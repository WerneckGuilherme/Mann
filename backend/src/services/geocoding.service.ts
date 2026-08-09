export type GeocodingResult={id:string;displayName:string;lat:number;lon:number};
export type AdministrativeLocation={city?:string;region?:string;country?:string};
type NominatimItem={place_id?:number;display_name?:string;lat?:string;lon?:string;address?:{city?:string;town?:string;village?:string;municipality?:string;state?:string;region?:string;country?:string}};
const reverseCache=new Map<string,{expires:number;value:AdministrativeLocation|null}>();
export async function searchLocations(query:string):Promise<GeocodingResult[]>{
 const base=process.env.NOMINATIM_BASE_URL??'https://nominatim.openstreetmap.org';const url=base.replace(/\/$/,'')+'/search?format=jsonv2&limit=5&q='+encodeURIComponent(query.trim());
 const response=await fetch(url,{headers:{accept:'application/json','user-agent':'MANN beta navigation simulator (local development)'}});
 if(!response.ok)throw new Error('Geocoder returned HTTP '+response.status+'.');const items=await response.json() as NominatimItem[];if(!Array.isArray(items))throw new Error('Geocoder returned an invalid response.');
 return items.flatMap((item,index)=>{const lat=Number(item.lat),lon=Number(item.lon);return Number.isFinite(lat)&&Number.isFinite(lon)?[{id:String(item.place_id??index),displayName:item.display_name??'Unnamed location',lat,lon}]:[];});
}
export async function reverseGeocode(latitude:number,longitude:number):Promise<AdministrativeLocation|null>{
 const base=process.env.NOMINATIM_BASE_URL??'https://nominatim.openstreetmap.org';const key=latitude.toFixed(3)+','+longitude.toFixed(3);const cached=reverseCache.get(key);if(cached&&cached.expires>Date.now())return cached.value;
 const url=base.replace(/\/$/,'')+'/reverse?format=jsonv2&zoom=10&lat='+encodeURIComponent(latitude)+'&lon='+encodeURIComponent(longitude);
 try{const response=await fetch(url,{headers:{accept:'application/json','user-agent':'MANN beta navigation simulator (local development)'}});if(!response.ok)throw new Error('Reverse geocoder returned HTTP '+response.status+'.');
  const item=await response.json() as NominatimItem;const address=item.address;const value=address?{city:address.city??address.town??address.village??address.municipality,region:address.state??address.region,country:address.country}:null;reverseCache.set(key,{expires:Date.now()+86400000,value});return value;
 }catch{reverseCache.set(key,{expires:Date.now()+600000,value:null});return null;}
}
