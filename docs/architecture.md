# Mann architecture

User map/search selection -> backend geocoding / OSRM route -> route analyzer (cached segments, bearing, curvature, environment) -> dynamic speed engine (look-ahead, target average, acceleration/braking) -> elapsed-time simulation -> vehicle position, bearing, actual speed -> MapLibre marker, speedometer, and Chase/Orbit camera.

The frontend talks to same-origin /api/* endpoints through the Vite proxy. Route geometry is normalized once into latitude/longitude coordinates and analyzed once after OSRM returns. The analyzer uses deterministic geometry heuristics: short/local segments are urban-capped at 60 km/h, longer routes can be road/highway environments, and direction changes are softened by the distance over which they occur.

Simulation state contains distance, actual engine speed, target average speed, run/pause state, multiplier, and logical elapsed seconds. The animation loop uses absolute frame timestamps and allows a long return delta, integrating the speed engine in bounded substeps. Thus hidden-tab rendering throttling does not freeze logical progress, while manual Pause prevents progression.

Chase mode centers the vehicle below the viewport center, pitches the map, and follows its bearing. Orbit mode leaves user bearing/pitch/zoom control intact; Recenter returns focus without restarting the trip.

## Navigation guidance flow

OSRM steps -> normalized maneuvers (type, modifier, name/ref, distance, location, exit/destination) -> centralized instruction formatter -> route-distance indexed current/next guidance -> desktop/mobile navigation card.

Reverse-geocode samples are selected from route endpoints, periodic distance spacing, and meaningful longer maneuver transitions. They are processed sequentially, cached, cancellable for a replaced route, and converted into ordered administrative sections. The current section and next city are derived from simulation route distance, so city/region/country transition banners only appear on confirmed context changes and are not replayed after hidden-tab jumps.

The navigation sign is a contextual route card: it prioritizes the current highway reference and next known city on highway-like sections, and the immediate road/maneuver in urban sections. It does not claim to reproduce authoritative physical signage. Voice navigation is a future feature.


## Travel environment flow

Departure Date/Time -> simulation elapsed time -> simulated current Date -> centralized environment engine -> phase and daylight factor -> MapLibre treatment, HUD clock, and vehicle headlights. The simulation stores `tripStartDateTime` and advances `simulationElapsedSeconds` only while running; the current trip date is derived as `tripStartDateTime + active elapsed time`. This keeps pause, arrival, restart, and hidden-tab timestamp reconciliation on one clock.

The environment engine is in `frontend/src/game/environment.ts`. Its beta timings are centralized approximate dawn/day/sunset/dusk/night periods and daylight is interpolated with smoothstep. The state already includes a fixed `clear` weather value so future weather/events can be added without coupling them to map rendering.

MapLibre continues to use the existing OpenStreetMap raster source. A pointer-transparent, continuously opacity-controlled multiply overlay darkens the map while preserving route and traveled-line layers. Headlights are a lightweight DOM beam positioned from the MapLibre geographic projection; its rotation uses vehicle bearing minus map bearing, so Chase and Orbit remain geographically aligned.


## Live weather flow

Vehicle route position -> frontend refresh policy -> /api/weather -> backend Open-Meteo service -> normalized LiveWeather. Weather uses real-world current conditions and its observedAt value; it is not derived from simulated date/time. Requests refresh at route activation, roughly 15 km movement, or 10 real minutes, with backend geographic-cell caching. The environment combines simulated daylight with the latest live weather condition. Weather visuals are transparent, pointer-through DOM treatment over the MapLibre canvas.

## Regional radio flow

Vehicle route position -> /api/radio/stations -> backend reverse geocoding -> Radio Browser server discovery/failover -> quality filtering and Haversine/regional ranking -> compact persistent player. Discovery refreshes after roughly 35 km or an administrative location change and uses a 20-minute in-memory cache. Current playback is deliberately preserved while a new regional station list loads. Public stream compatibility, mixed content, dead stations, and browser autoplay restrictions remain possible.


## Interface hierarchy

The start screen is an app-level menu/game state boundary. Game mode keeps navigation at the upper left, compact weather/HUD information at the upper right, the collapsible route planner in its own upper-right panel, driving controls at the lower left, and radio at the lower right. The radio component remains mounted while collapsed, so its persistent audio element is independent from panel visibility; opening the route planner collapses only the radio UI.

LanguageProvider supplies the lightweight keyed Portuguese/English dictionary and persists mann-language in localStorage. Domain values from weather, routes, and radio metadata remain language-neutral.
