import type { ReactNode } from "react";
import { useSession } from "@renderer/lib/session/context";

function PrintStoreHeader() {
  const { user } = useSession();
  const name = user?.tenantName?.trim();
  if (!name) return null;
  return <p className="print-doc-store">{name}</p>;
}

export function PrintDocument({
  children,
  showStoreHeader = true,
  title,
}: {
  children: ReactNode;
  /** When false, skip the generic tenant header (e.g. thermal sales receipts). */
  showStoreHeader?: boolean;
  /** Printed above the document number. Hidden on screen. */
  title?: string;
}) {
  return (
    <article data-print-document className="space-y-8 print:space-y-2">
      {showStoreHeader || title ? (
        <div className="print-doc-head hidden print:block">
          {showStoreHeader ? <PrintStoreHeader /> : null}
          {title ? <p className="print-doc-kind">{title}</p> : null}
        </div>
      ) : null}
      {children}
    </article>
  );
}
