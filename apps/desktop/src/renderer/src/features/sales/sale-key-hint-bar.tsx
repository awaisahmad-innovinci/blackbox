import { Kbd } from "@blackbox/ui/kbd";
import { SALE_KEY_HINT_ORDER, SALE_KEYS } from "./sale-keymap";

/** The hint strip under the sale screen, built from the one keymap (review U1). */
export function SaleKeyHintBar() {
  return (
    <ul
      aria-label="Keyboard shortcuts"
      className="border-border text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3 text-xs"
    >
      {SALE_KEY_HINT_ORDER.map((action) => (
        <li key={action} className="inline-flex items-center gap-1.5">
          <Kbd>{SALE_KEYS[action].key}</Kbd>
          {SALE_KEYS[action].label}
        </li>
      ))}
    </ul>
  );
}
