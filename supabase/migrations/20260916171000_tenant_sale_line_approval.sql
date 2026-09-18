alter table tenants
  add column if not exists require_manager_approval_remove_sale_line boolean not null default true;
