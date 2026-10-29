import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchNearbyRoads } from '../services/roads.service.js';

export async function handleRoadsRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname !== '/api/roads') return false;
  const latitude = Number(url.searchParams.get('lat'));
  const longitude = Number(url.searchParams.get('lon'));
  if (request.method !== 'GET' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ code: 'INVALID_COORDINATES', error: 'A valid latitude and longitude are required.' }));
    return true;
  }
  try {
    const roads = await fetchNearbyRoads(latitude, longitude);
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ roads }));
  } catch {
    response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ code: 'ROADS_UNAVAILABLE', error: 'Nearby road geometry is temporarily unavailable.' }));
  }
  return true;
}
