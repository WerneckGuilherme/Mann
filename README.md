# Mann

MANN is a browser driving simulator. Users choose arbitrary origin and destination points by map click or explicit backend geocoding search, then the backend obtains full driving geometry from OSRM. A cached route analyzer feeds a deterministic variable-speed engine and a time-based simulation rendered through MapLibre.

## Development

Run npm install, npm install --prefix backend, npm install --prefix frontend, then npm run dev.

The backend listens on port 3001. Vite proxies browser requests under /api to it. /api/route uses OSRM and /api/geocode?q=... uses Nominatim with explicit searches, a descriptive user agent, result limits, and frontend timeout/error handling.

## Validation

Run `npm test` for driving/camera unit tests and `npm run build` for TypeScript and production builds.

The simulation is deterministic from elapsed time. A hidden tab or a suspended device does not advance the vehicle when rendering resumes. Manual pause remains a hard freeze. Live traffic and authoritative posted speed limits remain future work.

## Free drive

The start menu offers guided route and free drive. Free drive starts near central Belo Horizonte; use the location panel to search or click another starting street. The backend fetches nearby OpenFreeMap vector tiles through `/api/roads`, extracts driveable road centerlines, caches tiles, and loads more as the car moves. Highlighted streets show the loaded driving area.

On a PC, W/Up accelerates, S/Down brakes and then reverses, and A/D or Left/Right steers. Standard Gamepad API controllers use the left stick for steering, analog R2/RT for acceleration, and analog L2/LT for braking and reverse; DualSenseX's virtual Xbox controller uses this same mapping. Phones show a steering pad and a separate accelerator/brake pad. The simulation uses acceleration, drag, turning, reverse, and a collision boundary around each road centerline. Road widths are inferred from map road class because the tiles do not contain surveyed curb geometry. Roads on different levels that overlap in the 2D tile data cannot currently be distinguished by the collision model.

## Driving feel

The selected speed is a strict cruise ceiling, not an average that the car tries to recover by overspeeding. OSRM segment-speed annotations provide a contextual planning estimate for roads without a clear highway identity; they are not hard speed limits. Simulation ceilings are 50/90/120 km/h (urban/road/highway). Explicitly identified highways and expressways use the selected speed as their cruising target even if the OSRM ETA speed is low. A high-speed routing profile can identify a broad avenue as an arterial with a 90 km/h simulation ceiling. These are simulation targets, not posted limits or live traffic. Geometry sampled on both sides of a point detects broad bends as well as sharp turns. The engine anticipates curves, slower road segments, maneuvers and urban intersections using braking distance, then limits acceleration and jerk. Named bridges, viaducts and crossings receive additional caution; unnamed structures cannot be identified from this OSRM response. A smooth, context-sensitive throttle variation prevents long perfectly constant speeds. Distance uses integrated speed, and trip average uses that same distance and active simulation time. The chase camera and vehicle heading use frame-rate-independent damping, including the 0°/360° bearing wrap, while Orbit remains free. High simulation multipliers deliberately fast-forward travel and can still produce visible jumps.

## Navigation pass

OSRM driving steps are normalized once into route-distance-indexed maneuvers. The simulator derives current/next guidance, contextual navigation signs, and compact city/highway transition banners from that metadata. Reverse-geocoded administrative samples are requested sequentially with bounded adaptive spacing, cached by the backend/frontend, and enriched without blocking route display. Guidance is simulated from route metadata; the sign card is contextual UI rather than an authoritative physical road-sign reproduction. Voice navigation, lane guidance, and authoritative administrative-boundary data remain future work.


## Travel environment

Each trip stores a departure date/time (the default is the local time when the simulation is created). The trip clock is derived from that stored value plus active simulation elapsed time, so pause freezes it, restart restores the original departure, arrival freezes it, and suspended-tab time is excluded along with the corresponding vehicle movement.

The environment flow is: Departure Date/Time -> Simulation elapsed time -> Simulated current time -> Environment engine -> daylight phase/factor -> Map + HUD + vehicle lighting. The beta uses centralized approximate periods for dawn, daylight, sunset, dusk, and night. Real astronomical sunrise/sunset and historical weather integration are planned but are not implemented.


## Live weather and regional radio

