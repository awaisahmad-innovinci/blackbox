import * as React from "react"

import { cn } from "@blackbox/ui/lib/utils"

/** A keyboard key, e.g. <Kbd>F10</Kbd>. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border bg-muted px-1 font-sans text-[0.7rem] font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
