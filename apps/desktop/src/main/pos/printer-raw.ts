import { spawn } from "node:child_process";
import { platform } from "node:process";

export async function sendRawToPrinter(
  printerName: string,
  data: Buffer,
): Promise<void> {
  const name = printerName.trim();
  if (!name) {
    throw new Error("Receipt printer name is required");
  }

  if (platform === "win32") {
    await sendRawWindows(name, data);
    return;
  }

  await sendRawCups(name, data);
}

function sendRawCups(printerName: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("lp", ["-d", printerName, "-o", "raw"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `lp exited with code ${code}`));
    });
    proc.stdin.write(data);
    proc.stdin.end();
  });
}

async function sendRawWindows(printerName: string, data: Buffer): Promise<void> {
  try {
    const printer = await import("@grandchef/node-printer");
    await new Promise<void>((resolve, reject) => {
      printer.printDirect({
        data,
        printer: printerName,
        type: "RAW",
        success: () => resolve(),
        error: (err: Error) => reject(err),
      });
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to send raw data to printer: ${message}`);
  }
}
