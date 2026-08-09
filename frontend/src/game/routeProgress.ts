import { bearingBetweenCoordinates, distanceBetweenCoordinates, interpolateCoordinates } from '../utils/geo.ts';
import type { Coordinate, Route, RouteProgress } from '../types/route.ts';
export function getRouteDistance(route: Route): number { return route.coordinates.slice(0, -1).reduce((total, point, index) => total + distanceBetweenCoordinates(point, route.coordinates[index + 1]), 0); }
export function getRouteProgress(route: Route, traveledDistance: number): RouteProgress {
    if (route.coordinates.length < 2) throw new Error('A route needs at least two coordinates.');
    const lengths = route.coordinates.slice(0, -1).map((point, index) => distanceBetweenCoordinates(point, route.coordinates[index + 1]));
    const total = lengths.reduce((sum, length) => sum + length, 0); const distance = Math.max(0, Math.min(traveledDistance, total));
    let before = 0; let segmentIndex = lengths.length - 1;
    for (let index = 0; index < lengths.length; index += 1) { if (distance <= before + lengths[index]) { segmentIndex = index; break; } before += lengths[index]; }
    const start = route.coordinates[segmentIndex]; const end = route.coordinates[segmentIndex + 1]; const length = lengths[segmentIndex];
    return { position: interpolateCoordinates(start, end, length === 0 ? 1 : (distance - before) / length), segmentIndex, traveledDistance: distance, remainingDistance: total - distance, progress: total === 0 ? 1 : distance / total, bearing: bearingBetweenCoordinates(start, end) };
}
