import type Database from "better-sqlite3";
import { backfillLocalEntityVersions } from "./entity-versions-local";

/**
 * Local SQLite schema for offline inventory (Phase A foundation).
 * Sync metadata columns are ready for a later sync engine; Dashboard still uses HTTP.
 */
type Migration = {
  id: string;
  sql: string;
  after?: (db: Database.Database) => void;
};

function ensureInventoryOutReturnTotalsColumns(db: Database.Database): void {
  const returnCols = (
    db.prepare("pragma table_info(inventory_out_returns)").all() as {
      name: string;
    }[]
  ).map((c) => c.name);
  if (returnCols.length > 0) {
    if (!returnCols.includes("subtotal")) {
      db.exec(
        `alter table inventory_out_returns add column subtotal real not null default 0`,
      );
    }
    if (!returnCols.includes("total")) {
      db.exec(
        `alter table inventory_out_returns add column total real not null default 0`,
      );
    }
  }

  const itemCols = (
    db.prepare("pragma table_info(inventory_out_return_items)").all() as {
      name: string;
    }[]
  ).map((c) => c.name);
  if (itemCols.length > 0 && !itemCols.includes("inventory_out_item_id")) {
    db.exec(
      `alter table inventory_out_return_items add column inventory_out_item_id text`,
    );
  }
}

function ensureInventoryOutReturnItemsNullableBalanceLink(
  db: Database.Database,
): void {
  const tableExists = db
    .prepare(
      `select 1 from sqlite_master where type = 'table' and name = 'inventory_out_return_items' limit 1`,
    )
    .get();
  if (!tableExists) return;

  const itemColInfo = db
    .prepare("pragma table_info(inventory_out_return_items)")
    .all() as { name: string; notnull: number }[];
  const balanceLinkCol = itemColInfo.find(
    (c) => c.name === "inventory_out_item_id",
  );
  if (!balanceLinkCol || balanceLinkCol.notnull !== 1) return;

  db.exec(`
    create table inventory_out_return_items_new (
      id text primary key,
      tenant_id text not null,
      inventory_out_return_id text not null,
      product_sku_id text not null,
      inventory_out_item_id text,
      quantity real not null,
      unit_cost real not null default 0,
      created_at text not null,
      updated_at text not null,
      sync_status text not null default 'synced',
      server_updated_at text
    );

    insert into inventory_out_return_items_new (
      id, tenant_id, inventory_out_return_id, product_sku_id,
      inventory_out_item_id, quantity, unit_cost,
      created_at, updated_at, sync_status, server_updated_at
    )
    select
      id, tenant_id, inventory_out_return_id, product_sku_id,
      inventory_out_item_id, quantity, unit_cost,
      created_at, updated_at, sync_status, server_updated_at
    from inventory_out_return_items;

    drop table inventory_out_return_items;
    alter table inventory_out_return_items_new rename to inventory_out_return_items;

    create index if not exists inventory_out_return_items_tenant_id_idx
      on inventory_out_return_items (tenant_id);
    create index if not exists inventory_out_return_items_return_id_idx
      on inventory_out_return_items (inventory_out_return_id);
    create index if not exists inventory_out_return_items_product_sku_id_idx
      on inventory_out_return_items (product_sku_id);
  `);
}

