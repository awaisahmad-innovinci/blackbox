import type { ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@blackbox/ui/components/alert-dialog"
import { cn } from "@blackbox/ui/lib/utils"

/** Yes/no confirmation. Name the confirm button after the action ("Deactivate shop"). */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onClosed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  /** Extra guard, e.g. until the user types the shop name. */
  confirmDisabled?: boolean
  /** Optional extra content (e.g. a "type the name to confirm" field). */
  children?: ReactNode
  onConfirm: () => void | Promise<void>
  /** Called after the dialog closes (desktop uses this to restore scan focus). */
  onClosed?: () => void
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClosed?.()
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading || confirmDisabled}
            className={cn(
              destructive &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
            onClick={(e) => {
              e.preventDefault()
              void onConfirm()
            }}
          >
            {loading ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { ConfirmDialog }
