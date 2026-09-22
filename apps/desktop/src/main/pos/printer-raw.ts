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

const WINDOWS_RAW_PRINT_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class DocInfoA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
}
public class RawPrinter {
    [DllImport("winspool.drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, [In, MarshalAs(UnmanagedType.LPStruct)] DocInfoA di);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
}
'@
$printerName = $env:BLACKBOX_PRINTER_NAME
$payloadB64 = $env:BLACKBOX_RAW_B64
if (-not $printerName) { throw 'Printer name is required' }
if (-not $payloadB64) { throw 'Raw payload is required' }
$bytes = [Convert]::FromBase64String($payloadB64)
$doc = New-Object DocInfoA
$doc.pDocName = 'Blackbox RAW'
$doc.pDataType = 'RAW'
$h = [IntPtr]::Zero
if (-not [RawPrinter]::OpenPrinter($printerName, [ref]$h, [IntPtr]::Zero)) {
  throw "OpenPrinter failed for '$printerName'"
}
try {
  if (-not [RawPrinter]::StartDocPrinter($h, 1, $doc)) { throw 'StartDocPrinter failed' }
  try {
    if (-not [RawPrinter]::StartPagePrinter($h)) { throw 'StartPagePrinter failed' }
    try {
      $ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
      try {
        [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
        $written = 0
        if (-not [RawPrinter]::WritePrinter($h, $ptr, $bytes.Length, [ref]$written)) {
          throw 'WritePrinter failed'
        }
      } finally {
        [Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
      }
    } finally {
      [void][RawPrinter]::EndPagePrinter($h)
    }
  } finally {
    [void][RawPrinter]::EndDocPrinter($h)
  }
} finally {
  [void][RawPrinter]::ClosePrinter($h)
}
`.trim();

async function sendRawWindows(printerName: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        WINDOWS_RAW_PRINT_PS,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          BLACKBOX_PRINTER_NAME: printerName,
          BLACKBOX_RAW_B64: data.toString("base64"),
        },
      },
    );

    let stderr = "";
    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim() || stdout.trim();
      reject(
        new Error(
          detail
            ? `Failed to send raw data to printer: ${detail}`
            : `powershell exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}
