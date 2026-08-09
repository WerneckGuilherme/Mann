import type { Coordinate } from '../types/route.ts';
const EARTH_RADIUS_METERS = 6_371_000;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (value: number) => (value * 180) / Math.PI;
export function distanceBetweenCoordinates(a: Coordinate, b: Coordinate): number { const latDelta = radians(b.latitude-a.latitude); const lonDelta = radians(b.longitude-a.longitude); const latA=radians(a.latitude); const latB=radians(b.latitude); const h=Math.sin(latDelta/2)**2+Math.cos(latA)*Math.cos(latB)*Math.sin(lonDelta/2)**2; return 2*EARTH_RADIUS_METERS*Math.asin(Math.sqrt(h)); }
export function interpolateCoordinates(a: Coordinate,b: Coordinate,fraction:number): Coordinate { const t=Math.max(0,Math.min(1,fraction)); return { latitude:a.latitude+(b.latitude-a.latitude)*t, longitude:a.longitude+(b.longitude-a.longitude)*t }; }
export function bearingBetweenCoordinates(a:Coordinate,b:Coordinate):number { const latA=radians(a.latitude); const latB=radians(b.latitude); const lonDelta=radians(b.longitude-a.longitude); const y=Math.sin(lonDelta)*Math.cos(latB); const x=Math.cos(latA)*Math.sin(latB)-Math.sin(latA)*Math.cos(latB)*Math.cos(lonDelta); return (degrees(Math.atan2(y,x))+360)%360; }
