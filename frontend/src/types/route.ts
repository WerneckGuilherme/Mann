export type Coordinate={latitude:number;longitude:number};
export interface AdministrativeLocation{city?:string;region?:string;country?:string}
export interface NavigationSegment{startDistanceMeters:number;endDistanceMeters:number;roadName?:string;roadRef?:string;position?:Coordinate}
export interface LocationSample{distanceMeters:number;location:AdministrativeLocation}
export type Route={coordinates:Coordinate[];distanceMeters?:number;durationSeconds?:number;navigationSegments?:NavigationSegment[];locationSamples?:LocationSample[]};
export type RouteProgress={position:Coordinate;segmentIndex:number;traveledDistance:number;remainingDistance:number;progress:number;bearing:number};
export interface GeocodingResult{id:string;displayName:string;lat:number;lon:number;}