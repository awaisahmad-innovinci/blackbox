import * as React from "react"

import { cn } from "@blackbox/ui/lib/utils"

/**
 * Top of every page: title, one line of help, and the page's actions on the right.
 * Keep the description to what the page is for, in the user's words.
 */
function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Optional back link or breadcrumb shown above the title. */
  back?: React.ReactNode
  className?: string
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {back ? <div className="text-sm text-muted-foreground">{back}</div> : null}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}

export { PageHeader }
