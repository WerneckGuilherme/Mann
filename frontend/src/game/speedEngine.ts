import type { VehicleDefinition } from '../types/vehicle.ts';
import type { AnalyzedRoute, RouteEnvironment } from './routeAnalyzer.ts';

export interface SpeedDebugInfo {
  currentSpeedKmh: number; targetAverageKmh: number; actualAverageKmh: number;
  vehicleMaxKmh: number; environment: RouteEnvironment; environmentCapKmh: number;
  curvature: number; curveCapKmh: number; lookAheadCapKmh: number; cruiseTargetKmh: number;
  finalTargetKmh: number; accelerationKmhPerSecond: number; brakingKmhPerSecond: number;
}
export interface SpeedEngineState { speedKmh: number; accelerationMetersPerSecondSquared: number; debug: SpeedDebugInfo | null; }
export interface SpeedEngineInput {
  route: AnalyzedRoute; distanceTraveled: number; targetAverageKmh: number;
  actualAverageKmh: number; vehicle: VehicleDefinition; deltaSeconds: number;
}
export interface SpeedAdvance { state: SpeedEngineState; distanceMeters: number; }

const comfortableBraking = 1.8; // m/s², well below emergency braking
const maximumJerk = 1.2; // m/s³, limits sudden throttle/brake changes
const curveHoldMeters = 25;

function segmentAt(route: AnalyzedRoute, distance: number) {
  let low = 0, high = route.segments.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (route.segments[middle].cumulativeStartMeters + route.segments[middle].distanceMeters < distance) low = middle + 1;
    else high = middle;
  }
  return route.segments[low];
}
function firstAtOrAfter(items: Array<{ distanceMeters: number }>, distance: number) {
  let low = 0, high = items.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (items[middle].distanceMeters < distance) low = middle + 1;
    else high = middle;
  }
  return low;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const createSpeedEngineState = (): SpeedEngineState => ({ speedKmh: 0, accelerationMetersPerSecondSquared: 0, debug: null });

