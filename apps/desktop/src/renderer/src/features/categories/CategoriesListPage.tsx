import { useCallback } from "react";
import { categoriesApi } from "@renderer/lib/api/categories";
import {
  loadTaxonomyRows,
  type TaxonomyQuery,
} from "@renderer/lib/local-db/taxonomy-source";
import { TaxonomyListPage } from "../taxonomy/TaxonomyListPage";

export function CategoriesListPage() {
  const load = useCallback(
    (query: TaxonomyQuery) =>
      loadTaxonomyRows("category", query, (q) => categoriesApi.list(q)),
    [],
  );
  return (
    <TaxonomyListPage
      title="Categories"
      subtitle="Product categories for this store."
      basePath="/categories"
      createLabel="+ Create Category"
      emptyLabel="No categories found."
      load={load}
    />
  );
}
