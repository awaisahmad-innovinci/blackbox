import type { ComponentProps } from "react";
import { ConfirmDialog as SharedConfirmDialog } from "@blackbox/ui/confirm-dialog";
import { afterDialogClosed } from "@renderer/lib/on-dialog-open-change";

/** Shared ConfirmDialog that also restores keyboard/scan focus after it closes. */
export function ConfirmDialog(
  props: Omit<ComponentProps<typeof SharedConfirmDialog>, "onClosed">,
) {
  return <SharedConfirmDialog {...props} onClosed={afterDialogClosed} />;
}
