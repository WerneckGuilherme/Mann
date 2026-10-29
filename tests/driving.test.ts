import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeRoute } from '../frontend/src/game/routeAnalyzer.ts';
import { advanceSpeed, createSpeedEngineState } from '../frontend/src/game/speedEngine.ts';
import { shortestTurn, smoothFollowPose } from '../frontend/src/game/followCamera.ts';
import { getVehicle } from '../frontend/src/types/vehicle.ts';
import { advanceSimulation, createSimulation, getTripAverageKmh } from '../frontend/src/game/simulation.ts';
import { getRouteProgress } from '../frontend/src/game/routeProgress.ts';
import { startGameLoop } from '../frontend/src/game/gameLoop.ts';
import { fetchDrivingRoute } from '../backend/src/services/osrm.service.ts';

const straight = analyzeRoute({ coordinates: [
  { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.12 },
  { latitude: 0, longitude: 0.24 }, { latitude: 0, longitude: 0.36 },
] });
const bend = analyzeRoute({ coordinates: [
  { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.04 },
  { latitude: 0, longitude: 0.135 }, { latitude: 0.135, longitude: 0.135 },
  { latitude: 0.27, longitude: 0.135 },
] });

test('a sharp bend triggers gradual braking before the vertex and acceleration after it', () => {
  const curve = bend.curves.find(item => item.turnDegrees > 80);
  assert.ok(curve);
  assert.ok(curve.speedKmh < 45);
  let distance = curve.distanceMeters - 500;
  let state = { ...createSpeedEngineState(), speedKmh: 120 };
  let speedAt200 = 0, speedAtCurve = 0, speedAfter100 = 0;
  for (let second = 0; second < 45; second++) {
    const advanced = advanceSpeed(state, {
      route: bend, distanceTraveled: distance, targetAverageKmh: 120,
      actualAverageKmh: 60, vehicle: getVehicle('car-3'), deltaSeconds: 1,
    });
    state = advanced.state;
    distance += advanced.distanceMeters;
    const ahead = curve.distanceMeters - distance;
    if (ahead > 180 && ahead < 210) speedAt200 = state.speedKmh;
    if (Math.abs(ahead) < 12) speedAtCurve = state.speedKmh;
    if (ahead < -90 && ahead > -120) speedAfter100 = state.speedKmh;
  }
  assert.ok(speedAt200 > speedAtCurve + 30, `200 m: ${speedAt200}, curve: ${speedAtCurve}`);
  assert.ok(speedAtCurve <= curve.speedKmh + 4, `curve: ${speedAtCurve}, cap: ${curve.speedKmh}`);
  assert.ok(speedAfter100 > speedAtCurve + 15, `after: ${speedAfter100}, curve: ${speedAtCurve}`);
});

test('acceleration ramps in gently and the selected speed is not exceeded to recover trip average', () => {
  let state = createSpeedEngineState();
  let distance = 15000;
  let previousAcceleration = 0;
  for (let step = 0; step < 600; step++) {
    const advanced = advanceSpeed(state, {
      route: straight, distanceTraveled: distance, targetAverageKmh: 80,
      actualAverageKmh: 10, vehicle: getVehicle('car-3'), deltaSeconds: 0.1,
    });
    state = advanced.state;
    distance += advanced.distanceMeters;
    assert.ok(Math.abs(state.accelerationMetersPerSecondSquared - previousAcceleration) <= 0.121);
    assert.ok(state.accelerationMetersPerSecondSquared <= 1.65);
    assert.ok(state.speedKmh <= 81, `speed: ${state.speedKmh}`);
    previousAcceleration = state.accelerationMetersPerSecondSquared;
  }
  assert.ok(state.speedKmh > 75);
});

test('a lower-speed road context is anticipated before entering it', () => {
  const route = analyzeRoute({ coordinates: [0, 0.06, 0.12, 0.18, 0.24, 0.30, 0.36]
    .map(longitude => ({ latitude: 0, longitude })), profileSpeedsKmh: [110, 110, 110, 110, 110, 50] });
  const transition = route.speedTransitions.at(-1);
  assert.ok(transition);
  let distance = transition.distanceMeters - 450;
  let state = { ...createSpeedEngineState(), speedKmh: 120 };
  while (distance < transition.distanceMeters) {
    const advanced = advanceSpeed(state, {
      route, distanceTraveled: distance, targetAverageKmh: 120,
      actualAverageKmh: 100, vehicle: getVehicle('car-3'), deltaSeconds: 0.5,
    });
    distance += advanced.distanceMeters;
    state = advanced.state;
  }
  assert.ok(state.speedKmh <= transition.speedKmh + 3);
});

