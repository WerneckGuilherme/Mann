import { addProtocol, removeProtocol } from 'maplibre-gl';

const protocol = 'mann-esri';
const tileUrl = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

// Esri returns this same JPEG (HTTP 200) for uncached high-zoom coverage.
// Its 2,521 bytes alone are not enough to identify it safely. A checksum also
// works on non-HTTPS local-network development hosts where SubtleCrypto is absent.
const unavailableChecksum = 2463699343;
function isUnavailable(data: ArrayBuffer) {
  if (data.byteLength !== 2521) return false;
  let hash = 2166136261;
  for (const byte of new Uint8Array(data)) hash = Math.imul(hash ^ byte, 16777619);
  return (hash >>> 0) === unavailableChecksum;
}

async function cropAncestor(data: ArrayBuffer, ancestorZoom: number, z: number, x: number, y: number): Promise<ArrayBuffer> {
  const scale = 2 ** (z - ancestorZoom);
  const image = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Cannot render satellite fallback tile');
    const size = 256 / scale;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, (x % scale) * size, (y % scale) * size, size, size, 0, 0, 256, 256);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Cannot encode satellite fallback tile')), 'image/jpeg', 0.95));
    return blob.arrayBuffer();
  } finally {
    image.close();
  }
}

export function installEsriImageryProtocol() {
  // The browser cache still handles normal tiles; this bounded cache avoids requesting
  // the same usable ancestor repeatedly when several nearby tiles are unavailable.
  const ancestors = new Map<string, ArrayBuffer>();
  const unavailable = new Set<string>();
  addProtocol(protocol, async (params, abortController) => {
    const parts = new URL(params.url).pathname.split('/').filter(Boolean);
    const [zoom, x, y] = parts.map(Number);
    if (parts.length !== 3 || !Number.isInteger(zoom) || !Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error('Invalid satellite tile coordinates');
    }
    for (let z = zoom; z >= 0; z--) {
      const scale = 2 ** (zoom - z);
      const tileX = Math.floor(x / scale), tileY = Math.floor(y / scale);
      const key = `${z}/${tileX}/${tileY}`;
      if (unavailable.has(key)) continue;
      let data = ancestors.get(key);
      if (!data) {
        const response = await fetch(tileUrl(z, tileX, tileY), { signal: abortController.signal });
        if (!response.ok) {
          if (response.status === 404) {
            unavailable.add(key);
            continue;
          }
          throw new Error(`Satellite tile request failed: HTTP ${response.status}`);
        }
        data = await response.arrayBuffer();
        if (isUnavailable(data)) {
          unavailable.add(key);
          if (unavailable.size > 256) unavailable.delete(unavailable.values().next().value!);
          continue;
        }
        ancestors.set(key, data);
        if (ancestors.size > 96) ancestors.delete(ancestors.keys().next().value!);
      }
      // MapLibre may transfer the returned buffer to a worker. Keep the cache's
      // original buffer attached for neighboring tile requests.
      return { data: z === zoom ? data.slice(0) : await cropAncestor(data, z, zoom, x, y) };
    }
    throw new Error('Satellite imagery unavailable for this location');
  });
  return () => { removeProtocol(protocol); ancestors.clear(); unavailable.clear(); };
}
