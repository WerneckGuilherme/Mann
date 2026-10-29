import type { FreeDriveInput } from './freeDrive.ts';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const pressed = (keys: ReadonlySet<string>, ...names: string[]) => names.some(name => keys.has(name));

export function keyboardDriveInput(keys: ReadonlySet<string>): FreeDriveInput {
  return {
    steering: Number(pressed(keys, 'KeyD', 'ArrowRight')) - Number(pressed(keys, 'KeyA', 'ArrowLeft')),
    throttle: Number(pressed(keys, 'KeyW', 'ArrowUp')),
    brake: Number(pressed(keys, 'KeyS', 'ArrowDown', 'Space')),
  };
}

export function gamepadDriveInput(gamepad: Gamepad | null): FreeDriveInput {
  if (!gamepad) return { steering: 0, throttle: 0, brake: 0 };
  const axis = gamepad.axes[0] ?? 0;
  const dpad = Number(Boolean(gamepad.buttons[15]?.pressed)) - Number(Boolean(gamepad.buttons[14]?.pressed));
  const steering = Math.abs(axis) > 0.09 ? clamp(axis, -1, 1) : dpad;
  // Standard mapping: L2/LT = 6, R2/RT = 7. DualSenseX presents its virtual
  // Xbox pad through the same mapping. Preserve the analog trigger value.
  const throttle = clamp(gamepad.buttons[7]?.value ?? 0, 0, 1);
  const brake = clamp(gamepad.buttons[6]?.value ?? 0, 0, 1);
  return { steering, throttle, brake };
}

export function combineDriveInputs(...inputs: FreeDriveInput[]): FreeDriveInput {
  return inputs.reduce((current, input) => ({
    steering: Math.abs(input.steering) > Math.abs(current.steering) ? input.steering : current.steering,
    throttle: Math.max(current.throttle, input.throttle), brake: Math.max(current.brake, input.brake),
  }), { steering: 0, throttle: 0, brake: 0 });
}
