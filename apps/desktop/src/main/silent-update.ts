import { app } from "electron";
import { autoUpdater } from "electron-updater";

const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000;

function apiBase(): string | null {
  const raw = import.meta.env.VITE_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

async function checkForSilentUpdate(apiUrl: string): Promise<void> {
  try {
    const response = await fetch(`${apiUrl}/desktop/update-feed`);
    if (!response.ok) return;
    const body = (await response.json()) as { url?: string | null };
    const url = body.url?.trim();
    if (!url) return;
    autoUpdater.setFeedURL({ provider: "generic", url });
    await autoUpdater.checkForUpdates();
  } catch (err: unknown) {
    console.error("[update]", err);
  }
}

/** Download a newer Windows or Linux build and install it the next time the app quits. */
export function startSilentUpdates(): void {
  if (!app.isPackaged) return;
  const apiUrl = apiBase();
  if (!apiUrl) {
    console.error("[update] VITE_API_URL is not configured");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", (info) => {
    console.log(
      `[update] ${info.version} downloaded. Will install on quit.`,
    );
  });
  autoUpdater.on("error", (err) => {
    console.error("[update]", err);
  });

  void checkForSilentUpdate(apiUrl);
  setInterval(() => {
    void checkForSilentUpdate(apiUrl);
  }, UPDATE_CHECK_MS);
}
