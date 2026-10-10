-- Notification centre phase 2: auto-scheduled dispatch (worker reuses the existing
-- dispatch RPC), periodic reminder generation across organizations, per-user
-- read/ack state, email media delivery, FCM push token registry, outbound tracking,
-- and a public storage bucket for uploaded SaaS logos.
-- All privileged operations remain service-role RPCs with atomic audit.

-- 1. Media/channel now support email delivery.
alter table public.notification_templates drop constraint if exists notification_templates_channel_check;
alter table public.notification_templates add constraint notification_templates_channel_check check(channel in ('banner','popup','push','email'));
alter table public.platform_notifications drop constraint if exists platform_notifications_media_check;
alter table public.platform_notifications add constraint platform_notifications_media_check check(media in ('banner','popup','push','email'));
alter table public.tenant_notifications drop constraint if exists tenant_notifications_media_check;
alter table public.tenant_notifications add constraint tenant_notifications_media_check check(media in ('banner','popup','push','email'));

-- 2. Outbound delivery tracking (the server worker stamps these after successful sends).
alter table public.tenant_notifications add column if not exists push_sent_at timestamptz;
alter table public.tenant_notifications add column if not exists email_sent_at timestamptz;
alter table public.tenant_notifications add column if not exists push_claimed_at timestamptz;
alter table public.tenant_notifications add column if not exists email_claimed_at timestamptz;
create index if not exists tenant_notifications_push_outbound_idx on public.tenant_notifications(id) where media='push' and push_sent_at is null;
create index if not exists tenant_notifications_email_outbound_idx on public.tenant_notifications(id) where media='email' and email_sent_at is null;

-- 3. Per-user read/ack state (server-side replacement for browser-local tracking).
create table if not exists public.tenant_notification_reads(notification_id bigint not null references public.tenant_notifications(id) on delete cascade, user_id uuid not null, read_at timestamptz, acked_at timestamptz, created_at timestamptz not null default now(), primary key(notification_id,user_id));
create index if not exists tenant_notification_reads_user_idx on public.tenant_notification_reads(user_id);

-- Feed now carries the caller's read/ack flags.
create or replace function public.notifications_list(p_t uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.memberships where user_id=p_actor and tenant_id=p_t and status='active') then raise exception 'Access denied.';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'category',n.category,'media',n.media,'title',n.title,'body',n.body,'createdAt',n.created_at,'isRead',r.read_at is not null,'acked',r.acked_at is not null) order by n.created_at desc)
  from (select * from public.tenant_notifications where tenant_id=p_t and (expires_at is null or expires_at>now()) order by created_at desc limit 25) n
  left join public.tenant_notification_reads r on r.notification_id=n.id and r.user_id=p_actor),'[]'::jsonb);end;$$;

-- Mark read / acknowledge popup broadcasts. p_kind: 'read' | 'ack'.
create or replace function public.notifications_mark(p_t uuid,p_actor uuid,p_ids bigint[],p_kind text) returns integer language plpgsql security definer set search_path='' as $$declare n bigint;cnt integer:=0;begin
 if p_kind not in ('read','ack') then raise exception 'Unknown mark kind.';end if;
 if not exists(select 1 from public.memberships where user_id=p_actor and tenant_id=p_t and status='active') then raise exception 'Access denied.';end if;
 if coalesce(array_length(p_ids,1),0)=0 or array_length(p_ids,1)>100 then raise exception 'Choose between 1 and 100 notifications.';end if;
 foreach n in array p_ids loop
  if exists(select 1 from public.tenant_notifications where id=n and tenant_id=p_t) then
   insert into public.tenant_notification_reads(notification_id,user_id,read_at,acked_at) values(n,p_actor,now(),case when p_kind='ack' then now() end)
    on conflict (notification_id,user_id) do update set read_at=coalesce(public.tenant_notification_reads.read_at,excluded.read_at),acked_at=case when p_kind='ack' then now() else public.tenant_notification_reads.acked_at end;
   cnt:=cnt+1;
  end if;
 end loop;
 return cnt;end;$$;

-- 4. Periodic reminder generation across every active organization (the worker throttles calls).
create or replace function public.notifications_generate_reminders_all() returns integer language plpgsql security definer set search_path='' as $$declare o record;total integer:=0;begin
 for o in select id from public.organizations where status='active' loop
  total:=total+public.notifications_generate_reminders(o.id);
 end loop;
 if total>0 then insert into public.audit_log(action,details) values('notification.reminders_generated',jsonb_build_object('created',total));end if;
 return total;end;$$;

-- 5. Browser push subscription registry (standard Web Push; endpoint is the id).
create table if not exists public.fcm_tokens(endpoint text primary key check(length(endpoint) between 20 and 1024 and endpoint ~ '^https://'), keys jsonb not null, user_id uuid not null, tenant_id uuid not null references public.organizations(id) on delete cascade, user_agent text not null default '', active boolean not null default true, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now());
create index if not exists fcm_tokens_tenant_idx on public.fcm_tokens(tenant_id) where active;

