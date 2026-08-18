import type { KeyboardEvent } from "react";

/**
 * On Enter in an input/select, move focus to the next field inside the nearest
 * [data-enter-nav] container (or the event currentTarget). Only inputs, selects
 * and textareas are candidates, so Enter can never land on a button and trigger
 * a destructive action such as removing a row.
 */
export function handleEnterToNextField(
  event: KeyboardEvent<HTMLElement>,
): void {
  if (event.key !== "Enter") return;
  if (event.defaultPrevented) return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "BUTTON") return;
  if (tag !== "INPUT" && tag !== "SELECT") return;

  if (
    target instanceof HTMLInputElement &&
    (target.type === "submit" ||
      target.type === "button" ||
      target.type === "checkbox" ||
      target.type === "radio" ||
      target.type === "file")
  ) {
    return;
  }

  if (target.dataset.enterSubmit !== undefined) return;

  const root =
    target.closest<HTMLElement>("[data-enter-nav]") ?? event.currentTarget;

  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]), select:not([disabled]), textarea:not([disabled])',
    ),
  ).filter((el) => {
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.tabIndex < 0) return false;
    return el.offsetParent !== null || el === document.activeElement;
  });

  const index = focusable.indexOf(target);
  if (index < 0) return;

  event.preventDefault();
  const next = focusable[index + 1];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement && next.type === "text") {
      next.select();
    }
    if (next instanceof HTMLSelectElement) {
      try {
        next.showPicker();
      } catch {
        /* picker needs user activation; focus alone is fine */
      }
    }
  }
}
