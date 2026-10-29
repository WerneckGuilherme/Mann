import MapLayers from './MapLayers.tsx';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Coordinate, Route } from '../types/route.ts';
import type { EnvironmentState } from '../types/environment.ts';
import { getRouteProgress } from '../game/routeProgress.ts';
import { smoothFollowPose, smoothMarkerBearing, type FollowPose } from '../game/followCamera.ts';
import { hasMapTilerKey, mapSources, mapTilerGlyphs } from '../services/mapConfig.ts';
import { installEsriImageryProtocol } from '../services/esriImagery.ts';
import { roadCollisionWidthPixelsAtZoom0, type RoadWay } from '../game/freeDrive.ts';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const style: maplibregl.StyleSpecification = {
  version: 8,
  ...(mapTilerGlyphs ? { glyphs: mapTilerGlyphs } : {}),
  sources: { streets: mapSources.streets, ...(mapSources.satellite ? { satellite: mapSources.satellite } : {}), ...(mapSources.labels ? { labels: mapSources.labels } : {}), ...(mapSources.vector ? { maptiler: mapSources.vector } : {}) },
  layers: [
    { id: 'streets', type: 'raster', source: 'streets' },
    ...(mapSources.satellite ? [{ id: 'satellite', type: 'raster' as const, source: 'satellite', layout: { visibility: 'none' as const }, paint: { 'raster-fade-duration': 0 } }] : []),
    ...(mapSources.labels ? [{ id: 'labels', type: 'raster' as const, source: 'labels', layout: { visibility: 'none' as const }, paint: { 'raster-opacity': 0.78 }}] : []),
    ...(mapSources.vector ? [
      { id: 'hybrid-roads', type: 'line' as const, source: 'maptiler', 'source-layer': 'transportation', minzoom: 8, layout: { visibility: 'none' as const, 'line-cap': 'round' as const, 'line-join': 'round' as const }, paint: { 'line-color': '#f5f0c8', 'line-opacity': 0.78, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 14, 2.2, 18, 5] as any } },
      { id: 'hybrid-places', type: 'symbol' as const, source: 'maptiler', 'source-layer': 'place', minzoom: 5, layout: { visibility: 'none' as const, 'text-field': ['get', 'name'] as any, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 12, 14, 16, 18] as any, 'text-allow-overlap': false }, paint: { 'text-color': '#ffffff', 'text-halo-color': '#23303a', 'text-halo-width': 1.5, 'text-halo-blur': 0.2 } },
      { id: 'hybrid-road-labels', type: 'symbol' as const, source: 'maptiler', 'source-layer': 'transportation_name', minzoom: 10, layout: { visibility: 'none' as const, 'text-field': ['get', 'name'] as any, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'symbol-placement': 'line' as const }, paint: { 'text-color': '#fff7c7', 'text-halo-color': '#24313a', 'text-halo-width': 1.2 } },
    ] : []),
  ] as any,
};
const sourceId = 'mann-route', lineId = 'mann-route-line', casingId = 'mann-route-line-casing', traveledSourceId = 'mann-route-traveled', traveledLineId = 'mann-route-traveled-line', freeRoadSourceId = 'mann-free-roads';
const collisionHaloId = 'mann-road-collision-halo', collisionEdgeId = 'mann-road-collision-edge';
// Web Mercator uses 512 screen pixels at zoom 0. The corridor comes from the same
// width used by free-drive collision, so the overlay grows in meters with zoom.
const collisionGapWidth = ['interpolate', ['exponential', 2], ['zoom'], 0, ['to-number', ['get', 'collisionWidthPixelsAtZoom0']], 22, ['*', ['to-number', ['get', 'collisionWidthPixelsAtZoom0']], 2 ** 22]] as any;
function addCollisionBoundaryLayers(map: MapLibreMap) {
  const layout = { visibility: 'none' as const, 'line-cap': 'round' as const, 'line-join': 'round' as const };
  map.addLayer({ id: collisionHaloId, type: 'line', source: freeRoadSourceId, minzoom: 15.5, layout,
    paint: { 'line-color': '#09242d', 'line-width': 5, 'line-gap-width': collisionGapWidth, 'line-opacity': 0.92 } });
  map.addLayer({ id: collisionEdgeId, type: 'line', source: freeRoadSourceId, minzoom: 15.5, layout,
    paint: { 'line-color': '#72eddf', 'line-width': 2.4, 'line-gap-width': collisionGapWidth, 'line-opacity': 0.98 } });
}
const CHASE_ZOOM = 16.5;
const CHASE_PITCH = 48;
type Props = { position: Coordinate; bearing: number; route: Route | null; freeRoads?: RoadWay[]; traveledDistance: number; running: boolean; restartToken: number; origin: Coordinate | null; destination: Coordinate | null; selectMode: 'origin' | 'destination' | 'free-start' | null; onMapPick: (c: Coordinate) => void; cameraMode: 'chase' | 'orbit'; timeMultiplier: number; recenterToken: number; environment: EnvironmentState; mapPanelOpen: boolean; onCloseMapPanel: () => void; mapPanelTitle: string; closeLabel: string };
const empty = () => ({ type: 'FeatureCollection' as const, features: [] });
const freeRoadData = (roads?: RoadWay[]) => ({ type: 'FeatureCollection' as const, features: (roads ?? []).map(road => {
  const latitude = road.coordinates[Math.floor(road.coordinates.length / 2)]?.[1] ?? 0;
  return { type: 'Feature' as const, properties: {
    collisionWidthPixelsAtZoom0: roadCollisionWidthPixelsAtZoom0(road, latitude),
  }, geometry: { type: 'LineString' as const, coordinates: road.coordinates } };
}) });
const routeData = (r: Route | null) => !r || r.coordinates.length < 2 ? empty() : ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: r.coordinates.map(p => [p.longitude, p.latitude]) } });
function traveledData(r: Route | null, distance: number) { if (!r || r.coordinates.length < 2 || distance <= 0) return empty(); if (distance >= (r.distanceMeters ?? Infinity)) return routeData(r); const x = getRouteProgress(r, distance), points = r.coordinates.slice(0, x.segmentIndex + 1).map(p => [p.longitude, p.latitude] as [number, number]); points.push([x.position.longitude, x.position.latitude]); return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: points } }; }
function fit(map: MapLibreMap, r: Route | null) { if (!r || r.coordinates.length < 2) return; const first = r.coordinates[0], bounds = r.coordinates.reduce((x, p) => x.extend([p.longitude, p.latitude]), new maplibregl.LngLatBounds([first.longitude, first.latitude], [first.longitude, first.latitude])), mobile = map.getContainer().clientWidth < 700; map.fitBounds(bounds, { padding: { top: mobile ? 84 : 82, bottom: mobile ? 88 : 28, left: mobile ? 18 : 104, right: mobile ? 18 : 22 }, duration: 700, maxZoom: CHASE_ZOOM }); }
export default function GameMap(p: Props) { const [loadedMap, setLoadedMap] = useState<MapLibreMap | null>(null); const ref = useRef<HTMLDivElement>(null), mapRef = useRef<MapLibreMap | null>(null), markerRef = useRef<maplibregl.Marker | null>(null), headlightRef = useRef<HTMLDivElement | null>(null), weatherLayerRef = useRef<HTMLDivElement | null>(null), originRef = useRef<maplibregl.Marker | null>(null), destinationRef = useRef<maplibregl.Marker | null>(null), ready = useRef(false); const latest = useRef(p); latest.current = p; const lastRecenter = useRef(0), lastRestart = useRef(0), fittedCoordinates = useRef<Route['coordinates'] | null>(null); const routeRef = useRef(p.route); routeRef.current = p.route; const selectModeRef = useRef(p.selectMode); selectModeRef.current = p.selectMode; const pickRef = useRef(p.onMapPick); pickRef.current = p.onMapPick;
const cameraPoseRef = useRef<FollowPose | null>(null);
const displayedBearingRef = useRef(p.bearing);
useEffect(() => { if (!ref.current) return; const disposeEsri = !hasMapTilerKey ? installEsriImageryProtocol() : null; const map = new maplibregl.Map({ container: ref.current, style, center: [p.position.longitude, p.position.latitude], zoom: p.freeRoads !== undefined ? 17.5 : 13, pitch: 48, bearing: p.bearing, attributionControl: false }); mapRef.current = map; map.scrollZoom.setWheelZoomRate(1 / 350); const img = document.createElement('img'); img.className = 'vehicle-marker'; img.src = '/assets/car.svg'; img.alt = 'Player vehicle'; img.style.zIndex = '3'; const marker = new maplibregl.Marker({ element: img, anchor: 'center', rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([p.position.longitude, p.position.latitude]).addTo(map); markerRef.current = marker; const weatherLayer = document.createElement('div'); weatherLayer.className = 'weather-layer'; weatherLayer.setAttribute('aria-hidden', 'true'); ref.current.appendChild(weatherLayer); weatherLayerRef.current = weatherLayer; const headlight = document.createElement('div'); headlight.className = 'headlight-beam'; headlight.setAttribute('aria-hidden', 'true'); ref.current.appendChild(headlight); headlightRef.current = headlight; map.addControl(new maplibregl.NavigationControl(), 'top-right'); map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right'); map.on('click', e => { if (selectModeRef.current) pickRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng }); }); map.on('style.load', () => { ready.current = true; setLoadedMap(map); if (!map.getSource(sourceId)) { map.addSource(sourceId, { type: 'geojson', data: empty() }); map.addSource(traveledSourceId, { type: 'geojson', data: empty() }); map.addSource(freeRoadSourceId, { type: 'geojson', data: empty() }); map.addLayer({ id: 'mann-free-roads-line', type: 'line', source: freeRoadSourceId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#56e1cc', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.4, 16, 3.5, 19, 9] as any, 'line-opacity': 0.45 } }); addCollisionBoundaryLayers(map); map.addLayer({ id: casingId, type: 'line', source: sourceId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#123047', 'line-width': 10 } }); map.addLayer({ id: lineId, type: 'line', source: sourceId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#35c7f4', 'line-width': 5 } }); map.addLayer({ id: traveledLineId, type: 'line', source: traveledSourceId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2779ff', 'line-width': 3.5, 'line-opacity': .85 } }); } (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(routeData(routeRef.current)); (map.getSource(traveledSourceId) as maplibregl.GeoJSONSource).setData(traveledData(routeRef.current, latest.current.traveledDistance)); (map.getSource(freeRoadSourceId) as maplibregl.GeoJSONSource).setData(freeRoadData(latest.current.freeRoads)); fit(map, routeRef.current); fittedCoordinates.current = routeRef.current?.coordinates ?? null; });
const renderLighting=()=>{const current=latest.current;const point=map.project([current.position.longitude,current.position.latitude]);const intensity=Math.max(0,Math.min(1,(.62-current.environment.daylightFactor)/.62));headlight.style.left=point.x+"px";headlight.style.top=point.y+"px";headlight.style.opacity=String(intensity*.72);headlight.style.transform="translate(-50%, -100%) rotate("+(displayedBearingRef.current-map.getBearing())+"deg)"};map.on("render",renderLighting);
return () => { map.off('render', renderLighting); marker.remove(); weatherLayer.remove(); headlight.remove(); map.remove(); disposeEsri?.(); mapRef.current = null; ready.current = false; }; }, []);
useEffect(()=>{const map=mapRef.current;if(!map||!ready.current)return;(map.getSource(sourceId) as maplibregl.GeoJSONSource)?.setData(routeData(p.route));(map.getSource(traveledSourceId) as maplibregl.GeoJSONSource)?.setData(traveledData(p.route,p.traveledDistance));if(fittedCoordinates.current!==p.route?.coordinates){fit(map,p.route);fittedCoordinates.current=p.route?.coordinates??null}},[p.route,loadedMap]);useEffect(()=>{const source=mapRef.current?.getSource(traveledSourceId) as maplibregl.GeoJSONSource|undefined;if(source)source.setData(traveledData(p.route,p.traveledDistance))},[p.traveledDistance,p.route]);useEffect(()=>{const map=mapRef.current;if(!map||!ready.current)return;for(const x of [originRef,destinationRef]){x.current?.remove();x.current=null}if(p.origin)originRef.current=new maplibregl.Marker({color:"#61e294"}).setLngLat([p.origin.longitude,p.origin.latitude]).addTo(map);if(p.destination)destinationRef.current=new maplibregl.Marker({color:"#ff7b8a"}).setLngLat([p.destination.longitude,p.destination.latitude]).addTo(map)},[p.origin,p.destination,loadedMap]);
useEffect(()=>{const source=mapRef.current?.getSource(freeRoadSourceId) as maplibregl.GeoJSONSource|undefined;if(source)source.setData(freeRoadData(p.freeRoads))},[p.freeRoads,loadedMap]);
useEffect(()=>{const map=mapRef.current;if(!map||!loadedMap)return;if(!map.getLayer('mann-route-glow'))map.addLayer({id:'mann-route-glow',type:'line',source:sourceId,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#42d8ff','line-width':14,'line-opacity':0.24,'line-blur':4}},casingId);if(!map.getLayer('mann-progress-glow'))map.addLayer({id:'mann-progress-glow',type:'line',source:traveledSourceId,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#348bff','line-width':10,'line-opacity':0.38,'line-blur':3}},traveledLineId)},[loadedMap]);
useEffect(() => {
  const map = mapRef.current, marker = markerRef.current, beam = headlightRef.current;
  const weatherLayer = weatherLayerRef.current;
  if (!map || !marker) return;
  const daylight = p.environment.daylightFactor;
  if (weatherLayer) weatherLayer.className = 'weather-layer weather-' + p.environment.weather;
  map.getCanvas().style.filter = `brightness(${(0.72 + daylight * 0.28).toFixed(3)}) saturate(${(0.84 + daylight * 0.16).toFixed(3)})`;
  marker.setLngLat([p.position.longitude, p.position.latitude]);
  if (beam) {
    const point = map.project([p.position.longitude, p.position.latitude]);
    const intensity = Math.max(0, Math.min(1, (0.62 - daylight) / 0.62));
    beam.style.left = point.x + 'px';
    beam.style.top = point.y + 'px';
    beam.style.opacity = String(intensity * 0.72);
    beam.style.transform = 'translate(-50%, -100%) rotate(' + (displayedBearingRef.current - map.getBearing()) + 'deg)';
  }
}, [p.position, p.bearing, p.environment]);

useEffect(() => {
  const map = loadedMap;
  if (!map) return;
  let frame = 0, previous = performance.now(), wasChasing = false;
  let displayedBearing = latest.current.bearing;
  const tick = (now: number) => {
    const dt = Math.max(0, Math.min(0.1, (now - previous) / 1000));
    previous = now;
    const current = latest.current;
    displayedBearing = current.running
      ? smoothMarkerBearing(displayedBearing, current.bearing, dt, current.timeMultiplier)
      : current.bearing;
    displayedBearingRef.current = displayedBearing;
    markerRef.current?.setRotation(displayedBearing);
    if (current.running && current.cameraMode === 'chase') {
      if (map.scrollZoom.isActive() || map.touchZoomRotate.isActive()) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      if (!wasChasing || !cameraPoseRef.current) {
        const offsetY = Math.min(140, map.getContainer().clientHeight * 0.16);
        const anchor = map.unproject([map.getContainer().clientWidth / 2, map.getContainer().clientHeight / 2 + offsetY]);
        cameraPoseRef.current = { longitude: anchor.lng, latitude: anchor.lat, bearing: map.getBearing(), pitch: map.getPitch() };
        wasChasing = true;
      }
      cameraPoseRef.current = smoothFollowPose(cameraPoseRef.current, {
        longitude: current.position.longitude, latitude: current.position.latitude,
        bearing: current.bearing, pitch: CHASE_PITCH,
      }, dt, current.timeMultiplier);
      const pose = cameraPoseRef.current;
      const zoom = map.getZoom();
      const zoomTarget = Math.min(map.getMaxZoom(), Math.max(zoom, CHASE_ZOOM));
      const zoomFactor = 1 - Math.exp(-dt * Math.min(8, Math.sqrt(current.timeMultiplier)) / 0.65);
      map.easeTo({
        center: [pose.longitude, pose.latitude], bearing: pose.bearing, pitch: pose.pitch,
        zoom: zoom + (zoomTarget - zoom) * zoomFactor,
        offset: [0, Math.min(140, map.getContainer().clientHeight * 0.16)], duration: 0,
      });
    } else {
      wasChasing = false;
      cameraPoseRef.current = null;
    }
    frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  return () => { window.cancelAnimationFrame(frame); cameraPoseRef.current = null; };
}, [loadedMap]);
useEffect(() => {
  if (p.recenterToken === lastRecenter.current) return;
  lastRecenter.current = p.recenterToken;
  const map = mapRef.current, current = latest.current;
  if (!map) return;
  const center: [number, number] = [current.position.longitude, current.position.latitude];
  if (current.cameraMode === 'chase') {
    cameraPoseRef.current = { longitude: center[0], latitude: center[1], bearing: current.bearing, pitch: map.getPitch() };
    map.easeTo({ center, bearing: current.bearing, offset: [0, Math.min(140, map.getContainer().clientHeight * 0.16)], duration: 0 });
  } else map.easeTo({ center, duration: 400 });
}, [p.recenterToken]);
useEffect(()=>{if(p.restartToken===lastRestart.current)return;lastRestart.current=p.restartToken;if(mapRef.current)fit(mapRef.current,p.route)},[p.restartToken,p.route]);return <><div ref={ref} className={"map-canvas "+(p.selectMode?"map-pick-mode":"")} aria-label="Mann navigation map"/><section id="panel-map" className="workspace-panel workspace-panel--map" hidden={!p.mapPanelOpen} aria-label={p.mapPanelTitle}><div className="workspace-panel-heading"><div><small>MANN</small><h2>{p.mapPanelTitle}</h2></div><button type="button" onClick={p.onCloseMapPanel} aria-label={p.closeLabel}>×</button></div><MapLayers map={loadedMap} hasCollisionRoads={p.freeRoads !== undefined}/></section></>}