test('camera follows positions and wrapped bearings without jumping to the target', () => {
  assert.equal(shortestTurn(350, 10), 20);
  assert.equal(shortestTurn(725, 10), 5);
  let pose = { longitude: -43.94, latitude: -19.92, bearing: 350, pitch: 48 };
  const target = { longitude: -43.939, latitude: -19.919, bearing: 10, pitch: 56 };
  pose = smoothFollowPose(pose, target, 1 / 60, 1);
  assert.ok(pose.longitude > -43.94 && pose.longitude < target.longitude);
  assert.ok(pose.bearing > 350 && pose.bearing < 370);
  for (let frame = 0; frame < 90; frame++) pose = smoothFollowPose(pose, target, 1 / 60, 1);
  assert.ok(Math.abs(pose.longitude - target.longitude) < 0.00001);
  assert.ok(Math.abs(shortestTurn(pose.bearing, target.bearing)) < 1);
});

test('at 1×, distance and reported average match the map while cruise stays below the selected speed', () => {
  const route = analyzeRoute({ coordinates: [
    { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.12 },
  ], profileSpeedsKmh: [90] });
  let state = { ...createSimulation(72), running: true, speedEngine: { ...createSpeedEngineState(), speedKmh: 72 } };
  for (let second = 0; second < 60; second++) state = advanceSimulation(state, 1, route, getVehicle('car-2'), route.totalDistanceMeters);
  const progress = getRouteProgress({ coordinates: route.coordinates }, state.distanceTraveled);
  assert.ok(state.distanceTraveled > 1100 && state.distanceTraveled < 1200, `distance: ${state.distanceTraveled}`);
  assert.ok(Math.abs(progress.traveledDistance - state.distanceTraveled) < 0.01);
  assert.ok(Math.abs(getTripAverageKmh(state) - state.distanceTraveled / 60 * 3.6) < 0.01);
  assert.ok(Math.abs(state.simulationElapsedSeconds - 60) < 0.01);
});

test('fast-forward uses simulated time and trip arrival counts only time spent traveling', () => {
  const route = analyzeRoute({ coordinates: [
    { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.02 },
  ], profileSpeedsKmh: [50] });
  const initial = { ...createSimulation(36), running: true, timeMultiplier: 5,
    speedEngine: { ...createSpeedEngineState(), speedKmh: 36 } };
  const accelerated = advanceSimulation(initial, 1, route, getVehicle('car-2'), route.totalDistanceMeters);
  assert.ok(accelerated.distanceTraveled > 40 && accelerated.distanceTraveled < 50);
  assert.ok(Math.abs(accelerated.simulationElapsedSeconds - 5) < 0.01);
  assert.ok(Math.abs(getTripAverageKmh(accelerated) - accelerated.distanceTraveled / 5 * 3.6) < 0.01);

  const nearEnd = { ...initial, timeMultiplier: 1, distanceTraveled: route.totalDistanceMeters - 5 };
  const arrived = advanceSimulation(nearEnd, 1, route, getVehicle('car-2'), route.totalDistanceMeters);
  assert.equal(arrived.running, false);
  assert.equal(arrived.distanceTraveled, route.totalDistanceMeters);
  assert.ok(arrived.simulationElapsedSeconds > 0.5 && arrived.simulationElapsedSeconds < 0.6);
});

test('resuming a suspended tab does not move the vehicle by the suspended time', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  const listeners = new Map<string, () => void>();
  globalThis.document = { visibilityState: 'visible', addEventListener: (name: string, callback: () => void) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name) } as unknown as Document;
  globalThis.window = { addEventListener: (name: string, callback: () => void) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name) } as unknown as Window & typeof globalThis;
  globalThis.requestAnimationFrame = callback => { const id = ++nextId; callbacks.set(id, callback); return id; };
  globalThis.cancelAnimationFrame = id => { callbacks.delete(id); };
  const deltas: number[] = [];
  let stop: (() => void) | undefined;
  const tick = (time: number) => { const [id, callback] = callbacks.entries().next().value!; callbacks.delete(id); callback(time); };
  try {
    stop = startGameLoop(delta => deltas.push(delta));
    tick(0);
    tick(16);
    tick(10_016);
    tick(10_032);
    assert.deepEqual(deltas, [0, 0.016, 0, 0.016]);
    (globalThis.document as { visibilityState: string }).visibilityState = 'hidden';
    listeners.get('visibilitychange')?.();
    tick(20_000);
    (globalThis.document as { visibilityState: string }).visibilityState = 'visible';
    listeners.get('visibilitychange')?.();
    tick(20_016);
    assert.deepEqual(deltas.slice(-2), [0, 0]);
  } finally {
    stop?.();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('OSRM segment speeds and intersection metadata reach the driving model', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json({ code: 'Ok', routes: [{ distance: 2200, duration: 160,
      geometry: { coordinates: [[-43.1, -19.1], [-43.09, -19.1], [-43.08, -19.1]] },
      legs: [{ annotation: { speed: [10, 20] }, steps: [{ distance: 2200, duration: 160,
        name: 'Ponte de teste', mode: 'driving', maneuver: { location: [-43.1, -19.1], type: 'depart' },
        intersections: [{ location: [-43.09, -19.1], bearings: [0, 90, 180, 270] }] }] }] }] });
  };
  try {
    const route = await fetchDrivingRoute(-43.1, -19.1, -43.08, -19.1);
    assert.match(requestedUrl, /annotations=speed/);
    assert.deepEqual(route.profileSpeedsKmh, [36, 72]);
    assert.equal(route.navigationSegments[0].roadName, 'Ponte de teste');
    assert.deepEqual(route.maneuvers[0].intersections?.[0].bearings, [0, 90, 180, 270]);
  } finally { globalThis.fetch = originalFetch; }
});

