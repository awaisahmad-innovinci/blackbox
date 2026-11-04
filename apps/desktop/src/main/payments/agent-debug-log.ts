import { appendFileSync } from "node:fs";

const LOG_PATH = "/home/rooki/Documents/work/blackbox/.cursor/debug-abae79.log";

export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  const payload = {
    sessionId: "abae79",
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
    runId: "pre-fix",
  };
  // #region agent log
  fetch("http://127.0.0.1:7686/ingest/ab68d8f7-59f7-4472-9baa-3354161bb732", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "abae79",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  try {
    appendFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch {
    /* ignore */
  }
  // #endregion
}
