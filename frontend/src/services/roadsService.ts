import type { Coordinate } from '../types/route.ts';
import type { RoadWay } from '../game/freeDrive.ts';

export async function requestNearbyRoads(point: Coordinate, signal?: AbortSignal): Promise<RoadWay[]> {
  const query = new URLSearchParams({ lat: String(point.latitude), lon: String(point.longitude) });
  const response = await fetch('/api/roads?' + query, { signal });
  if (!response.ok) throw new Error('Não foi possível carregar as ruas próximas. Tente novamente.');
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('roads' in body) || !Array.isArray(body.roads)) throw new Error('Os dados das ruas são inválidos.');
  const roads = body.roads as RoadWay[];
  if (!roads.every(road => (typeof road.id === 'string' && road.id.length > 0 || typeof road.id === 'number' && Number.isFinite(road.id)) && Number.isFinite(road.widthMeters) && road.widthMeters >= 3 && Array.isArray(road.coordinates)
    && road.coordinates.length >= 2 && road.coordinates.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)))) throw new Error('Os dados das ruas são inválidos.');
  return roads;
}
