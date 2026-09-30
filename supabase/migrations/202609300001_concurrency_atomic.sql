-- Concurrency hardening: optimistic record versions, idempotent create keys, and atomic mutation+audit RPCs.
-- Addresses stale-edit lost updates, duplicate creates on retried requests, and mutation/audit partial failure.

alter table public.saas_records add column if not exists version integer not null default 1;
alter table public.saas_records add column if not exists idempotency_key text;
create unique index if not exists saas_records_idempotency_idx on public.saas_records(tenant_id,kind,idempotency_key) where idempotency_key is not null;

-- Replaces the six-argument version: adds optional expected_version (stale-edit guard)
-- and request_key (stable idempotency key for creates that are safe to retry).
drop function if exists public.saas_save_record(uuid,uuid,text,text,jsonb,boolean);
create function public.saas_save_record(actor uuid,t uuid,k text,rid text,b jsonb,is_new boolean,expected_version integer default null,request_key text default null) returns jsonb language plpgsql security definer set search_path='' as $$declare m public.memberships;sub public.saas_subscriptions;n integer;paid numeric;old public.saas_records;dup public.saas_records;clean jsonb;hall jsonb;capacity numeric;v integer;begin
 perform 1 from public.organizations where id=t for update;if not found then raise exception 'Organization not found.';end if;
 select * into m from public.memberships where user_id=actor and tenant_id=t and status='active';if not found then raise exception 'Access denied.';end if;
 if not public.saas_has_access(t) then raise exception 'Subscription inactive. Renew before making changes.';end if;
 if k is null or k not in ('halls','bookings','clients','staff','payments','plans','addons') then raise exception 'Invalid resource.';end if;
 if m.role='client' and (k<>'bookings' or not is_new or b->>'clientId' is distinct from m.record_id or b->>'status' is distinct from 'Pending') then raise exception 'Client action not allowed.';end if;
 if m.role='staff' and k in ('halls','staff','plans','addons') then raise exception 'Only owners can manage this resource.';end if;
 -- A retry of an already-committed create returns the original record instead of duplicating it.
 if is_new and request_key is not null then
  select * into dup from public.saas_records where tenant_id=t and kind=k and idempotency_key=request_key;
  if found then return dup.body||jsonb_build_object('id',dup.id,'version',dup.version,'deduplicated',true);end if;
 end if;
 select * into old from public.saas_records where id=rid and tenant_id=t and kind=k;
 if not is_new and not found then raise exception 'Record not found.';end if;
 -- Optimistic concurrency: reject updates based on an outdated view of the record.
 if not is_new and expected_version is not null and old.version is distinct from expected_version then raise exception 'STALE_RECORD: Another change was saved after you opened this record. The latest version was reloaded; review it and save again.';end if;
 select * into sub from public.saas_subscriptions where tenant_id=t;
 if k='halls' and is_new then select count(*) into n from public.saas_records where tenant_id=t and kind='halls';if n>=(sub.plan_snapshot->>'max_halls')::int then raise exception 'Your subscription hall limit has been reached.';end if;end if;
 if k='staff' and b->>'status'='Active' then select count(*) into n from public.saas_records where tenant_id=t and kind='staff' and body->>'status'='Active' and id<>rid;if n>=(sub.plan_snapshot->>'max_staff')::int then raise exception 'Your subscription team limit has been reached.';end if;end if;
 if jsonb_typeof(b) is distinct from 'object' then raise exception 'Record body must be an object.';end if;
 if k='halls' then
  if jsonb_typeof(b->'capacity') is distinct from 'number' or (b->>'capacity')::numeric<1 or (b->>'capacity')::numeric>10000 or trunc((b->>'capacity')::numeric)<>(b->>'capacity')::numeric then raise exception 'Hall capacity must be a whole number between 1 and 10000.';end if;
 end if;
 if k='bookings' then
  if b->>'status' is null or b->>'status' not in ('Pending','Confirmed','Completed','Cancelled') then raise exception 'Choose a valid booking status.';end if;
  perform public.booking_window(b);
  if jsonb_typeof(b->'total') is distinct from 'number' or (b->>'total')::numeric<0 then raise exception 'Booking total must be a non-negative number.';end if;
  select body into hall from public.saas_records where tenant_id=t and kind='halls' and id=b->>'hallId';
  capacity:=(hall->>'capacity')::numeric;
  if capacity is null then raise exception 'Choose a valid hall and client.';end if;
  if jsonb_typeof(b->'guests') is distinct from 'number' or (b->>'guests')::numeric<1 or trunc((b->>'guests')::numeric)<>(b->>'guests')::numeric or (b->>'guests')::numeric>capacity then raise exception 'Guest count exceeds current hall capacity or is invalid.';end if;
  if greatest(coalesce((b->>'guaranteedPlates')::numeric,0),coalesce((b->>'actualGuests')::numeric,0),coalesce((b->'quote'->>'billedPlates')::numeric,0))>capacity then raise exception 'Attendance exceeds current hall capacity.';end if;
  if hall->>'status'='Maintenance' and (is_new or old.body->>'hallId' is distinct from b->>'hallId') then raise exception 'This hall is under maintenance.';end if;
  if not exists(select 1 from public.saas_records where tenant_id=t and kind='halls' and id=b->>'hallId') or not exists(select 1 from public.saas_records where tenant_id=t and kind='clients' and id=b->>'clientId') then raise exception 'Choose a valid hall and client.';end if;
  if b->>'status'<>'Cancelled' and exists(select 1 from public.saas_records x where x.tenant_id=t and x.kind='bookings' and x.id<>rid and x.body->>'hallId'=b->>'hallId' and x.body->>'status'<>'Cancelled' and public.booking_window(x.body)&&public.booking_window(b)) then raise exception 'Hall unavailable for the selected duration.';end if;
  select coalesce(sum((body->>'amount')::numeric),0) into paid from public.saas_records where tenant_id=t and kind='payments' and body->>'bookingId'=rid;if (b->>'total')::numeric<paid then raise exception 'Booking total is below payments received.';end if;
 end if;
 if k='payments' then
  if jsonb_typeof(b->'amount') is distinct from 'number' or (b->>'amount')::numeric<=0 then raise exception 'Payment amount must be positive.';end if;
  select * into old from public.saas_records where tenant_id=t and kind='bookings' and id=b->>'bookingId';if not found then raise exception 'Booking not found.';end if;
  select coalesce(sum((body->>'amount')::numeric),0) into paid from public.saas_records where tenant_id=t and kind='payments' and body->>'bookingId'=old.id and id<>rid;if paid+(b->>'amount')::numeric>(old.body->>'total')::numeric then raise exception 'Payment exceeds remaining balance.';end if;
 end if;
 clean:=b-'operationsNotes';
 if is_new then
  v:=1;
  begin
   insert into public.saas_records(id,tenant_id,kind,body,version,idempotency_key) values(rid,t,k,clean,v,request_key);
  exception when unique_violation then
   -- Concurrent retry of the same request key committed first; return it instead of a second record.
   if request_key is null then raise;end if;
   select * into dup from public.saas_records where tenant_id=t and kind=k and idempotency_key=request_key;
   if found then return dup.body||jsonb_build_object('id',dup.id,'version',dup.version,'deduplicated',true);end if;
   raise;
  end;
 else update public.saas_records set body=clean,version=old.version+1,updated_at=now() where id=rid and tenant_id=t;v:=old.version+1;end if;
 if k='bookings' then insert into public.record_private(record_id,tenant_id,operations_notes) values(rid,t,case when m.role='client' then '' else coalesce(b->>'operationsNotes','') end) on conflict(record_id) do update set operations_notes=excluded.operations_notes;end if;
 if k in ('staff','clients') then update public.memberships set status=case when b->>'status'='Active' then 'active' else 'inactive' end where tenant_id=t and record_id=rid;end if;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(actor,t,k||case when is_new then '.created' else '.updated' end,jsonb_build_object('record_id',rid));return clean||jsonb_build_object('id',rid,'version',v);end;$$;

