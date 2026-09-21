-- Denormalized till label for display and lookup (e.g. "bilal till").

alter table public.till_sessions
  add column if not exists till_name text not null default '';

update public.till_sessions ts
set till_name = u.username || ' till'
from public.users u
where u.id = ts.user_id
  and ts.till_name = '';
