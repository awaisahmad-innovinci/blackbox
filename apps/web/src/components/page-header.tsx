"use client";

import { useEffect, type ReactNode } from "react";
import { PageHeader as SharedPageHeader } from "@blackbox/ui/page-header";

/** Shared page header; also names the browser tab after the page (review W23). */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (typeof title === "string" && title.trim()) {
      document.title = `${title} · Blackbox`;
    }
  }, [title]);

  return (
    <SharedPageHeader
      title={title}
      description={description}
      actions={actions}
      back={breadcrumb}
      className={className}
    />
  );
}
