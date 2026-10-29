import { advanceSpeed, createSpeedEngineState, type SpeedDebugInfo, type SpeedEngineState } from './speedEngine.ts';
import type { AnalyzedRoute } from './routeAnalyzer.ts';
import type { VehicleDefinition } from '../types/vehicle.ts';

export type SimulationState = {
  speedKilometersPerHour: number; distanceTraveled: number; running: boolean;
  timeMultiplier: number; tripStartDateTime: number; simulationElapsedSeconds: number;
  speedEngine: SpeedEngineState; speedDebug: SpeedDebugInfo | null;
};
export const createSimulation = (speed = 80, tripStartDateTime = Date.now()): SimulationState => ({
  speedKilometersPerHour: speed, distanceTraveled: 0, running: false,
  timeMultiplier: 1, tripStartDateTime, simulationElapsedSeconds: 0,
  speedEngine: createSpeedEngineState(), speedDebug: null,
});
export const getTripAverageKmh = (state: SimulationState) =>
  state.simulationElapsedSeconds > 0 ? state.distanceTraveled / state.simulationElapsedSeconds * 3.6 : 0;

export function advanceSimulation(state: SimulationState, delta: number, route?: AnalyzedRoute, vehicle?: VehicleDefinition, maxDistance?: number): SimulationState {
  if (!state.running || delta <= 0 || !route || !vehicle) return state;
  if (maxDistance !== undefined && state.distanceTraveled >= maxDistance) {
    return { ...state, running: false, speedEngine: { ...state.speedEngine, speedKmh: 0, accelerationMetersPerSecondSquared: 0 } };
  }
  const elapsed = delta * state.timeMultiplier;
  const input = {
    route, distanceTraveled: state.distanceTraveled,
    targetAverageKmh: state.speedKilometersPerHour,
    actualAverageKmh: getTripAverageKmh(state),
    vehicle,
  };
  const advance = advanceSpeed(state.speedEngine, { ...input, deltaSeconds: elapsed });
  const next = Math.min(maxDistance ?? Infinity, state.distanceTraveled + advance.distanceMeters);
  const arrived = maxDistance !== undefined && next >= maxDistance;
  let elapsedThisFrame = elapsed;
  if (arrived && maxDistance !== undefined && advance.distanceMeters > 0) {
    const remaining = maxDistance - state.distanceTraveled;
    let low = 0, high = elapsed;
    for (let index = 0; index < 16; index++) {
      const middle = (low + high) / 2;
      const distance = advanceSpeed(state.speedEngine, { ...input, deltaSeconds: middle }).distanceMeters;
      if (distance < remaining) low = middle;
      else high = middle;
    }
    elapsedThisFrame = high;
  }
  const speedEngine = arrived
    ? { ...advance.state, speedKmh: 0, accelerationMetersPerSecondSquared: 0 }
    : advance.state;
  return {
    ...state, distanceTraveled: next, running: !arrived,
    simulationElapsedSeconds: state.simulationElapsedSeconds + elapsedThisFrame,
    speedEngine, speedDebug: advance.state.debug,
  };
}