-- Integration settings: revision compare-and-save and its audit entry commit in one transaction.
create or replace function public.platform_save_integration(p_kind text,p_actor uuid,p_enabled boolean,p_encrypted text,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$declare v integer;begin
 update public.platform_integrations set enabled=p_enabled,encrypted=p_encrypted,revision=revision+1,updated_at=now() where kind=p_kind and revision=p_expected returning revision into v;
 if not found then
  if p_expected<>0 then raise exception 'STALE_SETTINGS: Settings changed. Reload before saving.';end if;
  insert into public.platform_integrations(kind,enabled,encrypted,revision) values(p_kind,p_enabled,p_encrypted,1) returning revision into v;
 end if;
 insert into public.audit_log(actor_id,action,details) values(p_actor,'integration.updated',jsonb_build_object('kind',p_kind,'enabled',p_enabled,'revision',v));
 return jsonb_build_object('revision',v);end;$$;

create or replace function public.message_save_prefs(p_actor uuid,p_t uuid,p_channels jsonb,p_owner boolean,p_customer boolean) returns void language plpgsql security definer set search_path='' as $$begin
 insert into public.message_preferences(tenant_id,channels,owner_alerts,customer_alerts) values(p_t,p_channels,p_owner,p_customer) on conflict(tenant_id) do update set channels=excluded.channels,owner_alerts=excluded.owner_alerts,customer_alerts=excluded.customer_alerts;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(p_actor,p_t,'messages.preferences',jsonb_build_object('channels',p_channels,'owner_alerts',p_owner,'customer_alerts',p_customer));end;$$;

create or replace function public.message_save_consent(p_actor uuid,p_t uuid,p_client text,p_channel text,p_destination text,p_allowed boolean,p_evidence text) returns void language plpgsql security definer set search_path='' as $$begin
 if p_channel not in ('email','sms','whatsapp') then raise exception 'Choose a valid channel.';end if;
 insert into public.message_consents(tenant_id,client_id,channel,destination,allowed,evidence,actor_id,updated_at) values(p_t,p_client,p_channel,p_destination,p_allowed,p_evidence,p_actor,now()) on conflict(tenant_id,client_id,channel) do update set destination=excluded.destination,allowed=excluded.allowed,evidence=excluded.evidence,actor_id=excluded.actor_id,updated_at=now();
 insert into public.audit_log(actor_id,tenant_id,action,details) values(p_actor,p_t,'messages.consent',jsonb_build_object('client_id',p_client,'channel',p_channel,'allowed',p_allowed,'evidence',p_evidence,'destination',p_destination));end;$$;

create or replace function public.message_retry_job(p_jid uuid,p_actor uuid,p_t uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.message_jobs set status='queued',reason='',updated_at=now() where id=p_jid and status='held' and grant_id is null and (p_t is null or tenant_id=p_t);
 if not found then raise exception 'CONFLICT: Only held, uncharged messages can be retried.';end if;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(p_actor,p_t,'message.retry',jsonb_build_object('id',p_jid));end;$$;

create or replace function public.message_save_pack(p_actor uuid,p_pack jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 insert into public.message_packs(id,name,channel,credits,price_paise,active) values(coalesce(nullif(p_pack->>'id','')::uuid,gen_random_uuid()),p_pack->>'name',p_pack->>'channel',(p_pack->>'credits')::integer,(p_pack->>'price_paise')::bigint,(p_pack->>'active')::boolean) on conflict(id) do update set name=excluded.name,channel=excluded.channel,credits=excluded.credits,price_paise=excluded.price_paise,active=excluded.active;
 insert into public.audit_log(actor_id,action,details) values(p_actor,'messages.pack',p_pack);end;$$;

create or replace function public.message_save_allowance(p_actor uuid,p_scope text,p_scope_id uuid,p_channel text,p_credits integer,p_rollover boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if p_scope='plan' then perform 1 from public.saas_plans where id=p_scope_id;elsif p_scope='organization' then perform 1 from public.organizations where id=p_scope_id;else raise exception 'Choose a valid plan or organization.';end if;
 if not found then raise exception 'Choose a valid plan or organization.';end if;
 insert into public.message_allowances(scope,scope_id,channel,credits,rollover) values(p_scope,p_scope_id,p_channel,p_credits,p_rollover) on conflict(scope,scope_id,channel) do update set credits=excluded.credits,rollover=excluded.rollover;
 insert into public.audit_log(actor_id,action,details) values(p_actor,'messages.allowance',jsonb_build_object('scope',p_scope,'scope_id',p_scope_id,'channel',p_channel,'credits',p_credits,'rollover',p_rollover));end;$$;

-- Provider-order match is verified by the caller; the state change and its audit stay atomic here.
create or replace function public.message_reconcile_order(p_oid uuid,p_actor uuid,p_order_id text) returns void language plpgsql security definer set search_path='' as $$declare v_t uuid;begin
 update public.message_orders set provider_order_id=p_order_id,status='pending' where id=p_oid and status='creating' returning tenant_id into v_t;
 if not found then raise exception 'CONFLICT: Only uncertain order creation may be reconciled.';end if;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(p_actor,v_t,'messages.order_reconciled',jsonb_build_object('id',p_oid,'order_id',p_order_id));end;$$;

do $$declare f regprocedure;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('saas_save_record','platform_save_integration','message_save_prefs','message_save_consent','message_retry_job','message_save_pack','message_save_allowance','message_reconcile_order') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;end$$;
