-- Serialize invitation acceptance with directory deactivation/deletion and tenant suspension.
create or replace function public.saas_invite(actor uuid,t uuid,rid text) returns jsonb language plpgsql security definer set search_path='' as $$declare r public.saas_records;v public.saas_invitations;begin
 perform 1 from public.organizations where id=t and status='active' for update;if not found then raise exception 'Organization unavailable.';end if;
 if not exists(select 1 from public.memberships where user_id=actor and tenant_id=t and role='owner' and status='active') or not public.saas_has_access(t) then raise exception 'An active organization owner is required.';end if;
 select * into r from public.saas_records where tenant_id=t and id=rid and kind in ('staff','clients') and body->>'status'='Active';if not found then raise exception 'Choose an active team member or client.';end if;
 if exists(select 1 from public.profiles p join public.memberships m on m.user_id=p.id where lower(p.email)=lower(r.body->>'email')) then raise exception 'This email already belongs to an organization.';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(r.body->>'email'),0));
 if exists(select 1 from public.saas_invitations where lower(email)=lower(r.body->>'email') and status='pending' and expires_at>now() and tenant_id<>t) then raise exception 'This email has a pending invitation to another organization.';end if;
 update public.saas_invitations set status='cancelled' where lower(email)=lower(r.body->>'email') and status='pending' and (tenant_id=t or expires_at<=now());
 insert into public.saas_invitations(tenant_id,record_id,email,role) values(t,rid,lower(r.body->>'email'),case when r.kind='staff' then 'staff' else 'client' end) returning * into v;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(actor,t,'invitation.created',jsonb_build_object('record_id',rid));return to_jsonb(v);end;$$;


create or replace function public.saas_accept_invite(actor uuid,invitation_id uuid) returns void language plpgsql security definer set search_path='' as $$declare inv public.saas_invitations;recipient_email text;begin
 select lower(u.email) into recipient_email from auth.users u where u.id=actor and u.email_confirmed_at is not null;if recipient_email is null then raise exception 'Verify your email before accepting an invitation.';end if;
 -- Match the verified email before taking the tenant lock, then recheck the invitation.
 select * into inv from public.saas_invitations i where i.id=invitation_id and lower(i.email)=recipient_email;
 if not found then raise exception 'Invitation unavailable or expired.';end if;
 perform 1 from public.organizations where id=inv.tenant_id and status='active' for update;
 if not found then raise exception 'Organization unavailable.';end if;
 select * into inv from public.saas_invitations i where i.id=invitation_id and lower(i.email)=recipient_email and i.status='pending' and i.expires_at>now() for update;if not found then raise exception 'Invitation unavailable or expired.';end if;
 if not exists(select 1 from public.saas_records where id=inv.record_id and tenant_id=inv.tenant_id and body->>'status'='Active' and lower(body->>'email')=recipient_email) then raise exception 'Invitation no longer matches an active directory entry.';end if;
 if exists(select 1 from public.memberships where user_id=actor) then raise exception 'Account already belongs to an organization.';end if;
 insert into public.memberships(user_id,tenant_id,role,record_id) values(actor,inv.tenant_id,inv.role,inv.record_id);
 update public.saas_invitations set status='accepted' where id=inv.id;
 insert into public.audit_log(actor_id,tenant_id,action,details) values(actor,inv.tenant_id,'invitation.accepted','{}');end;$$;
