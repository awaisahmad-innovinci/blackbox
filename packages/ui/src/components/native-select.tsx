import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@blackbox/ui/lib/utils"

/**
 * Styled native <select>. Prefer it for simple filters and form fields: native keyboard
 * support, works inside forms, and allows an empty "" option (Radix Select does not).
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative inline-flex min-w-0", className)}>
      <select
        data-slot="native-select"
        className="border-input bg-card text-foreground h-10 w-full min-w-0 appearance-none rounded-md border py-2 pr-9 pl-3 text-sm transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  )
}

export { NativeSelect }
