import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@blackbox/ui/lib/utils"

/**
 * The shelf-tag: the yellow aisle price sticker. Use it ONLY for prices, bill totals and
 * amount due, so the eye always knows where the money is.
 */
const priceTagVariants = cva(
  "inline-flex items-baseline rounded-[4px] bg-shelf-tag font-semibold text-shelf-tag-foreground tabular-nums tracking-tight",
  {
    variants: {
      size: {
        sm: "px-1.5 py-0.5 text-sm",
        md: "px-2 py-0.5 text-base",
        lg: "px-3 py-1 text-2xl",
        xl: "px-4 py-1.5 text-5xl",
      },
    },
    defaultVariants: { size: "md" },
  }
)

function PriceTag({
  className,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof priceTagVariants>) {
  return (
    <span
      data-slot="price-tag"
      className={cn(priceTagVariants({ size }), className)}
      {...props}
    />
  )
}

export { PriceTag, priceTagVariants }
