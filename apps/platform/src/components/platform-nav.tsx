"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@blackbox/ui/button";
import { ThemeToggle } from "@blackbox/ui/theme-toggle";
import { cn } from "@blackbox/ui/lib/utils";
import { clearPlatformToken } from "@/lib/api";

/** Top bar shared by every signed-in platform page (review PL1). */
export function PlatformNav({ onSignOut }: { onSignOut?: () => void }) {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Tenants", active: pathname === "/" },
    { href: "/roles", label: "Roles", active: pathname === "/roles" || pathname.startsWith("/roles/") },
  ];

  return (
    <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div className="flex items-center gap-5">
        <Link href="/" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <span
            aria-hidden
            className="bg-shelf-tag text-shelf-tag-foreground flex size-7 items-center justify-center rounded-[5px] text-sm font-bold"
          >
            B
          </span>
          <span className="font-semibold tracking-tight">Blackbox platform</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                link.active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            clearPlatformToken();
            if (onSignOut) onSignOut();
            else window.location.href = "/";
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
