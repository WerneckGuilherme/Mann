# Mann

MANN is a browser driving simulator. Users choose arbitrary origin and destination points by map click or explicit backend geocoding search, then the backend obtains full driving geometry from OSRM. A cached route analyzer feeds a deterministic variable-speed engine and a time-based simulation rendered through MapLibre.

## Development

Run npm install, npm install --prefix backend, npm install --prefix frontend, then npm run dev.

The backend listens on port 3001. Vite proxies browser requests under /api to it. /api/route uses OSRM and /api/geocode?q=... uses Nominatim with explicit searches, a descriptive user agent, result limits, and frontend timeout/error handling.

## Validation

Run npm run build.

The simulation is deterministic from elapsed time, so hidden-tab rendering gaps are reconciled when a frame returns. Manual pause remains a hard freeze. AI driving behavior, traffic, weather, and authoritative OSM speed-limit metadata remain future work.

## Navigation pass

OSRM driving steps are normalized once into route-distance-indexed maneuvers. The simulator derives current/next guidance, contextual navigation signs, and compact city/highway transition banners from that metadata. Reverse-geocoded administrative samples are requested sequentially with bounded adaptive spacing, cached by the backend/frontend, and enriched without blocking route display. Guidance is simulated from route metadata; the sign card is contextual UI rather than an authoritative physical road-sign reproduction. Voice navigation, lane guidance, and authoritative administrative-boundary data remain future work.
