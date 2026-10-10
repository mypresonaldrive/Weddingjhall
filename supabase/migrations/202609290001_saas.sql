-- Apply to a new Supabase project as the database owner. No demo credentials/data.
create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade, name text not null default '', email text not null, created_at timestamptz not null default now());
create table if not exists public.platform_admins(user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists public.saas_plans(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 80),description text not null default '',monthly_paise bigint not null check(monthly_paise between 100 and 100000000),yearly_paise bigint not null check(yearly_paise between 100 and 100000000),max_halls integer not null check(max_halls between 1 and 100),max_staff integer not null check(max_staff between 1 and 500),trial_days integer not null default 0 check(trial_days between 0 and 30),published boolean not null default false,version integer not null default 1,created_at timestamptz not null default now());
create table if not exists public.organizations(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 120),owner_id uuid not null unique references auth.users(id),billing_email text not null,phone text not null default '',city text not null default '',status text not null default 'active' check(status in ('active','suspended')),created_at timestamptz not null default now());
create table if not exists public.memberships(user_id uuid primary key references auth.users(id) on delete cascade,tenant_id uuid not null references public.organizations(id),role text not null check(role in ('owner','staff','client')),record_id text,status text not null default 'active' check(status in ('active','inactive')),created_at timestamptz not null default now());
create index if not exists memberships_tenant_idx on public.memberships(tenant_id);
create table if not exists public.saas_subscriptions(tenant_id uuid primary key references public.organizations(id),plan_id uuid not null references public.saas_plans(id),plan_snapshot jsonb not null,interval text not null check(interval in ('monthly','yearly')),status text not null default 'pending',trial_until timestamptz,paid_through timestamptz,provider_subscription_id text unique,checkout_state text not null default 'none' check(checkout_state in ('none','creating','ready','uncertain')),checkout_token uuid,checkout_started_at timestamptz,last_checked_at timestamptz,cancel_at_period_end boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.saas_records(id text primary key,tenant_id uuid not null references public.organizations(id),kind text not null check(kind in ('halls','bookings','clients','staff','payments','plans','addons')),body jsonb not null check(jsonb_typeof(body)='object'),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists saas_records_tenant_kind_idx on public.saas_records(tenant_id,kind,id);
create index if not exists saas_records_booking_hall_idx on public.saas_records(tenant_id,(body->>'hallId')) where kind='bookings';
create index if not exists saas_records_payment_booking_idx on public.saas_records(tenant_id,(body->>'bookingId')) where kind='payments';
create table if not exists public.record_private(record_id text primary key references public.saas_records(id) on delete cascade,tenant_id uuid not null references public.organizations(id),operations_notes text not null default '');
create table if not exists public.saas_invitations(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.organizations(id),record_id text not null references public.saas_records(id) on delete cascade,email text not null,role text not null check(role in ('staff','client')),status text not null default 'pending' check(status in ('pending','accepted','cancelled')),expires_at timestamptz not null default now()+interval '7 days',created_at timestamptz not null default now());
create unique index if not exists invitation_pending_idx on public.saas_invitations(lower(email)) where status='pending';
create table if not exists public.billing_events(event_id text primary key,event_type text not null,provider_subscription_id text not null,received_at timestamptz not null default now());
create table if not exists public.billing_payments(provider_payment_id text primary key,tenant_id uuid not null references public.organizations(id),amount_paise bigint not null check(amount_paise>0),currency text not null check(currency='INR'),captured_at timestamptz not null,created_at timestamptz not null default now());
create table if not exists public.audit_log(id bigint generated always as identity primary key,actor_id uuid,tenant_id uuid,action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create table if not exists public.rate_buckets(key text primary key,hits integer not null,expires_at timestamptz not null);

create or replace function public.handle_saas_user() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.profiles(id,name,email) values(new.id,left(coalesce(new.raw_user_meta_data->>'name',''),120),lower(new.email)) on conflict(id) do update set email=excluded.email;return new;end;$$;
drop trigger if exists saas_auth_user on auth.users;
create trigger saas_auth_user after insert or update of email on auth.users for each row execute function public.handle_saas_user();
insert into public.profiles(id,name,email) select id,left(coalesce(raw_user_meta_data->>'name',''),120),lower(email) from auth.users on conflict(id) do nothing;
create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$select coalesce(auth.jwt()->>'aal','')='aal2' and exists(select 1 from public.platform_admins where user_id=auth.uid())$$;
create or replace function public.member_role(t uuid) returns text language sql stable security definer set search_path='' as $$select m.role from public.memberships m join public.organizations o on o.id=m.tenant_id where m.user_id=auth.uid() and m.tenant_id=t and m.status='active' and o.status='active'$$;
create or replace function public.record_visible(t uuid,k text,rid text,b jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$declare r text;c text;begin r:=public.member_role(t);if r in ('owner','staff') then return true;end if;if r is distinct from 'client' then return false;end if;select record_id into c from public.memberships where user_id=auth.uid();return case k when 'halls' then true when 'plans' then b->>'status'='Active' when 'addons' then b->>'status'='Active' when 'clients' then rid=c when 'bookings' then b->>'clientId'=c when 'payments' then exists(select 1 from public.saas_records x where x.tenant_id=t and x.kind='bookings' and x.id=b->>'bookingId' and x.body->>'clientId'=c) else false end;end;$$;

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.saas_plans enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.saas_subscriptions enable row level security;
alter table public.saas_records enable row level security;
alter table public.record_private enable row level security;
alter table public.saas_invitations enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_payments enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_buckets enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid());
create policy admins_read on public.platform_admins for select to authenticated using(user_id=auth.uid());
create policy plans_read on public.saas_plans for select to anon,authenticated using(published or public.is_platform_admin());
create policy organizations_read on public.organizations for select to authenticated using(public.is_platform_admin() or exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.tenant_id=id));
create policy memberships_read on public.memberships for select to authenticated using(user_id=auth.uid());
create policy subscriptions_read on public.saas_subscriptions for select to authenticated using(public.member_role(tenant_id)='owner' or public.is_platform_admin());
create policy records_read on public.saas_records for select to authenticated using(public.record_visible(tenant_id,kind,id,body));
create policy private_read on public.record_private for select to authenticated using(public.member_role(tenant_id) in ('owner','staff'));
create policy payments_read on public.billing_payments for select to authenticated using(public.member_role(tenant_id)='owner' or public.is_platform_admin());
create policy audit_read on public.audit_log for select to authenticated using(public.is_platform_admin());
-- No browser insert/update/delete policies. Authoritative writes are service-only RPCs below.
revoke all on all tables in schema public from anon,authenticated;
grant usage on schema public to anon,authenticated,service_role;
grant select on public.saas_plans to anon;
grant select on public.profiles,public.platform_admins,public.saas_plans,public.organizations,public.memberships,public.saas_subscriptions,public.saas_records,public.record_private,public.billing_payments,public.audit_log to authenticated;
grant select on public.profiles,public.platform_admins,public.saas_plans,public.organizations,public.memberships,public.saas_subscriptions,public.saas_records,public.record_private,public.saas_invitations,public.billing_events,public.billing_payments,public.audit_log to service_role;

create or replace function public.saas_has_access(t uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organizations o join public.saas_subscriptions s on s.tenant_id=o.id where o.id=t and o.status='active' and (s.paid_through>now() or (s.status='trialing' and s.trial_until>now())))$$;
create or replace function public.saas_register_org(actor uuid,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare plan public.saas_plans;org uuid;email text;begin
 if exists(select 1 from public.memberships where user_id=actor) then raise exception 'This account already belongs to an organization.';end if;
 select u.email into email from auth.users u where u.id=actor and u.email_confirmed_at is not null;if email is null then raise exception 'Verify your email before registering an organization.';end if;
 select * into plan from public.saas_plans where id=(p->>'planId')::uuid and published;if not found then raise exception 'Choose a published subscription plan.';end if;
 if p->>'interval' not in ('monthly','yearly') then raise exception 'Choose monthly or yearly billing.';end if;
 insert into public.organizations(name,owner_id,billing_email,phone,city) values(p->>'name',actor,email,coalesce(p->>'phone',''),coalesce(p->>'city','')) returning id into org;
 insert into public.memberships(user_id,tenant_id,role) values(actor,org,'owner');
 insert into public.saas_subscriptions(tenant_id,plan_id,plan_snapshot,interval,status,trial_until) values(org,plan.id,to_jsonb(plan),p->>'interval',case when plan.trial_days>0 then 'trialing' else 'pending' end,case when plan.trial_days>0 then now()+make_interval(days=>plan.trial_days) end);
 insert into public.audit_log(actor_id,tenant_id,action,details) values(actor,org,'organization.created',jsonb_build_object('plan_id',plan.id));return org;end;$$;

create or replace function public.booking_window(b jsonb) returns tstzrange language plpgsql immutable set search_path='' as $$declare d date:=(b->>'date')::date;e date;mode text:=coalesce(b->>'durationMode','full');s timestamp;f timestamp;begin
 e:=coalesce(nullif(b->>'endDate','')::date,d);
 if mode='morning' then s:=d+time '08:00';f:=d+time '14:00';elsif mode='afternoon' then s:=d+time '14:00';f:=d+time '20:00';elsif mode='evening' then s:=d+time '17:00';f:=d+time '23:00';elsif mode='custom' then s:=d+(b->>'time')::time;f:=e+(b->>'bookingEndTime')::time;elsif mode='multiple' then s:=d;f:=e+1;else s:=d;f:=d+1;end if;
 if f<=s or f-s>interval '31 days' then raise exception 'Invalid booking duration.';end if;return tstzrange(s at time zone 'UTC',f at time zone 'UTC','[)');end;$$;
create or replace function public.saas_save_record(actor uuid,t uuid,k text,rid text,b jsonb,is_new boolean) returns jsonb language plpgsql security definer set search_path='' as $$declare m public.memberships;sub public.saas_subscriptions;n integer;paid numeric;old public.saas_records;clean jsonb;begin
 perform 1 from public.organizations where id=t for update;if not found then raise exception 'Organization not found.';end if;
 select * into m from public.memberships where user_id=actor and tenant_id=t and status='active';if not found then raise exception 'Access denied.';end if;
 if not public.saas_has_access(t) then raise exception 'Subscription inactive. Renew before making changes.';end if;
 if k not in ('halls','bookings','clients','staff','payments','plans','addons') then raise exception 'Invalid resource.';end if;
 if m.role='client' and (k<>'bookings' or not is_new or b->>'clientId' is distinct from m.record_id or b->>'status'<>'Pending') then raise exception 'Client action not allowed.';end if;
 if m.role='staff' and k in ('halls','staff','plans','addons') then raise exception 'Only owners can manage this resource.';end if;
 select * into old from public.saas_records where id=rid and tenant_id=t and kind=k;
 if not is_new and not found then raise exception 'Record not found.';end if;
 select * into sub from public.saas_subscriptions where tenant_id=t;
 if k='halls' and is_new then select count(*) into n from public.saas_records where tenant_id=t and kind='halls';if n>=(sub.plan_snapshot->>'max_halls')::int then raise exception 'Your subscription hall limit has been reached.';end if;end if;
 if k='staff' and b->>'status'='Active' then select count(*) into n from public.saas_records where tenant_id=t and kind='staff' and body->>'status'='Active' and id<>rid;if n>=(sub.plan_snapshot->>'max_staff')::int then raise exception 'Your subscription team limit has been reached.';end if;end if;
 if k='bookings' then
  if not exists(select 1 from public.saas_records where tenant_id=t and kind='halls' and id=b->>'hallId') or not exists(select 1 from public.saas_records where tenant_id=t and kind='clients' and id=b->>'clientId') then raise exception 'Choose a valid hall and client.';end if;
  if b->>'status'<>'Cancelled' and exists(select 1 from public.saas_records x where x.tenant_id=t and x.kind='bookings' and x.id<>rid and x.body->>'hallId'=b->>'hallId' and x.body->>'status'<>'Cancelled' and public.booking_window(x.body)&&public.booking_window(b)) then raise exception 'Hall unavailable for the selected duration.';end if;
  select coalesce(sum((body->>'amount')::numeric),0) into paid from public.saas_records where tenant_id=t and kind='payments' and body->>'bookingId'=rid;if (b->>'total')::numeric<paid then raise exception 'Booking total is below payments received.';end if;
 end if;
 if k='payments' then
  select * into old from public.saas_records where tenant_id=t and kind='bookings' and id=b->>'bookingId';if not found then raise exception 'Booking not found.';end if;
  select coalesce(sum((body->>'amount')::numeric),0) into paid from public.saas_records where tenant_id=t and kind='payments' and body->>'bookingId'=old.id and id<>rid;if paid+(b->>'amount')::numeric>(old.body->>'total')::numeric then raise exception 'Payment exceeds remaining balance.';end if;
 end if;
 clean:=b-'operationsNotes';if is_new then insert into public.saas_records(id,tenant_id,kind,body) values(rid,t,k,clean);else update public.saas_records set body=clean,updated_at=now() where id=rid and tenant_id=t;end if;
 if k='bookings' then insert into public.record_private(record_id,tenant_id,operations_notes) values(rid,t,case when m.role='client' then '' else coalesce(b->>'operationsNotes','') end) on conflict(record_id) do update set operations_notes=excluded.operations_notes;end if;
 if k in ('staff','clients') then update public.memberships set status=case when b->>'status'='Active' then 'active' else 'inactive' end where tenant_id=t and record_id=rid;end if;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(actor,t,k||case when is_new then '.created' else '.updated' end,jsonb_build_object('record_id',rid));return clean||jsonb_build_object('id',rid);end;$$;
create or replace function public.saas_delete_record(actor uuid,t uuid,k text,rid text) returns void language plpgsql security definer set search_path='' as $$declare role text;begin
 perform 1 from public.organizations where id=t for update;select m.role into role from public.memberships m where m.user_id=actor and m.tenant_id=t and m.status='active';
 if role is null or role='client' or (role='staff' and k in ('halls','staff','plans','addons')) then raise exception 'Action not allowed.';end if;if not public.saas_has_access(t) then raise exception 'Subscription inactive.';end if;
 if not exists(select 1 from public.saas_records where tenant_id=t and kind=k and id=rid) then raise exception 'Record not found.';end if;
 if k in ('halls','clients') and exists(select 1 from public.saas_records where tenant_id=t and kind='bookings' and body->>case when k='halls' then 'hallId' else 'clientId' end=rid) then raise exception 'This record still has bookings.';end if;
 if k='bookings' then delete from public.saas_records where tenant_id=t and kind='payments' and body->>'bookingId'=rid;end if;
 delete from public.memberships where tenant_id=t and record_id=rid;
 delete from public.saas_records where tenant_id=t and kind=k and id=rid;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(actor,t,k||'.deleted',jsonb_build_object('record_id',rid));end;$$;

create or replace function public.saas_platform_action(actor uuid,action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;pid uuid;begin
 if not exists(select 1 from public.platform_admins where user_id=actor) then raise exception 'Platform administrator required.';end if;
 if action='plan.save' then
  if p->>'id' is null then insert into public.saas_plans(name,description,monthly_paise,yearly_paise,max_halls,max_staff,trial_days,published) values(p->>'name',p->>'description',(p->>'monthly_paise')::bigint,(p->>'yearly_paise')::bigint,(p->>'max_halls')::int,(p->>'max_staff')::int,(p->>'trial_days')::int,(p->>'published')::boolean) returning id into pid;
  else pid:=(p->>'id')::uuid;update public.saas_plans set name=p->>'name',description=p->>'description',monthly_paise=(p->>'monthly_paise')::bigint,yearly_paise=(p->>'yearly_paise')::bigint,max_halls=(p->>'max_halls')::int,max_staff=(p->>'max_staff')::int,trial_days=(p->>'trial_days')::int,published=(p->>'published')::boolean,version=version+1 where id=pid;if not found then raise exception 'Plan not found.';end if;end if;select to_jsonb(s) into result from public.saas_plans s where id=pid;
 elsif action='tenant.status' then
  if p->>'status' not in ('active','suspended') or length(coalesce(p->>'reason',''))<5 then raise exception 'Provide a valid status and reason.';end if;
  update public.organizations set status=p->>'status' where id=(p->>'tenant_id')::uuid;if not found then raise exception 'Organization not found.';end if;result:=p;
 else raise exception 'Unknown administrator action.';end if;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(actor,case when action='tenant.status' then (p->>'tenant_id')::uuid end,action,result);return result;end;$$;
create or replace function public.saas_profile_update(actor uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$begin update public.profiles set name=p->>'name' where id=actor;if p->>'organization' is not null then update public.organizations set name=p->>'organization' where owner_id=actor;end if;end;$$;

create or replace function public.saas_checkout_claim(actor uuid,t uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare s public.saas_subscriptions;token uuid;begin
 perform 1 from public.organizations where id=t and status='active' for update;if not found then raise exception 'Organization unavailable.';end if;
 if not exists(select 1 from public.memberships where user_id=actor and tenant_id=t and role='owner' and status='active') then raise exception 'Only the organization owner can subscribe.';end if;
 select * into s from public.saas_subscriptions where tenant_id=t for update;
 if s.provider_subscription_id is not null then return to_jsonb(s)||jsonb_build_object('reuse',true);end if;
 if not exists(select 1 from public.saas_plans where id=s.plan_id and published) then raise exception 'This plan is no longer available. Contact support.';end if;
 if s.checkout_state<>'none' then raise exception 'Checkout is being created or needs reconciliation. Do not create another mandate; contact support.';end if;
 token:=gen_random_uuid();update public.saas_subscriptions set checkout_state='creating',checkout_token=token,checkout_started_at=now() where tenant_id=t;return to_jsonb(s)||jsonb_build_object('checkout_token',token,'reuse',false);end;$$;
create or replace function public.saas_checkout_finish(t uuid,token uuid,provider_id text) returns void language plpgsql security definer set search_path='' as $$begin
 update public.saas_subscriptions set provider_subscription_id=provider_id,checkout_state=case when provider_id is null then 'uncertain' else 'ready' end where tenant_id=t and checkout_token=token and checkout_state in ('creating','uncertain');if not found then raise exception 'Checkout state changed. Reconcile before retrying.';end if;
 insert into public.audit_log(tenant_id,action,details) values(t,'checkout.created',jsonb_build_object('provider_id',provider_id,'needs_reconciliation',provider_id is null));end;$$;
create or replace function public.saas_sync_subscription(provider_id text,observed timestamptz,p jsonb,event_id text default null,event_type text default 'verification') returns void language plpgsql security definer set search_path='' as $$declare s public.saas_subscriptions;ending timestamptz;begin
 select * into s from public.saas_subscriptions where provider_subscription_id=provider_id for update;if not found then raise exception 'Unknown subscription.';end if;
 if event_id is not null then insert into public.billing_events values(event_id,event_type,provider_id,now()) on conflict do nothing;if not found then return;end if;end if;
 if s.last_checked_at is null or observed>=s.last_checked_at then
  ending:=case when p->>'status'='active' and (p->>'current_end')::bigint>0 then to_timestamp((p->>'current_end')::bigint) else s.paid_through end;
  update public.saas_subscriptions set status=p->>'status',paid_through=greatest(paid_through,ending),last_checked_at=observed,cancel_at_period_end=coalesce((p->>'cancel_at_period_end')::boolean,cancel_at_period_end) where tenant_id=s.tenant_id;
 end if;
 if p->>'payment_id' is not null and (p->>'amount_paise')::bigint>0 and p->>'currency'='INR' then insert into public.billing_payments(provider_payment_id,tenant_id,amount_paise,currency,captured_at) values(p->>'payment_id',s.tenant_id,(p->>'amount_paise')::bigint,'INR',to_timestamp((p->>'captured_at')::bigint)) on conflict do nothing;end if;
 insert into public.audit_log(tenant_id,action,details) values(s.tenant_id,'subscription.synced',jsonb_build_object('status',p->>'status','source',event_type));end;$$;
create or replace function public.saas_platform_usage(actor uuid) returns table(tenant_id uuid,halls bigint,staff bigint) language plpgsql stable security definer set search_path='' as $$begin
 if not exists(select 1 from public.platform_admins where user_id=actor) then raise exception 'Platform administrator required.';end if;
 return query select r.tenant_id,count(*) filter(where r.kind='halls'),count(*) filter(where r.kind='staff' and r.body->>'status'='Active') from public.saas_records r where r.kind in ('halls','staff') group by r.tenant_id;
end;$$;
create or replace function public.saas_rate_limit(bucket text,max_hits integer,seconds integer) returns boolean language plpgsql security definer set search_path='' as $$declare n int;begin
 insert into public.rate_buckets(key,hits,expires_at) values(bucket,1,now()+make_interval(secs=>seconds)) on conflict(key) do update set hits=case when public.rate_buckets.expires_at<now() then 1 else public.rate_buckets.hits+1 end,expires_at=case when public.rate_buckets.expires_at<now() then now()+make_interval(secs=>seconds) else public.rate_buckets.expires_at end returning hits into n;return n<=max_hits;end;$$;

create or replace function public.saas_invite(actor uuid,t uuid,rid text) returns jsonb language plpgsql security definer set search_path='' as $$declare r public.saas_records;v public.saas_invitations;begin
 if not exists(select 1 from public.memberships where user_id=actor and tenant_id=t and role='owner' and status='active') or not public.saas_has_access(t) then raise exception 'An active organization owner is required.';end if;
 select * into r from public.saas_records where tenant_id=t and id=rid and kind in ('staff','clients') and body->>'status'='Active';if not found then raise exception 'Choose an active team member or client.';end if;
 if exists(select 1 from public.profiles p join public.memberships m on m.user_id=p.id where lower(p.email)=lower(r.body->>'email')) then raise exception 'This email already belongs to an organization.';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(r.body->>'email'),0));
 if exists(select 1 from public.saas_invitations where lower(email)=lower(r.body->>'email') and status='pending' and expires_at>now() and tenant_id<>t) then raise exception 'This email has a pending invitation to another organization.';end if;
 update public.saas_invitations set status='cancelled' where lower(email)=lower(r.body->>'email') and status='pending' and (tenant_id=t or expires_at<=now());
 insert into public.saas_invitations(tenant_id,record_id,email,role) values(t,rid,lower(r.body->>'email'),case when r.kind='staff' then 'staff' else 'client' end) returning * into v;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(actor,t,'invitation.created',jsonb_build_object('record_id',rid));return to_jsonb(v);end;$$;
create or replace function public.saas_accept_invite(actor uuid,invitation_id uuid) returns void language plpgsql security definer set search_path='' as $$declare inv public.saas_invitations;recipient_email text;begin
 select lower(u.email) into recipient_email from auth.users u where u.id=actor and u.email_confirmed_at is not null;if recipient_email is null then return;end if;
 select * into inv from public.saas_invitations i where i.id=invitation_id and lower(i.email)=recipient_email and i.status='pending' and i.expires_at>now() for update;if not found then raise exception 'Invitation unavailable or expired.';end if;
 if not exists(select 1 from public.saas_records where id=inv.record_id and tenant_id=inv.tenant_id and body->>'status'='Active' and lower(body->>'email')=recipient_email) then raise exception 'Invitation no longer matches an active directory entry.';end if;
 if exists(select 1 from public.memberships where user_id=actor) then raise exception 'Account already belongs to an organization.';end if;
 insert into public.memberships(user_id,tenant_id,role,record_id) values(actor,inv.tenant_id,inv.role,inv.record_id);
 update public.saas_invitations set status='accepted' where id=inv.id;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(actor,inv.tenant_id,'invitation.accepted','{}');end;$$;

-- Do not grant arbitrary RPC execution to web clients. Explicit allowlist only.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_platform_admin(),public.member_role(uuid),public.record_visible(uuid,text,text,jsonb) to authenticated;
grant execute on function public.is_platform_admin() to anon;
grant execute on function public.saas_platform_usage(uuid),public.saas_has_access(uuid),public.saas_register_org(uuid,jsonb),public.saas_save_record(uuid,uuid,text,text,jsonb,boolean),public.saas_delete_record(uuid,uuid,text,text),public.saas_platform_action(uuid,text,jsonb),public.saas_profile_update(uuid,jsonb),public.saas_checkout_claim(uuid,uuid),public.saas_checkout_finish(uuid,uuid,text),public.saas_sync_subscription(text,timestamptz,jsonb,text,text),public.saas_rate_limit(text,integer,integer),public.saas_invite(uuid,uuid,text),public.saas_accept_invite(uuid,uuid) to service_role;
revoke create on schema public from public,anon,authenticated;

-- Illustrative prices; intentionally unpublished until the operator reviews them.
insert into public.saas_plans(name,description,monthly_paise,yearly_paise,max_halls,max_staff,trial_days) values
('Starter','For an independent venue',99900,999000,1,2,14),('Growth','For growing venue businesses',249900,2499000,3,10,14),('Scale','For multi-location operators',499900,4999000,10,30,14);