function evaluate(i: Omit<SpeedEngineInput, 'deltaSeconds'>, currentSpeed: number) {
  const segment = segmentAt(i.route, i.distanceTraveled);
  const environmentCap = segment.recommendedSpeedKmh;
  const speedMs = currentSpeed / 3.6;
  const leadMeters = 25 + speedMs * 1.5;
  const horizonMeters = Math.max(450, speedMs * speedMs / (2 * comfortableBraking) + leadMeters);
  let lookAheadCap = Infinity;
  let curveCap = environmentCap;

  // The allowable speed rises with distance from each bend according to v²=u²+2as.
  // This starts braking before the curve, instead of changing target at its vertex.
  for (let index = firstAtOrAfter(i.route.curves, i.distanceTraveled - curveHoldMeters); index < i.route.curves.length; index++) {
    const curve = i.route.curves[index];
    const ahead = curve.distanceMeters - i.distanceTraveled;
    if (ahead > horizonMeters) break;
    if (ahead < -curveHoldMeters) continue;
    const curveSpeedMs = curve.speedKmh / 3.6;
    const brakingRoom = Math.max(0, ahead - leadMeters);
    const allowedKmh = Math.sqrt(curveSpeedMs * curveSpeedMs + 2 * comfortableBraking * brakingRoom) * 3.6;
    lookAheadCap = Math.min(lookAheadCap, allowedKmh);
    if (ahead <= leadMeters) curveCap = Math.min(curveCap, curve.speedKmh);
  }

  // Entering a lower-speed context also needs advance notice; otherwise the
  // car would still be at highway speed on the first urban metres.
  for (let index = firstAtOrAfter(i.route.speedTransitions, i.distanceTraveled); index < i.route.speedTransitions.length; index++) {
    const transition = i.route.speedTransitions[index];
    const ahead = transition.distanceMeters - i.distanceTraveled;
    if (ahead > horizonMeters) break;
    const limitMs = transition.speedKmh / 3.6;
    const room = Math.max(0, ahead - leadMeters);
    lookAheadCap = Math.min(lookAheadCap, Math.sqrt(limitMs * limitMs + 2 * comfortableBraking * room) * 3.6);
  }

  for (let index = firstAtOrAfter(i.route.slowdowns, i.distanceTraveled - 30); index < i.route.slowdowns.length; index++) {
    const slowdown = i.route.slowdowns[index];
    const ahead = slowdown.distanceMeters - i.distanceTraveled;
    if (ahead > horizonMeters) break;
    if (ahead < -slowdown.holdMeters) continue;
    const limitMs = slowdown.speedKmh / 3.6;
    const room = Math.max(0, ahead - leadMeters);
    lookAheadCap = Math.min(lookAheadCap, Math.sqrt(limitMs * limitMs + 2 * comfortableBraking * room) * 3.6);
    if (ahead <= leadMeters) lookAheadCap = Math.min(lookAheadCap, slowdown.speedKmh);
  }

  // City driving varies on a shorter distance scale than open-road cruising.
  // This deterministic throttle pattern is smooth and never exceeds the cap.
  const amplitude = segment.environment === 'urban' ? 0.16 : segment.environment === 'road' ? 0.08 : 0.025;
  const wavelength = segment.environment === 'urban' ? 40 : segment.environment === 'road' ? 100 : 240;
  const phase = i.distanceTraveled / wavelength + 0.35 * Math.sin(i.distanceTraveled / (wavelength * 2.7));
  const cruiseVariation = 1 - amplitude * (0.5 + 0.5 * Math.sin(phase));
  const cruiseTarget = Math.min(i.vehicle.maxSpeedKmh, environmentCap, i.targetAverageKmh) * cruiseVariation;
  const finalTarget = Math.max(0, Math.min(cruiseTarget, lookAheadCap));
  const debug: SpeedDebugInfo = {
    currentSpeedKmh: currentSpeed, targetAverageKmh: i.targetAverageKmh,
    actualAverageKmh: i.actualAverageKmh, vehicleMaxKmh: i.vehicle.maxSpeedKmh,
    environment: segment.environment, environmentCapKmh: environmentCap,
    curvature: segment.curvature, curveCapKmh: curveCap,
    lookAheadCapKmh: Number.isFinite(lookAheadCap) ? lookAheadCap : environmentCap,
    cruiseTargetKmh: cruiseTarget, finalTargetKmh: finalTarget,
    accelerationKmhPerSecond: Math.min(i.vehicle.acceleration, 1.65 - 0.55 * Math.min(1, currentSpeed / 120)) * 3.6,
    brakingKmhPerSecond: comfortableBraking * 3.6,
  };
  return { target: finalTarget, debug };
}

export function desiredSpeedKmh(i: Omit<SpeedEngineInput, 'deltaSeconds'>): number {
  return evaluate(i, 0).target;
}

export function advanceSpeed(state: SpeedEngineState, i: SpeedEngineInput): SpeedAdvance {
  if (i.deltaSeconds <= 0) return { state, distanceMeters: 0 };
  const steps = Math.min(500, Math.max(1, Math.ceil(i.deltaSeconds / 0.2)));
  const dt = i.deltaSeconds / steps;
  let speedMs = state.speedKmh / 3.6;
  let acceleration = state.accelerationMetersPerSecondSquared;
  let distanceMeters = 0;
  let debug = state.debug;
  for (let step = 0; step < steps; step++) {
    const evaluated = evaluate({ ...i, distanceTraveled: i.distanceTraveled + distanceMeters }, speedMs * 3.6);
    const maximumAcceleration = Math.min(i.vehicle.acceleration, 1.65 - 0.55 * Math.min(1, speedMs * 3.6 / 120));
    const desiredAcceleration = clamp((evaluated.target / 3.6 - speedMs) / 1.2, -Math.min(i.vehicle.braking, comfortableBraking), maximumAcceleration);
    acceleration += clamp(desiredAcceleration - acceleration, -maximumJerk * dt, maximumJerk * dt);
    const nextSpeedMs = clamp(speedMs + acceleration * dt, 0, i.vehicle.maxSpeedKmh / 3.6);
    distanceMeters += (speedMs + nextSpeedMs) * 0.5 * dt;
    speedMs = nextSpeedMs;
    debug = { ...evaluated.debug, currentSpeedKmh: speedMs * 3.6 };
  }
  return { state: { speedKmh: speedMs * 3.6, accelerationMetersPerSecondSquared: acceleration, debug }, distanceMeters };
}
