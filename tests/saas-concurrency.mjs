// Concurrency hardening tests: optimistic record versions, idempotent creates,
// and atomic mutation+audit RPCs (settings, preferences, consent, retry, packs, allowances, order reconciliation).
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
const uid='00000000-0000-4000-8000-000000000011';
await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.test',now())",[uid]);
const plan=(await db.query("update public.saas_plans set published=true where name='Starter' returning id")).rows[0];
const tenant=(await db.query('select public.saas_register_org($1,$2) as id',[uid,{name:'Concurrency venue',planId:plan.id,interval:'monthly'}])).rows[0].id;
const count=async(sql,params=[])=>Number((await db.query(sql,params)).rows[0].n);
const save=(kind,id,body,fresh=true,extra={})=>db.query('select public.saas_save_record($1,$2,$3,$4,$5,$6,$7,$8) as saved',[uid,tenant,kind,id,body,fresh,extra.expected??null,extra.key??null]).then(r=>r.rows[0].saved);

// Preferences before bookings so the enqueue trigger produces jobs; upsert and audit are one transaction.
await db.query('select public.message_save_prefs($1,$2,$3,$4,$5)',[uid,tenant,{whatsapp:true},true,true]);
await db.query('select public.message_save_prefs($1,$2,$3,$4,$5)',[uid,tenant,{whatsapp:true,sms:true},true,true]);
assert.equal(await count('select count(*) n from public.message_preferences where tenant_id=$1',[tenant]),1);
assert.equal((await db.query("select (channels->>'sms')::boolean sms from public.message_preferences where tenant_id=$1",[tenant])).rows[0].sms,true);
assert.equal(await count("select count(*) n from public.audit_log where action='messages.preferences'"),2);

// Optimistic version lifecycle: create at v1, matching update increments, stale expected version is rejected.
let hall=await save('halls','ch1',{name:'Hall',capacity:100,price:1000,status:'Available'});
assert.equal(hall.version,1);
hall=await save('halls','ch1',{name:'Hall v2',capacity:100,price:1000,status:'Available'},false,{expected:1});
assert.equal(hall.version,2);
await assert.rejects(save('halls','ch1',{name:'Hall v3',capacity:100,price:1000,status:'Available'},false,{expected:1}),/STALE_RECORD: Another change was saved/);
hall=await save('halls','ch1',{name:'Hall v3',capacity:100,price:1000,status:'Available'},false);
assert.equal(hall.version,3,'callers without a version keep the documented legacy behavior');
await assert.rejects(save('halls','missing-hall',{name:'X',capacity:1,price:1,status:'Available'},false,{expected:1}),/Record not found/);

await save('clients','cc1',{name:'Client',status:'Active'});
await db.query('select public.message_save_consent($1,$2,$3,$4,$5,$6,$7)',[uid,tenant,'cc1','whatsapp','+919999999999',true,'Recorded while signing the event agreement']);
assert.equal((await db.query('select allowed from public.message_consents where tenant_id=$1',[tenant])).rows[0].allowed,true);
assert.equal(await count("select count(*) n from public.audit_log where action='messages.consent'"),1);

await save('bookings','cb1',{name:'Wedding',date:'2027-05-01',durationMode:'morning',time:'08:00',clientId:'cc1',hallId:'ch1',status:'Confirmed',guests:50,total:10000});
const jobs=(await db.query('select id,status from public.message_jobs where tenant_id=$1',[tenant])).rows;
assert(jobs.length>=2,'booking commit still enqueues notification jobs atomically');

// Idempotent create: a retried request with a new server id but the same request key returns the original record.
const key='11111111-2222-4333-8444-555555555555';
const first=await save('payments','cp1',{bookingId:'cb1',amount:1000},true,{key});
const retried=await save('payments','cp2-a-different-retry-id',{bookingId:'cb1',amount:1000},true,{key});
assert.equal(retried.deduplicated,true);assert.equal(retried.id,first.id);
assert.equal(await count("select count(*) n from public.saas_records where kind='payments'"),1,'no duplicate payment was stored');
assert.equal(await count("select count(*) n from public.audit_log where action='payments.created'"),1,'no duplicate audit entry');
const distinct=await save('payments','cp3',{bookingId:'cb1',amount:500},true,{key:'11111111-2222-4333-8444-666666666666'});
assert(!distinct.deduplicated);assert.equal(distinct.id,'cp3');
await assert.rejects(save('payments','cp4',{bookingId:'cb1',amount:99000},true,{key:'11111111-2222-4333-8444-777777777777'}),/exceeds remaining balance/);

