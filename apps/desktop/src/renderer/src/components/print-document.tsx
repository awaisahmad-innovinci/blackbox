import type { ReactNode } from "react";
import { useSession } from "@renderer/lib/session/context";

function PrintStoreHeader() {
  const { user } = useSession();
  const name = user?.tenantName?.trim();
  if (!name) return null;
  return (
    <p className="hidden text-lg font-semibold print:block">{name}</p>
  );
}

export function PrintDocument({ children }: { children: ReactNode }) {
  return (
    <article data-print-document className="space-y-8">
      <PrintStoreHeader />
      {children}
    </article>
  );
}
