# Mann architecture

```text
Browser
  ↓
Vite + React
  ↓  /api/route (same-origin in the browser)
Vite development proxy
  ↓
Node HTTP backend
  ↓
OSRM driving API
  ↓  normalized coordinates, distance, duration
Route state
  ↓
routeProgress + simulation + requestAnimationFrame
  ↓
MapLibre position, bearing, route line, HUD
```

The backend exposes `GET /api/route?startLon=&startLat=&endLon=&endLat=`. It validates geographic ranges, calls `${OSRM_BASE_URL}/route/v1/driving/...` with full GeoJSON geometry, and returns only Mann's route shape:

```json
{ "coordinates": [[-43.9, -19.9]], "distanceMeters": 1500, "durationSeconds": 152 }
```

GeoJSON coordinates remain `[longitude, latitude]` at the API boundary. The frontend converts them once to its `{ latitude, longitude }` coordinate type.

The simulation is independent of the route source. It uses selected vehicle speed, a separate time multiplier, delta time from one animation loop, and route distance clamping. Starting, pausing, changing routes, and restarting do not create duplicate loops.
