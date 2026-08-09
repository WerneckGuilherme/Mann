import { kilometersPerHourToMetersPerSecond } from '../utils/speed.ts';
export type SimulationState = { speedKilometersPerHour: number; distanceTraveled: number; running: boolean; timeMultiplier: number };
export function createSimulation(speedKilometersPerHour = 80): SimulationState { return { speedKilometersPerHour, distanceTraveled: 0, running: false, timeMultiplier: 1 }; }
export function advanceSimulation(state: SimulationState, deltaTimeSeconds: number, maxDistanceMeters?: number): SimulationState {
    if (!state.running || deltaTimeSeconds <= 0) return state;
    const distance = state.distanceTraveled + kilometersPerHourToMetersPerSecond(state.speedKilometersPerHour) * deltaTimeSeconds * state.timeMultiplier;
    const nextDistance = maxDistanceMeters === undefined ? distance : Math.min(distance, maxDistanceMeters);
    return { ...state, distanceTraveled: nextDistance, running: maxDistanceMeters !== undefined && nextDistance >= maxDistanceMeters ? false : state.running };
}
