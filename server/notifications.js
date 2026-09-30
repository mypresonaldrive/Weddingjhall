// Notification centre routes: tenant in-app feed + idempotent auto reminders,
// platform broadcast CRUD with categories/media/schedules, triggered template CRUD
// and platform branding settings. Every privileged write is an atomic RPC with audit.
import {z} from 'zod';
const category=z.enum(['announcement','maintenance','billing','event','system']);
const media=z.enum(['banner','popup','push']);
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
 try{const {data,error}=await admin.from('platform_settings').select('value').eq('key','branding').maybeSingle();if(!error&&data?.value)brandingCache={at:Date.now(),value:{...defaultBranding,...data.value}};else if(!error)brandingCache.at=Date.now();}catch{}
 return brandingCache.value;
}
