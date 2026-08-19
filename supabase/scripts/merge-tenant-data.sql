-- Move inventory data from one tenant to another.
--
-- Written for the case where rows were created before the apps sent a JWT and
-- landed under the DEV_TENANT_ID fallback tenant instead of a real tenant.
-- This is a one-off operation, not a repeatable migration: tenant ids are
-- environment specific, so it lives outside supabase/migrations.
--
-- Usage:
--   psql "$DATABASE_URL" \
--     -v src=a0000000-0000-4000-8000-000000000001 \
--     -v dst=<target-tenant-uuid> \
--     -f supabase/scripts/merge-tenant-data.sql
--
-- Check for unique-constraint collisions before running, e.g. brands and
-- categories are unique on (tenant_id, name), warehouses on (tenant_id, code).
-- The script aborts on any conflict because it runs in a single transaction.
--
-- `devices` and the sync log tables are deliberately excluded: the target
-- tenant has its own cloud-hub device, and moved rows carry no change history.
-- Marking devices as needing a full resync makes each desktop rebuild its
-- local database from REST instead of from the incremental log.

\set ON_ERROR_STOP on

select
  (:'src' <> :'dst')
  and exists (select 1 from tenants where id = :'dst'::uuid)
  and exists (select 1 from tenants where id = :'src'::uuid) as ok
\gset

\if :ok
\else
\echo 'ERROR: src and dst must differ and both tenants must exist'
\quit
\endif

begin;

update units             set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update brands            set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update categories        set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update vendor_groups     set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update warehouses        set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update locations         set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update products          set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update product_skus      set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update vendors           set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update vendor_contacts   set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update vendor_skus       set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update inventory_stock   set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update inventory_movements set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update purchase_orders   set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update purchase_order_items set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update goods_receipts    set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update goods_receipt_items set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update inventory_outs    set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;
update inventory_out_items set tenant_id = :'dst'::uuid where tenant_id = :'src'::uuid;

update devices
set needs_full_resync = true
where tenant_id = :'dst'::uuid
  and fingerprint <> 'cloud-hub';

commit;

select 'brands' as table_name, count(*) from brands where tenant_id = :'dst'::uuid
union all select 'products', count(*) from products where tenant_id = :'dst'::uuid
union all select 'product_skus', count(*) from product_skus where tenant_id = :'dst'::uuid
union all select 'vendors', count(*) from vendors where tenant_id = :'dst'::uuid
union all select 'purchase_orders', count(*) from purchase_orders where tenant_id = :'dst'::uuid
union all select 'inventory_movements', count(*) from inventory_movements where tenant_id = :'dst'::uuid
order by 1;
