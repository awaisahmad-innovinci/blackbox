const DEBUG_ENDPOINT =
  "http://127.0.0.1:7833/ingest/5c639e3b-d485-4142-8cf3-71119b248855";
const DEBUG_SESSION = "b2ecf6";

const DEBUG_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_INPUT_FREEZE === "true";

export function debugInputFreeze(
  hypothesisId: string,
  location: string,
  message: string,
  data?: Record<string, unknown>,
  runId = "pre-fix",
): void {
  if (!DEBUG_ENABLED) return;

  const payload = {
    sessionId: DEBUG_SESSION,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    runId,
  };
  // #region agent log
  console.warn("[debug-b2ecf6]", message, data);
  fetch(DEBUG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}

export function snapshotModalState(): Record<string, unknown> {
  const main = document.querySelector("main");
  const active = document.activeElement;
  return {
    bodyOverflow: document.body.style.overflow || null,
    bodyPaddingRight: document.body.style.paddingRight || null,
    bodyScrollLocked: document.body.getAttribute("data-scroll-locked"),
    mainInert: main?.hasAttribute("inert") ?? null,
    mainAriaHidden: main?.getAttribute("aria-hidden") ?? null,
    openDialogContent: document.querySelectorAll(
      '[data-slot="dialog-content"][data-state="open"]',
    ).length,
    openAlertContent: document.querySelectorAll(
      '[data-slot="alert-dialog-content"][data-state="open"]',
    ).length,
    inertCount: document.querySelectorAll("[inert]").length,
    ariaHiddenCount: document.querySelectorAll('[aria-hidden="true"]').length,
    activeTag: active?.tagName ?? null,
    activeId: active instanceof HTMLElement ? active.id || null : null,
  };
}

let probeInstalled = false;

/** Logs when a printable key in an input/textarea was swallowed (defaultPrevented). */
export function installInputFreezeProbe(): void {
  if (probeInstalled) return;
  probeInstalled = true;

  document.addEventListener(
    "keydown",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      if (target.disabled || target.readOnly) return;
      if (event.key.length !== 1) return;
      if (!event.defaultPrevented) return;

      debugInputFreeze(
        "D",
        "debug-input-freeze.ts:probe",
        "printable key defaultPrevented in editable field",
        {
          key: event.key,
          targetId: target.id || null,
          ...snapshotModalState(),
        },
      );
    },
    false,
  );
}
