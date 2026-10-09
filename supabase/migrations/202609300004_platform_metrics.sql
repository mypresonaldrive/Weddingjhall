-- Lifetime platform metrics: headline numbers computed in SQL so the dashboard
-- stays accurate even though the detailed tables are windowed to 1,000 rows.
create or replace function public.saas_platform_metrics() returns jsonb language plpgsql security definer set search_path='' as $$begin
 return jsonb_build_object(
  'organizations',(select count(*) from public.organizations),
  'activeOrganizations',(select count(*) from public.organizations where status='active'),
  'activeSubscriptions',(select count(*) from public.saas_subscriptions where coalesce(paid_through,trial_until)>now()),
  'capturedPaise',(select coalesce(sum(amount_paise),0) from public.billing_payments),
  'broadcastsSent',(select count(*) from public.platform_notifications where status='sent'),
  'deliveries',(select count(*) from public.tenant_notifications),
  'computedAt',now());end;$$;
do $$declare f record;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('saas_platform_metrics') loop
  execute format('revoke all on function %s from public',f.oid::regprocedure);
  execute format('revoke execute on function %s from anon, authenticated',f.oid::regprocedure);
  execute format('grant execute on function %s to service_role',f.oid::regprocedure);
 end loop;end $$;
