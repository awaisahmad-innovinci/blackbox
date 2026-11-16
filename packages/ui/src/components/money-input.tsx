import * as React from "react"

import { cn } from "@blackbox/ui/lib/utils"
import { Input } from "@blackbox/ui/components/input"

/** Keeps only digits and one decimal point, max `decimals` places. Rejects "1e5", "-", ",". */
export function sanitizeMoneyText(raw: string, decimals = 2): string {
  const cleaned = raw.replace(/[^\d.]/g, "")
  const [whole = "", ...rest] = cleaned.split(".")
  if (rest.length === 0) return whole
  return `${whole}.${rest.join("").slice(0, decimals)}`
}

/** Parses money text from MoneyInput; null when empty or not a number. */
export function parseMoneyText(text: string): number | null {
  if (!text.trim()) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

/**
 * Text input for amounts: numeric keypad on touch, digits and one decimal point only,
 * right-aligned tabular figures, optional currency prefix.
 */
function MoneyInput({
  value,
  onValueChange,
  prefix,
  decimals = 2,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string
  onValueChange: (text: string) => void
  prefix?: string
  decimals?: number
}) {
  return (
    <div className="relative">
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
          {prefix}
        </span>
      ) : null}
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onValueChange(sanitizeMoneyText(e.target.value, decimals))}
        className={cn("text-right tabular-nums", prefix && "pl-10", className)}
      />
    </div>
  )
}

export { MoneyInput }
