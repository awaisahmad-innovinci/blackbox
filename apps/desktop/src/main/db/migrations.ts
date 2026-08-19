import type Database from "better-sqlite3";

/**
 * Local SQLite schema for offline inventory (Phase A foundation).
 * Sync metadata columns are ready for a later sync engine; Dashboard still uses HTTP.
 */
type Migration = {
  id: string;
  sql: string;
  after?: (db: Database.Database) => void;
};

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
