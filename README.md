# Mann

MANN is a browser driving simulator. Users choose arbitrary origin and destination points by map click or explicit backend geocoding search, then the backend obtains full driving geometry from OSRM. A cached route analyzer feeds a deterministic variable-speed engine and a time-based simulation rendered through MapLibre.

## Development

Run npm install, npm install --prefix backend, npm install --prefix frontend, then npm run dev.

The backend listens on port 3001. Vite proxies browser requests under /api to it. /api/route uses OSRM and /api/geocode?q=... uses Nominatim with explicit searches, a descriptive user agent, result limits, and frontend timeout/error handling.

## Validation

Run npm run build.

The simulation is deterministic from elapsed time, so hidden-tab rendering gaps are reconciled when a frame returns. Manual pause remains a hard freeze. AI driving behavior, traffic, and authoritative OSM speed-limit metadata remain future work.

## Navigation pass

OSRM driving steps are normalized once into route-distance-indexed maneuvers. The simulator derives current/next guidance, contextual navigation signs, and compact city/highway transition banners from that metadata. Reverse-geocoded administrative samples are requested sequentially with bounded adaptive spacing, cached by the backend/frontend, and enriched without blocking route display. Guidance is simulated from route metadata; the sign card is contextual UI rather than an authoritative physical road-sign reproduction. Voice navigation, lane guidance, and authoritative administrative-boundary data remain future work.


## Travel environment

Each trip stores a departure date/time (the default is the local time when the simulation is created). The trip clock is derived from that stored value plus active simulation elapsed time, so pause freezes it, restart restores the original departure, arrival freezes it, and hidden-tab timestamp reconciliation keeps it synchronized with vehicle progress.

The environment flow is: Departure Date/Time -> Simulation elapsed time -> Simulated current time -> Environment engine -> daylight phase/factor -> Map + HUD + vehicle lighting. The beta uses centralized approximate periods for dawn, daylight, sunset, dusk, and night. Real astronomical sunrise/sunset and historical weather integration are planned but are not implemented.


## Live weather and regional radio

Live weather is requested through the Mann backend at /api/weather, which normalizes current Open-Meteo data at the vehicle position. The frontend refreshes after route activation, about 15 km of movement, or 10 real minutes; backend geographic-cell results are cached for 10 minutes. Live weather time observedAt is independent of the simulated trip clock. Weather failures retain the last successful result and never affect routing or simulation.

Regional radio is requested through /api/radio/stations using the current vehicle coordinates. The backend reverse-geocodes the position, queries Radio Browser with server failover, filters broken/HLS stations, ranks nearby and regional entries, and caches results for 20 minutes. The compact player uses one persistent HTML audio element and never retunes or stops playback merely because a new regional list arrives. External API failures are optional enhancements and leave the map, navigation, day/night cycle, and simulation usable.


## Project Mann interface

The browser opens to a minimal Project Mann start screen with Portuguese/English selection and an explicit Start action. The selected language is stored under mann-language and applies across the planner, controls, navigation, HUD, weather labels, and radio controls. Gameplay begins only after Start; route calculation and radio playback still require user interaction.
