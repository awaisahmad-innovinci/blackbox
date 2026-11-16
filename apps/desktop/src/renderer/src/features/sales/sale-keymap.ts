/**
 * One keymap for the sale screen. Buttons, the hint bar and the key handler all read
 * from here, so a key can only ever have one job (review U1).
 *
 * F2 / F3 / F10 match every other form (focus scan / add item / save) via usePageKeyboard.
 * F11 is avoided: Electron's default menu uses it for full screen.
 */
export const SALE_KEYS = {
  remove: { key: "F1", label: "Remove item" },
  scan: { key: "F2", label: "Focus scan" },
  addItem: { key: "F3", label: "Add item" },
  tender: { key: "F4", label: "Tender" },
  cash: { key: "F5", label: "Cash" },
  hold: { key: "F6", label: "Hold" },
  held: { key: "F7", label: "Held bills" },
  adjust: { key: "F8", label: "Adjust qty" },
  card: { key: "F9", label: "Card" },
  post: { key: "F10", label: "Post sale" },
  split: { key: "Ctrl+F9", label: "Split cash + card" },
  foc: { key: "F12", label: "Add FOC" },
} as const

export type SaleKeyAction = keyof typeof SALE_KEYS

/** Order shown in the hint bar under the sale screen. */
export const SALE_KEY_HINT_ORDER: SaleKeyAction[] = [
  "scan",
  "addItem",
  "remove",
  "adjust",
  "foc",
  "tender",
  "cash",
  "card",
  "split",
  "hold",
  "held",
  "post",
]

/** Maps a keydown to a sale action handled by the sale page itself (not usePageKeyboard). */
export function matchSaleKey(event: KeyboardEvent): SaleKeyAction | null {
  if (event.altKey || event.shiftKey || event.metaKey) return null
  if (event.ctrlKey) return event.key === "F9" ? "split" : null
  switch (event.key) {
    case "F1":
      return "remove"
    case "F4":
      return "tender"
    case "F5":
      return "cash"
    case "F6":
      return "hold"
    case "F7":
      return "held"
    case "F8":
      return "adjust"
    case "F9":
      return "card"
    case "F12":
      return "foc"
    default:
      return null
  }
}

let audio: AudioContext | null = null

/**
 * Short low beep for a failed scan (not found / no stock). The cashier is looking at the
 * product, not the screen, so the error must be heard (review U4). Never throws.
 */
export function playScanErrorBeep(): void {
  try {
    audio ??= new AudioContext()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = "square"
    osc.frequency.value = 220
    gain.gain.setValueAtTime(0.08, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25)
    osc.connect(gain).connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + 0.25)
  } catch {
    /* no audio device: the on-screen message still shows */
  }
}
