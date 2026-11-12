import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PosCardTerminalPushResult } from "@blackbox/shared";
import {
  formatLinuxKeyboardError,
  typeAmountOnLinux,
} from "./linux-keyboard";

const execFileAsync = promisify(execFile);

/**
 * Types the amount on the active window via OS keyboard simulation.
 * Cashier should focus the EDC amount field before card payment is selected.
 */
export async function pushAmountViaHidKeys(
  amountText: string,
): Promise<PosCardTerminalPushResult> {
  const sanitized = amountText.replace(/[^\d.]/g, "");
  if (!sanitized) {
    return { ok: false, message: "Invalid amount for terminal." };
  }

  try {
    if (process.platform === "win32") {
      await typeViaWindowsSendKeys(sanitized);
      return { ok: true };
    }
    if (process.platform === "linux") {
      await typeAmountOnLinux(sanitized);
      return { ok: true };
    }
    return {
      ok: false,
      message: `HID keyboard mode is not supported on ${process.platform}. Use serial ECR mode or enter the amount on the terminal manually.`,
    };
  } catch (err: unknown) {
    if (process.platform === "linux") {
      return {
        ok: false,
        message: `${formatLinuxKeyboardError(err)} Enter the amount on the terminal manually.`,
      };
    }
    const message =
      err instanceof Error
        ? err.message
        : "Could not send keystrokes to the terminal.";
    return {
      ok: false,
      message: `${message} Enter the amount on the terminal manually.`,
    };
  }
}

async function typeViaWindowsSendKeys(text: string): Promise<void> {
  const escaped = text.replace(/[+^%~()[\]{}]/g, "{$&}");
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    `$text = '${escaped.replace(/'/g, "''")}'`,
    "[System.Windows.Forms.SendKeys]::SendWait($text)",
    "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')",
  ].join("; ");
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 15_000 },
  );
}
