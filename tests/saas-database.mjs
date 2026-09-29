import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { bookingDuration } from '../shared/booking-duration.js';
import { readFile, readdir } from 'node:fs/promises';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.test',now()),($2,'other@example.test',now())",[uid,other]);
const plan=(await db.query("update public.saas_plans set published=true where name='Starter' returning id")).rows[0];
const tenant=(await db.query('select public.saas_register_org($1,$2) as id',[uid,{name:'First venue',planId:plan.id,interval:'monthly'}])).rows[0].id;
const tenant2=(await db.query('select public.saas_register_org($1,$2) as id',[other,{name:'Second venue',planId:plan.id,interval:'monthly'}])).rows[0].id;
const save=(actor,t,kind,id,body,fresh=true)=>db.query('select public.saas_save_record($1,$2,$3,$4,$5,$6)',[actor,t,kind,id,body,fresh]);
await save(uid,tenant,'halls','h1',{name:'Hall',capacity:200,price:50000,status:'Available'});
await assert.rejects(save(uid,tenant,'halls','h2',{name:'Beyond quota'}),/hall limit/);
await assert.rejects(save(uid,tenant2,'halls','cross',{name:'Cross tenant'}),/Access denied/);
await save(uid,tenant,'clients','c1',{name:'Client',status:'Active'});
const booking={name:'Wedding',date:'2027-02-10',durationMode:'morning',time:'08:00',clientId:'c1',hallId:'h1',status:'Confirmed',guests:100,total:65000,operationsNotes:'PRIVATE NOTE'};
await save(uid,tenant,'bookings','b1',booking);await assert.rejects(save(uid,tenant,'bookings','b2',booking),/unavailable/);
await save(uid,tenant,'bookings','b3',{...booking,durationMode:'afternoon'});
await save(uid,tenant,'payments','pay1',{bookingId:'b1',amount:50000});await assert.rejects(save(uid,tenant,'payments','pay2',{bookingId:'b1',amount:20000}),/exceeds/);
await assert.rejects(save(uid,tenant,'bookings','b1',{...booking,total:40000},false),/below payments/);
await save(uid,tenant,'staff','staff-1',{name:'Staff one',email:'s1@example.test',status:'Active'});
await save(uid,tenant,'staff','staff-2',{name:'Staff two',email:'s2@example.test',status:'Active'});
await assert.rejects(save(uid,tenant,'staff','staff-over',{name:'Over quota',email:'s3@example.test',status:'Active'}),/team limit/i);
// Service RPCs recheck numeric and capacity invariants, not just the HTTP validator.
for(const amount of [-1,0,null,'10'])await assert.rejects(save(uid,tenant,'payments','bad-payment',{bookingId:'b1',amount}),/positive/);
for(const patch of [{total:-1},{total:null},{guests:201},{guests:1.5},{actualGuests:201},{guaranteedPlates:201},{status:null}])await assert.rejects(save(uid,tenant,'bookings','bad-booking',{...booking,date:'2027-03-01',...patch}));
// Model a capacity change between JS pre-validation and the locked database write.
await save(uid,tenant,'halls','h1',{name:'Hall',capacity:50,price:50000,status:'Available'},false);
await assert.rejects(save(uid,tenant,'bookings','stale-capacity',{...booking,date:'2027-03-01'}),/current hall capacity/);
await save(uid,tenant,'halls','h1',{name:'Hall',capacity:200,price:50000,status:'Maintenance'},false);
await assert.rejects(save(uid,tenant,'bookings','maintenance',{...booking,date:'2027-03-01'}),/maintenance/);
await save(uid,tenant,'halls','h1',{name:'Hall',capacity:200,price:50000,status:'Available'},false);
// SQL conflict windows must match the browser/server duration contract.
for(const duration of [
 {date:'2027-03-01'},
 ...['morning','afternoon','evening'].map(durationMode=>({date:'2027-03-01',durationMode,endDate:'2027-03-05'})),
 {date:'2027-03-01',durationMode:'multiple',endDate:'2027-03-31'},
 {date:'2027-03-01',durationMode:'custom',time:'23:00',endDate:'2027-03-02',bookingEndTime:'02:00'},
]){
 const expected=bookingDuration(duration),actual=(await db.query('select extract(epoch from lower(public.booking_window($1)))*1000 as start,extract(epoch from upper(public.booking_window($1)))*1000 as finish',[duration])).rows[0];
 assert.equal(Number(actual.start),expected.start);assert.equal(Number(actual.finish),expected.end);
}
for(const duration of [{},{date:'2027-02-30'},{date:'2027-03-01',durationMode:'invalid'},{date:'2027-03-01',durationMode:'custom'},{date:'2027-03-01',durationMode:'custom',time:'12:00',bookingEndTime:'24:00'},{date:'2027-03-01',durationMode:'multiple',endDate:'2027-04-01'}])await assert.rejects(db.query('select public.booking_window($1)',[duration]));
// Invitations are tenant-bound and explicitly selected; identical client bodies cannot leak IDs.
const invited='00000000-0000-4000-8000-000000000003';
await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'guest@example.test',now())",[invited]);
const person={name:'Guest',email:'guest@example.test',status:'Active'};
await save(uid,tenant,'clients','invite-client',person);await save(uid,tenant,'clients','identical-client',person);await save(other,tenant2,'clients','other-invite-client',person);
const invitation=(await db.query('select public.saas_invite($1,$2,$3) as value',[uid,tenant,'invite-client'])).rows[0].value;
await assert.rejects(db.query('select public.saas_invite($1,$2,$3)',[other,tenant2,'other-invite-client']),/pending invitation/);
assert.equal((await db.query('select * from public.memberships where user_id=$1',[invited])).rows.length,0);
await assert.rejects(db.query('select public.saas_accept_invite($1,$2)',[other,invitation.id]),/unavailable/);
await db.query('select public.saas_accept_invite($1,$2)',[invited,invitation.id]);
await db.exec(`set role authenticated;set request.jwt.claim.sub='${invited}';set request.jwt.claims='{"aal":"aal1"}';`);
const clientRows=(await db.query("select id from public.saas_records where kind='clients'")).rows;assert.deepEqual(clientRows,[{id:'invite-client'}]);
assert.equal((await db.query('select * from public.record_private')).rows.length,0);
await db.exec('reset role');
// Pending invitations become unusable when the directory or organization changes.
const pendingUser='00000000-0000-4000-8000-000000000005';
await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'pending@example.test',now())",[pendingUser]);
const pendingBody={name:'Pending recipient',email:'pending@example.test',status:'Active'};
await save(uid,tenant,'clients','pending-client',pendingBody);
const pendingInvite=(await db.query('select public.saas_invite($1,$2,$3) as value',[uid,tenant,'pending-client'])).rows[0].value;
await save(uid,tenant,'clients','pending-client',{...pendingBody,status:'Inactive'},false);
await assert.rejects(db.query('select public.saas_accept_invite($1,$2)',[pendingUser,pendingInvite.id]),/active directory entry/);
await save(uid,tenant,'clients','pending-client',{...pendingBody,email:'changed@example.test'},false);
await assert.rejects(db.query('select public.saas_accept_invite($1,$2)',[pendingUser,pendingInvite.id]),/active directory entry/);
await save(uid,tenant,'clients','pending-client',pendingBody,false);
await db.query("update public.organizations set status='suspended' where id=$1",[tenant]);
await assert.rejects(db.query('select public.saas_accept_invite($1,$2)',[pendingUser,pendingInvite.id]),/Organization unavailable/);
await db.query("update public.organizations set status='active' where id=$1",[tenant]);
await db.query("update public.saas_invitations set expires_at=now()-interval '1 day' where id=$1",[pendingInvite.id]);
await assert.rejects(db.query('select public.saas_accept_invite($1,$2)',[pendingUser,pendingInvite.id]),/expired/);
assert.equal((await db.query('select * from public.memberships where user_id=$1',[pendingUser])).rows.length,0);
// Platform identity alone grants no cross-tenant booking access; metadata needs AAL2.
const administrator='00000000-0000-4000-8000-000000000004';
await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'admin@example.test',now())",[administrator]);
await db.query('insert into public.platform_admins(user_id) values($1)',[administrator]);
await db.exec(`set role authenticated;set request.jwt.claim.sub='${administrator}';set request.jwt.claims='{"aal":"aal1"}';`);
assert.equal((await db.query('select * from public.organizations')).rows.length,0);
assert.equal((await db.query('select * from public.audit_log')).rows.length,0);
await db.exec(`set request.jwt.claims='{"aal":"aal2"}';`);
assert.equal((await db.query('select * from public.organizations')).rows.length,2);
assert((await db.query('select * from public.audit_log')).rows.length>0);
assert.equal((await db.query('select * from public.saas_records')).rows.length,0);
assert.equal((await db.query('select * from public.record_private')).rows.length,0);
await assert.rejects(db.query('select public.saas_platform_usage($1)',[administrator]),/permission denied/);
await db.exec('reset role');
await db.exec('set role service_role');
assert.equal((await db.query('select * from public.saas_platform_usage($1)',[administrator])).rows.find(r=>r.tenant_id===tenant).halls,1);
await assert.rejects(db.query('select * from public.saas_platform_usage($1)',[uid]),/administrator required/);
await db.exec('reset role');
// Mandate authentication retains the original unexpired trial, without claiming a paid period.
await db.query("update public.saas_subscriptions set status='authenticated' where tenant_id=$1",[tenant]);
assert.equal((await db.query('select public.saas_has_access($1) as ok',[tenant])).rows[0].ok,true);
// RLS read isolation and direct-write/RPC denials.
await db.exec(`set role authenticated;set request.jwt.claim.sub='${other}';set request.jwt.claims='{"aal":"aal1"}';`);
assert.deepEqual((await db.query('select id from public.saas_records')).rows,[{id:'other-invite-client'}]);
await assert.rejects(db.query("insert into public.saas_records(id,tenant_id,kind,body) values('direct',$1,'halls','{}')",[tenant2]),/permission denied/);
await assert.rejects(db.query('select public.saas_save_record($1,$2,\'halls\',\'bypass\',\'{}\',true)',[other,tenant2]),/permission denied/);
await db.exec('reset role');
await db.query("update public.saas_subscriptions set trial_until=now()-interval '1 day' where tenant_id=$1",[tenant]);
await assert.rejects(save(uid,tenant,'addons','expired',{name:'Expired'}),/Subscription inactive/);
// A checkout lease cannot be created twice; provider state and duplicate webhooks are monotonic/idempotent.
const claim=(await db.query('select public.saas_checkout_claim($1,$2) as value',[uid,tenant])).rows[0].value;
await assert.rejects(db.query('select public.saas_checkout_claim($1,$2)',[uid,tenant]),/reconciliation/);
await db.query("select public.saas_checkout_finish($1,$2,'sub_test')",[tenant,claim.checkout_token]);
const next=Math.floor(Date.now()/1000)+86400;
await db.query("select public.saas_sync_subscription('sub_test',now(),$1,'event1','subscription.charged')",[{status:'active',current_end:next,payment_id:'pay_provider',amount_paise:99900,currency:'INR',captured_at:next-86400}]);
await db.query("select public.saas_sync_subscription('sub_test',now(),$1,'event1','subscription.charged')",[{status:'active',current_end:next}]);
assert.equal((await db.query('select * from public.billing_events')).rows.length,1);assert.equal((await db.query('select * from public.billing_payments')).rows.length,1);
assert.equal((await db.query('select public.saas_has_access($1) as ok',[tenant])).rows[0].ok,true);
// A late provider observation cannot regress state or shorten earned access.
await db.query("select public.saas_sync_subscription('sub_test',now()-interval '1 day',$1,'event-old','subscription.pending')",[{status:'pending',current_end:0}]);
assert.equal((await db.query('select status from public.saas_subscriptions where tenant_id=$1',[tenant])).rows[0].status,'active');
await db.query("select public.saas_sync_subscription('sub_test',now()+interval '1 second',$1,'event-cancel','subscription.cancelled')",[{status:'cancelled',current_end:0,cancel_at_period_end:true}]);
assert.equal((await db.query('select public.saas_has_access($1) as ok',[tenant])).rows[0].ok,true);
// Re-delivery under a different event ID still cannot duplicate the same captured payment.
await db.query("select public.saas_sync_subscription('sub_test',now(),$1,'event-repeat-payment','subscription.charged')",[{status:'active',current_end:next,payment_id:'pay_provider',amount_paise:99900,currency:'INR',captured_at:next-86400}]);
assert.equal((await db.query('select * from public.billing_payments')).rows.length,1);
await db.query("update public.organizations set status='suspended' where id=$1",[tenant]);
await assert.rejects(save(uid,tenant,'addons','suspended',{name:'Blocked'}),/Subscription inactive/);
// Platform CMS: independent drafts, publication snapshots, optimistic revisions and private enquiries.
const cmsWrite=async(action,p)=>(await db.query('select public.saas_cms_write($1,$2,$3) as entry',[administrator,action,p])).rows[0].entry;
const cmsDoc={title:'A test story',summary:'A summary',body:'## Heading\nPlain text content',cta_label:'Read more',seo_title:'A test story',seo_description:'A summary',category:'Testing'};
await assert.rejects(db.query('select public.saas_cms_write($1,$2,$3)',[uid,'save',{kind:'blog',slug:'forbidden',locale:'en',draft:cmsDoc}]),/administrator required/);
let cmsEntry=await cmsWrite('save',{kind:'blog',slug:'test-story',locale:'en',draft:cmsDoc});assert.equal(cmsEntry.published,null);
await assert.rejects(cmsWrite('publish',{id:cmsEntry.id,revision:99}),/another session/);
cmsEntry=await cmsWrite('publish',{id:cmsEntry.id,revision:cmsEntry.revision});assert.equal(cmsEntry.published.title,'A test story');
await assert.rejects(cmsWrite('delete',{id:cmsEntry.id,revision:cmsEntry.revision}),/Unpublish/);
cmsEntry=await cmsWrite('save',{id:cmsEntry.id,revision:cmsEntry.revision,kind:'blog',slug:'test-story',locale:'en',draft:{...cmsDoc,title:'Draft must stay private'}});
assert.equal(cmsEntry.published.title,'A test story');assert.equal(cmsEntry.draft.title,'Draft must stay private');
await assert.rejects(cmsWrite('save',{id:cmsEntry.id,revision:cmsEntry.revision,kind:'blog',slug:'changed-url',locale:'en',draft:cmsDoc}),/cannot change/);
const oldest=(await db.query('select id from public.cms_history where entry_id=$1 order by revision limit 1',[cmsEntry.id])).rows[0];
cmsEntry=await cmsWrite('restore',{id:cmsEntry.id,revision:cmsEntry.revision,historyId:oldest.id});assert.equal(cmsEntry.draft.title,'A test story');
await assert.rejects(cmsWrite('restore',{id:cmsEntry.id,revision:cmsEntry.revision,historyId:administrator}),/Revision not found/);
cmsEntry=await cmsWrite('unpublish',{id:cmsEntry.id,revision:cmsEntry.revision});assert.equal(cmsEntry.published,null);
await cmsWrite('delete',{id:cmsEntry.id,revision:cmsEntry.revision});assert.equal((await db.query('select * from public.cms_history where entry_id=$1',[cmsEntry.id])).rows.length,0);
let policy=(await db.query("select * from public.cms_entries where kind='page' and slug='privacy' and locale='en'")).rows[0];assert.equal(policy.published,null);
const enquiry={name:'Test person',email:'person@example.test',organization:'Test venue',message:'A legitimate contact enquiry.',locale:'en',consent:true,policyId:policy.id,policyRevision:1};
await assert.rejects(db.query('select public.saas_cms_enquiry($1)',[enquiry]),/Privacy policy/);
policy=await cmsWrite('publish',{id:policy.id,revision:policy.revision});
await assert.rejects(db.query('select public.saas_cms_enquiry($1)',[{...enquiry,consent:false,policyRevision:policy.published_revision}]),/Consent/);
await assert.rejects(db.query('select public.saas_cms_enquiry($1)',[{...enquiry,locale:'hi',policyRevision:policy.published_revision}]),/Privacy policy/);
await db.query('select public.saas_cms_enquiry($1)',[{...enquiry,policyRevision:policy.published_revision}]);
const submitted=(await db.query('select * from public.cms_enquiries')).rows[0];assert.equal(submitted.policy_revision,policy.published_revision);
policy=await cmsWrite('publish',{id:policy.id,revision:policy.revision});
await assert.rejects(db.query('select public.saas_cms_enquiry($1)',[{...enquiry,policyRevision:submitted.policy_revision}]),/Privacy policy changed/);
await db.exec(`set role authenticated;set request.jwt.claim.sub='${uid}';set request.jwt.claims='{"aal":"aal2"}';`);
for(const table of ['cms_entries','cms_history','cms_enquiries'])assert.equal((await db.query('select * from public.'+table)).rows.length,0);
await assert.rejects(db.query('select public.saas_cms_write($1,$2,$3)',[administrator,'publish',{}]),/permission denied/);
await assert.rejects(db.query('select public.saas_cms_enquiry($1)',[enquiry]),/permission denied/);
await db.exec(`set request.jwt.claim.sub='${administrator}';set request.jwt.claims='{"aal":"aal1"}';`);
assert.equal((await db.query('select * from public.cms_entries')).rows.length,0);
await db.exec(`set request.jwt.claims='{"aal":"aal2"}';`);
assert((await db.query('select * from public.cms_entries')).rows.length>0);assert.equal((await db.query('select * from public.cms_enquiries')).rows.length,1);
await assert.rejects(db.query("update public.cms_entries set draft='{}'"),/permission denied/);
await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.cms_entries'),/permission denied/);await db.exec('reset role');
await assert.rejects(db.query('select public.saas_cms_enquiry_action($1,$2)',[uid,{id:submitted.id,action:'delete'}]),/administrator required/);
await db.query('select public.saas_cms_enquiry_action($1,$2)',[administrator,{id:submitted.id,action:'read'}]);assert.equal((await db.query('select status from public.cms_enquiries where id=$1',[submitted.id])).rows[0].status,'read');
await db.query('select public.saas_cms_enquiry_action($1,$2)',[administrator,{id:submitted.id,action:'delete'}]);assert.equal((await db.query('select * from public.cms_enquiries')).rows.length,0);
console.log('PASS CMS SQL: draft isolation, publish/unpublish, stale-write rejection, restore/delete, MFA/RLS permissions, policy-version consent and private enquiry deletion.');
console.log('PASS SaaS SQL (all migrations): RLS isolation, denied browser writes/RPCs, atomic quotas/conflicts/payments, expiry/suspension, checkout lease and webhook idempotency.');
await db.close();
