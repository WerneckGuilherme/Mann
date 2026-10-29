export type FollowPose = { longitude: number; latitude: number; bearing: number; pitch: number };

const factor = (dt: number, responseSeconds: number) => 1 - Math.exp(-Math.max(0, dt) / responseSeconds);
export const shortestTurn = (from: number, to: number) => (((to - from) % 360 + 540) % 360) - 180;

export function smoothFollowPose(current: FollowPose, target: FollowPose, realSeconds: number, timeMultiplier: number): FollowPose {
  // Faster simulated travel needs a shorter real-time lag to keep the vehicle visible.
  const dt = Math.min(0.1, realSeconds) * Math.min(8, Math.max(1, Math.sqrt(timeMultiplier)));
  const position = factor(dt, 0.28);
  const heading = factor(dt, 0.48);
  const pitch = factor(dt, 0.65);
  return {
    longitude: current.longitude + (target.longitude - current.longitude) * position,
    latitude: current.latitude + (target.latitude - current.latitude) * position,
    bearing: current.bearing + shortestTurn(current.bearing, target.bearing) * heading,
    pitch: current.pitch + (target.pitch - current.pitch) * pitch,
  };
}

export function smoothMarkerBearing(current: number, target: number, realSeconds: number, timeMultiplier: number): number {
  const dt = Math.min(0.1, realSeconds) * Math.min(8, Math.max(1, Math.sqrt(timeMultiplier)));
  return current + shortestTurn(current, target) * factor(dt, 0.18);
}
