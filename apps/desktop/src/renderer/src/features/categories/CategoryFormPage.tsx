import { useCallback } from "react";
import { categoriesApi } from "@renderer/lib/api/categories";
import { loadTaxonomyOne } from "@renderer/lib/local-db/taxonomy-source";
import { TaxonomyFormPage } from "../taxonomy/TaxonomyFormPage";

export function CategoryFormPage() {
  const loadOne = useCallback(
    (id: string) =>
      loadTaxonomyOne("category", id, (rowId) => categoriesApi.get(rowId)),
    [],
  );
  const create = useCallback(
    (body: Parameters<typeof categoriesApi.create>[0]) =>
      categoriesApi.create(body),
    [],
  );
  const update = useCallback(
    (id: string, body: Parameters<typeof categoriesApi.update>[1]) =>
      categoriesApi.update(id, body),
    [],
  );
  const deactivate = useCallback(
    (id: string) => categoriesApi.deactivate(id),
    [],
  );
  const remove = useCallback((id: string) => categoriesApi.delete(id), []);
  const restore = useCallback((id: string) => categoriesApi.restore(id), []);

  return (
    <TaxonomyFormPage
      titleNew="Create Category"
      titleEdit="Edit Category"
      basePath="/categories"
      entityLabel="category"
      syncEntityType="category"
      loadOne={loadOne}
      create={create}
      update={update}
      deactivate={deactivate}
      remove={remove}
      restore={restore}
    />
  );
}
