-- Run as the project owner in the SQL Editor after applying supabase.sql.
-- Synthetic fixtures exist only in this transaction.
begin;

insert into auth.users (id) values
  ('d1c37f12-12e2-4ea5-9039-7bcdd13e4f12'),
  ('b579ffdb-71bc-4e9f-9379-3b45da70cdd8');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1c37f12-12e2-4ea5-9039-7bcdd13e4f12', true);

insert into public.phaze_plans (owner, revision, payload) values
  (auth.uid(), 1, '{"events":[]}'::jsonb);

do $$
declare changed integer;
begin
  if (select count(*) from public.phaze_plans where owner = auth.uid()) <> 1 then
    raise exception 'Owner cannot read their plan';
  end if;
  update public.phaze_plans set revision = 2 where owner = auth.uid() and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Owner update failed'; end if;
  update public.phaze_plans set revision = 3 where owner = auth.uid() and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Stale revision wrote data'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'b579ffdb-71bc-4e9f-9379-3b45da70cdd8', true);

do $$
declare changed integer;
begin
  if exists (select 1 from public.phaze_plans where owner = 'd1c37f12-12e2-4ea5-9039-7bcdd13e4f12') then
    raise exception 'Other user read private test plan';
  end if;
  update public.phaze_plans set revision = 3 where owner = 'd1c37f12-12e2-4ea5-9039-7bcdd13e4f12';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Other user changed private test plan'; end if;
  begin
    insert into public.phaze_plans (owner, revision, payload) values
      ('d1c37f12-12e2-4ea5-9039-7bcdd13e4f12', 1, '{}'::jsonb);
    raise exception 'Other user inserted under a foreign owner';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role anon;
do $$
begin
  perform 1 from public.phaze_plans;
  raise exception 'Anonymous read was allowed';
exception when insufficient_privilege then null;
end $$;

rollback;
select 'PASS: owner, revision guard, cross-user isolation, anonymous denial' as result;
