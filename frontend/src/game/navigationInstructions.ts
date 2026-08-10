import type {NavigationManeuver} from '../types/route.ts';
const road=(m:NavigationManeuver)=>m.roadRef||m.roadName;
const modifier=(m:NavigationManeuver)=>m.modifier?.replace('-', ' ');
export function formatManeuverInstruction(m:NavigationManeuver):string{
 const target=road(m),toward=m.destination?' toward '+m.destination:'';
 if(m.type==='arrive')return'Arrive at destination';
 if(m.type==='roundabout'||m.type==='rotary')return m.exit?'Take the '+ordinal(m.exit)+' exit':'Enter the roundabout';
 if(m.type==='exit')return m.exit?'Take exit '+m.exit:'Take the exit';
 if(m.type==='uturn')return 'Make a U-turn';
 if(m.type==='merge'||m.type==='on ramp'||m.type==='on_ramp')return target?'Merge onto '+target+toward:'Merge';
 if(m.type==='fork'||m.type==='off ramp'||m.type==='off_ramp')return target?'Keep '+(modifier(m)==='left'?'left':'right')+' onto '+target+toward:'Keep '+(modifier(m)||'right')+toward;
 if(m.type==='turn')return target?'Turn '+(modifier(m)||'ahead')+' onto '+target:'Turn '+(modifier(m)||'ahead');
 if(m.type==='keep')return 'Keep '+(modifier(m)||'straight')+toward;
 if(m.type==='depart')return target?'Continue on '+target:'Depart';
 return target?'Continue on '+target:'Continue';
}
function ordinal(value:number){return value===1?'first':value===2?'second':value===3?'third':value===4?'fourth':value+'th';}
export function prepareManeuvers(maneuvers:NavigationManeuver[]|undefined){return(maneuvers??[]).map(m=>({...m,instruction:formatManeuverInstruction(m)}));}
export function formatDistance(meters:number){const d=Math.max(0,meters);return d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km';}
export function maneuverIcon(m:NavigationManeuver){const t=m.type,mod=m.modifier||'';if(t==='arrive')return'⌖';if(t==='roundabout'||t==='rotary')return'⟳';if(t==='uturn')return'↶';if(t==='merge'||t==='fork'||t==='exit')return'⇢';if(mod.includes('left'))return'↰';if(mod.includes('right'))return'↱';return'↑';}