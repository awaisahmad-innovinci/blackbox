import { cn } from "@blackbox/ui/lib/utils";
import logoBlack from "../assets/logo-black.png";
import logoWhite from "../assets/logo-white.png";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0", className)}>
      <img src={logoBlack} alt="" className="h-8 w-auto dark:hidden" />
      <img src={logoWhite} alt="" className="hidden h-8 w-auto dark:block" />
    </span>
  );
}
