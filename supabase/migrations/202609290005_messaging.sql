-- Server-only integration secrets, channel credits and durable first-confirmation outbox.
begin;
create table public.platform_integrations(kind text primary key check(kind in ('razorpay','email','sms','whatsapp')), enabled boolean not null default false, encrypted text not null, revision integer not null default 1, updated_at timestamptz not null default now());
create table public.message_preferences(tenant_id uuid primary key references public.organizations(id), channels jsonb not null default '{}', owner_alerts boolean not null default false, customer_alerts boolean not null default false);
create table public.message_consents(tenant_id uuid not null references public.organizations(id), client_id text not null, channel text not null check(channel in ('email','sms','whatsapp')), destination text not null, allowed boolean not null, evidence text not null, actor_id uuid not null, updated_at timestamptz not null default now(), primary key(tenant_id,client_id,channel));
create table public.message_packs(id uuid primary key default gen_random_uuid(), name text not null, channel text not null check(channel in ('email','sms','whatsapp')), credits integer not null check(credits between 1 and 1000000), price_paise bigint not null check(price_paise between 100 and 100000000), active boolean not null default false);
create table public.message_allowances(scope text not null check(scope in ('plan','organization')), scope_id uuid not null, channel text not null check(channel in ('email','sms','whatsapp')), credits integer not null check(credits between 0 and 1000000), rollover boolean not null default false, primary key(scope,scope_id,channel));
create table public.message_grants(id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.organizations(id), channel text not null check(channel in ('email','sms','whatsapp')), credits integer not null check(credits>0), used integer not null default 0 check(used>=0 and used<=credits), expires_at timestamptz, source text not null unique, reason text not null, created_at timestamptz not null default now());
create table public.message_orders(id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.organizations(id), pack jsonb not null, provider_order_id text unique, provider_payment_id text unique, status text not null default 'creating' check(status in ('creating','pending','paid')), created_at timestamptz not null default now());
create table public.message_jobs(id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.organizations(id), booking_id text not null, recipient text not null check(recipient in ('owner','customer')), channel text not null check(channel in ('email','sms','whatsapp')), status text not null default 'queued' check(status in ('queued','processing','held','sent','failed','unknown')), reason text not null default '', grant_id uuid references public.message_grants(id), provider_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(tenant_id,booking_id,recipient,channel));
create index message_job_queue on public.message_jobs(status,created_at);
create index message_grant_wallet on public.message_grants(tenant_id,channel);
create table public.message_credit_events(id bigint generated always as identity primary key,tenant_id uuid not null references public.organizations(id),channel text not null,action text not null,credits integer not null,reference text not null,created_at timestamptz not null default now());

create function public.message_enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare prefs public.message_preferences; c text; r text;
begin
 if new.kind<>'bookings' or new.body->>'status'<>'Confirmed' then return new; end if;
 if tg_op='UPDATE' then if old.body->>'status'='Confirmed' then return new; end if; end if;
 select * into prefs from public.message_preferences where tenant_id=new.tenant_id;
 foreach c in array array['email','sms','whatsapp'] loop
  if coalesce((prefs.channels->>c)::boolean,false) then
   foreach r in array array['owner','customer'] loop
    if (r='owner' and prefs.owner_alerts) or (r='customer' and prefs.customer_alerts) then
     insert into public.message_jobs(tenant_id,booking_id,recipient,channel) values(new.tenant_id,new.id,r,c) on conflict do nothing;
    end if;
   end loop;
  end if;
 end loop;return new;
end;$$;
create trigger message_booking_confirmed after insert or update on public.saas_records for each row execute function public.message_enqueue();

