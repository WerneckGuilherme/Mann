import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GameMap from './GameMap.tsx';
import FreeDrivePads from './FreeDrivePads.tsx';
import { useLanguage } from '../i18n/LanguageContext.tsx';
import { advanceFreeDrive, buildRoadNetwork, createFreeDrive, nearestRoadPoint, type FreeDriveInput, type RoadNetwork, type RoadWay } from '../game/freeDrive.ts';
import { combineDriveInputs, gamepadDriveInput, keyboardDriveInput } from '../game/freeDriveInput.ts';
import { startGameLoop } from '../game/gameLoop.ts';
import { getEnvironmentState } from '../game/environment.ts';
import { requestNearbyRoads } from '../services/roadsService.ts';
import { searchLocations } from '../services/routingService.ts';
import { distanceBetweenCoordinates } from '../utils/geo.ts';
import { VEHICLES, getVehicle } from '../types/vehicle.ts';
import type { Coordinate, GeocodingResult } from '../types/route.ts';

type FreePanel = 'place' | 'drive' | 'map' | 'status';
const DEFAULT_CENTER: Coordinate = { latitude: -19.9191, longitude: -43.9386 };
const emptyInput = (): FreeDriveInput => ({ steering: 0, throttle: 0, brake: 0 });

export default function FreeDriveGame({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage();
  const [drive, setDrive] = useState(() => createFreeDrive(DEFAULT_CENTER));
  const [roads, setRoads] = useState<RoadWay[]>([]);
  const [vehicleId, setVehicleId] = useState('car-2');
  const [cameraMode, setCameraMode] = useState<'chase' | 'orbit'>('chase');
  const [activePanel, setActivePanel] = useState<FreePanel | null>('place');
  const [selectingStart, setSelectingStart] = useState(false);
  const [ready, setReady] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState<'freeRoadsError' | 'freeNoRoad' | null>(null);
  const [recenterToken, setRecenterToken] = useState(0);
  const [search, setSearch] = useState(''), [searching, setSearching] = useState(false), [results, setResults] = useState<GeocodingResult[]>([]);
  const [gamepadName, setGamepadName] = useState('');
  const roadsRef = useRef<RoadWay[]>([]), networkRef = useRef<RoadNetwork | null>(null);
  const keys = useRef(new Set<string>()), touchInput = useRef<FreeDriveInput>(emptyInput());
  const requestRef = useRef<AbortController | null>(null), loadedCenter = useRef<Coordinate | null>(null), requestedPoint = useRef(DEFAULT_CENTER), lastAttempt = useRef(0);
  const vehicle = getVehicle(vehicleId);

  const loadRoads = useCallback(async (point: Coordinate, placeCar: boolean) => {
    if (requestRef.current) {
      if (!placeCar) return;
      requestRef.current.abort();
    }
    const controller = new AbortController();
    requestRef.current = controller;
    requestedPoint.current = point;
    loadedCenter.current = point;
    lastAttempt.current = Date.now();
    setLoading(true); setError(null);
    if (placeCar) setDrive(state => ({ ...state, running: false }));
    try {
      const fetched = await requestNearbyRoads(point, controller.signal);
      if (controller.signal.aborted) return;
      const retained = placeCar ? [] : roadsRef.current.filter(road => road.coordinates.some(([lon, lat]) =>
        distanceBetweenCoordinates({ latitude: lat, longitude: lon }, point) < 2400));
      const merged = [...new Map([...retained, ...fetched].map(road => [road.id, road])).values()];
      const network = buildRoadNetwork(merged, point);
      if (!network.segments.length) { setError('freeNoRoad'); if (placeCar) setReady(false); return; }
      roadsRef.current = merged; networkRef.current = network; setRoads(merged);
      if (placeCar) {
        const snap = nearestRoadPoint(network, point);
        if (!snap || snap.distanceMeters > 100) { setError('freeNoRoad'); setReady(false); return; }
        setDrive(createFreeDrive(snap.position, snap.bearing));
        setReady(true); setRecenterToken(value => value + 1); setActivePanel(null);
      }
    } catch {
      if (!controller.signal.aborted) setError('freeRoadsError');
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setLoading(false); }
    }
  }, []);

  useEffect(() => { void loadRoads(DEFAULT_CENTER, true); return () => { requestRef.current?.abort(); }; }, [loadRoads]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (element?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
      keys.current.add(event.code);
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const clear = () => { keys.current.clear(); touchInput.current = emptyInput(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear); };
  }, []);
  useEffect(() => startGameLoop(delta => {
    const gamepad = navigator.getGamepads?.().find(pad => pad?.connected) ?? null;
    setGamepadName(current => current === (gamepad?.id ?? '') ? current : gamepad?.id ?? '');
    const network = networkRef.current;
    if (!network || delta <= 0) return;
    const input = combineDriveInputs(keyboardDriveInput(keys.current), gamepadDriveInput(gamepad), touchInput.current);
    setDrive(state => advanceFreeDrive(state, delta, input, network, vehicle));
  }), [vehicle]);
  useEffect(() => {
    if (!ready || !loadedCenter.current || requestRef.current || Date.now() - lastAttempt.current < 1000) return;
    if (distanceBetweenCoordinates(loadedCenter.current, drive.position) > 450) void loadRoads(drive.position, false);
  }, [drive.position, ready, loadRoads]);

  const searchPlace = async () => {
    if (!search.trim()) return;
    setSearching(true); setResults([]);
    try { setResults(await searchLocations(search)); } catch { setError('freeRoadsError'); }
    finally { setSearching(false); }
  };
  const choosePlace = (point: Coordinate) => { setSelectingStart(false); setResults([]); void loadRoads(point, true); };
  const environment = useMemo(() => getEnvironmentState(Date.now() - drive.elapsedSeconds * 1000, drive.elapsedSeconds), [drive.elapsedSeconds]);
  const panelHeading = (title: string) => <div className="workspace-panel-heading"><div><small>MANN · {t('freeMode')}</small><h2>{title}</h2></div><button type="button" onClick={() => setActivePanel(null)} aria-label={t('closePanel')}>×</button></div>;
  const panels: Array<{ id: FreePanel; label: string; icon: string }> = [
    { id: 'place', label: t('freePlace'), icon: '⌖' }, { id: 'drive', label: t('drivingSettings'), icon: '◉' },
    { id: 'map', label: t('mapView'), icon: '▦' }, { id: 'status', label: t('statusPanel'), icon: '▤' },
  ];

  return <main className="app-shell free-drive-shell">
    <GameMap position={drive.position} bearing={drive.bearing} route={null} freeRoads={roads} traveledDistance={0} running={drive.running} restartToken={0} origin={null} destination={null}
      selectMode={selectingStart ? 'free-start' : null} onMapPick={choosePlace} cameraMode={cameraMode} timeMultiplier={1} recenterToken={recenterToken}
      environment={environment} mapPanelOpen={activePanel === 'map'} onCloseMapPanel={() => setActivePanel(null)} mapPanelTitle={t('mapLayers')} closeLabel={t('closePanel')} />
    <header className="drive-bar">
      <div className="drive-brand"><strong>MANN</strong><small>{t('freeMode').toUpperCase()}</small></div>
      <div className="drive-speed" aria-label={t('currentSpeed')}><strong>{Math.round(Math.abs(drive.speedKmh))}</strong><span>{t('speedUnit')}</span>{drive.speedKmh < -0.5 && <em className="playback-rate">R</em>}</div>
      <div className="drive-bar-actions"><button type="button" className="drive-primary" disabled={!ready || loading} onClick={() => setDrive(state => ({ ...state, running: !state.running }))}>{drive.running ? t('pause') : t('startDriving')}</button>
        <button type="button" className="drive-icon-button" onClick={() => setRecenterToken(value => value + 1)} aria-label={t('recenter')} title={t('recenter')}>⌖</button></div>
    </header>
    {(loading || error) && <div className="free-road-message" role="status">{loading ? t('freeLoadingRoads') : t(error!)}{error && <button type="button" onClick={() => void loadRoads(requestedPoint.current, !ready)}>{t('retry')}</button>}</div>}
    {selectingStart && <div className="map-pick-prompt" role="status"><span>{t('freePickRoad')}</span><button type="button" onClick={() => setSelectingStart(false)}>{t('cancelSelection')}</button></div>}
    <nav className="workspace-menu" aria-label={t('sections')}>
      {panels.map(item => <button key={item.id} type="button" className={activePanel === item.id ? 'is-active' : ''} aria-expanded={activePanel === item.id} aria-controls={'panel-' + item.id} title={item.label} onClick={() => setActivePanel(current => current === item.id ? null : item.id)}><span className="menu-icon">{item.icon}</span><span className="menu-label">{item.label}</span></button>)}
      <button type="button" className="free-back" onClick={onBack} title={t('backToMenu')}><span className="menu-icon">↩</span><span className="menu-label">{t('menu')}</span></button>
    </nav>
    <section id="panel-place" className="workspace-panel" hidden={activePanel !== 'place'}>
      {panelHeading(t('freePlace'))}<div className="free-panel-content"><p>{t('freePlaceHint')}</p>
        <button type="button" onClick={() => { setSelectingStart(true); setActivePanel(null); }}>{t('freePickRoad')}</button>
        <label>{t('search')}<div className="free-search"><input value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void searchPlace(); }} placeholder={t('originSearch')} /><button type="button" disabled={searching} onClick={() => void searchPlace()}>{searching ? '…' : t('search')}</button></div></label>
        <div className="free-search-results">{results.map(result => <button type="button" key={result.id} onClick={() => choosePlace({ latitude: result.lat, longitude: result.lon })}>{result.displayName}</button>)}</div>
        <small>{t('freeRoadHint')}</small></div>
    </section>
    <section id="panel-drive" className="workspace-panel" hidden={activePanel !== 'drive'}>
      {panelHeading(t('drivingSettings'))}<div className="free-panel-content">
        <label>{t('vehicle')}<select value={vehicleId} onChange={event => setVehicleId(event.target.value)}>{VEHICLES.map(item => <option value={item.id} key={item.id}>{item.name} · {item.maxSpeedKmh} km/h</option>)}</select></label>
        <label>{t('camera')}<select value={cameraMode} onChange={event => setCameraMode(event.target.value as 'chase' | 'orbit')}><option value="chase">{t('chase')}</option><option value="orbit">{t('orbit')}</option></select></label>
        <p>{t('freeKeyboardHint')}</p><p>{t('freeGamepadHint')}</p><small>{gamepadName ? `${t('freeGamepadConnected')}: ${gamepadName}` : t('freeGamepadWaiting')}</small>
      </div>
    </section>
    <section id="panel-status" className="workspace-panel" hidden={activePanel !== 'status'}>
      {panelHeading(t('statusPanel'))}<div className="free-panel-content free-stats"><strong>{Math.round(Math.abs(drive.speedKmh))} km/h</strong><span>{t('traveled')} {(drive.distanceMeters / 1000).toFixed(2)} km</span><span>{t('freeRoadsLoaded')}: {roads.length}</span><span>{gamepadName ? t('freeGamepadConnected') : t('freeGamepadWaiting')}</span>{drive.colliding && <span className="free-collision">{t('freeRoadEdge')}</span>}</div>
    </section>
    <FreeDrivePads input={touchInput} enabled={drive.running && ready} />
  </main>;
}
