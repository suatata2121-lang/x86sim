// Pure helpers for the virtual devices, kept out of Devices.tsx (which
// should export only the React component) so that file's Fast Refresh
// boundary stays reliable in dev, and so this logic is unit-testable
// on its own.

export const PORTS = {
  TRAFFIC_LIGHT: 0x40,
  STEPPER_MOTOR: 0x41,
  SEVEN_SEGMENT: 0x42,
  THERMOMETER: 0x43,
} as const

// A standard 4-step full-step unipolar coil sequence. Each valid step (a
// value from this list that differs from the last one seen) rotates the
// stepper motor's dial by 90 degrees, forward or backward depending on
// which direction through the sequence the new value is closer to.
export const STEPPER_SEQUENCE = [0b0011, 0b0110, 0b1100, 0b1001]

export function stepperDelta(sequence: number[], fromIndex: number, toIndex: number): number {
  const n = sequence.length
  const forward = (toIndex - fromIndex + n) % n
  const backward = (fromIndex - toIndex + n) % n
  return forward <= backward ? forward : -backward
}
