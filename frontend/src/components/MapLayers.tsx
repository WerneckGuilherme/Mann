import { useEffect, useState } from 'react';
import type { ErrorEvent, Map } from 'maplibre-gl';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { COLLISION_BORDER_STORAGE_KEY, hasMapTilerKey, MAP_VIEW_STORAGE_KEY, mapSources, TERRAIN_STORAGE_KEY, type MapViewMode } from '../services/mapConfig.ts';

const readMode = (): MapViewMode => { const value = localStorage.getItem(MAP_VIEW_STORAGE_KEY); return value === 'satellite' || value === 'hybrid' ? value : 'map'; };
const readTerrain = () => localStorage.getItem(TERRAIN_STORAGE_KEY) !== 'false';
const readCollisionBorder = () => localStorage.getItem(COLLISION_BORDER_STORAGE_KEY) !== 'false';

// Changes existing MapLibre state only; the map instance and trip state remain intact.
export default function MapLayers({ map, hasCollisionRoads }: { map: Map | null; hasCollisionRoads: boolean }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<MapViewMode>(() => { const saved = readMode(); return saved === 'hybrid' && !hasMapTilerKey ? 'map' : saved; });
  const [terrain, setTerrain] = useState(readTerrain);
  const [collisionBorder, setCollisionBorder] = useState(readCollisionBorder);
  const [zoom, setZoom] = useState(13);
  const [message, setMessage] = useState<string | null>(null);
  const borderVisible = hasCollisionRoads && mode !== 'map' && collisionBorder;
  const terrainActive = terrain && !borderVisible;

  useEffect(() => {
    if (!map) return;
    const onError = (event: ErrorEvent & { sourceId?: string }) => {
      if (event.sourceId === 'satellite' || event.sourceId === 'labels') { setMode('map'); setMessage(t('mapLayerUnavailable')); }
      if (event.sourceId === 'terrain') { setTerrain(false); setMessage(t('terrainUnavailable')); }
    };
    map.on('error', onError);
    return () => { map.off('error', onError); };
  }, [map, t]);

  useEffect(() => {
    if (!map) return;
    map.setLayoutProperty('streets', 'visibility', mode === 'map' ? 'visible' : 'none');
    if (map.getLayer('satellite')) map.setLayoutProperty('satellite', 'visibility', mode === 'map' ? 'none' : 'visible');
    if (map.getLayer('labels')) map.setLayoutProperty('labels', 'visibility', mode === 'hybrid' ? 'visible' : 'none');
    for (const layerId of ['hybrid-roads', 'hybrid-places', 'hybrid-road-labels']) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', mode === 'hybrid' ? 'visible' : 'none');
    }
    localStorage.setItem(MAP_VIEW_STORAGE_KEY, mode);
  }, [map, mode]);

  useEffect(() => {
    if (!map) return;
    const satelliteVisible = mode !== 'map';
    if (map.getLayer('mann-free-roads-line')) map.setLayoutProperty('mann-free-roads-line', 'visibility', satelliteVisible ? 'none' : 'visible');
    for (const id of ['mann-road-collision-halo', 'mann-road-collision-edge']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', borderVisible ? 'visible' : 'none');
    }
    localStorage.setItem(COLLISION_BORDER_STORAGE_KEY, String(collisionBorder));
  }, [map, mode, borderVisible, collisionBorder]);

  useEffect(() => {
    if (!map || !mapSources.terrain) return;
    if (!map.getSource('terrain')) map.addSource('terrain', mapSources.terrain);
    if (!map.getLayer('mann-hillshade')) map.addLayer({ id: 'mann-hillshade', type: 'hillshade', source: 'terrain', layout: { visibility: terrainActive ? 'visible' : 'none' }, paint: { 'hillshade-exaggeration': 0.18, 'hillshade-shadow-color': '#394536' } }, 'mann-free-roads-line');
    map.setTerrain(terrainActive ? { source: 'terrain', exaggeration: 1 } : null);
    map.setLayoutProperty('mann-hillshade', 'visibility', terrainActive ? 'visible' : 'none');
    localStorage.setItem(TERRAIN_STORAGE_KEY, String(terrain));
  }, [map, terrain, terrainActive]);

  useEffect(() => {
    if (!map) return;
    map.setMaxZoom(22);
    const onZoom = () => setZoom(Math.round(map.getZoom() * 10) / 10);
    onZoom();
    map.on('zoom', onZoom);
    return () => { map.off('zoom', onZoom); };
  }, [map]);

  const chooseMode = (next: MapViewMode) => { if (!hasMapTilerKey && next === 'hybrid') { setMessage(t('mapTilerMissing')); return; } setMessage(null); setMode(next); };
  const toggleTerrain = () => { setMessage(null); setTerrain(value => !value); };

  return <div className="map-layers" role="group" aria-label={t('mapLayers')}>
    <button disabled={!map} aria-pressed={mode === 'map'} onClick={() => chooseMode('map')}>{t('mapView')}</button>
    <button disabled={!map} aria-pressed={mode === 'satellite'} onClick={() => chooseMode('satellite')}>{t('satelliteMap')}</button>
    <button disabled={!map} aria-pressed={mode === 'hybrid'} onClick={() => chooseMode('hybrid')}>{t('hybridMap')}</button>
    <button disabled={!map || borderVisible} aria-pressed={terrainActive} title={borderVisible ? t('collisionTerrainHint') : undefined} onClick={toggleTerrain}>{t('terrain3d')}</button>
    {hasCollisionRoads && mode !== 'map' && <button className="collision-border-toggle" disabled={!map} aria-pressed={collisionBorder} onClick={() => setCollisionBorder(value => !value)}>{t('collisionBorder')}</button>}
    {borderVisible && terrain && <span role="status">{t('collisionTerrainHint')}</span>}
    {hasCollisionRoads && mode !== 'map' && collisionBorder && zoom < 15.5 && <span role="status">{t('collisionBorderZoomHint')}</span>}
    <label className="map-zoom-control"><span>{t('mapZoom')} · {zoom.toFixed(1)}</span><input type="range" min="2" max="22" step="0.1" value={Math.min(22, Math.max(2, zoom))} disabled={!map} onChange={event => map?.setZoom(Number(event.target.value))} aria-label={t('mapZoom')} /></label>
    {message && <span role="status">{message}</span>}
  </div>;
}
