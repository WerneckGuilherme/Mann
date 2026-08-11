export type MannWeatherCondition = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';

export interface LiveWeather {
    latitude: number; longitude: number; observedAt: string; temperatureC: number; apparentTemperatureC: number; humidityPercent: number;
    precipitationMm: number; rainMm: number; showersMm: number; cloudCoverPercent: number; windSpeedKmh: number; windDirectionDegrees: number;
    windGustKmh: number; visibilityMeters: number; weatherCode: number; condition: MannWeatherCondition; isDay: boolean;
}
type OpenMeteoResponse = {latitude?: number; longitude?: number; current?: Record<string, unknown>};
const WEATHER_CACHE_TTL_MS=10*60*1000, WEATHER_TIMEOUT_MS=12000;
const cache=new Map<string,{expires:number;value:LiveWeather}>();
const numberValue=(value:unknown,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const booleanValue=(value:unknown)=>value===true||value===1;
const cellKey=(latitude:number,longitude:number)=>latitude.toFixed(2)+','+longitude.toFixed(2);
export function conditionFromWmoCode(code:number):MannWeatherCondition{
    if([45,48].includes(code))return'fog';
    if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return'rain';
    if([71,73,75,77,85,86].includes(code))return'snow';
    if([95,96,99].includes(code))return'storm';
    if([1,2,3].includes(code))return'cloudy';
    return'clear';
}
export async function fetchLiveWeather(latitude:number,longitude:number):Promise<LiveWeather>{
    const key=cellKey(latitude,longitude),cached=cache.get(key);if(cached&&cached.expires>Date.now())return cached.value;
    const params=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),current:['temperature_2m','apparent_temperature','relative_humidity_2m','precipitation','rain','showers','weather_code','cloud_cover','wind_speed_10m','wind_direction_10m','wind_gusts_10m','visibility','is_day'].join(','),temperature_unit:'celsius',wind_speed_unit:'kmh',precipitation_unit:'mm',timezone:'UTC'});
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),WEATHER_TIMEOUT_MS);
    try{
        const response=await fetch('https://api.open-meteo.com/v1/forecast?'+params,{headers:{accept:'application/json','user-agent':'Mann/0.1 live weather'},signal:controller.signal});
        if(!response.ok)throw new Error('Open-Meteo returned HTTP '+response.status+'.');
        const payload=await response.json() as OpenMeteoResponse,current=payload.current;
        if(!current||typeof current.time!=='string')throw new Error('Open-Meteo returned incomplete current weather.');
        const weatherCode=numberValue(current.weather_code),value:LiveWeather={
            latitude:numberValue(payload.latitude,latitude),longitude:numberValue(payload.longitude,longitude),observedAt:current.time,temperatureC:numberValue(current.temperature_2m),apparentTemperatureC:numberValue(current.apparent_temperature),
            humidityPercent:numberValue(current.relative_humidity_2m),precipitationMm:numberValue(current.precipitation),rainMm:numberValue(current.rain),showersMm:numberValue(current.showers),cloudCoverPercent:numberValue(current.cloud_cover),
            windSpeedKmh:numberValue(current.wind_speed_10m),windDirectionDegrees:numberValue(current.wind_direction_10m),windGustKmh:numberValue(current.wind_gusts_10m),visibilityMeters:numberValue(current.visibility),weatherCode,condition:conditionFromWmoCode(weatherCode),isDay:booleanValue(current.is_day)
        };
        cache.set(key,{expires:Date.now()+WEATHER_CACHE_TTL_MS,value});return value;
    }catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw new Error('Weather request timed out.');throw error;}finally{clearTimeout(timeout);}
}
