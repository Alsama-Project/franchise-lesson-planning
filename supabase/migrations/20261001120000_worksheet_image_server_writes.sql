-- 20261001120000_worksheet_image_server_writes.sql
--
-- The worksheet-image cache (worksheet_image, 0072) is shared by every teacher: the
-- newest non-blocked row for a key is what everyone's worksheets show. So:
--
-- 1. Only the server writes cache rows. The signed-in insert policy is removed; the
--    image route inserts with the service role, for an image it has just generated.
--    Reading is unchanged (every signed-in user can read the cache).
-- 2. Admins can block an image (and unblock it). A blocked image drops out of the
--    lookup, so the next request falls back to an older image or generates a new one.
--    blocked_by records who did it.
--
-- Apply BEFORE deploying the app change (the route's service-role insert works either
-- way; the order only matters for rollback).
--
-- Rollback:
--   create policy worksheet_image_insert_own on public.worksheet_image
--     for insert to authenticated with check (created_by = (select auth.uid()));
--   drop function if exists public.block_worksheet_image(uuid, boolean);
--   alter table public.worksheet_image drop column if exists blocked_by;
--   delete from applied_migration where filename = '20261001120000_worksheet_image_server_writes.sql';

drop policy if exists worksheet_image_insert_own on public.worksheet_image;

alter table public.worksheet_image
  add column if not exists blocked_by uuid references public.profiles (id) on delete set null;

create or replace function public.block_worksheet_image(p_image_id uuid, p_blocked boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.worksheet_image
     set blocked_at = case when p_blocked then now() else null end,
         blocked_by = case when p_blocked then auth.uid() else null end
   where id = p_image_id;
  if not found then
    raise exception 'Image not found';
  end if;
end;
$$;

revoke execute on function public.block_worksheet_image(uuid, boolean) from public, anon;
grant  execute on function public.block_worksheet_image(uuid, boolean) to authenticated;

insert into applied_migration (filename, note)
values ('20261001120000_worksheet_image_server_writes.sql', null)
on conflict (filename) do nothing;