const MIGRATIONS: Migration[] = [
  {
    id: "001_local_inventory",
    sql: `
create table if not exists schema_migrations (
  id text primary key,
  applied_at text not null default (datetime('now'))
);

create table if not exists categories (
  id text primary key,
  tenant_id text not null,
  name text not null,
  description text not null default '',
  status text not null default 'active',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, name)
);

create table if not exists brands (
  id text primary key,
  tenant_id text not null,
  name text not null,
  description text not null default '',
  status text not null default 'active',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, name)
);

create table if not exists units (
  id text primary key,
  tenant_id text not null,
  name text not null,
  abbreviation text not null,
  type text not null default 'count',
  status text not null default 'active',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, abbreviation)
);

create table if not exists products (
  id text primary key,
  tenant_id text not null,
  name text not null,
  brand_id text,
  category_id text,
  description text not null default '',
  image_path text,
  status text not null default 'active',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text
);

create table if not exists product_skus (
  id text primary key,
  tenant_id text not null,
  product_id text not null,
  sku text not null,
  barcode text,
  variant_name text not null default '',
  size_value text,
  size_unit text,
  base_unit_id text,
  cost_price real not null default 0,
  selling_price real not null default 0,
  reorder_level real not null default 0,
  track_inventory integer not null default 1,
  status text not null default 'active',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, sku)
);

create table if not exists vendors (
  id text primary key,
  tenant_id text not null,
  name text not null,
  vendor_code text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  city text,
  country text,
  tax_number text,
  notes text not null default '',
  status text not null default 'active',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, vendor_code)
);

create table if not exists vendor_skus (
  id text primary key,
  tenant_id text not null,
  vendor_id text not null,
  product_sku_id text not null,
  vendor_sku_code text,
  purchase_unit_id text,
  units_per_purchase_unit real not null default 1,
  purchase_price real not null default 0,
  minimum_order_quantity real not null default 1,
  lead_time_days integer not null default 0,
  is_preferred integer not null default 0,
  status text not null default 'active',
  notes text not null default '',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, vendor_id, product_sku_id)
);

create table if not exists warehouses (
  id text primary key,
  tenant_id text not null,
  name text not null,
  code text not null,
  location text,
  status text not null default 'active',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, code)
);

create table if not exists inventory_stock (
  id text primary key,
  tenant_id text not null,
  product_sku_id text not null,
  warehouse_id text not null,
  quantity_on_hand real not null default 0,
  quantity_reserved real not null default 0,
  quantity_available real not null default 0,
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, product_sku_id, warehouse_id)
);

create table if not exists inventory_movements (
  id text primary key,
  tenant_id text not null,
  product_sku_id text not null,
  warehouse_id text not null,
  movement_type text not null,
  quantity real not null,
  reference_type text,
  reference_id text,
  reason text not null default '',
  created_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text
);

create table if not exists purchase_orders (
  id text primary key,
  tenant_id text not null,
  po_number text not null,
  vendor_id text not null,
  warehouse_id text not null,
  status text not null default 'DRAFT',
  order_date text not null,
  expected_date text,
  subtotal real not null default 0,
  discount real not null default 0,
  tax real not null default 0,
  total real not null default 0,
  notes text not null default '',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, po_number)
);

create table if not exists purchase_order_items (
  id text primary key,
  tenant_id text not null,
  purchase_order_id text not null,
  product_sku_id text not null,
  vendor_sku_id text,
  quantity real not null,
  unit_cost real not null,
  tax real not null default 0,
  discount real not null default 0,
  line_total real not null,
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text
);

create table if not exists goods_receipts (
  id text primary key,
  tenant_id text not null,
  receipt_number text not null,
  purchase_order_id text not null,
  warehouse_id text not null,
  status text not null default 'DRAFT',
  received_at text,
  notes text not null default '',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, receipt_number)
);

create table if not exists goods_receipt_items (
  id text primary key,
  tenant_id text not null,
  goods_receipt_id text not null,
  purchase_order_item_id text,
  product_sku_id text not null,
  ordered_quantity real not null default 0,
  received_quantity real not null,
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text
);

create table if not exists sync_meta (
  key text primary key,
  value text not null,
  updated_at text not null default (datetime('now'))
);
`,
  },
  {
    id: "002_vendor_management",
    sql: `
create table if not exists vendor_groups (
  id text primary key,
  tenant_id text not null,
  name text not null,
  description text not null default '',
  status text not null default 'active',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, name)
);

create table if not exists vendor_contacts (
  id text primary key,
  tenant_id text not null,
  vendor_id text not null,
  contact_type text not null,
  name text,
  phone text,
  email text,
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, vendor_id, contact_type)
);
`,
    after: (db) => {
      const cols = (
        db.prepare("pragma table_info(vendors)").all() as { name: string }[]
      ).map((c) => c.name);
      const add = (name: string, ddl: string) => {
        if (!cols.includes(name)) db.exec(`alter table vendors add column ${ddl}`);
      };
      add("group_id", "group_id text");
      add("state", "state text");
      add("postal_code", "postal_code text");
      add("sales_target", "sales_target real");
      add("credit_limit", "credit_limit real");
      add("payment_terms", "payment_terms text");

      // Migrate legacy contacts then drop columns when present
      if (cols.includes("contact_person") || cols.includes("phone") || cols.includes("email")) {
        db.exec(`
          insert or ignore into vendor_contacts (
            id, tenant_id, vendor_id, contact_type, name, phone, email, created_at, updated_at
          )
          select
            lower(hex(randomblob(16))),
            tenant_id,
            id,
            'PRIMARY',
            nullif(trim(coalesce(contact_person, '')), ''),
            nullif(trim(coalesce(phone, '')), ''),
            nullif(trim(coalesce(email, '')), ''),
            datetime('now'),
            datetime('now')
          from vendors
          where coalesce(contact_person, '') <> ''
             or coalesce(phone, '') <> ''
             or coalesce(email, '') <> '';
        `);
        for (const col of ["contact_person", "phone", "email"] as const) {
          if (cols.includes(col)) {
            try {
              db.exec(`alter table vendors drop column ${col}`);
            } catch {
              /* older sqlite without DROP COLUMN — leave unused columns */
            }
          }
        }
      }
    },
  },
  {
    id: "003_product_management",
    sql: `-- column adds applied in after()`,
    after: (db) => {
      const productCols = (
        db.prepare("pragma table_info(products)").all() as { name: string }[]
      ).map((c) => c.name);
      const addProduct = (name: string, ddl: string) => {
        if (!productCols.includes(name)) {
          db.exec(`alter table products add column ${ddl}`);
        }
      };
      addProduct("product_code", "product_code text");
      addProduct("product_type", "product_type text not null default 'STOCK_ITEM'");

      db.exec(`
        update products
        set product_code = 'PRD-' || substr(id, 1, 8)
        where product_code is null or product_code = '';
      `);

      const skuCols = (
        db.prepare("pragma table_info(product_skus)").all() as { name: string }[]
      ).map((c) => c.name);
      const addSku = (name: string, ddl: string) => {
        if (!skuCols.includes(name)) {
          db.exec(`alter table product_skus add column ${ddl}`);
        }
      };
      addSku("purchase_unit_id", "purchase_unit_id text");
      addSku(
        "units_per_purchase_unit",
        "units_per_purchase_unit real not null default 1",
      );
      addSku(
        "minimum_stock_level",
        "minimum_stock_level real not null default 0",
      );
      addSku("maximum_stock_level", "maximum_stock_level real");
    },
  },
  {
    id: "004_purchase_order_management",
    sql: `-- column adds applied in after()`,
    after: (db) => {
      const poCols = (
        db.prepare("pragma table_info(purchase_orders)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      if (!poCols.includes("other_charges")) {
        db.exec(
          `alter table purchase_orders add column other_charges real not null default 0`,
        );
      }

      const itemCols = (
        db.prepare("pragma table_info(purchase_order_items)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      const addItem = (name: string, ddl: string) => {
        if (!itemCols.includes(name)) {
          db.exec(`alter table purchase_order_items add column ${ddl}`);
        }
      };
      addItem("purchase_unit_id", "purchase_unit_id text");
      addItem(
        "units_per_purchase_unit",
        "units_per_purchase_unit real not null default 1",
      );
    },
  },
  {
    id: "005_purchase_receiving",
    sql: `-- column adds applied in after()`,
    after: (db) => {
      const grCols = (
        db.prepare("pragma table_info(goods_receipts)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      const addGr = (name: string, ddl: string) => {
        if (!grCols.includes(name)) {
          db.exec(`alter table goods_receipts add column ${ddl}`);
        }
      };
      addGr("vendor_id", "vendor_id text");
      addGr("voucher_number", "voucher_number text");
      addGr("subtotal", "subtotal real not null default 0");
      addGr("discount", "discount real not null default 0");
      addGr("tax", "tax real not null default 0");
      addGr("other_charges", "other_charges real not null default 0");
      addGr("total", "total real not null default 0");

      const itemCols = (
        db.prepare("pragma table_info(goods_receipt_items)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      const addItem = (name: string, ddl: string) => {
        if (!itemCols.includes(name)) {
          db.exec(`alter table goods_receipt_items add column ${ddl}`);
        }
      };
      addItem("vendor_sku_id", "vendor_sku_id text");
      addItem("purchase_unit_id", "purchase_unit_id text");
      addItem(
        "units_per_purchase_unit",
        "units_per_purchase_unit real not null default 1",
      );
      addItem("po_unit_cost", "po_unit_cost real not null default 0");
      addItem(
        "receiving_unit_cost",
        "receiving_unit_cost real not null default 0",
      );
      addItem("line_total", "line_total real not null default 0");
    },
  },
  {
    id: "006_inventory_out",
    sql: `
create table if not exists inventory_outs (
  id text primary key,
  tenant_id text not null,
  out_number text not null,
  warehouse_id text not null,
  out_date text not null,
  reference text,
  notes text not null default '',
  status text not null default 'POSTED',
  subtotal real not null default 0,
  total real not null default 0,
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, out_number)
);

create table if not exists inventory_out_items (
  id text primary key,
  tenant_id text not null,
  inventory_out_id text not null,
  product_sku_id text not null,
  quantity real not null,
  unit_cost real not null default 0,
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text
);

create index if not exists inventory_outs_tenant_id_idx on inventory_outs (tenant_id);
create index if not exists inventory_outs_warehouse_id_idx on inventory_outs (warehouse_id);
create index if not exists inventory_out_items_tenant_id_idx on inventory_out_items (tenant_id);
create index if not exists inventory_out_items_out_id_idx on inventory_out_items (inventory_out_id);
create index if not exists inventory_out_items_product_sku_id_idx on inventory_out_items (product_sku_id);
`,
  },
  {
    id: "007_inventory_out_align",
    sql: `-- column adds applied in after()`,
    after: (db) => {
      const outCols = (
        db.prepare("pragma table_info(inventory_outs)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      const addOut = (name: string, ddl: string) => {
        if (!outCols.includes(name)) {
          db.exec(`alter table inventory_outs add column ${ddl}`);
        }
      };
      addOut("reference", "reference text");
      addOut("subtotal", "subtotal real not null default 0");
      addOut("total", "total real not null default 0");

      if (outCols.includes("reference_number")) {
        db.exec(`
          update inventory_outs
          set reference = coalesce(reference, reference_number)
          where reference is null and reference_number is not null
        `);
      }
      if (outCols.includes("total_cost")) {
        db.exec(`
          update inventory_outs
          set total = case when total = 0 then coalesce(total_cost, 0) else total end
        `);
      }

      const itemCols = (
        db.prepare("pragma table_info(inventory_out_items)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      const addItem = (name: string, ddl: string) => {
        if (!itemCols.includes(name)) {
          db.exec(`alter table inventory_out_items add column ${ddl}`);
        }
      };
      addItem("unit_cost", "unit_cost real not null default 0");
      if (itemCols.includes("average_cost")) {
        db.exec(`
          update inventory_out_items
          set unit_cost = case when unit_cost = 0 then coalesce(average_cost, 0) else unit_cost end
        `);
      }
    },
  },
  {
    id: "008_sync_outbox",
    sql: `
create table if not exists local_sync_outbox (
  change_id text primary key,
  tenant_id text not null,
  origin_device_id text not null,
  stream text not null,
  entity_type text not null,
  entity_id text not null,
  operation text not null,
  payload text not null,
  base_entity_version integer not null default 0,
  created_at text not null default (datetime('now')),
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  acked_at text,
  cloud_seq text
);

create table if not exists local_applied_changes (
  change_id text primary key,
  seq integer not null,
  stream text not null,
  applied_at text not null default (datetime('now'))
);

create table if not exists local_sync_state (
  stream text primary key,
  pull_cursor text not null default '0',
  last_push_at text,
  last_pull_at text,
  last_error text
);
`,
  },
  {
    id: "009_gr_item_discount_percent",
    sql: `-- column add applied in after()`,
    after: (db) => {
      const itemCols = (
        db.prepare("pragma table_info(goods_receipt_items)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      if (!itemCols.includes("discount_percent")) {
        db.exec(
          `alter table goods_receipt_items add column discount_percent real not null default 0`,
        );
      }
    },
  },
  {
    id: "010_gr_item_bonus_quantity",
    sql: `-- column add applied in after()`,
    after: (db) => {
      const itemCols = (
        db.prepare("pragma table_info(goods_receipt_items)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      if (!itemCols.includes("bonus_quantity")) {
        db.exec(
          `alter table goods_receipt_items add column bonus_quantity real not null default 0`,
        );
      }
    },
  },
  {
    id: "011_vendor_returns",
    sql: `
create table if not exists vendor_returns (
  id text primary key,
  tenant_id text not null,
  return_number text not null,
  vendor_id text not null,
  warehouse_id text not null,
  return_date text not null,
  notes text not null default '',
  status text not null default 'OPEN',
  subtotal real not null default 0,
  total real not null default 0,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  sync_status text not null default 'pending',
  server_updated_at text
);
create index if not exists vendor_returns_tenant_id_idx on vendor_returns (tenant_id);
create index if not exists vendor_returns_vendor_id_idx on vendor_returns (vendor_id);
create index if not exists vendor_returns_warehouse_id_idx on vendor_returns (warehouse_id);

create table if not exists vendor_return_items (
  id text primary key,
  tenant_id text not null,
  vendor_return_id text not null,
  product_sku_id text not null,
  vendor_sku_id text,
  purchase_unit_id text,
  units_per_purchase_unit real not null default 1,
  quantity real not null,
  unit_cost real not null default 0,
  reason text not null,
  settlement text,
  goods_receipt_id text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  sync_status text not null default 'pending',
  server_updated_at text
);
create index if not exists vendor_return_items_tenant_id_idx on vendor_return_items (tenant_id);
create index if not exists vendor_return_items_return_id_idx on vendor_return_items (vendor_return_id);
create index if not exists vendor_return_items_product_sku_id_idx on vendor_return_items (product_sku_id);
`,
    after: (db) => {
      const cols = (
        db.prepare("pragma table_info(goods_receipts)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      if (!cols.includes("return_credit")) {
        db.exec(
          `alter table goods_receipts add column return_credit real not null default 0`,
        );
      }
    },
  },
  {
    id: "012_local_entity_versions",
    sql: `
create table if not exists local_entity_versions (
  entity_type text not null,
  entity_id text not null,
  entity_version integer not null default 0,
  primary key (entity_type, entity_id)
);
`,
    after: (db) => {
      backfillLocalEntityVersions(db);
    },
  },
  {
    id: "013_goods_receipt_charge_fields",
    sql: `-- column adds applied in after()`,
    after: (db) => {
      const cols = (
        db.prepare("pragma table_info(goods_receipts)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      const add = (name: string, ddl: string) => {
        if (!cols.includes(name)) {
          db.exec(`alter table goods_receipts add column ${ddl}`);
        }
      };
      add("adv_tax", "adv_tax real not null default 0");
      add("gst", "gst real not null default 0");
      add("incentive", "incentive real not null default 0");
      add("shelf_rent", "shelf_rent real not null default 0");
    },
  },
  {
    id: "014_product_sku_barcodes",
    sql: `
create table if not exists product_sku_barcodes (
  id text primary key,
  tenant_id text not null,
  product_sku_id text not null,
  barcode text not null,
  status text not null default 'active',
  created_at text not null,
  updated_at text not null,
  sync_status text not null default 'synced',
  server_updated_at text,
  unique (tenant_id, barcode)
);

create index if not exists product_sku_barcodes_sku_id_idx
  on product_sku_barcodes (product_sku_id);
`,
    after: (db) => {
      db.exec(`
insert into product_sku_barcodes (
  id, tenant_id, product_sku_id, barcode, status, created_at, updated_at, sync_status
)
select
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))),
  tenant_id,
  id,
  barcode,
  'active',
  datetime('now'),
  datetime('now'),
  'synced'
from product_skus
where barcode is not null and trim(barcode) != ''
  and not exists (
    select 1 from product_sku_barcodes b
    where b.tenant_id = product_skus.tenant_id
      and b.barcode = product_skus.barcode
  );
`);
    },
  },
  {
    id: "015_sku_barcode_multiplier_box_price",
    sql: `-- column adds applied in after()`,
    after: (db) => {
      const barcodeCols = (
        db.prepare("pragma table_info(product_sku_barcodes)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      if (!barcodeCols.includes("quantity_multiplier")) {
        db.exec(
          `alter table product_sku_barcodes add column quantity_multiplier real not null default 1`,
        );
      }

      const skuCols = (
        db.prepare("pragma table_info(product_skus)").all() as { name: string }[]
      ).map((c) => c.name);
      if (!skuCols.includes("selling_price_per_purchase_unit")) {
        db.exec(
          `alter table product_skus add column selling_price_per_purchase_unit real`,
        );
      }
    },
  },
  {
    id: "016_vendor_return_qty_pcs",
    sql: `
update vendor_return_items
set quantity = quantity * units_per_purchase_unit
where units_per_purchase_unit > 0;
`,
  },
  {
    id: "017_po_item_order_unit",
    sql: `-- column add applied in after()`,
    after: (db) => {
      const itemCols = (
        db.prepare("pragma table_info(purchase_order_items)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);
      if (!itemCols.includes("order_unit")) {
        db.exec(
          `alter table purchase_order_items add column order_unit text not null default 'box'`,
        );
      }
    },
  },
  {
    id: "018_inventory_out_balance_and_returns",
    sql: `-- applied in after()`,
    after: (db) => {
      db.exec(`
        create table if not exists inventory_out_lines (
          id text primary key,
          tenant_id text not null,
          inventory_out_id text not null,
          product_sku_id text not null,
          quantity real not null,
          unit_cost real not null default 0,
          created_at text not null,
          updated_at text not null,
          sync_status text not null default 'synced',
          server_updated_at text
        );
        create index if not exists inventory_out_lines_tenant_id_idx
          on inventory_out_lines (tenant_id);
        create index if not exists inventory_out_lines_out_id_idx
          on inventory_out_lines (inventory_out_id);
        create index if not exists inventory_out_lines_product_sku_id_idx
          on inventory_out_lines (product_sku_id);
      `);

      const itemCols = (
        db.prepare("pragma table_info(inventory_out_items)").all() as {
          name: string;
        }[]
      ).map((c) => c.name);

      if (itemCols.includes("inventory_out_id")) {
        db.exec(`
          insert or ignore into inventory_out_lines (
            id, tenant_id, inventory_out_id, product_sku_id, quantity, unit_cost,
            created_at, updated_at, sync_status, server_updated_at
          )
          select
            id, tenant_id, inventory_out_id, product_sku_id, quantity, unit_cost,
            created_at, updated_at, sync_status, server_updated_at
          from inventory_out_items;
        `);

        db.exec(`
          create table inventory_out_items_new (
            id text primary key,
            tenant_id text not null,
            warehouse_id text not null,
            product_sku_id text not null,
            quantity real not null,
            unit_cost real not null default 0,
            created_at text not null,
            updated_at text not null,
            sync_status text not null default 'synced',
            server_updated_at text,
            unique (tenant_id, warehouse_id, product_sku_id)
          );
        `);

        db.exec(`
          insert into inventory_out_items_new (
            id, tenant_id, warehouse_id, product_sku_id, quantity, unit_cost,
            created_at, updated_at, sync_status, server_updated_at
          )
          select
            min(i.id),
            i.tenant_id,
            o.warehouse_id,
            i.product_sku_id,
            sum(i.quantity),
            max(i.unit_cost),
            min(i.created_at),
            max(i.updated_at),
            'synced',
            max(i.server_updated_at)
          from inventory_out_items i
          inner join inventory_outs o on o.id = i.inventory_out_id
          group by i.tenant_id, o.warehouse_id, i.product_sku_id
          having sum(i.quantity) > 0;
        `);

        db.exec(`drop table inventory_out_items`);
        db.exec(
          `alter table inventory_out_items_new rename to inventory_out_items`,
        );
        db.exec(`
          create index if not exists inventory_out_items_tenant_id_idx
            on inventory_out_items (tenant_id);
          create index if not exists inventory_out_items_warehouse_id_idx
            on inventory_out_items (warehouse_id);
          create index if not exists inventory_out_items_product_sku_id_idx
            on inventory_out_items (product_sku_id);
        `);
      } else if (!itemCols.includes("warehouse_id")) {
        db.exec(
          `alter table inventory_out_items add column warehouse_id text not null default ''`,
        );
      }

      db.exec(`
        create table if not exists inventory_out_returns (
          id text primary key,
          tenant_id text not null,
          return_number text not null,
          warehouse_id text not null,
          return_date text not null,
          notes text not null default '',
          status text not null default 'POSTED',
          subtotal real not null default 0,
          total real not null default 0,
          created_at text not null,
          updated_at text not null,
          sync_status text not null default 'synced',
          server_updated_at text,
          unique (tenant_id, return_number)
        );
        create index if not exists inventory_out_returns_tenant_id_idx
          on inventory_out_returns (tenant_id);
        create index if not exists inventory_out_returns_warehouse_id_idx
          on inventory_out_returns (warehouse_id);

        create table if not exists inventory_out_return_items (
          id text primary key,
          tenant_id text not null,
          inventory_out_return_id text not null,
          product_sku_id text not null,
          inventory_out_item_id text,
          quantity real not null,
          unit_cost real not null default 0,
          created_at text not null,
          updated_at text not null,
          sync_status text not null default 'synced',
          server_updated_at text
        );
        create index if not exists inventory_out_return_items_tenant_id_idx
          on inventory_out_return_items (tenant_id);
        create index if not exists inventory_out_return_items_return_id_idx
          on inventory_out_return_items (inventory_out_return_id);
        create index if not exists inventory_out_return_items_product_sku_id_idx
          on inventory_out_return_items (product_sku_id);
      `);

      ensureInventoryOutReturnTotalsColumns(db);
      ensureInventoryOutReturnItemsNullableBalanceLink(db);
    },
  },
  {
    id: "019_inventory_out_return_totals",
    sql: `-- column adds applied in after()`,
    after: (db) => {
      ensureInventoryOutReturnTotalsColumns(db);
    },
  },
  {
    id: "020_inventory_out_return_items_nullable_balance_link",
    sql: `-- table rebuild applied in after()`,
    after: (db) => {
      ensureInventoryOutReturnItemsNullableBalanceLink(db);
    },
  },
  {
    id: "021_sales",
    sql: `
      create table if not exists sales (
        id text primary key,
        tenant_id text not null,
        sale_number text not null,
        warehouse_id text not null,
        status text not null default 'POSTED',
        subtotal real not null default 0,
        gst_rate real not null default 0,
        gst_amount real not null default 0,
        sales_tax_rate real not null default 0,
        sales_tax_amount real not null default 0,
        total real not null default 0,
        device_id text,
        posted_by text,
        posted_at text,
        notes text not null default '',
        created_at text not null,
        updated_at text not null,
        sync_status text not null default 'synced',
        server_updated_at text,
        unique (tenant_id, sale_number)
      );
      create index if not exists sales_tenant_id_idx on sales (tenant_id);
      create index if not exists sales_warehouse_id_idx on sales (warehouse_id);
      create index if not exists sales_posted_at_idx on sales (posted_at);

      create table if not exists sale_lines (
        id text primary key,
        tenant_id text not null,
        sale_id text not null,
        product_sku_id text not null,
        quantity real not null,
        unit_price real not null default 0,
        line_total real not null default 0,
        sell_unit text not null default 'pc',
        barcode text,
        created_at text not null,
        updated_at text not null,
        sync_status text not null default 'synced',
        server_updated_at text
      );
      create index if not exists sale_lines_tenant_id_idx on sale_lines (tenant_id);
      create index if not exists sale_lines_sale_id_idx on sale_lines (sale_id);
      create index if not exists sale_lines_product_sku_id_idx on sale_lines (product_sku_id);

      create table if not exists sale_payments (
        id text primary key,
        tenant_id text not null,
        sale_id text not null,
        method text not null,
        amount real not null,
        reference text not null default '',
        created_at text not null,
        updated_at text not null,
        sync_status text not null default 'synced',
        server_updated_at text
      );
      create index if not exists sale_payments_tenant_id_idx on sale_payments (tenant_id);
      create index if not exists sale_payments_sale_id_idx on sale_payments (sale_id);
    `,
  },
  {
    id: "022_sales_receipt_fields",
    sql: `
      alter table sales add column customer_name text not null default 'CASH SALES CUSTOMER';
      alter table sales add column posted_by_name text;
    `,
  },
  {
    id: "023_sales_cash_tendered",
    sql: `alter table sales add column cash_tendered real;`,
  },
  {
    id: "024_supervisor_totp",
    sql: `
      create table if not exists supervisor_totp (
        user_id text primary key,
        tenant_id text not null,
        secret_base32 text not null,
        updated_at text not null default (datetime('now'))
      );
      create index if not exists supervisor_totp_tenant_id_idx
        on supervisor_totp (tenant_id);
    `,
  },
  {
    id: "025_till_sessions",
    sql: `
      create table if not exists till_sessions (
        id text primary key,
        tenant_id text not null,
        user_id text not null,
        user_name text not null default '',
        status text not null,
        note_10 integer not null default 0,
        note_20 integer not null default 0,
        note_50 integer not null default 0,
        note_100 integer not null default 0,
        note_500 integer not null default 0,
        note_1000 integer not null default 0,
        note_5000 integer not null default 0,
        opening_total real not null default 0,
        opening_balance real not null default 0,
        current_cash_balance real not null default 0,
        max_cash_limit real not null default 0,
        opened_at text,
        closed_at text,
        approved_by_user_id text,
        approved_by_name text,
        approved_at text,
        reopened_by_user_id text,
        reopened_by_name text,
        close_reason text,
        created_at text not null,
        updated_at text not null
      );
      create index if not exists till_sessions_tenant_id_idx on till_sessions (tenant_id);
      create index if not exists till_sessions_user_id_idx on till_sessions (user_id);
      create index if not exists till_sessions_status_idx on till_sessions (status);

      create table if not exists till_withdrawals (
        id text primary key,
        tenant_id text not null,
        till_session_id text not null,
        withdrawn_by_user_id text not null,
        withdrawn_by_name text not null default '',
        note_10 integer not null default 0,
        note_20 integer not null default 0,
        note_50 integer not null default 0,
        note_100 integer not null default 0,
        note_500 integer not null default 0,
        note_1000 integer not null default 0,
        note_5000 integer not null default 0,
        withdrawal_total real not null default 0,
        created_at text not null
      );
      create index if not exists till_withdrawals_tenant_id_idx on till_withdrawals (tenant_id);
      create index if not exists till_withdrawals_till_session_id_idx on till_withdrawals (till_session_id);
    `,
  },
  {
    id: "026_till_withdrawal_kind",
    sql: `
      alter table till_withdrawals add column kind text not null default 'full';
    `,
  },
  {
    id: "027_activity_log_pending",
    sql: `
      create table if not exists activity_log_pending (
        id text primary key,
        payload text not null,
        created_at text not null
      );
    `,
  },
  {
    id: "028_supervisor_totp_display_name",
    sql: `
      alter table supervisor_totp add column display_name text not null default '';
    `,
  },
  {
    id: "029_activity_logs_local",
    sql: `
      create table if not exists activity_logs (
        id text primary key,
        event_type text not null,
        actor_user_id text not null,
        actor_name text not null,
        supervisor_user_id text,
        supervisor_name text,
        subject_user_id text,
        subject_name text,
        summary text not null,
        metadata text not null default '{}',
        created_at text not null,
        synced_at text
      );
      create index if not exists activity_logs_created_at_idx on activity_logs (created_at desc);
    `,
  },
];

export function runLocalMigrations(db: Database.Database): void {
  db.exec(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at text not null default (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .prepare("select id from schema_migrations")
      .all()
      .map((row) => (row as { id: string }).id),
  );

  const insert = db.prepare(
    "insert into schema_migrations (id) values (@id)",
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    const run = db.transaction(() => {
      db.exec(migration.sql);
      migration.after?.(db);
      insert.run({ id: migration.id });
    });
    run();
  }
}
