/**
 * OS-level keyboard simulation on Linux (no xdotool).
 * Uses @nut-tree-fork/nut-js — maintained fork of nut-js.
 */
export async function typeAmountOnLinux(text: string): Promise<void> {
  const { keyboard, Key } = await import("@nut-tree-fork/nut-js");
  keyboard.config.autoDelayMs = 12;
  await keyboard.type(text);
  await keyboard.type(Key.Enter);
}

export function formatLinuxKeyboardError(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : "Could not send keystrokes to the terminal.";
  const lower = raw.toLowerCase();

  if (lower.includes("display") || lower.includes("x11") || lower.includes("wayland")) {
    return `${raw} Ensure the POS session has a graphical display (X11 often works best for sending keys to external apps).`;
  }
  if (lower.includes("libxtst") || lower.includes("xtest")) {
    return `${raw} On X11, install libxtst (e.g. sudo apt install libxtst6).`;
  }

  return raw;
}
