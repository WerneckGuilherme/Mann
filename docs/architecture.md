# Mann architecture

User map/search selection -> backend geocoding / OSRM route -> route analyzer (cached segments, bearing, curvature, environment) -> dynamic speed engine (look-ahead, target average, acceleration/braking) -> elapsed-time simulation -> vehicle position, bearing, actual speed -> MapLibre marker, speedometer, and Chase/Orbit camera.

The frontend talks to same-origin /api/* endpoints through the Vite proxy. Route geometry is normalized once into latitude/longitude coordinates and analyzed once after OSRM returns. The analyzer uses deterministic geometry heuristics: short/local segments are urban-capped at 60 km/h, longer routes can be road/highway environments, and direction changes are softened by the distance over which they occur.

Simulation state contains distance, actual engine speed, target average speed, run/pause state, multiplier, and logical elapsed seconds. The animation loop uses absolute frame timestamps and allows a long return delta, integrating the speed engine in bounded substeps. Thus hidden-tab rendering throttling does not freeze logical progress, while manual Pause prevents progression.

Chase mode centers the vehicle below the viewport center, pitches the map, and follows its bearing. Orbit mode leaves user bearing/pitch/zoom control intact; Recenter returns focus without restarting the trip.

## Navigation guidance flow

OSRM steps -> normalized maneuvers (type, modifier, name/ref, distance, location, exit/destination) -> centralized instruction formatter -> route-distance indexed current/next guidance -> desktop/mobile navigation card.

Reverse-geocode samples are selected from route endpoints, periodic distance spacing, and meaningful longer maneuver transitions. They are processed sequentially, cached, cancellable for a replaced route, and converted into ordered administrative sections. The current section and next city are derived from simulation route distance, so city/region/country transition banners only appear on confirmed context changes and are not replayed after hidden-tab jumps.

The navigation sign is a contextual route card: it prioritizes the current highway reference and next known city on highway-like sections, and the immediate road/maneuver in urban sections. It does not claim to reproduce authoritative physical signage. Voice navigation is a future feature.
