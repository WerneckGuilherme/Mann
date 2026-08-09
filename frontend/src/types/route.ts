export type Coordinate = { latitude: number; longitude: number };
export type Route = { coordinates: Coordinate[]; distanceMeters?: number; durationSeconds?: number };
export type RouteProgress = { position: Coordinate; segmentIndex: number; traveledDistance: number; remainingDistance: number; progress: number; bearing: number };
