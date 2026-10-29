import { bearingBetweenCoordinates, distanceBetweenCoordinates, interpolateCoordinates } from '../utils/geo.ts';
import type { Coordinate, NavigationSegment, Route } from '../types/route.ts';

export type RouteEnvironment = 'urban' | 'road' | 'highway' | 'unknown';
export type CurveSeverity = 'straight' | 'gentle' | 'moderate' | 'strong';

// Fallback ceilings when the routing provider has no segment speed data.
// These are simulation targets, not posted speed limits.
export const ENVIRONMENT_SPEED_CAPS: Record<RouteEnvironment, number> = { urban: 50, road: 90, highway: 120, unknown: 70 };
export interface RouteCurve { distanceMeters: number; speedKmh: number; turnDegrees: number; }
export interface SpeedTransition { distanceMeters: number; speedKmh: number; }
export interface RouteSlowdown { distanceMeters: number; speedKmh: number; holdMeters: number; reason: 'maneuver' | 'intersection'; }
export interface RouteSegment {
  start: Coordinate; end: Coordinate; distanceMeters: number; bearing: number;
  curvature: number; severity: CurveSeverity; environment: RouteEnvironment;
  recommendedSpeedKmh: number; cumulativeStartMeters: number;
}
export interface AnalyzedRoute {
  coordinates: Coordinate[]; segments: RouteSegment[]; curves: RouteCurve[];
  speedTransitions: SpeedTransition[]; slowdowns: RouteSlowdown[]; totalDistanceMeters: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const angleDelta = (a: number, b: number) => Math.abs(((b - a + 540) % 360) - 180);
const severity = (v: number): CurveSeverity => v < 0.15 ? 'straight' : v < 0.4 ? 'gentle' : v < 0.75 ? 'moderate' : 'strong';
const urbanName = /\b(rua|avenida|av\.?|street|st\.?|avenue|ave\.?|alameda|travessa|boulevard|pra[cç]a)\b/i;
const bridgeName = /\b(ponte|bridge|viaduto|overpass)\b/i;
const crossingName = /\b(travessia|crossing|ferry|balsa)\b/i;
const highwayName = /\b(rodovia|autoestrada|motorway|highway|freeway|expressway|expressa|express|via\s+r[aá]pida|anel\s+rodovi[aá]rio)\b/i;
const highwayRef = /\b(?:BR|SP|MG|RJ|PR|RS|SC|BA|GO|DF|ES|MT|MS|PA|PE|CE|RN|PB|AL|SE|PI|MA|TO|RO|AC|AM|RR|AP|I|M|A)[- ]?\d{1,4}\b/i;

function firstAtOrAfter(items: Array<{ distanceMeters: number }>, distance: number) {
  let low = 0, high = items.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (items[middle].distanceMeters < distance) low = middle + 1;
    else high = middle;
  }
  return low;
}

function routeContext(profileSpeed: number | null, step: NavigationSegment | undefined, distance: number, total: number): RouteEnvironment {
  const name = step?.roadName ?? '';
  // Road identity is stronger evidence than an OSRM ETA speed, which can be
  // low even on a clear highway. It also covers names such as "Av. Expressa".
  if (highwayName.test(name) || highwayRef.test(name) || highwayRef.test(step?.roadRef ?? '')) return 'highway';
  if (profileSpeed !== null && profileSpeed >= 105) return 'highway';
  // A broad, fast avenue can be a multi-lane arterial rather than a city
  // street; its routing profile can support 80 km/h without implying 120.
  if (urbanName.test(name)) return profileSpeed !== null && profileSpeed >= 75 ? 'road' : 'urban';
  if (profileSpeed !== null) {
    if (profileSpeed <= 58) return 'urban';
    return 'road';
  }
  if (distance < Math.min(900, total * 0.12) || total - distance < Math.min(900, total * 0.12)) return 'urban';
  return 'road';
}

