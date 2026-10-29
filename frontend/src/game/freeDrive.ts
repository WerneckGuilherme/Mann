import type { Coordinate } from '../types/route.ts';
import type { VehicleDefinition } from '../types/vehicle.ts';
import { bearingBetweenCoordinates } from '../utils/geo.ts';

export type RoadWay = { id: string | number; coordinates: Array<[number, number]>; widthMeters: number; name?: string };
export type FreeDriveInput = { steering: number; throttle: number; brake: number };
export type FreeDriveState = { position: Coordinate; bearing: number; speedKmh: number; running: boolean; elapsedSeconds: number; distanceMeters: number; colliding: boolean };
type RoadSegment = { ax: number; ay: number; bx: number; by: number; halfWidth: number; road: RoadWay; start: Coordinate; end: Coordinate };
export type RoadNetwork = { origin: Coordinate; roads: RoadWay[]; segments: RoadSegment[]; cells: Map<string, number[]> };

const radius = 6_371_000;
const radians = Math.PI / 180;
const cellSize = 40;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const cellKey = (x: number, y: number) => `${x}:${y}`;

export const roadCollisionHalfWidthMeters = (road: RoadWay) => clamp(road.widthMeters / 2 - 0.9, 1.5, 18);
export const roadCollisionWidthPixelsAtZoom0 = (road: RoadWay, latitude: number) =>
  2 * roadCollisionHalfWidthMeters(road) * 512 / (2 * Math.PI * radius * Math.cos(latitude * radians));

function toMeters(point: Coordinate, origin: Coordinate) {
  return { x: (point.longitude - origin.longitude) * radians * radius * Math.cos(origin.latitude * radians), y: (point.latitude - origin.latitude) * radians * radius };
}
function fromMeters(x: number, y: number, origin: Coordinate): Coordinate {
  return { longitude: origin.longitude + x / (radians * radius * Math.cos(origin.latitude * radians)), latitude: origin.latitude + y / (radians * radius) };
}
function projection(segment: RoadSegment, x: number, y: number) {
  const dx = segment.bx - segment.ax, dy = segment.by - segment.ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? clamp(((x - segment.ax) * dx + (y - segment.ay) * dy) / lengthSquared, 0, 1) : 0;
  const px = segment.ax + t * dx, py = segment.ay + t * dy;
  return { x: px, y: py, distance: Math.hypot(x - px, y - py), tangentX: lengthSquared ? dx / Math.sqrt(lengthSquared) : 0, tangentY: lengthSquared ? dy / Math.sqrt(lengthSquared) : 0 };
}

export function buildRoadNetwork(roads: RoadWay[], origin: Coordinate): RoadNetwork {
  const segments: RoadSegment[] = [], cells = new Map<string, number[]>();
  for (const road of roads) for (let index = 1; index < road.coordinates.length; index++) {
    const [startLon, startLat] = road.coordinates[index - 1], [endLon, endLat] = road.coordinates[index];
    const start = { latitude: startLat, longitude: startLon }, end = { latitude: endLat, longitude: endLon };
    const a = toMeters(start, origin), b = toMeters(end, origin);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.05) continue;
    const halfWidth = roadCollisionHalfWidthMeters(road);
    const segment = { ax: a.x, ay: a.y, bx: b.x, by: b.y, halfWidth, road, start, end };
    const segmentIndex = segments.push(segment) - 1;
    for (let cx = Math.floor((Math.min(a.x, b.x) - halfWidth) / cellSize); cx <= Math.floor((Math.max(a.x, b.x) + halfWidth) / cellSize); cx++)
      for (let cy = Math.floor((Math.min(a.y, b.y) - halfWidth) / cellSize); cy <= Math.floor((Math.max(a.y, b.y) + halfWidth) / cellSize); cy++) {
        const key = cellKey(cx, cy), bucket = cells.get(key) ?? [];
        bucket.push(segmentIndex); cells.set(key, bucket);
      }
  }
  return { origin, roads, segments, cells };
}

function nearbySegments(network: RoadNetwork, x: number, y: number) {
  return network.cells.get(cellKey(Math.floor(x / cellSize), Math.floor(y / cellSize))) ?? [];
}

export function isOnRoad(network: RoadNetwork, point: Coordinate): boolean {
  const { x, y } = toMeters(point, network.origin);
  return nearbySegments(network, x, y).some(index => {
    const segment = network.segments[index];
    return projection(segment, x, y).distance <= segment.halfWidth;
  });
}

