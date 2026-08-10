export type OsrmCoordinate=[number,number];
export type MannManeuver={routeDistanceMeters:number;distanceFromPreviousMeters:number;type:string;modifier?:string;roadName?:string;roadRef?:string;position?:OsrmCoordinate;exit?:number;destination?:string;intersections?:Array<{location?:OsrmCoordinate;bearings?:number[]}>};
export type MannNavigationSegment={startDistanceMeters:number;endDistanceMeters:number;roadName?:string;roadRef?:string;position?:OsrmCoordinate};
export type MannRoute={coordinates:OsrmCoordinate[];distanceMeters:number;durationSeconds:number;maneuvers:MannManeuver[];navigationSegments:MannNavigationSegment[]};
type OsrmStep={distance?:number;name?:string;ref?:string;destinations?:string;maneuver?:{location?:unknown;type?:unknown;modifier?:unknown;exit?:unknown};intersections?:Array<{location?:unknown;bearings?:unknown}>};
type OsrmResponse={code?:string;message?:string;routes?:Array<{distance?:number;duration?:number;geometry?:{coordinates?:unknown};legs?:Array<{steps?:OsrmStep[]}>}>};
const DEFAULT_OSRM_BASE_URL='https://router.project-osrm.org';const OSRM_TIMEOUT_MS=20_000;
function isCoordinate(value:unknown):value is OsrmCoordinate{return Array.isArray(value)&&value.length>=2&&typeof value[0]==='number'&&typeof value[1]==='number'&&Number.isFinite(value[0])&&Number.isFinite(value[1]);}
function optionalString(value:unknown){return typeof value==='string'&&value.trim()?value.trim():undefined;}
export async function fetchDrivingRoute(startLon:number,startLat:number,endLon:number,endLat:number):Promise<MannRoute>{
 const baseUrl=process.env.OSRM_BASE_URL??DEFAULT_OSRM_BASE_URL;
 const url=baseUrl.replace(/\/$/,'')+'/route/v1/driving/'+startLon+','+startLat+';'+endLon+','+endLat+'?overview=full&geometries=geojson&steps=true';
 const controller=new AbortController();const timeoutId=setTimeout(()=>controller.abort(),OSRM_TIMEOUT_MS);let response:Response;
 try{response=await fetch(url,{headers:{accept:'application/json'},signal:controller.signal});}
 catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw new Error('OSRM request timed out.');throw new Error('Unable to reach OSRM.');}
 finally{clearTimeout(timeoutId);}
 if(!response.ok)throw new Error('OSRM returned HTTP '+response.status+'.');let payload:OsrmResponse;
 try{payload=await response.json() as OsrmResponse;}catch{throw new Error('OSRM returned invalid JSON.');}
 const route=payload.routes?.[0];const coordinates=route?.geometry?.coordinates;
 if(payload.code!=='Ok'||!route||typeof route.distance!=='number'||typeof route.duration!=='number'||!Array.isArray(coordinates))throw new Error(payload.message||'OSRM did not return a usable driving route.');
 const normalizedCoordinates=coordinates.filter(isCoordinate);if(normalizedCoordinates.length<2)throw new Error('OSRM returned a route without enough road coordinates.');
 let distance=0;const navigationSegments:MannNavigationSegment[]=[],maneuvers:MannManeuver[]=[];
 for(const leg of route.legs??[])for(const step of leg.steps??[]){
  const stepDistance=typeof step.distance==='number'&&Number.isFinite(step.distance)?step.distance:0;
  const name=optionalString(step.name),ref=optionalString(step.ref),location=isCoordinate(step.maneuver?.location)?step.maneuver.location:undefined;const type=optionalString(step.maneuver?.type)??"continue",modifier=optionalString(step.maneuver?.modifier),intersections=step.intersections?.flatMap(i=>{const location=isCoordinate(i.location)?i.location:undefined;return location?[{location}]:[]}),exit=typeof step.maneuver?.exit==="number"&&Number.isFinite(step.maneuver.exit)?step.maneuver.exit:undefined,destination=optionalString(step.destinations);maneuvers.push({routeDistanceMeters:distance,distanceFromPreviousMeters:stepDistance,type,...modifier?{modifier}:{},...name?{roadName:name}:{},...ref?{roadRef:ref}:{},...location?{position:location}:{},...exit!==undefined?{exit}:{},...destination?{destination}:{},...intersections?.length?{intersections}:{} });
  if(name||ref)navigationSegments.push({startDistanceMeters:distance,endDistanceMeters:distance+stepDistance,...name?{roadName:name}:{},...ref?{roadRef:ref}:{},...(location?{position:location}:{})});
  distance+=stepDistance;
 }
 return{coordinates:normalizedCoordinates,distanceMeters:route.distance,durationSeconds:route.duration,maneuvers,navigationSegments};
}