// The previous six-argument call shape remains valid for existing integrations.
await db.query('select public.saas_save_record($1,$2,$3,$4,$5,$6)',[uid,tenant,'clients','cc2',{name:'Compat caller',status:'Active'},true]);

// Integration settings: revision compare-and-save plus audit commit together.
const si=(enabled,expected)=>db.query('select public.platform_save_integration($1,$2,$3,$4,$5) as r',['email',uid,enabled,'ciphertext',expected]).then(r=>r.rows[0].r);
assert.equal((await si(true,0)).revision,1);
assert.equal((await si(false,1)).revision,2);
await assert.rejects(si(true,1),/STALE_SETTINGS/);
assert.equal(await count("select count(*) n from public.audit_log where action='integration.updated'"),2,'failed saves leave no audit row');
assert.deepEqual((await db.query("select revision,enabled from public.platform_integrations where kind='email'")).rows[0],{revision:2,enabled:false});

// Held-message retry: atomic conditional transition plus audit.
const held=jobs[0].id;
await db.query("update public.message_jobs set status='held' where id=$1",[held]);
await db.query('select public.message_retry_job($1,$2,$3)',[held,uid,tenant]);
assert.equal((await db.query('select status from public.message_jobs where id=$1',[held])).rows[0].status,'queued');
await assert.rejects(db.query('select public.message_retry_job($1,$2,$3)',[held,uid,tenant]),/Only held/);
assert.equal(await count("select count(*) n from public.audit_log where action='message.retry'"),1);

// Packs, allowances and uncertain-order reconciliation mutate and audit atomically.
await db.query('select public.message_save_pack($1,$2)',[uid,{name:'Concurrency pack',channel:'whatsapp',credits:100,price_paise:99000,active:true}]);
assert.equal(await count("select count(*) n from public.message_packs where name='Concurrency pack'"),1);
await db.query('select public.message_save_allowance($1,$2,$3,$4,$5,$6)',[uid,'organization',tenant,'whatsapp',50,false]);
await assert.rejects(db.query('select public.message_save_allowance($1,$2,$3,$4,$5,$6)',[uid,'organization','00000000-0000-4000-8000-999999999999','whatsapp',50,false]),/valid plan or organization/);
const order=(await db.query("insert into public.message_orders(tenant_id,pack) values($1,'{}') returning id",[tenant])).rows[0];
await db.query('select public.message_reconcile_order($1,$2,$3)',[order.id,uid,'order_TEST123']);
assert.equal((await db.query('select status from public.message_orders where id=$1',[order.id])).rows[0].status,'pending');
await assert.rejects(db.query('select public.message_reconcile_order($1,$2,$3)',[order.id,uid,'order_TEST123']),/Only uncertain/);

// Privileged RPCs stay service-role only; tenant-facing roles cannot call them directly.
await db.exec(`set role authenticated;set request.jwt.claim.sub='${uid}';set request.jwt.claims='{"aal":"aal1"}';`);
await assert.rejects(db.query('select public.platform_save_integration($1,$2,$3,$4,$5)',['email',uid,true,'x',0]),/permission denied/i);
await assert.rejects(db.query('select public.message_save_prefs($1,$2,$3,$4,$5)',[uid,tenant,{},true,true]),/permission denied/i);
await assert.rejects(db.query('select public.saas_save_record($1,$2,$3,$4,$5,$6)',[uid,tenant,'clients','cc3',{name:'Nope',status:'Active'},true]),/permission denied/i);
await db.exec('reset role');
console.log('PASS concurrency hardening: optimistic versions and stale conflicts, idempotent creates without duplicate payments or audits, atomic settings/consent/preferences/retry/pack/allowance/reconcile transitions, and service-role-only RPC enforcement.');
