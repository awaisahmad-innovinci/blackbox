-- Web inserts rely on a database default when the id is omitted.
-- These two tables were created as bare uuid primary keys.

alter table public.manager_drawer_openings
  alter column id set default gen_random_uuid();

alter table public.manager_drawer_submissions
  alter column id set default gen_random_uuid();
