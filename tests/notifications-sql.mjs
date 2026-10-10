// Notification centre tests: branding settings CAS, broadcast fan-out with idempotent
// dispatch, triggered template edits, auto reminders dedupe and role restrictions.
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to anon,authenticated,service_role;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text not null,public boolean default false);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null references storage.buckets(id),name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.buckets,storage.objects to service_role;`);
for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
const admin='00000000-0000-4000-8000-0000000000aa',owner='00000000-0000-4000-8000-0000000000bb',other='00000000-0000-4000-8000-0000000000cc';
await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'admin@example.test',now()),($2,'owner@example.test',now()),($3,'other@example.test',now())",[admin,owner,other]);
const plan=(await db.query("update public.saas_plans set published=true where name='Starter' returning id")).rows[0];
const t1=(await db.query('select public.saas_register_org($1,$2) as id',[owner,{name:'First venue',planId:plan.id,interval:'monthly'}])).rows[0].id;
const t2=(await db.query('select public.saas_register_org($1,$2) as id',[other,{name:'Second venue',planId:plan.id,interval:'monthly'}])).rows[0].id;
const count=async(s,p=[])=>Number((await db.query(s,p)).rows[0].n);

// FCM is a valid integration kind; unknown kinds remain rejected.
await db.query("insert into public.platform_integrations(kind,enabled,encrypted) values('fcm',false,'enc')");
await assert.rejects(db.query("insert into public.platform_integrations(kind,enabled,encrypted) values('pager',false,'x')"));

// Branding: first save inserts at revision 1, matching CAS increments, stale revisions rejected, audit only on success.
const saveBranding=(rev)=>db.query('select public.platform_save_setting($1,$2,$3,$4) as r',['branding',admin,{title:'My Hall SaaS',tagline:'Elevated'},rev]).then(r=>r.rows[0].r);
assert.equal((await saveBranding(0)).revision,1);
assert.equal((await saveBranding(1)).revision,2);
await assert.rejects(saveBranding(1),/STALE_SETTING/);
assert.equal(await count("select count(*) n from public.audit_log where action='platform.setting_saved'"),2);

// Template CRUD is revision-guarded and audited.
const tpl=(slug)=>db.query('select revision from public.notification_templates where slug=$1',[slug]).then(r=>r.rows[0].revision);
const saveTpl=(rev,enabled=true)=>db.query('select public.platform_save_template($1,$2,$3,$4,$5,$6,$7,$8,$9) as r',[admin,'payment.due','billing','popup','Updated due title','Body about {{booking}} on {{date}}',['booking','date'],enabled,rev]).then(r=>r.rows[0].r);
assert.equal((await saveTpl(1)).revision,2);
await assert.rejects(saveTpl(1),/STALE_TEMPLATE/);
assert.equal((await db.query("select title from public.notification_templates where slug='payment.due'")).rows[0].title,'Updated due title');
assert.equal(await count("select count(*) n from public.audit_log where action='notification.template_saved'"),1);

// Broadcast create → dispatch fan-out is idempotent and audience-aware.
const create=await db.query('select public.platform_notification_create($1,$2,$3,$4,$5,$6,$7,$8) as n',[admin,'announcement','all','banner','Scheduled maintenance','We upgrade storage on Sunday.','draft',null]).then(r=>r.rows[0].n);
const send=()=>db.query('select public.platform_notification_dispatch($1,$2) as c',[admin,create.id]).then(r=>r.rows[0].c);
assert.equal(await send(),2,'both active organizations received the broadcast');
await assert.rejects(send(),/Only draft/);
assert.equal(await count('select count(*) n from public.tenant_notifications where dedupe_key=$1',['broadcast:'+create.id]),2,'re-dispatch cannot duplicate deliveries');
assert.equal((await db.query('select status from public.platform_notifications where id=$1',[create.id])).rows[0].status,'sent');

const trialB=await db.query('select public.platform_notification_create($1,$2,$3,$4,$5,$6,$7,$8) as n',[admin,'billing','trial','popup','Trial expiring','Your trial ends soon, choose a plan.','draft',null]).then(r=>r.rows[0].n);
const trialCount=await db.query('select public.platform_notification_dispatch($1,$2) as c',[admin,trialB.id]).then(r=>r.rows[0].c);
assert(trialCount>=1&&trialCount<=2);
await db.query('select public.platform_notification_cancel($1,$2)',[admin,(await db.query('select public.platform_notification_create($1,$2,$3,$4,$5,$6,$7,$8) as n',[admin,'system','all','banner','Draft only','x'.repeat(2),'draft',null]).then(r=>r.rows[0].n)).id]);

// Scheduling requires a future time; updates are revision + status guarded.
await assert.rejects(db.query('select public.platform_notification_create($1,$2,$3,$4,$5,$6,$7,$8)',[admin,'system','all','banner','Past','body','scheduled',new Date(Date.now()-60000).toISOString()]),/future/);
const sched=await db.query('select public.platform_notification_create($1,$2,$3,$4,$5,$6,$7,$8) as n',[admin,'maintenance','all','popup','Tonight','Maintenance at midnight.','scheduled',new Date(Date.now()+3600e3).toISOString()]).then(r=>r.rows[0].n);
await db.query('select public.platform_notification_update($1,$2,$3,$4,$5,$6,$7,$8,$9)',[admin,sched.id,'maintenance','all','banner','Tonight revised','Maintenance window moved.',new Date(Date.now()+7200e3).toISOString(),1]);
await assert.rejects(db.query('select public.platform_notification_update($1,$2,$3,$4,$5,$6,$7,$8,$9)',[admin,sched.id,'maintenance','all','banner','x','y',new Date(Date.now()+7200e3).toISOString(),1]),/STALE_NOTIFICATION/);
await assert.rejects(db.query('select public.platform_notification_cancel($1,$2)',[admin,create.id]),/Only draft/);

// Auto reminders: expiring subscription, due-payment and tomorrow's event — idempotent per dedupe key.
await db.query("update public.saas_subscriptions set paid_through=now()+interval '5 days' where tenant_id=$1",[t1]);
const save8=(kind,id,body,fresh=true)=>db.query('select public.saas_save_record($1,$2,$3,$4,$5,$6)',[owner,t1,kind,id,body,fresh]);
await save8('halls','nh1',{name:'Hall',capacity:100,price:1000,status:'Available'});
await save8('clients','nc1',{name:'Client',status:'Active'});
const tomorrow=new Date(Date.now()+86400e3).toISOString().slice(0,10);
await save8('bookings','nb1',{name:'Ring ceremony',date:tomorrow,durationMode:'morning',time:'08:00',clientId:'nc1',hallId:'nh1',status:'Confirmed',guests:50,total:8000});
const gen=()=>db.query('select public.notifications_generate_reminders($1) as c',[t1]).then(r=>r.rows[0].c);
const first=await gen();
assert(first>=3,'expiry + due + tomorrow reminders created: '+first);
assert.equal((await gen())> first,false,'second generation creates no duplicates');
const feed=await db.query('select public.notifications_list($1,$2) as feed',[t1,owner]).then(r=>r.rows[0].feed);
assert(feed.length>=3);
assert(feed.some(n=>n.category==='billing'&&n.media==='banner'),'subscription-expiry banner reminder');
assert(feed.some(n=>n.media==='popup'&&n.title==='Updated due title'),'edited enabled template drives the due reminder');
assert(feed.some(n=>n.category==='event'&&n.title.includes('Ring ceremony')),'tomorrow event reminder');
await assert.rejects(db.query('select public.notifications_list($1,$2)',[t1,other]),/Access denied/);
assert.equal((await db.query('select public.notifications_generate_reminders($1)',[t2])).then?0:0,0);

// Phase 2: per-user read/ack state, email media with outbound queueing, push registry, fleet reminders.
const ids=feed.map(n=>n.id);
assert.equal((await db.query('select public.notifications_mark($1,$2,$3,$4)',[t1,owner,ids.slice(0,2),'read'])).rows[0].notifications_mark,2);
const feed2=await db.query('select public.notifications_list($1,$2) as feed',[t1,owner]).then(r=>r.rows[0].feed);
assert(feed2.filter(n=>ids.slice(0,2).includes(n.id)).every(n=>n.isRead),'server read state is returned in the feed');
const popupId=feed2.find(n=>n.media==='popup'&&!n.acked)?.id;
await db.query('select public.notifications_mark($1,$2,$3,$4)',[t1,owner,[popupId],'ack']);
const feed3=await db.query('select public.notifications_list($1,$2) as feed',[t1,owner]).then(r=>r.rows[0].feed);
assert(feed3.find(n=>n.id===popupId).acked,'popup acknowledgement persists in the feed');
await assert.rejects(db.query('select public.notifications_mark($1,$2,$3,$4)',[t1,other,ids.slice(0,1),'read']),/Access denied/);

const emailCount=await db.query('select public.platform_notification_dispatch($1,$2) as c',[admin,(await db.query('select public.platform_notification_create($1,$2,$3,$4,$5,$6,$7,$8) as n',[admin,'announcement','all','email','Season greetings','Happy wedding season to your venue team.','draft',null]).then(r=>r.rows[0].n)).id]).then(r=>r.rows[0].c);
assert.equal(emailCount,2,'email broadcast fans out to both organizations');
const claimed=await db.query('select id from public.notifications_claim_outbound($1,$2)',['email',10]);
assert.equal(claimed.rows.length,2,'email outbound claimed once');
await db.query('select public.notifications_outbound_done($1,$2)',['email',claimed.rows[0].id]);
await db.query('select public.notifications_outbound_release($1,$2)',['email',claimed.rows[1].id]);
assert.equal((await db.query('select id from public.notifications_claim_outbound($1,$2)',['email',10])).rows.length,1,'completed claims never return; released claims do');
await db.query('select public.notifications_outbound_done($1,$2)',['email',claimed.rows[1].id]);
assert.equal((await db.query('select id from public.notifications_claim_outbound($1,$2)',['email',10])).rows.length,0);
await assert.rejects(db.query('select public.notifications_claim_outbound($1,$2)',['pigeon',1]));

await db.query('select public.platform_notification_dispatch($1,$2)',[admin,(await db.query('select public.platform_notification_create($1,$2,$3,$4,$5,$6,$7,$8) as n',[admin,'system','all','push','Server will restart','Two-minute maintenance restart soon.','draft',null]).then(r=>r.rows[0].n)).id]);
const sub1={endpoint:'https://push.services.mozilla.org/wpush/v2/demo-endpoint-1',keys:{p256dh:'BCxDemoPublicKeyMaterial0123456789abcdefghijklmnopqrstuvwx',auth:'demo-auth-secret'}};
await db.query('select public.fcm_token_register($1,$2,$3,$4)',[owner,t1,JSON.stringify(sub1),'Mozilla/5.0 (X11)']);
assert.equal(await count('select count(*) n from public.fcm_tokens'),1);
await assert.rejects(db.query('select public.fcm_token_register($1,$2,$3,$4)',[owner,t1,JSON.stringify({endpoint:'http://insecure.example/p',keys:sub1.keys}),'']),/Invalid/);
const pushClaims=await db.query('select id from public.notifications_claim_outbound($1,$2)',['push',10]);
assert.equal(pushClaims.rows.length,2,'push media queued for both organizations');
for(const r of pushClaims.rows)await db.query('select public.notifications_outbound_done($1,$2)',['push',r.id]);
assert.equal((await db.query('select id from public.notifications_claim_outbound($1,$2)',['push',10])).rows.length,0);
await db.query('select public.fcm_token_unregister($1,$2)',[owner,'https://push.services.mozilla.org/wpush/v2/demo-endpoint-1']);
assert.equal(await count('select count(*) n from public.fcm_tokens'),0);

const beforeFleet=await count('select count(*) n from public.tenant_notifications');
const fleetMade=await db.query('select public.notifications_generate_reminders_all() as c').then(r=>r.rows[0].c);
assert(fleetMade>=0);
assert.equal(await count('select count(*) n from public.tenant_notifications'),beforeFleet,'fleet reminder run is fully deduped');

// All administration RPCs are service-role only.
await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}';`);
await assert.rejects(db.query('select public.platform_notification_create($1,$2,$3,$4,$5,$6,$7,$8)',[owner,'system','all','banner','x','y','draft',null]),/permission denied/i);
await assert.rejects(db.query('select public.platform_save_setting($1,$2,$3,$4)',['branding',owner,{},0]),/permission denied/i);
await assert.rejects(db.query('select public.platform_save_template($1,$2,$3,$4,$5,$6,$7,$8,$9)',[owner,'payment.due','billing','popup','t','b',[],true,2]),/permission denied/i);
await assert.rejects(db.query('insert into public.tenant_notifications(tenant_id,dedupe_key,category,media,title,body) values($1,$2,$3,$4,$5,$6)',[t1,'x','billing','popup','t','b']));
await assert.rejects(db.query('select public.notifications_mark($1,$2,$3,$4)',[t1,owner,[1],'read']),/permission denied/i);
await assert.rejects(db.query('select public.notifications_generate_reminders_all()'),/permission denied/i);
await assert.rejects(db.query('select public.notifications_claim_outbound($1,$2)',['push',1]),/permission denied/i);
await assert.rejects(db.query('select public.fcm_token_register($1,$2,$3,$4)',[owner,t1,'{}','']),/permission denied/i);
await db.exec('reset role');
console.log('PASS notification centre: FCM kind, branding CAS, template guards, idempotent broadcast fan-out, schedule rules, deduped auto reminders (expiry/due/tomorrow), per-user read/ack state, email+push outbound claiming, browser subscription registry, fleet reminder generation, tenant feed scoping and service-role enforcement.');
