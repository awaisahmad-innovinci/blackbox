import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type FormShortcutAction = "save" | "scan" | "add" | "new";

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Match POS-style dual shortcuts (F-keys and Ctrl combinations).
 */
export function matchFormShortcut(event: KeyboardEvent): FormShortcutAction | null {
  if (event.altKey || event.shiftKey) return null;

  if (event.key === "F10") {
    event.preventDefault();
    return "save";
  }
  if (event.key === "F2") {
    event.preventDefault();
    return "scan";
  }
  if (event.key === "F3") {
    event.preventDefault();
    return "add";
  }
  if (event.key === "F4") {
    event.preventDefault();
    return "new";
  }

  if (!(event.ctrlKey || event.metaKey)) return null;

  if (event.key === "Enter") {
    event.preventDefault();
    return "save";
  }
  const key = event.key.toLowerCase();
  if (key === "b") {
    event.preventDefault();
    return "scan";
  }
  if (key === "i") {
    event.preventDefault();
    return "add";
  }
  if (key === "n") {
    event.preventDefault();
    return "new";
  }
  return null;
}

/**
 * On Enter in a field marked data-enter-submit, submit the nearest form.
 */
export function handleEnterToSubmit(
  event: ReactKeyboardEvent<HTMLElement>,
): boolean {
  if (event.key !== "Enter") return false;
  if (event.defaultPrevented) return false;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.dataset.enterSubmit === undefined) return false;
  if (target.tagName === "TEXTAREA") return false;

  event.preventDefault();
  const form = target.closest("form");
  if (form) {
    form.requestSubmit();
    return true;
  }
  return false;
}

function isEnterNavField(target: HTMLElement): boolean {
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "BUTTON") return false;
  if (tag !== "INPUT" && tag !== "SELECT") return false;

  if (
    target instanceof HTMLInputElement &&
    (target.type === "submit" ||
      target.type === "button" ||
      target.type === "checkbox" ||
      target.type === "radio" ||
      target.type === "file")
  ) {
    return false;
  }

  if (target.dataset.enterSubmit !== undefined) return false;

  return true;
}

function getEnterNavFocusable(
  root: HTMLElement,
  target: HTMLElement,
): { focusable: HTMLElement[]; index: number } | null {
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
  if (index < 0) return null;

  return { focusable, index };
}

function openPickerOnField(el: HTMLElement): void {
  if (el instanceof HTMLInputElement && el.type === "date") {
    try {
      el.showPicker();
    } catch {
      /* picker needs user activation; focus alone is fine */
    }
    return;
  }
  if (el instanceof HTMLSelectElement) {
    try {
      el.showPicker();
    } catch {
      /* picker needs user activation; focus alone is fine */
    }
  }
}

function isSelectValueEmptyOrPlaceholder(select: HTMLSelectElement): boolean {
  if (select.value === "") return true;
  const selected = select.options[select.selectedIndex];
  return selected?.value === "";
}

function firstSelectableOptionIndex(select: HTMLSelectElement): number {
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i]!;
    if (opt.disabled) continue;
    if (opt.value !== "") return i;
  }
  for (let i = 0; i < select.options.length; i++) {
    if (!select.options[i]!.disabled) return i;
  }
  return -1;
}

function applyFirstSelectOption(select: HTMLSelectElement): boolean {
  const idx = firstSelectableOptionIndex(select);
  if (idx < 0) return false;
  const opt = select.options[idx]!;
  if (select.value === opt.value) return false;
  select.selectedIndex = idx;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/** Reset two-step Enter picker state when a field receives focus. */
export function handleEnterPickerFocus(
  event: React.FocusEvent<HTMLElement>,
): void {
  delete event.currentTarget.dataset.enterPickerOpened;
}

function focusEnterNavField(el: HTMLElement): void {
  el.focus();
  if (el instanceof HTMLInputElement && el.type === "text") {
    el.select();
  }
  if (el.dataset.enterPicker !== undefined) {
    if (el.dataset.enterPickerLazy === undefined) {
      openPickerOnField(el);
      if (el instanceof HTMLSelectElement) {
        el.dataset.enterPickerOpened = "open";
      } else {
        el.dataset.enterPickerOpened = "true";
      }
    }
  }
}

function tryOpenEnterPicker(
  event: ReactKeyboardEvent<HTMLElement>,
  target: HTMLElement,
): boolean {
  if (target.dataset.enterPicker === undefined) return false;

  const opened = target.dataset.enterPickerOpened;
  if (target instanceof HTMLSelectElement) {
    if (opened === "open" || opened === "ready" || opened === "true") {
      return false;
    }
    event.preventDefault();
    target.dataset.enterPickerOpened = "open";
    openPickerOnField(target);
    return true;
  }

  if (opened === "true") return false;

  event.preventDefault();
  target.dataset.enterPickerOpened = "true";
  openPickerOnField(target);
  return true;
}

/**
 * On Enter in an input/select, move focus to the next field inside the nearest
 * [data-enter-nav] container (or the event currentTarget). Only inputs, selects
 * and textareas are candidates, so Enter can never land on a button and trigger
 * a destructive action such as removing a row.
 */
export function handleEnterToNextField(
  event: ReactKeyboardEvent<HTMLElement>,
): void {
  if (event.key !== "Enter" || event.shiftKey) return;
  if (event.defaultPrevented) return;

  if (handleEnterToSubmit(event)) return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!isEnterNavField(target)) return;

  const root =
    target.closest<HTMLElement>("[data-enter-nav]") ?? event.currentTarget;

  if (
    target instanceof HTMLSelectElement &&
    target.dataset.enterPicker !== undefined
  ) {
    const opened = target.dataset.enterPickerOpened;
    if (opened === "open") {
      event.preventDefault();
      if (isSelectValueEmptyOrPlaceholder(target)) {
        applyFirstSelectOption(target);
      }
      target.dataset.enterPickerOpened = "ready";
      return;
    }
    if (opened === "ready") {
      delete target.dataset.enterPickerOpened;
    }
  }

  if (tryOpenEnterPicker(event, target)) return;

  const nav = getEnterNavFocusable(root, target);
  if (!nav) return;

  if (target.dataset.enterPickerOpened === "true") {
    delete target.dataset.enterPickerOpened;
  }

  event.preventDefault();
  const next = nav.focusable[nav.index + 1];
  if (next) focusEnterNavField(next);
}

/**
 * On Shift+Enter, move focus to the previous field in the same enter-nav list.
 */
export function handleShiftEnterToPreviousField(
  event: ReactKeyboardEvent<HTMLElement>,
): void {
  if (event.key !== "Enter" || !event.shiftKey) return;
  if (event.defaultPrevented) return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!isEnterNavField(target)) return;

  const root =
    target.closest<HTMLElement>("[data-enter-nav]") ?? event.currentTarget;

  const nav = getEnterNavFocusable(root, target);
  if (!nav) return;

  event.preventDefault();
  const prev = nav.focusable[nav.index - 1];
  if (prev) focusEnterNavField(prev);
}

/** Enter next field; Shift+Enter previous field. */
export function handleEnterNavKeyDown(
  event: ReactKeyboardEvent<HTMLElement>,
): void {
  handleShiftEnterToPreviousField(event);
  handleEnterToNextField(event);
}