export function analyzeRoute(route: Route): AnalyzedRoute {
  const coordinates = route.coordinates;
  if (coordinates.length < 2) throw new Error('A route needs at least two coordinates.');
  const lengths = coordinates.slice(0, -1).map((point, index) => distanceBetweenCoordinates(point, coordinates[index + 1]));
  const bearings = coordinates.slice(0, -1).map((point, index) => bearingBetweenCoordinates(point, coordinates[index + 1]));
  const vertexDistances = [0];
  for (const length of lengths) vertexDistances.push(vertexDistances[vertexDistances.length - 1] + length);
  const total = vertexDistances[vertexDistances.length - 1];
  const metadataScale = route.distanceMeters && route.distanceMeters > 0 ? total / route.distanceMeters : 1;
  const steps = [...(route.navigationSegments ?? [])].sort((a, b) => a.startDistanceMeters - b.startDistanceMeters);
  const profile = route.profileSpeedsKmh?.length === lengths.length ? route.profileSpeedsKmh : undefined;

  const coordinateAt = (distance: number): Coordinate => {
    const d = clamp(distance, 0, total);
    let low = 0, high = lengths.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (vertexDistances[middle + 1] < d) low = middle + 1;
      else high = middle;
    }
    return interpolateCoordinates(coordinates[low], coordinates[low + 1], lengths[low] ? (d - vertexDistances[low]) / lengths[low] : 0);
  };

  const segmentAtDistance = (distance: number): number => {
    let low = 0, high = lengths.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (vertexDistances[middle + 1] < distance) low = middle + 1;
      else high = middle;
    }
    return low;
  };

  // The provider can assign a very low value to a 2-3 m geometry edge.
  // Average by road metres so such edges do not force a full braking cycle.
  const profileValues = lengths.map((_, index) => {
    const value = profile?.[index];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
  });
  const profileValidIndicators = profileValues.map(value => value ? 1 : 0);
  const profileSpeedArea = [0], profileValidMeters = [0];
  for (let index = 0; index < lengths.length; index++) {
    profileSpeedArea.push(profileSpeedArea[index] + profileValues[index] * lengths[index]);
    profileValidMeters.push(profileValidMeters[index] + profileValidIndicators[index] * lengths[index]);
  }
  const areaAt = (distance: number, prefix: number[], values: number[]): number => {
    const d = clamp(distance, 0, total);
    const index = segmentAtDistance(d);
    return prefix[index] + values[index] * (d - vertexDistances[index]);
  };
  const profileAt = (distance: number): number | null => {
    if (!profile) return null;
    const before = Math.max(0, distance - 60), after = Math.min(total, distance + 60);
    const valid = areaAt(after, profileValidMeters, profileValidIndicators)
      - areaAt(before, profileValidMeters, profileValidIndicators);
    if (valid < Math.min(10, after - before) || valid <= 0) return null;
    return (areaAt(after, profileSpeedArea, profileValues) - areaAt(before, profileSpeedArea, profileValues)) / valid;
  };

  // OSRM maneuver and intersection points are snapped back onto the same
  // geometry used for vehicle movement, avoiding two competing distance axes.
  const distanceAtPosition = (point: Coordinate, fallback: number, searchStart = fallback - 800, searchEnd = fallback + 800): number => {
    let bestDistance = clamp(fallback, 0, total), bestError = Infinity;
    const latitudeScale = Math.cos(point.latitude * Math.PI / 180);
    const first = segmentAtDistance(Math.max(0, searchStart));
    const last = segmentAtDistance(Math.min(total, searchEnd));
    for (let index = first; index <= last; index++) {
      const start = coordinates[index], end = coordinates[index + 1];
      const dx = (end.longitude - start.longitude) * latitudeScale;
      const dy = end.latitude - start.latitude;
      const size = dx * dx + dy * dy;
      const fraction = size ? clamp(((point.longitude - start.longitude) * latitudeScale * dx + (point.latitude - start.latitude) * dy) / size, 0, 1) : 0;
      const ex = (start.longitude + (end.longitude - start.longitude) * fraction - point.longitude) * latitudeScale;
      const ey = start.latitude + (end.latitude - start.latitude) * fraction - point.latitude;
      const error = ex * ex + ey * ey;
      if (error < bestError) { bestError = error; bestDistance = vertexDistances[index] + lengths[index] * fraction; }
    }
    return bestDistance;
  };

  // A 35 m window on either side also recognizes broad bends made from many
  // small OSRM geometry segments. Individual noisy vertices are not used.
  const curves: RouteCurve[] = [];
  const curveSamples: number[] = [];
  for (let distance = 25; distance < total - 25; distance += 25) curveSamples.push(distance);
  for (let index = 1; index < bearings.length; index++) {
    if (angleDelta(bearings[index - 1], bearings[index]) >= 20) curveSamples.push(vertexDistances[index]);
  }
  curveSamples.sort((a, b) => a - b);
  for (const distance of curveSamples) {
    if (distance < 10 || distance > total - 10) continue;
    const before = coordinateAt(distance - 35), middle = coordinateAt(distance), after = coordinateAt(distance + 35);
    const turnDegrees = angleDelta(bearingBetweenCoordinates(before, middle), bearingBetweenCoordinates(middle, after));
    if (turnDegrees < 8) continue;
    const radiusMeters = 70 / (turnDegrees * Math.PI / 180);
    const speedKmh = clamp(Math.sqrt(2.0 * radiusMeters) * 3.6, 20, 100);
    curves.push({ distanceMeters: distance, speedKmh, turnDegrees });
  }

  const intersectionDistances: number[] = [];
  const slowdowns: RouteSlowdown[] = [];
  for (const maneuver of route.maneuvers ?? []) {
    const fallback = maneuver.routeDistanceMeters * metadataScale;
    const distance = maneuver.position ? distanceAtPosition(maneuver.position, fallback) : clamp(fallback, 0, total);
    const type = maneuver.type.toLowerCase();
    const modifier = maneuver.modifier?.toLowerCase() ?? '';
    let maneuverSpeed: number | undefined;
    if (type === 'uturn') maneuverSpeed = 15;
    else if (type.includes('roundabout') || type === 'rotary') maneuverSpeed = 24;
    else if (type === 'turn' || type === 'end of road') maneuverSpeed = modifier.includes('sharp') ? 20 : 28;
    else if (type === 'exit' || type.includes('ramp')) maneuverSpeed = 42;
    else if (type === 'merge' || type === 'fork') maneuverSpeed = 52;
    else if (type === 'arrive') maneuverSpeed = 12;
    if (maneuverSpeed !== undefined) slowdowns.push({ distanceMeters: distance, speedKmh: maneuverSpeed, holdMeters: 18, reason: 'maneuver' });
    for (const intersection of maneuver.intersections ?? []) {
      if (!intersection.location || (intersection.bearings?.length ?? 0) < 3) continue;
      intersectionDistances.push(distanceAtPosition(intersection.location, fallback, fallback - 30,
        fallback + maneuver.distanceFromPreviousMeters * metadataScale + 30));
    }
  }
  intersectionDistances.sort((a, b) => a - b);
  const crossings = intersectionDistances.filter((value, index) => index === 0 || value - intersectionDistances[index - 1] > 12);
  const crossingItems = crossings.map(distanceMeters => ({ distanceMeters }));

  let stepIndex = 0;
  const segments = lengths.map((distanceMeters, index): RouteSegment => {
    const middle = vertexDistances[index] + distanceMeters / 2;
    const metadataDistance = metadataScale ? middle / metadataScale : middle;
    while (stepIndex + 1 < steps.length && steps[stepIndex].endDistanceMeters <= metadataDistance) stepIndex++;
    const step = steps[stepIndex]?.startDistanceMeters <= metadataDistance && steps[stepIndex]?.endDistanceMeters >= metadataDistance ? steps[stepIndex] : undefined;
    const profileSpeed = profileAt(middle);
    const environment = routeContext(profileSpeed, step, middle, total);
    const name = step?.roadName ?? '';
    const limit = ENVIRONMENT_SPEED_CAPS[environment];
    // OSRM's distance/duration speed is an ETA estimate, not a posted limit.
    // On a highway it must not suppress the driver's chosen cruising speed.
    const roadCruise = environment === 'highway' || profileSpeed === null ? limit : clamp(profileSpeed * 1.15 + 5, 15, 130);
    let recommendedSpeedKmh = Math.min(limit, roadCruise);
    if (bridgeName.test(name)) recommendedSpeedKmh = Math.min(recommendedSpeedKmh, 65);
    if (crossingName.test(name)) recommendedSpeedKmh = Math.min(recommendedSpeedKmh, 30);
    if (step?.mode && step.mode !== 'driving') recommendedSpeedKmh = Math.min(recommendedSpeedKmh, 20);
    const nearbyCrossings = firstAtOrAfter(crossingItems, middle + 300) - firstAtOrAfter(crossingItems, middle - 300);
    if (environment === 'urban' && nearbyCrossings >= 4) recommendedSpeedKmh = Math.min(recommendedSpeedKmh, nearbyCrossings >= 8 ? 35 : 42);
    const nearbyCurve = curves[firstAtOrAfter(curves, middle - 40)];
    const curvature = nearbyCurve && nearbyCurve.distanceMeters <= middle + 40 ? clamp(nearbyCurve.turnDegrees / 90, 0, 1) : 0;
    return { start: coordinates[index], end: coordinates[index + 1], distanceMeters, bearing: bearings[index],
      curvature, severity: severity(curvature), environment, recommendedSpeedKmh, cumulativeStartMeters: vertexDistances[index] };
  });

  const segmentEnds = segments.map(segment => ({ distanceMeters: segment.cumulativeStartMeters + segment.distanceMeters }));
  for (const distance of crossings) {
    const index = firstAtOrAfter(segmentEnds, distance);
    const environment = segments[Math.min(index, segments.length - 1)]?.environment;
    if (environment === 'urban') slowdowns.push({ distanceMeters: distance, speedKmh: 32, holdMeters: 10, reason: 'intersection' });
    else if (environment === 'road') slowdowns.push({ distanceMeters: distance, speedKmh: 48, holdMeters: 10, reason: 'intersection' });
  }
  slowdowns.sort((a, b) => a.distanceMeters - b.distanceMeters);

  const speedTransitions: SpeedTransition[] = [];
  for (let index = 1; index < segments.length; index++) {
    const nextCap = segments[index].recommendedSpeedKmh;
    const previousCap = segments[index - 1].recommendedSpeedKmh;
    if (nextCap < previousCap - 5) speedTransitions.push({ distanceMeters: segments[index].cumulativeStartMeters, speedKmh: nextCap });
  }
  return { coordinates, segments, curves, speedTransitions, slowdowns, totalDistanceMeters: total };
}
