import type { EntityStatus } from "@blackbox/shared";
import { resolveDataSourceMode, type DataSourceMode } from "./data-source";

export type TaxonomyKind = "brand" | "category" | "vendor_group";

export type TaxonomyQuery = {
  status?: EntityStatus | "all";
  q?: string;
};

type TaxonomyRow = {
  id: string;
  name: string;
  description: string;
  status: EntityStatus;
};

function localReader(
  kind: TaxonomyKind,
): ((status?: EntityStatus | "all") => Promise<TaxonomyRow[]>) | undefined {
  const localDb = window.blackbox?.localDb;
  if (kind === "brand") return localDb?.listBrands;
  if (kind === "category") return localDb?.listCategories;
  return localDb?.listVendorGroups;
}

/**
 * Taxonomy rows from SQLite once a full pull exists, otherwise from the API.
 * The local queries filter by status only, so the search term is applied here.
 */
export async function loadTaxonomyRows(
  kind: TaxonomyKind,
  query: TaxonomyQuery,
  fromApi: (query: TaxonomyQuery) => Promise<TaxonomyRow[]>,
): Promise<{ rows: TaxonomyRow[]; mode: DataSourceMode }> {
  const mode = await resolveDataSourceMode();
  const readLocal = localReader(kind);
  if (mode !== "local" || !readLocal) {
    return { rows: await fromApi(query), mode: "api" };
  }

  const rows = await readLocal(query.status ?? "active");
  const term = query.q?.trim().toLowerCase();
  if (!term) return { rows, mode };
  return {
    rows: rows.filter(
      (row) =>
        row.name.toLowerCase().includes(term) ||
        (row.description ?? "").toLowerCase().includes(term),
    ),
    mode,
  };
}
