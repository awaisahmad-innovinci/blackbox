import { useEffect } from "react";
import type { Brand, Category, VendorGroup } from "@blackbox/shared";
import type {
  TaxonomyKind,
  TaxonomyRow,
} from "@renderer/features/taxonomy/create-taxonomy";

export type TaxonomyCreatedDetail = {
  kind: TaxonomyKind;
  row: TaxonomyRow;
};

type TaxonomyCreatedListener = (detail: TaxonomyCreatedDetail) => void;

const listeners = new Set<TaxonomyCreatedListener>();

export function notifyTaxonomyCreated(detail: TaxonomyCreatedDetail): void {
  for (const listener of listeners) {
    listener(detail);
  }
}

export function subscribeTaxonomyCreated(
  listener: TaxonomyCreatedListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTaxonomyCreatedListener(
  listener: TaxonomyCreatedListener,
): void {
  useEffect(() => subscribeTaxonomyCreated(listener), [listener]);
}

export type { Brand, Category, VendorGroup };
