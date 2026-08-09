import type {AdministrativeLocation,NavigationSegment,Route} from '../types/route.ts';
import type {RouteEnvironment} from './routeAnalyzer.ts';
export interface NavigationContext{currentLocation?:AdministrativeLocation;currentRoad?:string;currentRoadName?:string;currentRoadRef?:string;nextLabel?:string;nextType?:'city'|'road';nextLocation?:AdministrativeLocation;nextRoad?:string;distanceToNextMeters?:number;highway:boolean}
const label=(s:NavigationSegment)=>s.roadRef||s.roadName;const canonical=(value?:string)=>value?.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
const sameLocation=(a?:AdministrativeLocation,b?:AdministrativeLocation)=>Boolean(a&&b&&a.city===b.city&&a.region===b.region&&a.country===b.country);
const locationText=(l?:AdministrativeLocation)=>[l?.city,l?.region,l?.country].filter(Boolean).join(' / ');
export function formatLocation(l?:AdministrativeLocation){return locationText(l);}
export function getNavigationContext(route:Route,distanceMeters:number,environment:RouteEnvironment):NavigationContext{
 const d=Math.max(0,distanceMeters),segments=(route.navigationSegments??[]).filter((s,i)=>label(s)&&(s.endDistanceMeters-s.startDistanceMeters>=100||i===0));
 let current:NavigationSegment|undefined;for(const segment of segments){if(segment.startDistanceMeters<=d)current=segment;else break;}
 const road=current?label(current):undefined;const nextRoad=segments.find(s=>s.startDistanceMeters>d+100&&label(s)&&canonical(label(s))!==canonical(road));
 const samples=route.locationSamples??[];let currentLocation=samples[0]?.location;for(const sample of samples){if(sample.distanceMeters<=d)currentLocation=sample.location;else break;}
 const nextCity=samples.find(s=>s.distanceMeters>d+200&&s.location.city&&(!currentLocation?.city||s.location.city!==currentLocation.city));
 const roadDistance=nextRoad?Math.max(0,nextRoad.startDistanceMeters-d):undefined;const cityDistance=nextCity?Math.max(0,nextCity.distanceMeters-d):undefined;
 const highway=environment==='highway'||Boolean(current?.roadRef&&/^[A-Z]{1,3}[- ]?\d+/.test(current.roadRef));
 if(highway&&nextCity)return{currentLocation,currentRoad:road,currentRoadName:current?.roadName,currentRoadRef:current?.roadRef,nextLabel:nextCity.location.city,nextType:'city',nextLocation:nextCity.location,distanceToNextMeters:cityDistance,highway};
 if(nextRoad)return{currentLocation,currentRoad:road,currentRoadName:current?.roadName,currentRoadRef:current?.roadRef,nextLabel:label(nextRoad),nextType:'road',nextRoad:label(nextRoad),distanceToNextMeters:roadDistance,highway};
 if(nextCity)return{currentLocation,currentRoad:road,currentRoadName:current?.roadName,currentRoadRef:current?.roadRef,nextLabel:nextCity.location.city,nextType:'city',nextLocation:nextCity.location,distanceToNextMeters:cityDistance,highway};
 return{currentLocation,currentRoad:road,currentRoadName:current?.roadName,currentRoadRef:current?.roadRef,highway};
}