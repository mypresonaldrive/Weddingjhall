-- Notification centre: platform branding settings, triggered templates, SaaS-admin broadcasts
-- with categories/media/schedules, tenant in-app delivery, and idempotent auto reminders.
-- All administration is platform-only; every privileged write is service-role RPC + atomic audit.

alter table public.platform_integrations drop constraint if exists platform_integrations_kind_check;
alter table public.platform_integrations add constraint platform_integrations_kind_check check(kind in ('razorpay','email','sms','whatsapp','fcm'));

create table public.platform_settings(key text primary key check(key ~ '^[a-z][a-z0-9_.-]{1,60}$'), value jsonb not null, revision integer not null default 1, updated_at timestamptz not null default now());

create table public.notification_templates(id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z][a-z0-9._-]{1,80}$'), category text not null check(category in ('announcement','maintenance','billing','event','system')), channel text not null check(channel in ('banner','popup','push')), title text not null check(length(title) between 1 and 160), body text not null check(length(body) between 1 and 2000), variables jsonb not null default '[]' check(jsonb_typeof(variables)='array'), enabled boolean not null default true, revision integer not null default 1, updated_at timestamptz not null default now());

create table public.platform_notifications(id uuid primary key default gen_random_uuid(), category text not null check(category in ('announcement','maintenance','billing','event','system')), audience text not null check(audience in ('all','trial')), media text not null check(media in ('banner','popup','push')), title text not null check(length(title) between 1 and 160), body text not null check(length(body) between 1 and 2000), status text not null default 'draft' check(status in ('draft','scheduled','sent','cancelled')), scheduled_at timestamptz, sent_at timestamptz, created_by uuid, revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table public.tenant_notifications(id bigint generated always as identity primary key, tenant_id uuid not null references public.organizations(id) on delete cascade, dedupe_key text not null, category text not null check(category in ('announcement','maintenance','billing','event','system')), media text not null check(media in ('banner','popup','push')), title text not null, body text not null, created_at timestamptz not null default now(), expires_at timestamptz, unique(tenant_id,dedupe_key));
create index tenant_notifications_tenant_idx on public.tenant_notifications(tenant_id,created_at desc);

insert into public.notification_templates(slug,category,channel,title,body,variables) values
 ('subscription.expiring','billing','banner','Your subscription access ends soon','Your Gatherhall access for {{organization}} ends in {{days}} day(s), on {{date}}. Renew to keep editing bookings and payments.','["organization","days","date"]'),
 ('payment.due','billing','popup','Balance due for {{booking}}','{{booking}} on {{date}} has a remaining balance of {{balance}}. Record the payment before the event day.','["booking","date","balance"]'),
 ('booking.tomorrow','event','banner','Celebration tomorrow: {{booking}}','{{booking}} at {{venue}} starts on {{date}} ({{duration}}). Review staffing, menu and balance today.','["booking","venue","date","duration"]'),
 ('workspace.welcome','announcement','popup','Welcome to Gatherhall','Your workspace is ready. Add your first hall, client and booking to get started.','[]');

create or replace function public.render_template(t text,v jsonb) returns text language plpgsql immutable as $$
declare k text;r text:=t;begin
 if r is null then return '';end if;
 for k in select jsonb_object_keys(coalesce(v,'{}'::jsonb)) loop r:=replace(r,'{{'||k||'}}',coalesce(v->>k,''));end loop;
 return r;end;$$;

-- One tenant's idempotent auto reminders: subscription expiry, due balances and tomorrow's events.
create or replace function public.notifications_generate_reminders(p_t uuid) returns integer language plpgsql security definer set search_path='' as $$
declare s public.saas_subscriptions;o public.organizations;tpl public.notification_templates;b record;made integer:=0;ded text;days integer;
begin
 select * into o from public.organizations where id=p_t and status='active';if not found then return 0;end if;
 select * into s from public.saas_subscriptions where tenant_id=p_t;
 if coalesce(s.paid_through,s.trial_until) is not null and coalesce(s.paid_through,s.trial_until)>now() and coalesce(s.paid_through,s.trial_until)<now()+interval '7 days' then
  days:=greatest(0,extract(day from (coalesce(s.paid_through,s.trial_until)-now())))::integer+1;
  select * into tpl from public.notification_templates where slug='subscription.expiring';
  ded:='sub-expiring:'||to_char(coalesce(s.paid_through,s.trial_until),'IYYY-IW');
  insert into public.tenant_notifications(tenant_id,dedupe_key,category,media,title,body,expires_at)
   values(p_t,ded,coalesce(tpl.category,'billing'),coalesce(tpl.channel,'banner'),
    public.render_template(coalesce(case when tpl.enabled then tpl.title end,'Subscription access ends soon'),jsonb_build_object('organization',o.name,'days',days::text,'date',to_char(coalesce(s.paid_through,s.trial_until),'DD Mon YYYY'))),
    public.render_template(coalesce(case when tpl.enabled then tpl.body end,'Your access ends in {{days}} day(s). Renew to keep editing.'),jsonb_build_object('organization',o.name,'days',days::text,'date',to_char(coalesce(s.paid_through,s.trial_until),'DD Mon YYYY'))),
    coalesce(s.paid_through,s.trial_until)+interval '3 days') on conflict do nothing;
  get diagnostics made = row_count;
 end if;
 if public.saas_has_access(p_t) then
  for b in
   select r.id,r.body,coalesce((select sum((p.body->>'amount')::numeric) from public.saas_records p where p.tenant_id=r.tenant_id and p.kind='payments' and p.body->>'bookingId'=r.id),0) as paid
   from public.saas_records r where r.tenant_id=p_t and r.kind='bookings' and r.body->>'status' not in ('Cancelled','Completed')
    and r.body->>'date' in (to_char(now()::date,'YYYY-MM-DD'),to_char((now()::date+1),'YYYY-MM-DD'))
  loop
   if (b.body->>'date')=to_char((now()::date+1),'YYYY-MM-DD') then
    select * into tpl from public.notification_templates where slug='booking.tomorrow';
    ded:='booking-tomorrow:'||b.id||':'||(b.body->>'date');
    insert into public.tenant_notifications(tenant_id,dedupe_key,category,media,title,body,expires_at)
     values(p_t,ded,coalesce(tpl.category,'event'),coalesce(tpl.channel,'banner'),
      public.render_template(coalesce(case when tpl.enabled then tpl.title end,'Celebration tomorrow: {{booking}}'),jsonb_build_object('booking',b.body->>'name','venue',coalesce(b.body->>'hall',''),'date',b.body->>'date','duration',coalesce(b.body->>'durationMode','full day'))),
      public.render_template(coalesce(case when tpl.enabled then tpl.body end,'{{booking}} starts tomorrow. Review staffing, menu and balance today.'),jsonb_build_object('booking',b.body->>'name','venue',coalesce(b.body->>'hall',''),'date',b.body->>'date','duration',coalesce(b.body->>'durationMode','full day'))),
      (b.body->>'date')::date+2) on conflict do nothing;
    if found then made:=made+1;end if;
   end if;
   if coalesce((b.body->>'total')::numeric,0)>b.paid then
    select * into tpl from public.notification_templates where slug='payment.due';
    ded:='pay-due:'||b.id||':'||to_char(now()::date,'YYYY-MM-DD');
    insert into public.tenant_notifications(tenant_id,dedupe_key,category,media,title,body,expires_at)
     values(p_t,ded,coalesce(tpl.category,'billing'),coalesce(tpl.channel,'popup'),
      public.render_template(coalesce(case when tpl.enabled then tpl.title end,'Balance due for {{booking}}'),jsonb_build_object('booking',b.body->>'name','date',b.body->>'date','balance','₹ '||trim(to_char((b.body->>'total')::numeric-b.paid,'FM999,999,999,990')))),
      public.render_template(coalesce(case when tpl.enabled then tpl.body end,'{{booking}} on {{date}} has a remaining balance of {{balance}}.'),jsonb_build_object('booking',b.body->>'name','date',b.body->>'date','balance','₹ '||trim(to_char((b.body->>'total')::numeric-b.paid,'FM999,999,999,990')))),
      now()+interval '2 days') on conflict do nothing;
    if found then made:=made+1;end if;
   end if;
  end loop;
 end if;
 return made;end;$$;

create or replace function public.notifications_list(p_t uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.memberships where user_id=p_actor and tenant_id=p_t and status='active') then raise exception 'Access denied.';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'category',n.category,'media',n.media,'title',n.title,'body',n.body,'createdAt',n.created_at) order by n.created_at desc)
  from (select * from public.tenant_notifications where tenant_id=p_t and (expires_at is null or expires_at>now()) order by created_at desc limit 25) n),'[]'::jsonb);end;$$;