create function public.message_grant(t uuid,c text,n integer,src text,why text,expiry timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.message_grants(tenant_id,channel,credits,source,reason,expires_at) values(t,c,n,src,why,expiry) on conflict(source) do nothing;
 if found then insert into public.message_credit_events(tenant_id,channel,action,credits,reference) values(t,c,'grant',n,src);end if;
end;$$;
create function public.message_paid_allowance() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.saas_subscriptions; a record; expiry timestamptz;
begin
 select * into s from public.saas_subscriptions where tenant_id=new.tenant_id;
 -- One grant per paid-through cycle, even if providers emit multiple captured-payment events.
 if s.paid_through is null or s.paid_through<=now() then return new;end if;
 for a in select distinct on(channel) * from public.message_allowances where (scope='organization' and scope_id=new.tenant_id) or (scope='plan' and scope_id=s.plan_id) order by channel,case when scope='organization' then 0 else 1 end loop
  if a.credits>0 then
   expiry:=case when a.rollover then null else s.paid_through end;
   perform public.message_grant(new.tenant_id,a.channel,a.credits,'cycle:'||new.tenant_id||':'||extract(epoch from s.paid_through)::text||':'||a.channel,'Paid subscription allowance',expiry);
  end if;
 end loop;return new;
end;$$;
create trigger message_subscription_paid after insert on public.billing_payments for each row execute function public.message_paid_allowance();

create function public.message_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.message_jobs;
begin
 -- Never automatically retry an interrupted provider call.
 update public.message_jobs set status='unknown',reason='Interrupted send; reconcile with provider. No automatic retry.',updated_at=now() where status='processing' and updated_at<now()-interval '5 minutes';
 select * into j from public.message_jobs where status='queued' order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.message_jobs set status='processing',updated_at=now() where id=j.id;
 return to_jsonb(j);
end;$$;
create function public.message_reserve(jid uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.message_jobs; g public.message_grants;
begin
 select * into j from public.message_jobs where id=jid for update;
 if j.status<>'processing' or j.grant_id is not null then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(j.tenant_id::text||j.channel,0));
 select * into g from public.message_grants where tenant_id=j.tenant_id and channel=j.channel and credits>used and (expires_at is null or expires_at>now()) order by expires_at nulls last,created_at for update limit 1;
 if not found then return false;end if;
 update public.message_grants set used=used+1 where id=g.id;
 update public.message_jobs set grant_id=g.id,updated_at=now() where id=jid;
 insert into public.message_credit_events(tenant_id,channel,action,credits,reference) values(j.tenant_id,j.channel,'reserve',1,jid::text);return true;
end;$$;
create function public.message_finish(jid uuid,outcome text,why text,pid text default null) returns void language plpgsql security definer set search_path='' as $$
declare j public.message_jobs;
begin
 if outcome not in ('held','sent','failed','unknown') then raise exception 'Invalid outcome';end if;
 select * into j from public.message_jobs where id=jid for update;
 if j.status<>'processing' then return;end if;
 if outcome='sent' and j.grant_id is null then raise exception 'Missing reservation';end if;
 if j.grant_id is not null then
  if outcome in ('failed','held') then update public.message_grants set used=used-1 where id=j.grant_id;end if;
  insert into public.message_credit_events(tenant_id,channel,action,credits,reference) values(j.tenant_id,j.channel,case when outcome in ('failed','held') then 'release' when outcome='sent' then 'charge' else 'uncertain' end,1,jid::text);
 end if;
 update public.message_jobs set status=outcome,reason=why,provider_id=pid,updated_at=now(),grant_id=case when outcome in ('failed','held') then null else grant_id end where id=jid;
end;$$;
create function public.message_recharge(oid text,pid text,amount bigint) returns void language plpgsql security definer set search_path='' as $$
declare o public.message_orders;
begin
 select * into o from public.message_orders where provider_order_id=oid for update;
 if not found then raise exception 'Unknown recharge order';end if;
 if (o.pack->>'price_paise')::bigint<>amount then raise exception 'Recharge amount mismatch';end if;
 if o.status='paid' then return;end if;
 perform public.message_grant(o.tenant_id,o.pack->>'channel',(o.pack->>'credits')::integer,'recharge:'||o.id,'Purchased credit pack');
 update public.message_orders set status='paid',provider_payment_id=pid where id=o.id;
end;$$;

-- All access goes through authenticated, tenant-scoped Express routes. No browser table grants.
do $$declare t text; f record;begin
 foreach t in array array['platform_integrations','message_preferences','message_consents','message_packs','message_allowances','message_grants','message_orders','message_jobs','message_credit_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('message_enqueue','message_grant','message_paid_allowance','message_claim','message_reserve','message_finish','message_recharge') loop
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end;$$;
grant usage,select on sequence public.message_credit_events_id_seq to service_role;

create function public.message_summary(t uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('balances',coalesce((select jsonb_object_agg(c,n) from (select channel c,sum(credits-used) n from public.message_grants where (t is null or tenant_id=t) and (expires_at is null or expires_at>now()) group by channel) q),'{}'), 'counts',coalesce((select jsonb_object_agg(c,n) from (select channel c,jsonb_object_agg(status,n) n from (select channel,status,count(*) n from public.message_jobs where t is null or tenant_id=t group by channel,status) q group by channel) q),'{}'),'charged',coalesce((select jsonb_object_agg(c,n) from (select channel c,sum(credits) n from public.message_credit_events where action='charge' and (t is null or tenant_id=t) group by channel) q),'{}'));
$$;
revoke all on function public.message_summary(uuid) from public,anon,authenticated;
grant execute on function public.message_summary(uuid) to service_role;

create function public.message_reconcile(jid uuid,accepted boolean,evidence text,actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.message_jobs;
begin
 if not exists(select 1 from public.platform_admins where user_id=actor) or length(evidence)<10 then raise exception 'Administrator and evidence required';end if;
 select * into j from public.message_jobs where id=jid for update;
 if j.status<>'unknown' then raise exception 'Only uncertain messages may be reconciled';end if;
 if accepted and j.grant_id is null then raise exception 'No credit reservation; cannot mark accepted';end if;
 if j.grant_id is not null then
  if not accepted then update public.message_grants set used=used-1 where id=j.grant_id;end if;
  insert into public.message_credit_events(tenant_id,channel,action,credits,reference) values(j.tenant_id,j.channel,case when accepted then 'charge' else 'release' end,1,jid::text);
 end if;
 update public.message_jobs set status=case when accepted then 'sent' else 'failed' end,reason='Provider outcome reconciled by platform administrator.',updated_at=now() where id=jid;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(actor,j.tenant_id,'message.reconciled',jsonb_build_object('id',jid,'accepted',accepted,'evidence',evidence));
end;$$;
revoke all on function public.message_reconcile(uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.message_reconcile(uuid,boolean,text,uuid) to service_role;

commit;
