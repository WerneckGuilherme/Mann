const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY?.trim();

export const hasMapTilerKey = Boolean(mapTilerKey);
const mapTiler = (path: string) => `https://api.maptiler.com/${path}?key=${encodeURIComponent(mapTilerKey ?? '')}`;

export const mapSources = {
  streets: {
    type: 'raster' as const,
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  },
  satellite: hasMapTilerKey ? {
    type: 'raster' as const,
    url: mapTiler('tiles/satellite-v4/tiles.json'),
    tileSize: 512,
    maxzoom: 20,
    attribution: '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © <a href="https://www.maxar.com/">Maxar</a>',
  } : {
    type: 'raster' as const,
    tiles: ['mann-esri://tiles/{z}/{x}/{y}'],
    tileSize: 256,
    maxzoom: 22,
    attribution: 'Tiles © <a href="https://www.esri.com/en-us/legal/terms-of-use">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
  labels: hasMapTilerKey ? {
    type: 'raster' as const,
    url: mapTiler('maps/streets-v4/tiles.json'),
    tileSize: 512,
    maxzoom: 20,
    attribution: '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © OpenStreetMap contributors',
  } : undefined,
  vector: hasMapTilerKey ? {
    type: 'vector' as const,
    url: mapTiler('tiles/v4/tiles.json'),
    attribution: '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © OpenStreetMap contributors',
  } : undefined,
  terrain: hasMapTilerKey ? {
    type: 'raster-dem' as const,
    url: mapTiler('tiles/terrain-rgb-v2/tiles.json'),
    tileSize: 512,
    maxzoom: 14,
    attribution: '© <a href="https://www.maptiler.com/copyright/">MapTiler</a>',
  } : {
    type: 'raster-dem' as const,
    tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium' as const,
    tileSize: 256,
    maxzoom: 15,
    attribution: 'Terrain © <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen and data contributors</a>',
  },
};

export type MapViewMode = 'map' | 'satellite' | 'hybrid';
export const mapTilerGlyphs = hasMapTilerKey ? mapTiler('fonts/{fontstack}/{range}.pbf') : undefined;
export const MAP_VIEW_STORAGE_KEY = 'mann-map-view';
export const TERRAIN_STORAGE_KEY = 'mann-terrain-3d';
export const COLLISION_BORDER_STORAGE_KEY = 'mann-collision-border';
