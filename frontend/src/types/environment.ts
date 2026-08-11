export type EnvironmentPhase = 'day' | 'sunset' | 'dusk' | 'night' | 'dawn';
export type WeatherState = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';

export interface EnvironmentState {
    dateTime: Date;
    phase: EnvironmentPhase;
    daylightFactor: number;
    weather: WeatherState;
}
