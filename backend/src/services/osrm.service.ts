export type OsrmCoordinate = [number, number];
export type MannRoute = { coordinates: OsrmCoordinate[]; distanceMeters: number; durationSeconds: number };
type OsrmResponse = { code?: string; message?: string; routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: unknown } }> };
const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';
function isCoordinate(value: unknown): value is OsrmCoordinate { return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number' && Number.isFinite(value[0]) && Number.isFinite(value[1]); }
export async function fetchDrivingRoute(startLon: number, startLat: number, endLon: number, endLat: number): Promise<MannRoute> {
    const baseUrl = process.env.OSRM_BASE_URL ?? DEFAULT_OSRM_BASE_URL;
    const url = baseUrl.replace(/\/$/, '') + '/route/v1/driving/' + startLon + ',' + startLat + ';' + endLon + ',' + endLat + '?overview=full&geometries=geojson&steps=false';
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('OSRM returned HTTP ' + response.status + '.');
    const payload = await response.json() as OsrmResponse;
    const route = payload.routes?.[0]; const coordinates = route?.geometry?.coordinates;
    if (payload.code !== 'Ok' || !route || typeof route.distance !== 'number' || typeof route.duration !== 'number' || !Array.isArray(coordinates)) throw new Error(payload.message || 'OSRM did not return a usable driving route.');
    const normalizedCoordinates = coordinates.filter(isCoordinate);
    if (normalizedCoordinates.length < 2) throw new Error('OSRM returned a route without enough road coordinates.');
    return { coordinates: normalizedCoordinates, distanceMeters: route.distance, durationSeconds: route.duration };
}
