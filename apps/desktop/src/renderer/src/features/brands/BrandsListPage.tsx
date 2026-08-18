import { useCallback } from "react";
import { brandsApi } from "@renderer/lib/api/brands";
import { TaxonomyListPage } from "../taxonomy/TaxonomyListPage";

export function BrandsListPage() {
  const load = useCallback(
    (query: Parameters<typeof brandsApi.list>[0]) => brandsApi.list(query),
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
