import type {NavigationContext as NavigationContextData} from '../game/navigationContext.ts';
import {formatDistance,maneuverIcon} from '../game/navigationInstructions.ts';
type Props={context:NavigationContextData;event?:{label:string;detail?:string}|null;completed:boolean};
export default function NavigationContext({context,event,completed}:Props){
 const location=[context.currentLocation?.city,context.currentLocation?.region,context.currentLocation?.country].filter(Boolean).join(' / ');
 const road=context.currentRoadRef||context.currentRoadName||context.currentRoad;
 const maneuver=context.nextManeuver;
 return <><section className="navigation-context" aria-label="Navigation guidance">
  <div className="guidance-current"><small>{context.highway?'CURRENT ROAD':'CURRENT LOCATION'}</small><strong>{context.highway?road:location||road||'Route'}</strong>{!context.highway&&road&&road!==location&&<span>{road}</span>}</div>
  {completed?<div className="arrival-guidance"><b>Destination reached</b><span>{location||'Route complete'}</span><small>100% complete</small></div>:maneuver&&<div className="maneuver-card"><span className="maneuver-icon" aria-hidden="true">{maneuverIcon(maneuver)}</span><div><small>IN {formatDistance(context.distanceToManeuverMeters??0)}</small><strong>{maneuver.instruction}</strong></div></div>}
  {context.nextLabel&&context.distanceToNextMeters!==undefined&&<div className="next-context navigation-sign"><small>{context.nextType==='city'?'NEXT CITY':'NEXT ROAD'}</small><strong>{context.nextLabel}</strong><span>{formatDistance(context.distanceToNextMeters)}</span></div>}
 </section>{event&&<aside className="navigation-event" aria-live="polite"><small>{event.label}</small><strong>{event.detail}</strong></aside>}</>;
}