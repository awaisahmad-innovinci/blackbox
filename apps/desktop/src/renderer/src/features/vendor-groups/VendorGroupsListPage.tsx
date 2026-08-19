import { useCallback } from "react";
import { vendorGroupsApi } from "@renderer/lib/api/vendor-groups";
import {
  loadTaxonomyRows,
  type TaxonomyQuery,
} from "@renderer/lib/local-db/taxonomy-source";
import { TaxonomyListPage } from "../taxonomy/TaxonomyListPage";

export function VendorGroupsListPage() {
  const load = useCallback(
    (query: TaxonomyQuery) =>
      loadTaxonomyRows("vendor_group", query, (q) => vendorGroupsApi.list(q)),
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