-- Platform branding settings with optimistic revisions and atomic audit.
create or replace function public.platform_save_setting(p_key text,p_actor uuid,p_value jsonb,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$declare v integer;begin
 update public.platform_settings set value=p_value,revision=revision+1,updated_at=now() where key=p_key and revision=p_expected returning revision into v;
 if not found then
  if p_expected<>0 then raise exception 'STALE_SETTING: Settings changed. Reload before saving.';end if;
  insert into public.platform_settings(key,value,revision) values(p_key,p_value,1) returning revision into v;
 end if;
 insert into public.audit_log(actor_id,action,details) values(p_actor,'platform.setting_saved',jsonb_build_object('key',p_key,'revision',v));
 return jsonb_build_object('revision',v);end;$$;

create or replace function public.platform_save_template(p_actor uuid,p_slug text,p_category text,p_channel text,p_title text,p_body text,p_variables jsonb,p_enabled boolean,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$declare v integer;begin
 update public.notification_templates set category=p_category,channel=p_channel,title=p_title,body=p_body,variables=coalesce(p_variables,'[]'::jsonb),enabled=p_enabled,revision=revision+1,updated_at=now() where slug=p_slug and revision=p_expected returning revision into v;
 if not found then
  if exists(select 1 from public.notification_templates where slug=p_slug) then raise exception 'STALE_TEMPLATE: Template changed. Reload before saving.';end if;
  insert into public.notification_templates(slug,category,channel,title,body,variables,enabled) values(p_slug,p_category,p_channel,p_title,p_body,coalesce(p_variables,'[]'::jsonb),p_enabled) returning revision into v;
 end if;
 insert into public.audit_log(actor_id,action,details) values(p_actor,'notification.template_saved',jsonb_build_object('slug',p_slug,'enabled',p_enabled,'revision',v));
 return jsonb_build_object('revision',v);end;$$;

create or replace function public.platform_notification_create(p_actor uuid,p_category text,p_audience text,p_media text,p_title text,p_body text,p_status text,p_scheduled_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$declare n public.platform_notifications;begin
 if p_status not in ('draft','scheduled') then raise exception 'Choose draft or scheduled.';end if;
 if p_status='scheduled' and (p_scheduled_at is null or p_scheduled_at<=now()) then raise exception 'Choose a future schedule time.';end if;
 insert into public.platform_notifications(category,audience,media,title,body,status,scheduled_at,created_by) values(p_category,p_audience,p_media,p_title,p_body,p_status,case when p_status='scheduled' then p_scheduled_at else null end,p_actor) returning * into n;
 insert into public.audit_log(actor_id,action,details) values(p_actor,'notification.created',jsonb_build_object('id',n.id,'category',p_category,'media',p_media,'status',n.status));
 return to_jsonb(n);end;$$;

create or replace function public.platform_notification_update(p_actor uuid,p_id uuid,p_category text,p_audience text,p_media text,p_title text,p_body text,p_scheduled_at timestamptz,p_expected integer) returns void language plpgsql security definer set search_path='' as $$begin
 update public.platform_notifications set category=p_category,audience=p_audience,media=p_media,title=p_title,body=p_body,scheduled_at=case when status='scheduled' then p_scheduled_at else null end,revision=revision+1,updated_at=now() where id=p_id and revision=p_expected and status in ('draft','scheduled');
 if not found then raise exception 'STALE_NOTIFICATION: This broadcast changed or is no longer editable. Reload before saving.';end if;
 if (select status from public.platform_notifications where id=p_id)='scheduled' and (p_scheduled_at is null or p_scheduled_at<=now()) then raise exception 'Choose a future schedule time.';end if;
 insert into public.audit_log(actor_id,action,details) values(p_actor,'notification.updated',jsonb_build_object('id',p_id));end;$$;

-- Fan-out is idempotent: re-dispatching an already-sent broadcast cannot duplicate tenant deliveries.
create or replace function public.platform_notification_dispatch(p_actor uuid,p_id uuid) returns integer language plpgsql security definer set search_path='' as $$declare n public.platform_notifications;cnt integer:=0;begin
 update public.platform_notifications set status='sent',sent_at=now(),updated_at=now() where id=p_id and status in ('draft','scheduled') returning * into n;
 if not found then raise exception 'CONFLICT: Only draft or scheduled broadcasts can be sent.';end if;
 insert into public.tenant_notifications(tenant_id,dedupe_key,category,media,title,body,expires_at)
  select o.id,'broadcast:'||n.id::text,n.category,n.media,n.title,n.body,now()+interval '30 days' from public.organizations o
  where o.status='active' and (n.audience='all' or (n.audience='trial' and exists(select 1 from public.saas_subscriptions s where s.tenant_id=o.id and s.trial_until>now() and (s.paid_through is null or s.paid_through<=now()))))
  on conflict do nothing;
 get diagnostics cnt = row_count;
 insert into public.audit_log(actor_id,action,details) values(p_actor,'notification.dispatched',jsonb_build_object('id',n.id,'audience',n.audience,'deliveries',cnt));
 return cnt;end;$$;

create or replace function public.platform_notification_cancel(p_actor uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.platform_notifications set status='cancelled',updated_at=now() where id=p_id and status in ('draft','scheduled');
 if not found then raise exception 'CONFLICT: Only draft or scheduled broadcasts can be cancelled.';end if;
 insert into public.audit_log(actor_id,action,details) values(p_actor,'notification.cancelled',jsonb_build_object('id',p_id));end;$$;

alter table public.platform_settings enable row level security;
alter table public.notification_templates enable row level security;
alter table public.platform_notifications enable row level security;
alter table public.tenant_notifications enable row level security;

do $$declare f regprocedure;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('render_template','notifications_generate_reminders','notifications_list','platform_save_setting','platform_save_template','platform_notification_create','platform_notification_update','platform_notification_dispatch','platform_notification_cancel') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;end$$;
grant select on public.platform_settings,public.notification_templates,public.platform_notifications,public.tenant_notifications to service_role;
grant insert,update on public.platform_settings,public.notification_templates,public.platform_notifications,public.tenant_notifications to service_role;
