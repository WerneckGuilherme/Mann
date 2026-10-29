export function startGameLoop(onFrame: (delta: number) => void): () => void {
  let id = 0;
  let previous: number | null = null;
  let stopped = false;
  const resetClock = () => { previous = null; };
  const frame = (timestamp: number) => {
    if (stopped) return;
    const visible = document.visibilityState === 'visible';
    const gap = previous === null ? 0 : (timestamp - previous) / 1000;
    previous = visible ? timestamp : null;
    // A suspended tab or sleeping device must not move the car on the next frame.
    onFrame(visible && gap > 0 && gap <= 2 ? gap : 0);
    id = requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', resetClock);
  window.addEventListener('pageshow', resetClock);
  id = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
    document.removeEventListener('visibilitychange', resetClock);
    window.removeEventListener('pageshow', resetClock);
  };
}