test('road profile, named bridge, crossing and metropolitan segments reduce speed locally', () => {
  const coordinates = [0, 0.005, 0.01, 0.015, 0.02, 0.025].map(longitude => ({ latitude: 0, longitude }));
  const route = analyzeRoute({ coordinates, profileSpeedsKmh: [110, 100, 40, 90, 90],
    navigationSegments: [
      { startDistanceMeters: 0, endDistanceMeters: 1100, roadName: 'Rodovia BR-040', roadRef: 'BR-040' },
      { startDistanceMeters: 1100, endDistanceMeters: 1700, roadName: 'Ponte do Rio' },
      { startDistanceMeters: 1700, endDistanceMeters: 2800, roadName: 'Travessia Central' },
    ] });
  assert.equal(route.segments[0].environment, 'highway');
  assert.equal(route.segments[2].environment, 'urban');
  assert.ok(route.segments[2].recommendedSpeedKmh <= 50);
  assert.ok(route.segments[3].recommendedSpeedKmh <= 30);
  assert.ok(route.speedTransitions.some(item => item.speedKmh <= 40));
});

test('a highway reaches the selected 80 or 120 km/h despite a low OSRM ETA speed', () => {
  const coordinates = [0, 0.04, 0.08, 0.12].map(longitude => ({ latitude: 0, longitude }));
  const route = analyzeRoute({ coordinates, profileSpeedsKmh: [40, 40, 40],
    navigationSegments: [{ startDistanceMeters: 0, endDistanceMeters: 13344,
      roadName: 'Rodovia BR-040', roadRef: 'BR-040', mode: 'driving' }] });
  assert.ok(route.segments.every(segment => segment.environment === 'highway'));
  assert.ok(route.segments.every(segment => segment.recommendedSpeedKmh === 120));
  for (const selectedSpeed of [80, 120]) {
    let state = createSpeedEngineState(), distance = 0;
    const steadySpeeds: number[] = [];
    for (let second = 0; second < 90; second++) {
      const advanced = advanceSpeed(state, { route, distanceTraveled: distance,
        targetAverageKmh: selectedSpeed, actualAverageKmh: selectedSpeed - 10,
        vehicle: getVehicle('car-3'), deltaSeconds: 1 });
      state = advanced.state;
      distance += advanced.distanceMeters;
      if (second >= 60) steadySpeeds.push(state.speedKmh);
    }
    const mean = steadySpeeds.reduce((sum, value) => sum + value, 0) / steadySpeeds.length;
    assert.ok(mean >= selectedSpeed * 0.975, `${selectedSpeed} km/h selected, ${mean} km/h achieved`);
    assert.ok(Math.max(...steadySpeeds) <= selectedSpeed + 0.1);
    assert.ok(distance > selectedSpeed / 3.6 * 75, `distance at ${selectedSpeed} km/h: ${distance} m`);
  }
});

test('an expressway name takes priority over the urban road prefix and low ETA speed', () => {
  const route = analyzeRoute({ coordinates: [
    { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.04 },
  ], profileSpeedsKmh: [35], navigationSegments: [{ startDistanceMeters: 0,
    endDistanceMeters: 4448, roadName: 'Avenida Expressa', mode: 'driving' }] });
  assert.equal(route.segments[0].environment, 'highway');
  assert.equal(route.segments[0].recommendedSpeedKmh, 120);
});

test('a high-capacity avenue is not held to a 50 km/h city-street target', () => {
  const route = analyzeRoute({ coordinates: [
    { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.04 },
  ], profileSpeedsKmh: [82], navigationSegments: [{ startDistanceMeters: 0,
    endDistanceMeters: 4448, roadName: 'Avenida Principal', mode: 'driving' }] });
  assert.equal(route.segments[0].environment, 'road');
  assert.ok(route.segments[0].recommendedSpeedKmh >= 80);
  assert.ok(route.segments[0].recommendedSpeedKmh <= 90);
});

