import * as React from "react"

export type ThemePreference = "light" | "dark" | "system"

const STORAGE_KEY = "bb-theme"

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value === "light" || value === "dark" || value === "system") return value
  } catch {
    /* storage blocked: fall back to the OS setting */
  }
  return "system"
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
}

/** Applies the stored theme (or the OS setting) to <html>. Safe to call before React renders. */
export function applyStoredTheme(): void {
  const pref = readPreference()
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark())
  document.documentElement.classList.toggle("dark", dark)
}

/**
 * Inline script for <head> so the right theme is set before first paint (no light flash).
 * Mirrors applyStoredTheme().
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${STORAGE_KEY}");var d=p==="dark"||((p===null||p==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})();`

/** Light / dark / system theme, stored per browser. Follows the OS while set to "system". */
export function useTheme(): {
  preference: ThemePreference
  resolved: "light" | "dark"
  setPreference: (pref: ThemePreference) => void
} {
  const [preference, setPref] = React.useState<ThemePreference>("system")
  const [resolved, setResolved] = React.useState<"light" | "dark">("light")

  React.useEffect(() => {
    setPref(readPreference())
  }, [])

  React.useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)")
    const apply = () => {
      const dark =
        preference === "dark" || (preference === "system" && (media?.matches ?? false))
      document.documentElement.classList.toggle("dark", dark)
      setResolved(dark ? "dark" : "light")
    }
    apply()
    media?.addEventListener("change", apply)
    return () => media?.removeEventListener("change", apply)
  }, [preference])

  const setPreference = React.useCallback((pref: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, pref)
    } catch {
      /* not persisted; still applied for this session */
    }
    setPref(pref)
  }, [])

  return { preference, resolved, setPreference }
}
