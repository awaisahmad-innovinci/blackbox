-- Usernames are now treated case-insensitively at login and are stored
-- lowercased on create/update. Normalize existing rows to match, skipping any
-- that would collide with another user in the same tenant (those stay as-is
-- and still resolve at login because lookup is case-insensitive).

update public.users u
set username = lower(username)
where username <> lower(username)
  and not exists (
    select 1
    from public.users u2
    where u2.tenant_id = u.tenant_id
      and u2.id <> u.id
      and lower(u2.username) = lower(u.username)
  );