export function nearestRoadPoint(network: RoadNetwork, point: Coordinate) {
  const { x, y } = toMeters(point, network.origin);
  let best: { position: Coordinate; bearing: number; distanceMeters: number; roadName?: string } | null = null;
  for (const segment of network.segments) {
    const projected = projection(segment, x, y);
    if (!best || projected.distance < best.distanceMeters) best = {
      position: fromMeters(projected.x, projected.y, network.origin),
      bearing: bearingBetweenCoordinates(segment.start, segment.end),
      distanceMeters: projected.distance, roadName: segment.road.name,
    };
  }
  return best;
}

function moveInsideRoad(network: RoadNetwork, from: Coordinate, to: Coordinate) {
  if (isOnRoad(network, to)) return { position: to, collided: false };
  const a = toMeters(from, network.origin), b = toMeters(to, network.origin);
  let low = 0, high = 1;
  for (let index = 0; index < 12; index++) {
    const middle = (low + high) / 2;
    if (isOnRoad(network, fromMeters(a.x + (b.x - a.x) * middle, a.y + (b.y - a.y) * middle, network.origin))) low = middle;
    else high = middle;
  }
  const edgeX = a.x + (b.x - a.x) * low, edgeY = a.y + (b.y - a.y) * low;
  let best: { segment: RoadSegment; distance: number; tangentX: number; tangentY: number } | null = null;
  for (const index of nearbySegments(network, edgeX, edgeY)) {
    const segment = network.segments[index], projected = projection(segment, edgeX, edgeY);
    if (!best || projected.distance < best.distance) best = { segment, distance: projected.distance, tangentX: projected.tangentX, tangentY: projected.tangentY };
  }
  if (best) {
    const along = (b.x - edgeX) * best.tangentX + (b.y - edgeY) * best.tangentY;
    const slide = fromMeters(edgeX + along * best.tangentX * 0.9, edgeY + along * best.tangentY * 0.9, network.origin);
    if (isOnRoad(network, slide)) return { position: slide, collided: true };
  }
  return { position: fromMeters(edgeX, edgeY, network.origin), collided: true };
}

export function createFreeDrive(position: Coordinate, bearing = 0): FreeDriveState {
  return { position, bearing, speedKmh: 0, running: false, elapsedSeconds: 0, distanceMeters: 0, colliding: false };
}

export function advanceFreeDrive(state: FreeDriveState, deltaSeconds: number, input: FreeDriveInput, network: RoadNetwork, vehicle: VehicleDefinition): FreeDriveState {
  if (!state.running || deltaSeconds <= 0 || !network.segments.length) return state;
  const steps = Math.max(1, Math.ceil(deltaSeconds / 0.025));
  const dt = deltaSeconds / steps;
  let position = state.position, bearing = state.bearing, speed = state.speedKmh / 3.6, traveled = 0, collided = false;
  const steering = clamp(input.steering, -1, 1), throttle = clamp(input.throttle, 0, 1), brake = clamp(input.brake, 0, 1);
  for (let step = 0; step < steps; step++) {
    const acceleration = throttle > 0.01 ? vehicle.acceleration * throttle - (speed < 0 ? vehicle.braking : 0)
      : brake > 0.01 ? (speed > 0.15 ? -vehicle.braking * brake : -vehicle.acceleration * 0.55 * brake)
      : speed > 0 ? -Math.min(1.25, speed / dt) : speed < 0 ? Math.min(1.25, -speed / dt) : 0;
    const nextSpeed = clamp(speed + acceleration * dt, -15 / 3.6, vehicle.maxSpeedKmh / 3.6);
    const forward = (speed + nextSpeed) / 2 * dt;
    const steerAngle = steering * (30 * radians) / (1 + Math.pow(Math.abs(nextSpeed * 3.6) / 35, 1.4));
    const turnRate = Math.abs(nextSpeed) < 0.1 ? 0 : clamp(nextSpeed / 2.7 * Math.tan(steerAngle), -3.2 / Math.max(3, Math.abs(nextSpeed)), 3.2 / Math.max(3, Math.abs(nextSpeed)));
    bearing = (bearing + turnRate * dt / radians + 360) % 360;
    const angle = bearing * radians;
    const current = toMeters(position, network.origin);
    const next = fromMeters(current.x + Math.sin(angle) * forward, current.y + Math.cos(angle) * forward, network.origin);
    const moved = moveInsideRoad(network, position, next);
    const actual = toMeters(moved.position, network.origin);
    traveled += Math.hypot(actual.x - current.x, actual.y - current.y);
    position = moved.position;
    collided ||= moved.collided;
    speed = moved.collided ? nextSpeed * 0.65 : nextSpeed;
  }
  return { ...state, position, bearing, speedKmh: speed * 3.6,
    elapsedSeconds: state.elapsedSeconds + steps * dt, distanceMeters: state.distanceMeters + traveled, colliding: collided };
}
