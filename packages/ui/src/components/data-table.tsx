import * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { cn } from "@blackbox/ui/lib/utils"

/**
 * Ledger-style table: hairline row rules, sentence-case headers, tabular numbers.
 * Scrolls sideways inside its own frame on small screens, never the whole page.
 */
function DataTable({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("bb-surface overflow-hidden", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      className={cn("w-full text-left text-sm tabular-nums sm:min-w-[640px]", className)}
      {...props}
    />
  )
}

function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn(
        "border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function Th({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th className={cn("px-4 py-2.5 font-medium whitespace-nowrap", className)} {...props} />
  )
}

export type SortDirection = "asc" | "desc"

/** Clickable column header. Pair with useSortedRows(). */
function SortableTh({
  label,
  active,
  direction,
  onSort,
  className,
  ...props
}: Omit<React.ComponentProps<"th">, "onClick"> & {
  label: React.ReactNode
  active: boolean
  direction: SortDirection
  onSort: () => void
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown
  return (
    <th
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-4 py-2.5 font-medium whitespace-nowrap", className)}
      {...props}
    >
      <button
        type="button"
        onClick={onSort}
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
      </button>
    </th>
  )
}

function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />
}

function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("transition-colors hover:bg-accent/50", className)} {...props} />
}

function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-2.5 align-middle", className)} {...props} />
}

/**
 * Client-side sorting for a list already on screen.
 * `getValue` returns what to compare for a column key (string, number or null).
 */
function useSortedRows<T, K extends string>(
  rows: readonly T[],
  getValue: (row: T, key: K) => string | number | null | undefined,
  initial?: { key: K; direction: SortDirection }
) {
  const [sort, setSort] = React.useState<{ key: K; direction: SortDirection } | null>(
    initial ?? null
  )
  const sorted = React.useMemo(() => {
    if (!sort) return [...rows]
    const factor = sort.direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = getValue(a, sort.key)
      const vb = getValue(b, sort.key)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * factor
    })
  }, [rows, sort, getValue])
  const toggle = React.useCallback((key: K) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    )
  }, [])
  const thProps = (key: K) => ({
    active: sort?.key === key,
    direction: sort?.key === key ? sort.direction : ("asc" as SortDirection),
    onSort: () => toggle(key),
  })
  return { sorted, sort, toggle, thProps }
}

export { DataTable, Table, THead, Th, SortableTh, TBody, Tr, Td, useSortedRows }
