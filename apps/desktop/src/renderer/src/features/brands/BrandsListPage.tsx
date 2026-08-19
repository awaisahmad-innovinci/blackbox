import { useCallback } from "react";
import { brandsApi } from "@renderer/lib/api/brands";
import {
  loadTaxonomyRows,
  type TaxonomyQuery,
} from "@renderer/lib/local-db/taxonomy-source";
import { TaxonomyListPage } from "../taxonomy/TaxonomyListPage";

export function BrandsListPage() {
  const load = useCallback(
    (query: TaxonomyQuery) =>
      loadTaxonomyRows("brand", query, (q) => brandsApi.list(q)),
    [],
  );
  return (
    <TaxonomyListPage
      title="Brands"
      subtitle="Product brands for this store."
      basePath="/brands"
      createLabel="+ Create Brand"
      emptyLabel="No brands found."
      load={load}
    />
  );
}
