import type {EnvironmentPhase, EnvironmentState} from '../types/environment.ts';

export const ENVIRONMENT_TIMINGS = {
    dawnStartMinutes: 5 * 60 + 30,
    dayStartMinutes: 7 * 60,
    sunsetStartMinutes: 17 * 60 + 30,
    duskStartMinutes: 18 * 60 + 30,
    nightStartMinutes: 19 * 60 + 15,
} as const;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => { const x = clamp(value); return x * x * (3 - 2 * x); };
const blend = (from: number, to: number, value: number) => from + (to - from) * smoothstep(value);

export function calculateTripDateTime(tripStartDateTime: number, simulationElapsedSeconds: number): Date {
    return new Date(tripStartDateTime + Math.max(0, simulationElapsedSeconds) * 1000);
}

export function calculateEnvironmentPhase(minutes: number): EnvironmentPhase {
    const t = ENVIRONMENT_TIMINGS;
    if (minutes >= t.dawnStartMinutes && minutes < t.dayStartMinutes) return 'dawn';
    if (minutes >= t.dayStartMinutes && minutes < t.sunsetStartMinutes) return 'day';
    if (minutes >= t.sunsetStartMinutes && minutes < t.duskStartMinutes) return 'sunset';
    if (minutes >= t.duskStartMinutes && minutes < t.nightStartMinutes) return 'dusk';
    return 'night';
}

export function calculateDaylightFactor(minutes: number): number {
    const t = ENVIRONMENT_TIMINGS;
    if (minutes < t.dawnStartMinutes) return 0;
    if (minutes < t.dayStartMinutes) return blend(0, 1, (minutes - t.dawnStartMinutes) / (t.dayStartMinutes - t.dawnStartMinutes));
    if (minutes < t.sunsetStartMinutes) return 1;
    if (minutes < t.duskStartMinutes) return blend(1, 0.22, (minutes - t.sunsetStartMinutes) / (t.duskStartMinutes - t.sunsetStartMinutes));
    if (minutes < t.nightStartMinutes) return blend(0.22, 0, (minutes - t.duskStartMinutes) / (t.nightStartMinutes - t.duskStartMinutes));
    return 0;
}

export function calculateEnvironment(dateTime: Date): EnvironmentState {
    const minutes = dateTime.getHours() * 60 + dateTime.getMinutes() + dateTime.getSeconds() / 60;
    return {dateTime, phase: calculateEnvironmentPhase(minutes), daylightFactor: calculateDaylightFactor(minutes), weather: 'clear'};
}

export function getEnvironmentState(tripStartDateTime: number, simulationElapsedSeconds: number): EnvironmentState {
    return calculateEnvironment(calculateTripDateTime(tripStartDateTime, simulationElapsedSeconds));
}
