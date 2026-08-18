import { useCallback } from "react";
import { vendorGroupsApi } from "@renderer/lib/api/vendor-groups";
import { TaxonomyFormPage } from "../taxonomy/TaxonomyFormPage";

export function VendorGroupFormPage() {
  const loadOne = useCallback((id: string) => vendorGroupsApi.get(id), []);
  const create = useCallback(
    (body: Parameters<typeof vendorGroupsApi.create>[0]) =>
      vendorGroupsApi.create(body),
    [],
  );
  const update = useCallback(
    (id: string, body: Parameters<typeof vendorGroupsApi.update>[1]) =>
      vendorGroupsApi.update(id, body),
    [],
  );
  const deactivate = useCallback(
    (id: string) => vendorGroupsApi.deactivate(id),
    [],
  );

  return (
    <TaxonomyFormPage
      titleNew="Create Vendor Group"
      titleEdit="Edit Vendor Group"
      basePath="/vendor-groups"
      entityLabel="vendor group"
      loadOne={loadOne}
      create={create}
      update={update}
      deactivate={deactivate}
    />
  );
}
