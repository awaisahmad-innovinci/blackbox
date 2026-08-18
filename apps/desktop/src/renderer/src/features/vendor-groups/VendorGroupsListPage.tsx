import { useCallback } from "react";
import { vendorGroupsApi } from "@renderer/lib/api/vendor-groups";
import { TaxonomyListPage } from "../taxonomy/TaxonomyListPage";

export function VendorGroupsListPage() {
  const load = useCallback(
    (query: Parameters<typeof vendorGroupsApi.list>[0]) =>
      vendorGroupsApi.list(query),
    [],
  );
  return (
    <TaxonomyListPage
      title="Vendor Groups"
      subtitle="Group vendors for filtering and reporting."
      basePath="/vendor-groups"
      createLabel="+ Create Vendor Group"
      emptyLabel="No vendor groups found."
      load={load}
    />
  );
}
