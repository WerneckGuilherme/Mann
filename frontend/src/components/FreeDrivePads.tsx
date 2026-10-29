import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { FreeDriveInput } from '../game/freeDrive.ts';

type Props = { input: React.MutableRefObject<FreeDriveInput>; enabled: boolean };
const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export default function FreeDrivePads({ input, enabled }: Props) {
  const stick = useRef<HTMLDivElement>(null);
  const [steering, setSteering] = useState(0);
  const updateSteering = (event: PointerEvent<HTMLDivElement>) => {
    const box = stick.current?.getBoundingClientRect();
    if (!box) return;
    const value = clamp((event.clientX - box.left - box.width / 2) / (box.width * 0.35));
    input.current.steering = value;
    setSteering(value);
  };
  const stopSteering = () => { input.current.steering = 0; setSteering(0); };
  const pedal = (kind: 'throttle' | 'brake', pressed: boolean) => { input.current[kind] = pressed ? 1 : 0; };
  return <div className="free-drive-pads" aria-label="Controles de direção no celular">
    <section className="free-pad free-steering-pad" aria-label="Direção">
      <span>DIREÇÃO</span>
      <div ref={stick} className="free-stick" role="slider" aria-label="Virar o volante" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(steering * 100)} tabIndex={0}
        onPointerDown={event => { if (!enabled) return; event.currentTarget.setPointerCapture(event.pointerId); updateSteering(event); }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSteering(event); }}
        onPointerUp={stopSteering} onPointerCancel={stopSteering} onLostPointerCapture={stopSteering}
        onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const value = event.key === 'ArrowLeft' ? -1 : 1; input.current.steering = value; setSteering(value); } }}
        onKeyUp={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') stopSteering(); }}>
        <span aria-hidden="true">◀</span><div className="free-stick-knob" style={{ transform: `translateX(${steering * 37}px)` }} /><span aria-hidden="true">▶</span>
      </div>
    </section>
    <section className="free-pad free-pedal-pad" aria-label="Pedais">
      <span>PEDAIS</span>
      <div>
        <button type="button" disabled={!enabled} className="free-pedal free-brake" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pedal('brake', true); }} onPointerUp={() => pedal('brake', false)} onPointerCancel={() => pedal('brake', false)} onLostPointerCapture={() => pedal('brake', false)}>FREIO<br /><small>RÉ</small></button>
        <button type="button" disabled={!enabled} className="free-pedal free-throttle" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pedal('throttle', true); }} onPointerUp={() => pedal('throttle', false)} onPointerCancel={() => pedal('throttle', false)} onLostPointerCapture={() => pedal('throttle', false)}>ACELERAR</button>
      </div>
    </section>
  </div>;
}
