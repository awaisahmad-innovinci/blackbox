import { Monitor, Moon, Sun } from "lucide-react"

import { cn } from "@blackbox/ui/lib/utils"
import { useTheme, type ThemePreference } from "@blackbox/ui/hooks/use-theme"

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Match system", Icon: Monitor },
]

/** Three-way theme switch (light / dark / match system). */
function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme()
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5",
        className
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={label}
          title={label}
          onClick={() => setPreference(value)}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-[5px] text-muted-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            preference === value
              ? "bg-accent text-accent-foreground"
              : "hover:text-foreground"
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  )
}

export { ThemeToggle }
