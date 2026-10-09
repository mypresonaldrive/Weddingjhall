// Notification centre routes: tenant in-app feed + idempotent auto reminders,
// platform broadcast CRUD with categories/media/schedules, triggered template CRUD
// and platform branding settings. Every privileged write is an atomic RPC with audit.
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {readIntegration} from './integrations.js';
import {sendProvider} from './messaging.js';
import {sendWebPush} from './push.js';
const category=z.enum(['announcement','maintenance','billing','event','system']);
const media=z.enum(['banner','popup','push','email']);
const audience=z.enum(['all','trial']);
const conflict=(message,status=409)=>Object.assign(Error(message),{status});
const stale=(error,prefix,message)=>{if(String(error?.message||'').startsWith(prefix+':'))throw conflict(message);if(error?.code==='23505')throw conflict(message);throw error;};
const broadcastBody=z.object({category:category,audience:audience,media:media,title:z.string().trim().min(1).max(160),body:z.string().trim().min(1).max(2000),status:z.enum(['draft','scheduled']).default('draft'),scheduledAt:z.string().nullable().default(null)});
const uuid=z.string().uuid();
export function installNotifications(app,{admin,result,rpc,route,platform,member,rateLimit}){

 // Workspace feed. Reminder generation is idempotent (dedupe keys), so running it per load is safe.
 app.get('/api/notifications',member,rateLimit('notifications-list',60,300),route(async(req,res)=>{
  await rpc('notifications_generate_reminders',{p_t:req.membership.tenant_id});
  res.json(await rpc('notifications_list',{p_t:req.membership.tenant_id,p_actor:req.actor.id}));
 }));

 // Per-user read state + one-time popup acknowledgement (server-side, syncs across devices).
 app.post('/api/notifications/ack',member,rateLimit('notifications-mark',120,300),route(async(req,res)=>{
  const p=z.object({ids:z.array(z.number().int().positive()).min(1).max(100),kind:z.enum(['read','ack']).default('read')}).parse(req.body);
  res.json({marked:await rpc('notifications_mark',{p_t:req.membership.tenant_id,p_actor:req.actor.id,p_ids:p.ids,p_kind:p.kind})});
 }));

 // Browser push: shareable config (no secrets) + subscription registration (also drives /public/sw.js permission).
 app.get('/api/notifications/push-config',member,route(async(_req,res)=>{
  const r=await readIntegration(admin,result,'fcm').catch(()=>null);
  res.json(r?.enabled?{enabled:true,vapidKey:r.config.vapidPublic}:{enabled:false});
 }));
 app.post('/api/notifications/push-token',member,rateLimit('push-token',60,900),route(async(req,res)=>{
  const action=z.enum(['register','unregister']).parse(req.body.action||'register');
  if(action==='register'){const p=z.object({endpoint:z.string().url().max(1024),keys:z.object({p256dh:z.string().min(20).max(200),auth:z.string().min(8).max(200)})}).parse(req.body.subscription);
   await rpc('fcm_token_register',{p_actor:req.actor.id,p_tenant:req.membership.tenant_id,p_subscription:{endpoint:p.endpoint,keys:p.keys},p_user_agent:req.headers['user-agent']||''});}
  else await rpc('fcm_token_unregister',{p_actor:req.actor.id,p_endpoint:z.string().url().max(1024).parse(req.body.endpoint)});
  res.json({saved:true,enabled:action==='register'});
 }));

 app.get('/api/platform/notifications',platform,route(async(_req,res)=>{
  const [notifications,templates]=await Promise.all([
   result(admin.from('platform_notifications').select('*').order('created_at',{ascending:false}).limit(100)),
   result(admin.from('notification_templates').select('*').order('slug')),
  ]);
  res.json({notifications,templates});
 }));

 app.post('/api/platform/notifications',platform,rateLimit('notification-create',30,900),route(async(req,res)=>{
  const p=broadcastBody.parse(req.body);
  res.json(await rpc('platform_notification_create',{p_actor:req.actor.id,p_category:p.category,p_audience:p.audience,p_media:p.media,p_title:p.title,p_body:p.body,p_status:p.status,p_scheduled_at:p.scheduledAt}));
 }));

 app.post('/api/platform/notifications/update',platform,route(async(req,res)=>{
  const p=broadcastBody.and(z.object({id:uuid,revision:z.number().int().min(1)})).parse(req.body);
  try{await rpc('platform_notification_update',{p_actor:req.actor.id,p_id:p.id,p_category:p.category,p_audience:p.audience,p_media:p.media,p_title:p.title,p_body:p.body,p_scheduled_at:p.scheduledAt,p_expected:p.revision});}
  catch(error){stale(error,'STALE_NOTIFICATION','This broadcast changed or is no longer editable. Reload before saving.');}
  res.json({saved:true});
 }));

 app.post('/api/platform/notifications/dispatch',platform,rateLimit('notification-dispatch',20,900),route(async(req,res)=>{
  const p=z.object({id:uuid}).parse(req.body);
  let deliveries;try{deliveries=await rpc('platform_notification_dispatch',{p_actor:req.actor.id,p_id:p.id});}
  catch(error){stale(error,'CONFLICT','Only draft or scheduled broadcasts can be sent.');}
  res.json({sent:true,deliveries});
 }));

 app.post('/api/platform/notifications/cancel',platform,route(async(req,res)=>{
  const p=z.object({id:uuid}).parse(req.body);
  try{await rpc('platform_notification_cancel',{p_actor:req.actor.id,p_id:p.id});}
  catch(error){stale(error,'CONFLICT','Only draft or scheduled broadcasts can be cancelled.');}
  res.json({cancelled:true});
 }));

 app.post('/api/platform/notifications/template',platform,route(async(req,res)=>{
  const p=z.object({slug:z.string().regex(/^[a-z][a-z0-9._-]{1,80}$/),category,channel:media,title:z.string().trim().min(1).max(160),body:z.string().trim().min(1).max(2000),variables:z.array(z.string().regex(/^[a-z]+$/)).max(12),enabled:z.boolean(),revision:z.number().int().min(0)}).parse(req.body);
  let saved;try{saved=await rpc('platform_save_template',{p_actor:req.actor.id,p_slug:p.slug,p_category:p.category,p_channel:p.channel,p_title:p.title,p_body:p.body,p_variables:p.variables,p_enabled:p.enabled,p_expected:p.revision});}
  catch(error){stale(error,'STALE_TEMPLATE','This template changed. Reload before saving.');}
  res.json({saved:true,revision:saved?.revision});
 }));

 // Signed upload for the SaaS logo: one hop via a public 'branding' storage bucket.
 app.post('/api/platform/branding/logo-url',platform,rateLimit('branding-logo',10,900),route(async(req,res)=>{
  const p=z.object({fileName:z.string().trim().min(1).max(120),contentType:z.enum(['image/png','image/jpeg','image/svg+xml','image/webp']).default('image/png')}).parse(req.body);
  const ext=(p.fileName.toLowerCase().match(/\.(png|jpe?g|svg|webp)$/)||[null,p.contentType==='image/svg+xml'?'svg':'png'])[1];
  const path='logos/'+randomUUID()+'.'+ext;
  const {data,error}=await admin.storage.from('branding').createSignedUploadUrl(path);
  if(error||!data?.signedUrl)throw Object.assign(Error('Could not prepare the upload. Try again.'),{status:502});
  res.json({uploadUrl:new URL(data.signedUrl,process.env.SUPABASE_URL).toString(),token:data.token,contentType:p.contentType,publicUrl:(process.env.SUPABASE_URL||'').replace(/\/$/,'')+'/storage/v1/object/public/'+path});
 }));
 app.delete('/api/platform/branding/logo',platform,rateLimit('branding-logo',10,900),route(async(req,res)=>{
  const p=z.object({path:z.string().trim().regex(/^logos\/[-a-zA-Z0-9.]+\.(png|jpe?g|svg|webp)$/).max(160)}).parse(req.query);
  await admin.storage.from('branding').remove([p.path]);
  res.json({deleted:true});
 }));

 // SaaS branding (logo/title/description/support info).
 app.get('/api/platform/branding',platform,route(async(_req,res)=>{
  const row=await result(admin.from('platform_settings').select('value,revision,updated_at').eq('key','branding').maybeSingle());
  res.json({values:row?.value||defaultBranding,revision:row?.revision||0,updatedAt:row?.updated_at||null});
 }));
 app.post('/api/platform/branding',platform,rateLimit('branding-save',20,900),route(async(req,res)=>{
  const p=z.object({values:z.object({logoText:z.string().trim().min(1).max(40),logoUrl:z.string().trim().max(500).refine(v=>!v||/^https:\/\//.test(v),'Logo URL must use HTTPS.'),title:z.string().trim().min(1).max(80),tagline:z.string().trim().max(160),description:z.string().trim().max(400),supportEmail:z.string().trim().max(120).refine(v=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),'Enter a valid support email.'),footerNote:z.string().trim().max(200)}),revision:z.number().int().min(0)}).parse(req.body);
  let saved;try{saved=await rpc('platform_save_setting',{p_key:'branding',p_actor:req.actor.id,p_value:p.values,p_expected:p.revision});}
  catch(error){stale(error,'STALE_SETTING','Branding changed. Reload before saving.');}
  res.json({saved:true,revision:saved?.revision});
 }));
}
export const defaultBranding={logoText:'Gatherhall',logoUrl:'',title:'Gatherhall',tagline:'Every celebration, beautifully managed',description:'Venue management for marriage halls, bookings, teams and payments.',supportEmail:'',footerNote:''};

// Public-safe branding cached briefly; used by /api/config for login and workspace chrome.
let brandingCache={at:0,value:defaultBranding};
export async function currentBranding(admin){
 if(Date.now()-brandingCache.at<15000)return brandingCache.value;
 try{const query=admin.from('platform_settings').select('value').eq('key','branding').maybeSingle(),{data,error}=await Promise.race([query,new Promise((_,reject)=>setTimeout(()=>reject(Error('branding lookup timed out')),2500))]).catch(err=>({timeout:err}));if(!error&&data?.value)brandingCache={at:Date.now(),value:{...defaultBranding,...data.value}};else if(!error&&data!==undefined)brandingCache.at=Date.now();}catch{}
 return brandingCache.value;
}

// Background worker: auto-dispatches due scheduled broadcasts, periodically generates
// idempotent reminders for every active organization, delivers push (Web Push) and
// broadcast email (platform SMTP), and sweeps expired deliveries.
// Concurrency-safe: dispatch RPC is atomic, outbound rows are claimed then stamped.
export function startNotificationWorker({admin,result,rpc,keepAlive=true}){
 const noop=()=>Promise.resolve();if(process.env.NOTIFICATION_WORKER_ENABLED!=='true'){noop.runOnce=()=>Promise.resolve();return noop;}
 let busy=false,stopped=false,running=Promise.resolve(),lastRemind=0,lastSweep=0,fcmCache=null,fcmCacheAt=0;
 const fcm=async()=>{if(Date.now()-fcmCacheAt<60000)return fcmCache;fcmCache=await readIntegration(admin,result,'fcm').catch(()=>null);fcmCacheAt=Date.now();return fcmCache;};
 async function dispatchDue(){
  const due=await result(admin.from('platform_notifications').select('id').eq('status','scheduled').lte('scheduled_at',new Date().toISOString()).order('scheduled_at').limit(20));
  for(const n of due||[]){try{await rpc('platform_notification_dispatch',{p_actor:null,p_id:n.id});}catch(e){if(!/^CONFLICT/.test(String(e?.message||'')))console.error('Broadcast auto-dispatch failed:',e?.message||e);}}
 }
 async function generateReminders(){if(Date.now()-lastRemind<15*60*1000)return;lastRemind=Date.now();await rpc('notifications_generate_reminders_all',{}).catch(e=>console.error('Reminder generation failed:',e?.message||e));}
 async function sweepExpired(){if(Date.now()-lastSweep<24*3600*1000)return;lastSweep=Date.now();await admin.from('tenant_notifications').delete().lt('expires_at',new Date(Date.now()-30*86400000).toISOString());}
 async function sendPush(){
  const cfg=await fcm();if(!cfg?.enabled)return;
  const claimed=await rpc('notifications_claim_outbound',{p_kind:'push',p_limit:40});
  if(!claimed?.length)return;
  const subs=await result(admin.from('fcm_tokens').select('endpoint,keys,tenant_id').eq('active',true));
  const byTenant=new Map();for(const t of subs||[]){if(!byTenant.has(t.tenant_id))byTenant.set(t.tenant_id,[]);byTenant.get(t.tenant_id).push({endpoint:t.endpoint,keys:t.keys});}
  for(const n of claimed){
   const targets=byTenant.get(n.tenant_id)||[];
   if(!targets.length){await rpc('notifications_outbound_done',{p_kind:'push',p_id:n.id}).catch(()=>{});continue;}
   try{const res=await sendWebPush(cfg.config,targets,{title:n.title,body:n.body,url:'/'});
    for(const ep of res.invalid)await result(admin.from('fcm_tokens').update({active:false}).eq('endpoint',ep)).catch(()=>{});
    if(res.ok||res.invalid.length)await rpc('notifications_outbound_done',{p_kind:'push',p_id:n.id}).catch(()=>{});
    else await rpc('notifications_outbound_release',{p_kind:'push',p_id:n.id}).catch(()=>{});
   }catch(e){console.error('Push send failed:',e?.message||e);await rpc('notifications_outbound_release',{p_kind:'push',p_id:n.id}).catch(()=>{});}
  }
 }
 async function sendEmails(){
  const cfg=await readIntegration(admin,result,'email').catch(()=>null);if(!cfg?.enabled)return;
  const claimed=await rpc('notifications_claim_outbound',{p_kind:'email',p_limit:20});
  if(!claimed?.length)return;
  for(const n of claimed){
   const org=await result(admin.from('organizations').select('name,billing_email').eq('id',n.tenant_id).maybeSingle()).catch(()=>null);
   const to=String(org?.billing_email||'').trim();
   if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)){await rpc('notifications_outbound_done',{p_kind:'email',p_id:n.id}).catch(()=>{});continue;}
   try{const text=(n.title+'\n\n'+n.body+'\n\n— Platform notice · replies to this address are not monitored.').slice(0,4000);
    const out=await sendProvider('email',cfg.config,to,text,{});
    if(out.outcome==='sent'||out.outcome==='failed')await rpc('notifications_outbound_done',{p_kind:'email',p_id:n.id}).catch(()=>{});
    else await rpc('notifications_outbound_release',{p_kind:'email',p_id:n.id}).catch(()=>{});}catch{await rpc('notifications_outbound_release',{p_kind:'email',p_id:n.id}).catch(()=>{});}
  }
 }
 async function tick(){if(busy||stopped)return;busy=true;try{await dispatchDue();await generateReminders();await sendPush();await sendEmails();await sweepExpired();}catch(e){console.error('Notification worker:',e?.message||e);}finally{busy=false;}}
 const run=()=>{running=tick();return running;};
 const timer=setInterval(run,20000);if(!keepAlive)timer.unref();
 const stop=()=>{stopped=true;clearInterval(timer);return running;};stop.runOnce=run;return stop;
}