test('turns and multi-road intersections cause braking before the maneuver', () => {
  const coordinates = [
    { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.005 },
    { latitude: 0.005, longitude: 0.005 }, { latitude: 0.01, longitude: 0.005 },
  ];
  const route = analyzeRoute({ coordinates, profileSpeedsKmh: [90, 90, 90], maneuvers: [{
    routeDistanceMeters: 556, distanceFromPreviousMeters: 556, type: 'turn', modifier: 'right',
    position: coordinates[1], intersections: [{ location: coordinates[1], bearings: [0, 90, 180, 270] }],
  }] });
  const turn = route.slowdowns.find(item => item.reason === 'maneuver');
  assert.ok(turn);
  let distance = turn.distanceMeters - 250;
  let state = { ...createSpeedEngineState(), speedKmh: 85 };
  let approachSpeed = 0;
  while (distance < turn.distanceMeters + 12) {
    const advanced = advanceSpeed(state, { route, distanceTraveled: distance, targetAverageKmh: 90,
      actualAverageKmh: 70, vehicle: getVehicle('car-2'), deltaSeconds: 0.2 });
    distance += advanced.distanceMeters;
    state = advanced.state;
    if (distance < turn.distanceMeters - 180) approachSpeed = state.speedKmh;
  }
  assert.ok(approachSpeed > 60);
  assert.ok(state.speedKmh < 35, `speed at turn: ${state.speedKmh}`);
});

test('a long straight road still has gradual speed variation without exceeding the chosen value', () => {
  const route = analyzeRoute({ coordinates: [
    { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.4 },
  ], profileSpeedsKmh: [110] });
  let distance = 0;
  let state = { ...createSpeedEngineState(), speedKmh: 100 };
  const sampled: number[] = [];
  for (let second = 0; second < 180; second++) {
    const advanced = advanceSpeed(state, { route, distanceTraveled: distance, targetAverageKmh: 100,
      actualAverageKmh: 90, vehicle: getVehicle('car-3'), deltaSeconds: 1 });
    distance += advanced.distanceMeters;
    state = advanced.state;
    if (second > 10) sampled.push(state.speedKmh);
  }
  assert.ok(Math.max(...sampled) - Math.min(...sampled) > 2, `range: ${Math.max(...sampled) - Math.min(...sampled)}`);
  assert.ok(Math.max(...sampled) <= 100.1);
});

test('a 25 km/h OSRM estimate does not lock the vehicle at 24 km/h', () => {
  const route = analyzeRoute({ coordinates: [
    { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.08 },
  ], profileSpeedsKmh: [25] });
  let state = createSpeedEngineState(), distance = 0;
  const observed: number[] = [];
  for (let second = 0; second < 120; second++) {
    const advanced = advanceSpeed(state, { route, distanceTraveled: distance, targetAverageKmh: 80,
      actualAverageKmh: 20, vehicle: getVehicle('car-2'), deltaSeconds: 1 });
    state = advanced.state;
    distance += advanced.distanceMeters;
    if (second >= 30) observed.push(Math.round(state.speedKmh));
  }
  assert.ok(Math.min(...observed) >= 27, `minimum: ${Math.min(...observed)}`);
  assert.ok(Math.max(...observed) >= 32, `maximum: ${Math.max(...observed)}`);
  assert.ok(new Set(observed).size >= 5, `speeds: ${[...new Set(observed)]}`);
});

test('a short low-speed routing edge does not make the car brake for an entire block', () => {
  const route = analyzeRoute({ coordinates: [0, 0.001, 0.00103, 0.002]
    .map(longitude => ({ latitude: 0, longitude })), profileSpeedsKmh: [50, 20, 50] });
  assert.ok(route.segments[1].recommendedSpeedKmh > 45,
    `smoothed target: ${route.segments[1].recommendedSpeedKmh}`);
});

test('an intersection near the end of a long routing step stays at its map position', () => {
  const coordinates = [0, 0.01, 0.02, 0.03].map(longitude => ({ latitude: 0, longitude }));
  const route = analyzeRoute({ coordinates, profileSpeedsKmh: [50, 50, 50], maneuvers: [{
    routeDistanceMeters: 0, distanceFromPreviousMeters: 3336, type: 'depart', position: coordinates[0],
    intersections: [{ location: { latitude: 0, longitude: 0.025 }, bearings: [0, 90, 180] }],
  }] });
  const intersection = route.slowdowns.find(item => item.reason === 'intersection');
  assert.ok(intersection);
  assert.ok(intersection.distanceMeters > 2700 && intersection.distanceMeters < 2850,
    `intersection at ${intersection.distanceMeters} m`);
});
