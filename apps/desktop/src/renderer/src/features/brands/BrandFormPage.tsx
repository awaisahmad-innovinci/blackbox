import { useCallback } from "react";
import { brandsApi } from "@renderer/lib/api/brands";
import { TaxonomyFormPage } from "../taxonomy/TaxonomyFormPage";

export function BrandFormPage() {
  const loadOne = useCallback((id: string) => brandsApi.get(id), []);
  const create = useCallback(
    (body: Parameters<typeof brandsApi.create>[0]) => brandsApi.create(body),
    [],
  );
  const update = useCallback(
    (id: string, body: Parameters<typeof brandsApi.update>[1]) =>
      brandsApi.update(id, body),
    [],
  );
  const deactivate = useCallback(
    (id: string) => brandsApi.deactivate(id),
    [],
  );

  return (
    <TaxonomyFormPage
      titleNew="Create Brand"
      titleEdit="Edit Brand"
      basePath="/brands"
      entityLabel="brand"
      loadOne={loadOne}
      create={create}
      update={update}
      deactivate={deactivate}
    />
  );
}
