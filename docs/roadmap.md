# Mann roadmap

## Beta upgrade completed

- Arbitrary map-click and explicit geocoded origin/destination selection
- Vehicle definitions with centralized caps and acceleration/braking
- Cached route curvature/environment metadata and deterministic look-ahead speed engine
- Target average speed versus actual instantaneous speed
- Time-based hidden-tab progression, pause/resume/arrival preservation
- Chase and Orbit camera modes, recenter control, and speedometer HUD

## Next

Add OSRM step metadata, authoritative OSM maxspeed/road classes, traffic/weather, persistence, and optional driver behavior. AI-based driving behavior is planned but is not required by this beta.

## Navigation simulator pass completed

- Normalized OSRM maneuver metadata and centralized human-readable instructions
- Route-distance next-maneuver guidance with distance formatting and simple directional icons
- Contextual highway/urban navigation sign card
- Confirmed city, region, country, and major-road transition banners
- Bounded sequential adaptive administrative enrichment with cancellation and cache reuse
- Context-sensitive suppression of short connector/ramp road-name noise

Voice navigation, lane-level guidance, authoritative OSM speed limits, traffic, historical weather, and persistent trips remain future work.


## Travel environment pass

- Simulated departure date/time with midnight-safe Date arithmetic and compact HUD clock
- Centralized day, sunset, dusk, night, and dawn phases with continuous daylight factor
- Existing timestamp-based hidden-tab progression now drives the trip clock and environment together
- Continuous MapLibre night treatment, readable route lines, and subtle bearing-aligned headlights
- Environment state prepared for future weather and road-event consumers

Real sunrise/sunset calculations, historical weather, traffic, and road events remain future work.


## Live weather and regional radio pass

- Current Open-Meteo weather at the moving vehicle position with WMO condition mapping, bounded refresh, and stale-data resilience
- Transparent cloudy, rain, storm, fog, and snow treatments combined with the existing simulated day/night system
- Radio Browser regional discovery by current reverse-geocoded location, nearby metadata, quality, and working-server failover
- Compact persistent audio player with explicit play, pause, volume, mute, previous, and next controls

Historical weather tied to simulated dates, automatic radio retuning, physical FM propagation, and guaranteed compatibility with every public stream remain future work.


## Project Mann interface pass

- Minimal initial menu with explicit Start and persisted Portuguese/English selection
- Keyed lightweight localization across the game UI
- Collapsible radio control with planner-priority layout and persistent playback
- Defined responsive UI zones that keep the map and vehicle visually dominant

A richer settings screen and additional languages remain future work.
