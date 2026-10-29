import type { AdministrativeLocation, Coordinate, GeocodingResult, LocationSample, NavigationManeuver, Route } from '../types/route.ts';
import { getRouteProgress } from '../game/routeProgress.ts';

type RawIntersection = { location?: [number, number]; bearings?: number[] };
type RouteResponse = { coordinates: Array<[number, number]>; distanceMeters: number; durationSeconds: number; profileSpeedsKmh?: Array<number|null>; navigationSegments?: Route['navigationSegments']; maneuvers?: Array<Omit<NavigationManeuver, 'position' | 'intersections'> & { position?: [number, number]; intersections?: RawIntersection[] }> };
export type RouteRequestErrorCode = 'BACKEND_UNAVAILABLE' | 'UPSTREAM_TIMEOUT' | 'BACKEND_TIMEOUT' | 'UPSTREAM_HTTP_ERROR' | 'NO_ROUTE' | 'NETWORK_ERROR' | 'REQUEST_ABORTED' | 'FRONTEND_TIMEOUT' | 'HTTP_ERROR' | 'INVALID_JSON' | 'INVALID_ROUTE' | 'INVALID_COORDINATES';
export class RouteRequestError extends Error { constructor(public readonly code: RouteRequestErrorCode, message: string) { super(message); this.name = 'RouteRequestError'; } }
export const ROUTE_FRONTEND_TIMEOUT_MS = 30_000;

function validCoordinate(c: Coordinate) { return Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180; }
function isAbortError(error: unknown) { return error instanceof DOMException && error.name === 'AbortError'; }

async function jsonRequest(url: string, signal?: AbortSignal, timeoutMs = 15_000): Promise<any> {
  const controller = new AbortController();
  let callerAborted = false;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => { callerAborted = true; controller.abort(); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal });
    let body: any;
    try { body = await response.json(); } catch { throw new RouteRequestError('INVALID_JSON', 'The service returned invalid JSON.'); }
    if (!response.ok) {
      const code = typeof body?.code === 'string' ? body.code as RouteRequestErrorCode : 'HTTP_ERROR';
      throw new RouteRequestError(code, body?.error ?? 'The service could not complete the request.');
    }
    return body;
  } catch (error) {
    if (error instanceof RouteRequestError) throw error;
    if (isAbortError(error)) throw new RouteRequestError(callerAborted ? 'REQUEST_ABORTED' : 'FRONTEND_TIMEOUT', callerAborted ? 'Route request was cancelled.' : 'Route request timed out.');
    throw new RouteRequestError('BACKEND_UNAVAILABLE', 'Unable to reach the route service.');
  } finally { window.clearTimeout(timeoutId); signal?.removeEventListener('abort', abort); }
}

const point = (value?: [number, number]) => value ? { longitude: value[0], latitude: value[1] } : undefined;
const normalizeIntersections = (items?: RawIntersection[]) => items?.map(item => { const { location, ...rest } = item; return { ...rest, ...(point(location) ? { location: point(location) } : {}) }; });

