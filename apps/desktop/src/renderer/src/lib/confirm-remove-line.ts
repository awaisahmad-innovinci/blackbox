import type { ConfirmOptions } from "@renderer/components/confirm-provider";

export function removeTableLineConfirmOptions(label?: string): ConfirmOptions {
  return {
    title: "Remove line?",
    description: label
      ? `Remove ${label} from this list?`
      : "Remove this line from this list?",
    confirmLabel: "Remove",
  };
}
