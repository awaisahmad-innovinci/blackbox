import { refreshPendingCount, syncNow } from "./sync-status";

const BASE_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 5 * 60_000;

type Engine = {
  timer: ReturnType<typeof setTimeout> | null;
  intervalMs: number;
  stopped: boolean;
  detach: () => void;
};

let engine: Engine | null = null;

function canReachApi(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

/**
 * Periodic push/pull loop for a trusted device.
 *
 * Reschedules from the end of each attempt rather than on a fixed interval, so
 * a slow sync cannot stack runs, and backs off to `MAX_INTERVAL_MS` while the
 * API keeps failing (typically offline or a device that lost trust).
 */
export function startAutoSync(): void {
  if (engine) return;

  const current: Engine = {
    timer: null,
    intervalMs: BASE_INTERVAL_MS,
    stopped: false,
    detach: () => undefined,
  };
  engine = current;

  const schedule = (delay: number): void => {
    if (current.stopped) return;
    if (current.timer) clearTimeout(current.timer);
    current.timer = setTimeout(() => void tick(), delay);
  };

  const tick = async (): Promise<void> => {
    if (current.stopped) return;
    if (!canReachApi()) {
      schedule(current.intervalMs);
      return;
    }
    const ok = await syncNow();
    current.intervalMs = ok
      ? BASE_INTERVAL_MS
      : Math.min(current.intervalMs * 2, MAX_INTERVAL_MS);
    schedule(current.intervalMs);
  };

  const runSoon = (): void => {
    current.intervalMs = BASE_INTERVAL_MS;
    schedule(0);
  };

  const onOnline = () => runSoon();
  const onFocus = () => runSoon();
  const onVisible = () => {
    if (document.visibilityState === "visible") runSoon();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  current.detach = () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };

  void refreshPendingCount().catch(() => undefined);
  schedule(0);
}

export function stopAutoSync(): void {
  if (!engine) return;
  engine.stopped = true;
  if (engine.timer) clearTimeout(engine.timer);
  engine.detach();
  engine = null;
}