export async function requestRoute(origin: Coordinate, destination: Coordinate, signal?: AbortSignal): Promise<Route> {
  if (!validCoordinate(origin) || !validCoordinate(destination)) throw new RouteRequestError('INVALID_COORDINATES', 'Origin and destination must contain valid coordinates.');
  const p = new URLSearchParams({ startLon: String(origin.longitude), startLat: String(origin.latitude), endLon: String(destination.longitude), endLat: String(destination.latitude) });
  const body = await jsonRequest('/api/route?' + p, signal, ROUTE_FRONTEND_TIMEOUT_MS) as RouteResponse;
  if (!Array.isArray(body.coordinates) || body.coordinates.length < 2 || !body.coordinates.every(item => Array.isArray(item) && item.length >= 2 && item.every(value => typeof value === 'number' && Number.isFinite(value)))) throw new RouteRequestError('INVALID_ROUTE', 'The route service returned invalid road geometry.');
  if (typeof body.distanceMeters !== 'number' || typeof body.durationSeconds !== 'number') throw new RouteRequestError('INVALID_ROUTE', 'The route service returned incomplete route metadata.');
  const profileSpeedsKmh = Array.isArray(body.profileSpeedsKmh) && body.profileSpeedsKmh.length === body.coordinates.length - 1 && body.profileSpeedsKmh.every(value => value === null || typeof value === 'number' && Number.isFinite(value) && value > 0) ? body.profileSpeedsKmh : undefined;
  return { coordinates: body.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })), distanceMeters: body.distanceMeters, durationSeconds: body.durationSeconds, ...(profileSpeedsKmh ? { profileSpeedsKmh } : {}), navigationSegments: body.navigationSegments ?? [], maneuvers: (body.maneuvers ?? []).map(m => { const { position, intersections, ...rest } = m; return { ...rest, ...(point(position) ? { position: point(position) } : {}), ...(normalizeIntersections(intersections) ? { intersections: normalizeIntersections(intersections) } : {}) }; }) };
}

const locationCache = new Map<string, AdministrativeLocation | null>();
export async function reverseGeocode(c: Coordinate, signal?: AbortSignal): Promise<AdministrativeLocation | null> {
  const key = c.latitude.toFixed(3) + ',' + c.longitude.toFixed(3);
  if (locationCache.has(key)) return locationCache.get(key) ?? null;
  try {
    const p = new URLSearchParams({ lat: String(c.latitude), lon: String(c.longitude) });
    const body = await jsonRequest('/api/reverse-geocode?' + p, signal);
    const value = body.location ?? null; locationCache.set(key, value); return value;
  } catch (error) { if (signal?.aborted) throw error; locationCache.set(key, null); return null; }
}
function sampleDistances(total: number, route: Route) {
  const spacing = total < 10000 ? 5 : total < 50000 ? Math.min(10, Math.max(5, Math.ceil(total / 8000))) : Math.min(25, Math.max(10, Math.ceil(total / 12000)));
  const distances = [0, total, ...(route.maneuvers ?? []).filter(m => m.routeDistanceMeters > 0 && m.routeDistanceMeters < total && m.distanceFromPreviousMeters > 250).map(m => m.routeDistanceMeters)];
  for (let d = spacing * 1000; d < total; d += spacing * 1000) distances.push(d);
  const sorted = [...new Set(distances.map(d => Math.round(d)))].sort((a, b) => a - b);
  if (sorted.length <= 12) return sorted;
  return Array.from({ length: 12 }, (_, index) => sorted[Math.round(index * (sorted.length - 1) / 11)]);
}
export async function enrichRouteLocations(route: Route, signal?: AbortSignal): Promise<Route> {
  const total = route.distanceMeters ?? 0; if (!total) return route;
  const samples: LocationSample[] = [];
  for (const distanceMeters of sampleDistances(total, route)) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const location = await reverseGeocode(getRouteProgress(route, distanceMeters).position, signal);
    if (location && (location.city || location.region || location.country)) samples.push({ distanceMeters, location });
  }
  if (!samples.length) return route;
  const sections = samples.map((sample, index) => ({ startDistanceMeters: sample.distanceMeters, endDistanceMeters: samples[index + 1]?.distanceMeters, city: sample.location.city, region: sample.location.region, country: sample.location.country })).filter((section, index, all) => index === 0 || section.city !== all[index - 1].city || section.region !== all[index - 1].region || section.country !== all[index - 1].country);
  return { ...route, locationSamples: samples, administrativeSections: sections };
}
export async function searchLocations(query: string, signal?: AbortSignal): Promise<GeocodingResult[]> {
  if (!query.trim()) throw new RouteRequestError('INVALID_COORDINATES', 'Enter a location to search.');
  const p = new URLSearchParams({ q: query.trim() }); const body = await jsonRequest('/api/geocode?' + p, signal);
  if (!Array.isArray(body.results)) throw new RouteRequestError('INVALID_ROUTE', 'The geocoder returned an invalid response.');
  return body.results;
}
