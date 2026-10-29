import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceFreeDrive, buildRoadNetwork, createFreeDrive, isOnRoad, nearestRoadPoint, roadCollisionWidthPixelsAtZoom0, type RoadWay } from '../frontend/src/game/freeDrive.ts';
import { gamepadDriveInput, keyboardDriveInput } from '../frontend/src/game/freeDriveInput.ts';
import { getVehicle } from '../frontend/src/types/vehicle.ts';
import { distanceBetweenCoordinates } from '../frontend/src/utils/geo.ts';
import { tileAt } from '../backend/src/services/roads.service.ts';

const horizontal: RoadWay = { id: 1, widthMeters: 8, coordinates: [[0, 0], [0.001, 0]] };
const vertical: RoadWay = { id: 2, widthMeters: 8, coordinates: [[0.0005, -0.0005], [0.0005, 0.0005]] };
const origin = { latitude: 0, longitude: 0 };

test('free drive snaps to a road and cannot cross its edge', () => {
  const network = buildRoadNetwork([horizontal], origin);
  const snap = nearestRoadPoint(network, { latitude: 0.0001, longitude: 0.0005 });
  assert.ok(snap);
  assert.ok(snap.distanceMeters > 10 && snap.distanceMeters < 12);
  assert.ok(isOnRoad(network, snap.position));
  let state = { ...createFreeDrive(snap.position, 0), running: true };
  for (let frame = 0; frame < 240; frame++) state = advanceFreeDrive(state, 1 / 60,
    { steering: 0, throttle: 1, brake: 0 }, network, getVehicle('car-2'));
  assert.ok(isOnRoad(network, state.position));
  assert.ok(distanceBetweenCoordinates(snap.position, state.position) < 4);
  assert.ok(state.colliding);
});

test('satellite collision outline has the same physical width as the driveable corridor', () => {
  const network = buildRoadNetwork([horizontal], origin);
  const zoom = 18;
  const metersPerPixel = 2 * Math.PI * 6_371_000 / (512 * 2 ** zoom);
  const halfWidthFromOutline = roadCollisionWidthPixelsAtZoom0(horizontal, 0) * 2 ** zoom * metersPerPixel / 2;
  const justInside = { latitude: (halfWidthFromOutline - 0.05) / 6_371_000 * 180 / Math.PI, longitude: 0.0005 };
  const justOutside = { latitude: (halfWidthFromOutline + 0.05) / 6_371_000 * 180 / Math.PI, longitude: 0.0005 };
  assert.ok(isOnRoad(network, justInside));
  assert.ok(!isOnRoad(network, justOutside));
});

test('free drive advances on a street, can take a connected street, and reverses', () => {
  const network = buildRoadNetwork([horizontal, vertical], origin);
  let state = { ...createFreeDrive({ latitude: 0, longitude: 0.0001 }, 90), running: true };
  for (let frame = 0; frame < 300; frame++) state = advanceFreeDrive(state, 1 / 60,
    { steering: 0, throttle: 0.6, brake: 0 }, network, getVehicle('car-2'));
  assert.ok(state.position.longitude > 0.0002);
  assert.ok(isOnRoad(network, state.position));
  state = { ...createFreeDrive({ latitude: 0, longitude: 0.0005 }, 0), running: true };
  for (let frame = 0; frame < 300; frame++) state = advanceFreeDrive(state, 1 / 60,
    { steering: 0, throttle: 0.6, brake: 0 }, network, getVehicle('car-2'));
  assert.ok(state.position.latitude > 0.0001);
  assert.ok(isOnRoad(network, state.position));
  state = { ...createFreeDrive({ latitude: 0, longitude: 0.0005 }, 90), running: true };
  for (let frame = 0; frame < 120; frame++) state = advanceFreeDrive(state, 1 / 60,
    { steering: 0, throttle: 0, brake: 0.8 }, network, getVehicle('car-2'));
  assert.ok(state.speedKmh < -1);
  assert.ok(state.position.longitude < 0.0005);
  assert.ok(isOnRoad(network, state.position));
});

test('standard gamepad R2/RT trigger value controls acceleration proportionally', () => {
  const pad = { axes: [0.35], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) } as unknown as Gamepad;
  (pad.buttons[7] as { value: number }).value = 0.42;
  (pad.buttons[6] as { value: number }).value = 0.17;
  const input = gamepadDriveInput(pad);
  assert.equal(input.steering, 0.35);
  assert.equal(input.throttle, 0.42);
  assert.equal(input.brake, 0.17);
  assert.deepEqual(keyboardDriveInput(new Set(['KeyW', 'ArrowLeft'])), { steering: -1, throttle: 1, brake: 0 });
});

test('partial analog throttle accelerates less than a fully pressed trigger', () => {
  const network = buildRoadNetwork([{ id: 3, widthMeters: 10, coordinates: [[0, 0], [0.01, 0]] }], origin);
  const start = { ...createFreeDrive({ latitude: 0, longitude: 0.001 }, 90), running: true };
  let partial = start, full = start;
  for (let frame = 0; frame < 120; frame++) {
    partial = advanceFreeDrive(partial, 1 / 60, { steering: 0, throttle: 0.3, brake: 0 }, network, getVehicle('car-2'));
    full = advanceFreeDrive(full, 1 / 60, { steering: 0, throttle: 1, brake: 0 }, network, getVehicle('car-2'));
  }
  assert.ok(partial.speedKmh > 0);
  assert.ok(full.speedKmh > partial.speedKmh * 2.5);
  assert.ok(isOnRoad(network, full.position));
});

test('road tile indexing selects the expected map area', () => {
  assert.deepEqual(tileAt(-19.9191, -43.9386), { x: 6192, y: 9117 });
});
