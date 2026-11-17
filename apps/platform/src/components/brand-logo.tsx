import { cn } from "@blackbox/ui/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <img
        src="/brand/logo-black.png"
        alt=""
        className="h-8 w-auto dark:hidden"
      />
      <img
        src="/brand/logo-white.png"
        alt=""
        className="hidden h-8 w-auto dark:block"
      />
    </span>
  );
}
