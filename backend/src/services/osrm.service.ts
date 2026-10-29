export type OsrmCoordinate = [number, number];
export type MannManeuver = { routeDistanceMeters: number; distanceFromPreviousMeters: number; type: string; modifier?: string; roadName?: string; roadRef?: string; position?: OsrmCoordinate; exit?: number; destination?: string; intersections?: Array<{ location?: OsrmCoordinate; bearings?: number[] }> };
export type MannNavigationSegment = { startDistanceMeters: number; endDistanceMeters: number; roadName?: string; roadRef?: string; mode?: string; position?: OsrmCoordinate };
export type MannRoute = { coordinates: OsrmCoordinate[]; distanceMeters: number; durationSeconds: number; profileSpeedsKmh?: Array<number | null>; maneuvers: MannManeuver[]; navigationSegments: MannNavigationSegment[] };
export type RoutingErrorCode = 'UPSTREAM_TIMEOUT' | 'BACKEND_TIMEOUT' | 'UPSTREAM_HTTP_ERROR' | 'NO_ROUTE' | 'INVALID_ROUTE_RESPONSE' | 'NETWORK_ERROR';

export class RoutingError extends Error {
  constructor(public readonly code: RoutingErrorCode, message: string, public readonly retryable = false) { super(message); this.name = 'RoutingError'; }
}

export const OSRM_ATTEMPT_TIMEOUT_MS = 9_000;
export const ROUTE_BACKEND_TIMEOUT_MS = 20_000;
export const ROUTE_MAX_ATTEMPTS = 2;
const ROUTE_CACHE_TTL_MS = 10 * 60 * 1_000;
const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';
type OsrmStep = { distance?: number; name?: string; ref?: string; mode?: string; destinations?: string; maneuver?: { location?: unknown; type?: unknown; modifier?: unknown; exit?: unknown }; intersections?: Array<{ location?: unknown; bearings?: unknown }> };
type OsrmResponse = { code?: string; message?: string; routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: unknown }; legs?: Array<{ steps?: OsrmStep[]; annotation?: { speed?: unknown } }> }> };
type CacheEntry = { expiresAt: number; route: MannRoute };
const routeCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<MannRoute>>();

