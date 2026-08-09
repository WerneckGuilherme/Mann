import type { Coordinate, Route } from '../types/route.ts';
type RouteResponse = { coordinates: Array<[number, number]>; distanceMeters: number; durationSeconds: number };
export async function requestRoute(origin: Coordinate, destination: Coordinate, signal?: AbortSignal): Promise<Route> {
    const params = new URLSearchParams({ startLon: String(origin.longitude), startLat: String(origin.latitude), endLon: String(destination.longitude), endLat: String(destination.latitude) });
    const timeoutController = new AbortController();
    const timeout = window.setTimeout(() => timeoutController.abort(), 20_000);
    const abortRequest = () => timeoutController.abort();
    signal?.addEventListener('abort', abortRequest, { once: true });
    let response: Response;
    try { response = await fetch('/api/route?' + params.toString(), { signal: timeoutController.signal }); }
    catch (cause) { if (cause instanceof DOMException && cause.name === 'AbortError') throw new Error('Route request timed out or was cancelled.'); throw new Error('Unable to reach the route service.'); }
    finally { window.clearTimeout(timeout); signal?.removeEventListener('abort', abortRequest); }
    let payload: RouteResponse | { error?: string };
    try { payload = await response.json() as RouteResponse | { error?: string }; } catch { throw new Error('The route service returned an invalid response.'); }
    if (!response.ok) throw new Error('error' in payload && payload.error ? payload.error : 'The route service could not calculate this route.');
    if (!('coordinates' in payload) || !Array.isArray(payload.coordinates) || payload.coordinates.length < 2 || !payload.coordinates.every(point => Array.isArray(point) && point.length >= 2 && point.every(value => typeof value === 'number' && Number.isFinite(value)))) throw new Error('The route service returned invalid road geometry.');
    return { coordinates: payload.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })), distanceMeters: payload.distanceMeters, durationSeconds: payload.durationSeconds };
}
