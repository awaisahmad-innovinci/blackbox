/** USB payment terminals on Linux usually appear as ttyACM* or ttyUSB*. */
export function isUsbEdcSerialPath(path: string): boolean {
  return /ttyACM|ttyUSB/i.test(path);
}

export function onboardMotherboardSerialPath(path: string): boolean {
  return /^\/dev\/ttyS\d+$/i.test(path.trim());
}

export function wrongEdcPortMessage(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (onboardMotherboardSerialPath(trimmed)) {
    return `${trimmed} is your PC's built-in serial port, not the USB card terminal. Plug in the EDC via USB and choose /dev/ttyACM0 (or /dev/ttyUSB0), not /dev/ttyS0.`;
  }
  return null;
}
