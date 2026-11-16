import { Toaster as Sonner, toast, type ToasterProps } from "sonner"

/** App-wide toasts for short results ("Saved", "Synced"). Errors that need action stay inline. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "!rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-lg",
          description: "!text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