create or replace function public.fcm_token_register(p_actor uuid,p_tenant uuid,p_subscription jsonb,p_user_agent text) returns void language plpgsql security definer set search_path='' as $$declare ep text;k jsonb;begin
 if not exists(select 1 from public.memberships where user_id=p_actor and tenant_id=p_tenant and status='active') then raise exception 'Access denied.';end if;
 ep:=p_subscription->>'endpoint';k:=p_subscription->'keys';
 if ep is null or ep not like 'https://%' or k is null or k->>'p256dh' is null or k->>'auth' is null then raise exception 'Invalid browser push subscription.';end if;
 insert into public.fcm_tokens(endpoint,keys,user_id,tenant_id,user_agent,active,last_seen_at) values(ep,k,p_actor,p_tenant,left(coalesce(p_user_agent,''),400),true,now())
  on conflict (endpoint) do update set keys=excluded.keys,user_id=p_actor,tenant_id=p_tenant,user_agent=left(coalesce(p_user_agent,''),400),active=true,last_seen_at=now();end;$$;

create or replace function public.fcm_token_unregister(p_actor uuid,p_endpoint text) returns void language plpgsql security definer set search_path='' as $$begin
 delete from public.fcm_tokens where endpoint=p_endpoint and user_id=p_actor;end;$$;

-- Outbound claiming (skip-safe: a crashed worker's claims expire after 10 minutes)
-- and completion stamps. Worker sends after claiming; failed claims are released.
create or replace function public.notifications_claim_outbound(p_kind text,p_limit integer) returns setof public.tenant_notifications language plpgsql security definer set search_path='' as $$begin
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Claim size must be 1-100.';end if;
 if p_kind='push' then return query update public.tenant_notifications n set push_claimed_at=now()
  where n.id in (select id from public.tenant_notifications where media='push' and push_sent_at is null and (push_claimed_at is null or push_claimed_at<now()-interval '10 minutes') and (expires_at is null or expires_at>now()) order by id limit p_limit) returning n.*;
 elseif p_kind='email' then return query update public.tenant_notifications n set email_claimed_at=now()
  where n.id in (select id from public.tenant_notifications where media='email' and email_sent_at is null and (email_claimed_at is null or email_claimed_at<now()-interval '10 minutes') and (expires_at is null or expires_at>now()) order by id limit p_limit) returning n.*;
 else raise exception 'Unknown outbound kind.';end if;end;$$;

create or replace function public.notifications_outbound_done(p_kind text,p_id bigint) returns void language plpgsql security definer set search_path='' as $$begin
 if p_kind='push' then update public.tenant_notifications set push_sent_at=now() where id=p_id and push_sent_at is null;
 elseif p_kind='email' then update public.tenant_notifications set email_sent_at=now() where id=p_id and email_sent_at is null;
 else raise exception 'Unknown outbound kind.';end if;end;$$;

create or replace function public.notifications_outbound_release(p_kind text,p_id bigint) returns void language plpgsql security definer set search_path='' as $$begin
 if p_kind='push' then update public.tenant_notifications set push_claimed_at=null where id=p_id and push_sent_at is null;
 elseif p_kind='email' then update public.tenant_notifications set email_claimed_at=null where id=p_id and email_sent_at is null;
 else raise exception 'Unknown outbound kind.';end if;end;$$;

-- Expiring deliveries are dropped by the worker on sight (no table of expired rows).

-- 6. Branding logo storage: public read bucket named "branding" (uploads use signed URLs).
insert into storage.buckets(id,name,public) values('branding','branding',true) on conflict (id) do nothing;
drop policy if exists branding_public_read on storage.objects;
create policy branding_public_read on storage.objects for select using(bucket_id='branding');

-- 7. RLS + service-role-only execution (mirrors the 202609300002 pattern).
alter table public.tenant_notification_reads enable row level security;
alter table public.fcm_tokens enable row level security;
revoke all on public.tenant_notification_reads,public.fcm_tokens from anon,authenticated;
do $$declare f record;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('notifications_mark','notifications_generate_reminders_all','fcm_token_register','fcm_token_unregister','notifications_claim_outbound','notifications_outbound_done','notifications_outbound_release') loop
  execute format('revoke all on function %s from public',f.oid::regprocedure);
  execute format('revoke execute on function %s from anon, authenticated',f.oid::regprocedure);
  execute format('grant execute on function %s to service_role',f.oid::regprocedure);
 end loop;end $$;
grant select on public.tenant_notification_reads,public.fcm_tokens to service_role;
grant insert,update,delete on public.tenant_notification_reads,public.fcm_tokens to service_role;
grant update on public.tenant_notifications to service_role;
