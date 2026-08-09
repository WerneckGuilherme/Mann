export interface VehicleDefinition { id:string; name:string; maxSpeedKmh:number; acceleration:number; braking:number; }
export const VEHICLES: VehicleDefinition[] = [
 {id:'car-1',name:'Car 1',maxSpeedKmh:90,acceleration:2.2,braking:4.8},
 {id:'car-2',name:'Car 2',maxSpeedKmh:120,acceleration:2.8,braking:5.4},
 {id:'car-3',name:'Car 3',maxSpeedKmh:160,acceleration:3.4,braking:6.2},
];
export function getVehicle(id:string):VehicleDefinition{return VEHICLES.find(v=>v.id===id)??VEHICLES[0];}
