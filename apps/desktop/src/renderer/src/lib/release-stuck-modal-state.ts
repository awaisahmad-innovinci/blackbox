import {
  debugInputFreeze,
  snapshotModalState,
} from "@renderer/lib/debug-input-freeze";

function hasOpenDialog(): boolean {
  return (
    document.querySelector(
      '[data-slot="dialog-content"][data-state="open"]',
    ) != null ||
    document.querySelector(
      '[data-slot="alert-dialog-content"][data-state="open"]',
    ) != null
  );
}

function clearElementLock(el: HTMLElement): void {
  el.removeAttribute("inert");
  if (el.getAttribute("aria-hidden") === "true") {
    el.removeAttribute("aria-hidden");
  }
}

function runCleanup(attemptLabel: string): boolean {
  const before = snapshotModalState();
  if (hasOpenDialog()) {
    // #region agent log
    debugInputFreeze(
      "B",
      "release-stuck-modal-state.ts:skipped",
      "cleanup skipped — dialog still open",
      { attempt: attemptLabel, ...before },
    );
    // #endregion
    return false;
  }

  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  document.body.removeAttribute("data-scroll-locked");

  for (const el of document.querySelectorAll("main, header")) {
    if (el instanceof HTMLElement) clearElementLock(el);
  }

  const root = document.getElementById("root");
  if (root) {
    for (const child of root.children) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.hasAttribute("data-slot")) continue;
      clearElementLock(child);
    }
  }

  for (const el of document.querySelectorAll("[inert]")) {
    if (el instanceof HTMLElement) el.removeAttribute("inert");
  }

  for (const el of document.querySelectorAll('[aria-hidden="true"]')) {
    if (!(el instanceof HTMLElement) || el === document.body) continue;
    if (
      el.closest(
        '[data-slot="dialog-content"], [data-slot="alert-dialog-content"]',
      )
    ) {
      continue;
    }
    el.removeAttribute("aria-hidden");
  }

  // #region agent log
  debugInputFreeze(
    "C",
    "release-stuck-modal-state.ts:done",
    "cleanup ran",
    { attempt: attemptLabel, before, after: snapshotModalState() },
  );
  // #endregion
  return true;
}

/**
 * Clears Radix scroll-lock / inert / aria-hidden that can stick on Windows/Electron
 * after nested or repeated dialog close. No-op while a dialog is still open.
 */
export function releaseStuckModalState(options?: { retry?: boolean }): void {
  // #region agent log
  debugInputFreeze(
    "B",
    "release-stuck-modal-state.ts:entry",
    "releaseStuckModalState scheduled",
    { retry: options?.retry ?? false, ...snapshotModalState() },
  );
  // #endregion

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (runCleanup("immediate")) return;
      if (!options?.retry) return;

      // #region agent log
      debugInputFreeze(
        "B",
        "release-stuck-modal-state.ts:retryScheduled",
        "cleanup retry scheduled",
        snapshotModalState(),
      );
      // #endregion

      window.setTimeout(() => {
        if (runCleanup("350ms")) return;
      }, 350);

      window.setTimeout(() => {
        runCleanup("700ms");
      }, 700);
    });
  });
}
