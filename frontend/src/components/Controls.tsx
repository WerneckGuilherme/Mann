import { VEHICLES } from '../types/vehicle.ts';
import { useLanguage } from '../i18n/LanguageContext.tsx';

type Props = {
  running: boolean;
  canRestart: boolean;
  target: number;
  vehicleId: string;
  timeMultiplier: number;
  cameraMode: 'chase' | 'orbit';
  departureTime: string;
  onDepartureTimeChange: (value: string) => void;
  onSpeedChange: (value: number) => void;
  onVehicleChange: (value: string) => void;
  onMultiplierChange: (value: number) => void;
  onCameraChange: (value: 'chase' | 'orbit') => void;
  onRecenter: () => void;
  onRestart: () => void;
};

export default function Controls(p: Props) {
  const { t } = useLanguage();
  const vehicle = VEHICLES.find(v => v.id === p.vehicleId) ?? VEHICLES[0];

  return <section className="controls" aria-label={t('drivingSettings')}>
    <label>{t('departureTime')}<input type="time" value={p.departureTime} disabled={p.running} onChange={e => p.onDepartureTimeChange(e.target.value)} /></label>
    <label>{t('vehicle')}<select value={p.vehicleId} onChange={e => p.onVehicleChange(e.target.value)}>{VEHICLES.map(v => <option key={v.id} value={v.id}>{v.name} · {v.maxSpeedKmh} km/h</option>)}</select></label>
    <label>{t('targetAverage')}<select value={p.target} onChange={e => p.onSpeedChange(Math.min(Number(e.target.value), vehicle.maxSpeedKmh))}>{[40, 60, 80, 100, 120].filter(v => v <= vehicle.maxSpeedKmh).map(v => <option key={v} value={v}>{v} km/h</option>)}</select></label>
    <label>{t('rate')}<select value={p.timeMultiplier} onChange={e => p.onMultiplierChange(Number(e.target.value))}>{[1, 5, 10, 50, 100].map(v => <option key={v} value={v}>{v}×</option>)}</select></label>
    <p className="rate-hint">{t('rateHint')}</p>
    <label>{t('camera')}<select value={p.cameraMode} onChange={e => p.onCameraChange(e.target.value as 'chase' | 'orbit')}><option value="chase">{t('chase')}</option><option value="orbit">{t('orbit')}</option></select></label>
    <div className="controls-actions"><button type="button" onClick={p.onRecenter}>{t('recenter')}</button><button type="button" disabled={!p.canRestart} onClick={p.onRestart}>{t('restart')}</button></div>
  </section>;
}