function isCoordinate(value: unknown): value is OsrmCoordinate { return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number' && Number.isFinite(value[0]) && Number.isFinite(value[1]); }
function optionalString(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function providers() { return (process.env.OSRM_BASE_URLS ?? process.env.OSRM_BASE_URL ?? DEFAULT_OSRM_BASE_URL).split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean); }
function routeKey(values: number[]) { return values.map(value => value.toFixed(5)).join(','); }
function isAbortError(error: unknown) { return error instanceof DOMException && error.name === 'AbortError'; }

async function requestProvider(baseUrl: string, startLon: number, startLat: number, endLon: number, endLat: number, timeoutMs: number): Promise<MannRoute> {
  const url = `${baseUrl}/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson&steps=true&annotations=speed`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Mann/0.1' }, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) throw new RoutingError('UPSTREAM_TIMEOUT', 'The routing provider did not respond within the attempt budget.', true);
    throw new RoutingError('NETWORK_ERROR', 'Unable to reach the routing provider.', true);
  } finally { clearTimeout(timeoutId); }
  if (!response.ok) throw new RoutingError('UPSTREAM_HTTP_ERROR', `The routing provider returned HTTP ${response.status}.`, response.status >= 500 || response.status === 408 || response.status === 429);
  let payload: OsrmResponse;
  try { payload = await response.json() as OsrmResponse; } catch { throw new RoutingError('INVALID_ROUTE_RESPONSE', 'The routing provider returned invalid JSON.', true); }
  if (payload.code === 'NoRoute') throw new RoutingError('NO_ROUTE', 'No drivable route was found between these points.');
  const route = payload.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (payload.code !== 'Ok' || !route || typeof route.distance !== 'number' || typeof route.duration !== 'number' || !Array.isArray(coordinates)) throw new RoutingError('INVALID_ROUTE_RESPONSE', payload.message || 'The routing provider did not return a usable route.', true);
  const normalizedCoordinates = coordinates.filter(isCoordinate);
  if (normalizedCoordinates.length < 2) throw new RoutingError('INVALID_ROUTE_RESPONSE', 'The routing provider returned a route without enough road coordinates.', true);
  if (normalizedCoordinates.length !== coordinates.length) throw new RoutingError('INVALID_ROUTE_RESPONSE', 'The routing provider returned invalid road coordinates.', true);
  const annotatedSpeeds = route.legs?.[0]?.annotation?.speed;
  const profileSpeedsKmh = Array.isArray(annotatedSpeeds) && annotatedSpeeds.length === normalizedCoordinates.length - 1
    ? annotatedSpeeds.map((speed: unknown) => typeof speed === 'number' && Number.isFinite(speed) && speed > 0 ? Math.round(speed * 36) / 10 : null)
    : undefined;
  let distance = 0;
  const navigationSegments: MannNavigationSegment[] = [];
  const maneuvers: MannManeuver[] = [];
  for (const leg of route.legs ?? []) for (const step of leg.steps ?? []) {
    const stepDistance = typeof step.distance === 'number' && Number.isFinite(step.distance) ? Math.max(0, step.distance) : 0;
    const name = optionalString(step.name); const ref = optionalString(step.ref); const mode = optionalString(step.mode); const location = isCoordinate(step.maneuver?.location) ? step.maneuver.location : undefined;
    const type = optionalString(step.maneuver?.type) ?? 'continue'; const modifier = optionalString(step.maneuver?.modifier); const exit = typeof step.maneuver?.exit === 'number' && Number.isFinite(step.maneuver.exit) ? step.maneuver.exit : undefined; const destination = optionalString(step.destinations);
    const intersections = step.intersections?.flatMap(intersection => { const intersectionLocation = isCoordinate(intersection.location) ? intersection.location : undefined; const bearings = Array.isArray(intersection.bearings) ? intersection.bearings.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)) : []; return intersectionLocation ? [{ location: intersectionLocation, ...(bearings.length ? { bearings } : {}) }] : []; });
    maneuvers.push({ routeDistanceMeters: distance, distanceFromPreviousMeters: stepDistance, type, ...(modifier ? { modifier } : {}), ...(name ? { roadName: name } : {}), ...(ref ? { roadRef: ref } : {}), ...(location ? { position: location } : {}), ...(exit !== undefined ? { exit } : {}), ...(destination ? { destination } : {}), ...(intersections?.length ? { intersections } : {}) });
    if (name || ref || mode) navigationSegments.push({ startDistanceMeters: distance, endDistanceMeters: distance + stepDistance, ...(name ? { roadName: name } : {}), ...(ref ? { roadRef: ref } : {}), ...(mode ? { mode } : {}), ...(location ? { position: location } : {}) });
    distance += stepDistance;
  }
  return { coordinates: normalizedCoordinates, distanceMeters: route.distance, durationSeconds: route.duration, ...(profileSpeedsKmh ? { profileSpeedsKmh } : {}), maneuvers, navigationSegments };
}

async function fetchWithResilience(startLon: number, startLat: number, endLon: number, endLat: number): Promise<MannRoute> {
  const deadline = Date.now() + ROUTE_BACKEND_TIMEOUT_MS;
  let lastError: RoutingError | undefined;
  const baseUrls = providers();
  for (let attempt = 0; attempt < ROUTE_MAX_ATTEMPTS; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new RoutingError('BACKEND_TIMEOUT', 'The routing backend exceeded its total time budget.');
    try { return await requestProvider(baseUrls[attempt % baseUrls.length], startLon, startLat, endLon, endLat, Math.min(OSRM_ATTEMPT_TIMEOUT_MS, remainingMs)); }
    catch (error) {
      if (!(error instanceof RoutingError)) throw error;
      lastError = error;
      if (!error.retryable || attempt === ROUTE_MAX_ATTEMPTS - 1) break;
    }
  }
  if (Date.now() >= deadline) throw new RoutingError('BACKEND_TIMEOUT', 'The routing backend exceeded its total time budget.');
  throw lastError ?? new RoutingError('NETWORK_ERROR', 'Unable to calculate the route.', true);
}

export async function fetchDrivingRoute(startLon: number, startLat: number, endLon: number, endLat: number): Promise<MannRoute> {
  const key = routeKey([startLon, startLat, endLon, endLat]);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.route;
  routeCache.delete(key);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = fetchWithResilience(startLon, startLat, endLon, endLat).then(route => { routeCache.set(key, { route, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS }); return route; }).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
