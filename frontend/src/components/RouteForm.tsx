import { useState } from 'react';
import type { Coordinate, GeocodingResult } from '../types/route.ts';
import { searchLocations } from '../services/routingService.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';

type Props = { open: boolean; onToggle: () => void; onSubmit: (o: Coordinate, d: Coordinate) => void; loading: boolean; routeState: 'idle' | 'loading' | 'ready' | 'error'; origin: Coordinate | null; destination: Coordinate | null; onOrigin: (c: Coordinate) => void; onDestination: (c: Coordinate) => void; selectMode: 'origin' | 'destination' | null; onSelectMode: (v: 'origin' | 'destination' | null) => void };
export default function RouteForm(p: Props) {
  const { t } = useLanguage();
  const [oq, setOq] = useState(''), [dq, setDq] = useState(''), [results, setResults] = useState<{ side: 'origin' | 'destination'; items: GeocodingResult[] } | null>(null), [error, setError] = useState<string | null>(null);
  const search = async (side: 'origin' | 'destination', q: string) => { try { const items = await searchLocations(q); setResults({ side, items }); setError(items.length ? '' : t('noLocations')); } catch (e) { setError(t('searchFailed') + (e instanceof Error ? ': ' + e.message : '')); } };
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!p.origin || !p.destination) { setError(t('setBoth')); return; } if (Math.abs(p.origin.latitude - p.destination.latitude) < .00001 && Math.abs(p.origin.longitude - p.destination.longitude) < .00001) { setError(t('differentPoints')); return; } setError(null); p.onSubmit(p.origin, p.destination); };
  const pick = (r: GeocodingResult) => { (results?.side === 'origin' ? p.onOrigin : p.onDestination)({ latitude: r.lat, longitude: r.lon }); setResults(null); };
  const compactLabel = p.routeState === 'loading' ? t('calculatingShort') : p.routeState === 'ready' ? t('routeReadyShort') : p.routeState === 'error' ? t('routeErrorShort') : t('routeShort');
  return <form className={'route-form ' + (p.open ? 'is-open' : '')} onSubmit={submit}>
    <button type="button" className="planner-close" onClick={p.onToggle}>{p.open ? t('routePlanner') + ' ×' : '🗺 ' + compactLabel}</button>
    <div className="planner-body">
      <div className="form-heading"><strong>{t('routePlanner')}</strong><span>{t('searchOrSelect')}</span></div>
      <div className="search-row"><input value={oq} onChange={e => setOq(e.target.value)} placeholder={t('originSearch')} /><button type="button" onClick={() => search('origin', oq)}>{t('search')}</button></div>
      <div className="search-row"><input value={dq} onChange={e => setDq(e.target.value)} placeholder={t('destinationSearch')} /><button type="button" onClick={() => search('destination', dq)}>{t('search')}</button></div>
      {results && <div className="search-results">{results.items.map(r => <button type="button" key={r.id} onClick={() => pick(r)}>{r.displayName}</button>)}</div>}
      <div className="point-row"><button type="button" className={p.selectMode === 'origin' ? 'active' : ''} onClick={() => p.onSelectMode('origin')}>{t('setOrigin')}</button><span>{p.origin ? p.origin.latitude.toFixed(4) + ', ' + p.origin.longitude.toFixed(4) : t('notSet')}</span></div>
      <div className="point-row"><button type="button" className={p.selectMode === 'destination' ? 'active' : ''} onClick={() => p.onSelectMode('destination')}>{t('setDestination')}</button><span>{p.destination ? p.destination.latitude.toFixed(4) + ', ' + p.destination.longitude.toFixed(4) : t('notSet')}</span></div>
      {error && <span className="error">{error}</span>}
      <button className="route-submit" disabled={p.loading} type="submit">{p.loading ? t('loadingRoute') : t('calculateRoute')}</button>
    </div>
  </form>;
}
