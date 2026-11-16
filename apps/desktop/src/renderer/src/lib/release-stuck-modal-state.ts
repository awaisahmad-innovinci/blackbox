
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

function runCleanup(): boolean {
  if (hasOpenDialog()) {
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

  return true;
}

/**
 * Clears Radix scroll-lock / inert / aria-hidden that can stick on Windows/Electron
 * after nested or repeated dialog close. No-op while a dialog is still open.
 */
export function releaseStuckModalState(options?: { retry?: boolean }): void {

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (runCleanup()) return;
      if (!options?.retry) return;


      window.setTimeout(() => {
        if (runCleanup()) return;
      }, 350);

      window.setTimeout(() => {
        runCleanup();
      }, 700);
    });
  });
}
