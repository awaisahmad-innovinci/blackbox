import { useCallback } from "react";
import { categoriesApi } from "@renderer/lib/api/categories";
import { TaxonomyListPage } from "../taxonomy/TaxonomyListPage";

export function CategoriesListPage() {
  const load = useCallback(
    (query: Parameters<typeof categoriesApi.list>[0]) =>
      categoriesApi.list(query),
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
