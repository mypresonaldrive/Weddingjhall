-- Apply after 202609290001_saas.sql. Recheck booking invariants under the organization write lock.
create or replace function public.booking_window(b jsonb) returns tstzrange
language plpgsql immutable security definer set search_path='' as $$
declare d date;e date;mode text:=coalesce(nullif(b->>'durationMode',''),'full');s timestamp;f timestamp;
begin
 if coalesce(b->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid event date.';end if;
 d:=(b->>'date')::date;
 if mode not in ('full','morning','afternoon','evening','multiple','custom') then raise exception 'Choose a valid booking duration.';end if;
 e:=d;
 if mode in ('multiple','custom') and nullif(b->>'endDate','') is not null then
  if b->>'endDate' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid end date.';end if;
  e:=(b->>'endDate')::date;
 end if;
 if e<d then raise exception 'End date must be on or after start date.';end if;
 if mode='morning' then s:=d+time '08:00';f:=d+time '14:00';
 elsif mode='afternoon' then s:=d+time '14:00';f:=d+time '20:00';
 elsif mode='evening' then s:=d+time '17:00';f:=d+time '23:00';
 elsif mode='custom' then
  if coalesce(b->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(b->>'bookingEndTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Enter valid booking start and end times.';end if;
  s:=d+(b->>'time')::time;f:=e+(b->>'bookingEndTime')::time;
 elsif mode='multiple' then s:=d;f:=e+1;
 else s:=d;f:=d+1;
 end if;
 if s is null or f is null or f<=s or f-s>interval '31 days' then raise exception 'Invalid booking duration.';end if;
 return tstzrange(s at time zone 'UTC',f at time zone 'UTC','[)');
end;$$;

create or replace function public.saas_save_record(actor uuid,t uuid,k text,rid text,b jsonb,is_new boolean) returns jsonb language plpgsql security definer set search_path='' as $$declare m public.memberships;sub public.saas_subscriptions;n integer;paid numeric;old public.saas_records;clean jsonb;hall jsonb;capacity numeric;begin
 perform 1 from public.organizations where id=t for update;if not found then raise exception 'Organization not found.';end if;
 select * into m from public.memberships where user_id=actor and tenant_id=t and status='active';if not found then raise exception 'Access denied.';end if;
 if not public.saas_has_access(t) then raise exception 'Subscription inactive. Renew before making changes.';end if;
 if k is null or k not in ('halls','bookings','clients','staff','payments','plans','addons') then raise exception 'Invalid resource.';end if;
 if m.role='client' and (k<>'bookings' or not is_new or b->>'clientId' is distinct from m.record_id or b->>'status' is distinct from 'Pending') then raise exception 'Client action not allowed.';end if;
 if m.role='staff' and k in ('halls','staff','plans','addons') then raise exception 'Only owners can manage this resource.';end if;
 select * into old from public.saas_records where id=rid and tenant_id=t and kind=k;
 if not is_new and not found then raise exception 'Record not found.';end if;
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
 clean:=b-'operationsNotes';if is_new then insert into public.saas_records(id,tenant_id,kind,body) values(rid,t,k,clean);else update public.saas_records set body=clean,updated_at=now() where id=rid and tenant_id=t;end if;
 if k='bookings' then insert into public.record_private(record_id,tenant_id,operations_notes) values(rid,t,case when m.role='client' then '' else coalesce(b->>'operationsNotes','') end) on conflict(record_id) do update set operations_notes=excluded.operations_notes;end if;
 if k in ('staff','clients') then update public.memberships set status=case when b->>'status'='Active' then 'active' else 'inactive' end where tenant_id=t and record_id=rid;end if;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(actor,t,k||case when is_new then '.created' else '.updated' end,jsonb_build_object('record_id',rid));return clean||jsonb_build_object('id',rid);end;$$;


revoke all on function public.booking_window(jsonb) from public,anon,authenticated;
grant insert on public.audit_log to service_role;

-- The agreed trial deadline is independent of intermediate provider mandate states.
-- Authentication of a mandate must not remove a trial before paid activation.
create or replace function public.saas_has_access(t uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organizations o join public.saas_subscriptions s on s.tenant_id=o.id
 where o.id=t and o.status='active' and (s.paid_through>now() or s.trial_until>now()))
$$;
