create table public.phaze_plans (
  owner uuid primary key references auth.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2000000)
);

alter table public.phaze_plans enable row level security;
revoke all on table public.phaze_plans from anon, authenticated;
grant select, insert, update on table public.phaze_plans to authenticated;

create policy "Read own PHAZE plan" on public.phaze_plans
  for select to authenticated using ((select auth.uid()) = owner);
create policy "Insert own PHAZE plan" on public.phaze_plans
  for insert to authenticated with check ((select auth.uid()) = owner);
create policy "Update own PHAZE plan" on public.phaze_plans
  for update to authenticated using ((select auth.uid()) = owner)
  with check ((select auth.uid()) = owner);