Live weather is requested through the Mann backend at /api/weather, which normalizes current Open-Meteo data at the vehicle position. The frontend refreshes after route activation, about 15 km of movement, or 10 real minutes; backend geographic-cell results are cached for 10 minutes. Live weather time observedAt is independent of the simulated trip clock. Weather failures retain the last successful result and never affect routing or simulation.

Regional radio is requested through /api/radio/stations using the current vehicle coordinates. The backend reverse-geocodes the position, queries Radio Browser with server failover, filters broken/HLS stations, ranks nearby and regional entries, and caches results for 20 minutes. The compact player uses one persistent HTML audio element and never retunes or stops playback merely because a new regional list arrives. External API failures are optional enhancements and leave the map, navigation, day/night cycle, and simulation usable.


## Project Mann interface

The browser opens to a minimal Project Mann start screen with Portuguese/English selection and an explicit Start action. The selected language is stored under mann-language and applies across the planner, controls, navigation, HUD, weather labels, and radio controls. Gameplay begins only after Start; route calculation and radio playback still require user interaction.

## Satellite, hybrid and 3D terrain

The map keeps MapLibre GL JS 6.2 as its renderer and uses MapTiler when `VITE_MAPTILER_KEY` is configured. Without a key, Satellite falls back to Esri World Imagery and terrain falls back to Mapzen Terrarium DEM, so clicking Satellite still works immediately. MapTiler Satellite v4, Streets v4 (used as the readable hybrid overlay), and Terrain RGB v2 are used when configured. Terrain uses `setTerrain({ source: 'terrain', exaggeration: 1 })`; it is visual only and never changes OSRM geometry, speed, vehicle position, or trip state. A low-opacity hillshade is placed below the route so it does not hide the navigation line.

Create `frontend/.env` from `frontend/.env.example` and set a browser-restricted MapTiler key when Hybrid labels or MapTiler imagery are needed. The key is necessarily exposed to the browser by Vite, so restrict it by allowed origins and usage quotas; it is not a server secret and must not be committed. Restart Vite after changing the key. The Map view, Satellite fallback and DEM fallback work without it. Hybrid labels report the missing-key reason. Invalid credentials or tile failures fall back to Map and disable terrain while preserving the trip.

MapTiler Terrain RGB v2 has global coverage, a maximum zoom of 14, approximately 30 m global resolution (5 m in some areas), and 6 m vertical resolution according to its provider documentation. Satellite detail and coverage vary by region and zoom, and MapTiler plan quotas/licensing apply. Attributions remain in the MapLibre attribution control. The three visual modes and terrain preference are persisted in localStorage without recreating the map.

Manual validation still required: configure a valid key, start a trip in Brazilian mountainous terrain, toggle Map/Satellite/Hybrid and terrain while driving and paused, inspect route/vehicle/camera continuity and attribution, and test an invalid key or blocked tile host in browser developer tools. The build and direct sample-tile responses were checked here; browser rendering, camera behavior and external-service failures were not visually validated.

The chase camera enters a wider view at zoom 16.5 and pitch 48 (or preserves a closer manual zoom). Manual zoom and the map panel slider can now reach level 22. With no MapTiler key, Esri imagery is requested up to level 22 where available. When Esri serves its 2,521-byte "Map data not yet available" JPEG, the browser crops the nearest available parent tile and resamples it at high quality; this cannot create detail where high-resolution photography does not exist, so some areas still look soft at high zoom. MapTiler tiles are overscaled above their available native level. A changed Esri placeholder image may require updating its detector. Esri service terms and attribution still apply; for production, review provider licensing and quotas and prefer a configured MapTiler key where its coverage is suitable. In free drive, the map starts at zoom 17.5 and Satellite and Hybrid show an optional collision edge over the imagery from zoom 15.5 onward. Its width uses the same road corridor as vehicle collision; the toggle is saved, and the line reflects map road geometry rather than the visible edge of satellite pavement. The map panel prompts users to zoom in if the edge is too small to draw. While this edge is visible, 3D terrain is paused to keep the road boundary and imagery visible; the terrain preference returns in other map modes. The MapLibre worker is bundled explicitly so GeoJSON road geometry loads in development as well as production. Wheel zoom remains available. The vehicle tilts with the map, and headlights track camera movement even while paused. Recenter acts only on the button press; later orbit movement stays free. Route metadata enrichment does not refit unchanged geometry. Initial markers and route progress are synchronized when the style becomes ready, independently of tile downloads.
