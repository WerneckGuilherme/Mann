import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

export type RoadWay = { id: string; coordinates: Array<[number, number]>; widthMeters: number; name?: string };
const zoom = 14;
const radiusMeters = 900;
const tileCache = new Map<string, { expires: number; roads: RoadWay[] }>();
const inFlight = new Map<string, Promise<RoadWay[]>>();
const roadWidths: Record<string, number> = {
  motorway: 15, trunk: 12, primary: 10, secondary: 9, tertiary: 8,
  minor: 7, service: 5, residential: 7, unclassified: 7,
};

export function tileAt(latitude: number, longitude: number, z = zoom) {
  const n = 2 ** z;
  const lat = Math.max(-85, Math.min(85, latitude)) * Math.PI / 180;
  return {
    x: Math.floor((longitude + 180) / 360 * n),
    y: Math.floor((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * n),
  };
}

function parseTile(bytes: Uint8Array, x: number, y: number): RoadWay[] {
  const tile = new VectorTile(new PbfReader(bytes));
  const layer = tile.layers.transportation;
  if (!layer) return [];
  const roads: RoadWay[] = [];
  for (let index = 0; index < layer.length; index++) {
    const feature = layer.feature(index);
    const roadClass = String(feature.properties.class ?? '');
    if (!(roadClass in roadWidths) || feature.properties.access === 'no' || feature.properties.access === 'private') continue;
    const geometry = feature.toGeoJSON(x, y, zoom).geometry;
    const lines = geometry.type === 'LineString' ? [geometry.coordinates]
      : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const coordinates = lines[lineIndex].flatMap(point => Number.isFinite(point[0]) && Number.isFinite(point[1])
        ? [[point[0], point[1]] as [number, number]] : []);
      if (coordinates.length < 2) continue;
      const widthMeters = roadWidths[roadClass];
      roads.push({ id: `${zoom}/${x}/${y}:${feature.id ?? index}:${lineIndex}`, coordinates, widthMeters });
    }
  }
  return roads;
}

async function fetchTile(x: number, y: number): Promise<RoadWay[]> {
  const key = `${zoom}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.roads;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const task = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const url = `https://tiles.openfreemap.org/planet/latest/${zoom}/${x}/${y}.pbf`;
      const response = await fetch(url, { headers: { 'user-agent': 'Mann/0.1 (free drive)' }, signal: controller.signal });
      if (!response.ok) throw new Error(`Road tile returned HTTP ${response.status}.`);
      const roads = parseTile(new Uint8Array(await response.arrayBuffer()), x, y);
      tileCache.set(key, { expires: Date.now() + 10 * 60_000, roads });
      if (tileCache.size > 120) tileCache.delete(tileCache.keys().next().value!);
      return roads;
    } finally { clearTimeout(timer); inFlight.delete(key); }
  })();
  inFlight.set(key, task);
  return task;
}

export async function fetchNearbyRoads(latitude: number, longitude: number): Promise<RoadWay[]> {
  const latDelta = radiusMeters / 111_195;
  const lonDelta = latDelta / Math.max(0.2, Math.cos(latitude * Math.PI / 180));
  const northWest = tileAt(latitude + latDelta, longitude - lonDelta);
  const southEast = tileAt(latitude - latDelta, longitude + lonDelta);
  const requests: Array<Promise<RoadWay[]>> = [];
  for (let x = northWest.x; x <= southEast.x; x++)
    for (let y = northWest.y; y <= southEast.y; y++) requests.push(fetchTile(x, y));
  return (await Promise.all(requests)).flat();
}
