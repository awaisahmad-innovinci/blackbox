import { cn } from "@blackbox/ui/lib/utils"

/**
 * Black Box logo. Each app passes its own image URLs (web/platform serve them from
 * /public, desktop imports them through Vite so they work under file://).
 * Shows the black logo in light mode and the white one in dark mode.
 */
function BrandLogo({
  lightSrc,
  darkSrc,
  className,
}: {
  lightSrc: string
  darkSrc: string
  /** Size the logo by height, e.g. "h-8". */
  className?: string
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <img src={lightSrc} alt="Black Box" className="h-full w-auto dark:hidden" />
      <img src={darkSrc} alt="Black Box" className="hidden h-full w-auto dark:block" />
    </span>
  )
}

export { BrandLogo }
