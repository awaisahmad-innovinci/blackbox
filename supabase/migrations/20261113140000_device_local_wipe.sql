-- A revoked device must erase its local database before it can sync again.
alter table devices
  add column if not exists wipe_local_data boolean not null default false;

update devices
set wipe_local_data = true
where status = 'revoked';
