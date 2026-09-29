import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {resolve4} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import nodemailer from 'nodemailer';
import {z} from 'zod';
import {integrationFields} from '../shared/integrations.js';
const secretKey=()=>{const k=Buffer.from(process.env.INTEGRATION_ENCRYPTION_KEY||'','base64');if(k.length!==32)throw Object.assign(Error('Set INTEGRATION_ENCRYPTION_KEY to a base64-encoded 32-byte key in server runtime settings.'),{status:503});return k;};
export function encryptConfig(kind,data){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secretKey(),iv);cipher.setAAD(Buffer.from(kind));const body=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');}
export function decryptConfig(kind,value){const b=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',secretKey(),b.subarray(0,12));cipher.setAAD(Buffer.from(kind));cipher.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString());}
export async function readIntegration(admin,result,kind){const row=await result(admin.from('platform_integrations').select('*').eq('kind',kind).maybeSingle());return row?{...row,config:decryptConfig(kind,row.encrypted)}:null;}
export async function loadSavedRazorpay(admin,result){if(!process.env.INTEGRATION_ENCRYPTION_KEY)return;const r=await readIntegration(admin,result,'razorpay');if(!r)return;if(!r.enabled){delete process.env.RAZORPAY_KEY_ID;delete process.env.RAZORPAY_KEY_SECRET;delete process.env.RAZORPAY_WEBHOOK_SECRET;return;}Object.assign(process.env,{RAZORPAY_KEY_ID:r.config.keyId,RAZORPAY_KEY_SECRET:r.config.keySecret,RAZORPAY_WEBHOOK_SECRET:r.config.webhookSecret});}
export function validateConfig(kind,c,enabled){
 const out={};for(const [key] of integrationFields[kind].fields)out[key]=z.string().trim().max(4096).parse(c[key]||'');
 if(!enabled)return out;
 if(Object.values(out).some(v=>!v))throw Object.assign(Error('Complete all provider fields before enabling.'),{status:400});
 if(kind==='razorpay'){z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/).parse(out.keyId);if(out.keyId.startsWith('rzp_test_')&&process.env.NODE_ENV==='production'&&process.env.ALLOW_TEST_BILLING!=='true')throw Object.assign(Error('Enable ALLOW_TEST_BILLING in staging before using test keys.'),{status:400});}
 if(kind==='email'){z.enum(['465','587']).parse(out.port);z.email().parse(out.from);z.string().regex(/^[a-zA-Z0-9.-]+$/).max(253).parse(out.host);}
 if(['sms','whatsapp'].includes(kind)&&out.approved!=='true')throw Object.assign(Error('Confirm provider template approval before enabling this channel.'),{status:400});
 if(kind==='sms')z.string().regex(/^[a-zA-Z0-9]+$/).parse(out.flowId);
 if(kind==='whatsapp'){z.string().regex(/^\d+$/).parse(out.phoneId);z.string().regex(/^[a-z0-9_]+$/).parse(out.template);z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/).parse(out.language);}
 return out;
}
export function installIntegrationSettings(app,{admin,result,route,platform,rateLimit}){
 app.get('/api/platform/settings',platform,route(async(_req,res)=>{const rows=await result(admin.from('platform_integrations').select('*'));const settings={};for(const kind of Object.keys(integrationFields)){const r=rows.find(x=>x.kind===kind),c=r?decryptConfig(kind,r.encrypted):{};settings[kind]={enabled:r?.enabled||false,revision:r?.revision||0,fields:Object.fromEntries(integrationFields[kind].fields.filter(f=>!f[2]).map(([k])=>[k,c[k]||''])),secrets:Object.fromEntries(integrationFields[kind].fields.filter(f=>f[2]).map(([k])=>[k,!!c[k]]))};}res.json({settings,encryptionReady:!!process.env.INTEGRATION_ENCRYPTION_KEY,workerEnabled:process.env.MESSAGE_WORKER_ENABLED==='true',razorpaySource:rows.some(r=>r.kind==='razorpay')?'Saved settings (loaded on restart)':'Server environment'});}));
 app.post('/api/platform/settings/:kind',platform,rateLimit('integration-save',20,900),route(async(req,res)=>{const kind=z.enum(Object.keys(integrationFields)).parse(req.params.kind),p=z.object({enabled:z.boolean(),revision:z.number().int().nonnegative(),fields:z.record(z.string(),z.string())}).parse(req.body),r=await readIntegration(admin,result,kind);
 if((r?.revision||0)!==p.revision)throw Object.assign(Error('Settings changed. Reload before saving.'),{status:409});
 const merged={...r?.config};for(const [k,,secret] of integrationFields[kind].fields){if(!secret||p.fields[k])merged[k]=p.fields[k]||'';}
 const c=validateConfig(kind,merged,p.enabled),row={kind,enabled:p.enabled,encrypted:encryptConfig(kind,c),revision:p.revision+1,updated_at:new Date().toISOString()};
 if(r){const changed=await result(admin.from('platform_integrations').update(row).eq('kind',kind).eq('revision',p.revision).select('kind'));if(!changed.length)throw Object.assign(Error('Settings changed. Reload before saving.'),{status:409});}else await result(admin.from('platform_integrations').insert(row));
 await result(admin.from('audit_log').insert({actor_id:req.actor.id,action:'integration.updated',details:{kind,enabled:p.enabled,revision:row.revision}}));res.json({saved:true,restartRequired:kind==='razorpay'});
 }));
}
const blocked=new BlockList();for(const [ip,n] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(ip,n);
async function smtp(c){const ips=isIP(c.host)?[c.host]:await resolve4(c.host);if(!ips.length||ips.some(ip=>isIP(ip)!==4||blocked.check(ip)))throw Error('SMTP requires a public IPv4 destination.');return nodemailer.createTransport({host:ips[0],port:Number(c.port),secure:c.port==='465',requireTLS:true,tls:{servername:c.host,minVersion:'TLSv1.2'},auth:{user:c.user,pass:c.password},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true});}
export async function sendProvider(channel,c,to,text,details={}){
 if(channel==='email'){let transport;try{transport=await smtp(c);const sent=await transport.sendMail({from:c.from,to,subject:'Booking confirmation',text});return sent.accepted?.length?{outcome:'sent',id:sent.messageId}:{outcome:'failed'};}catch(e){return {outcome:e.responseCode>=500&&e.responseCode<600?'failed':'unknown'};}finally{transport?.close();}}
 const sms=channel==='sms';const url=sms?'https://control.msg91.com/api/v5/flow/':`https://graph.facebook.com/v23.0/${c.phoneId}/messages`;
 const body=sms?{flow_id:c.flowId,recipients:[{mobiles:to.replace('+',''),...Object.fromEntries(['event','date','time','venue','organization'].map(k=>[k,String(details[k]||'').replace(/[\r\n\t]/g,' ').slice(0,30)]))}]}:{messaging_product:'whatsapp',to:to.replace('+',''),type:'template',template:{name:c.template,language:{code:c.language},components:[{type:'body',parameters:[{type:'text',text}]}]}};
 try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(sms?{authkey:c.authKey}:{Authorization:'Bearer '+c.token})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'}),data=await response.json();if(response.ok&&(sms?data.type==='success':data.messages?.[0]?.id))return {outcome:'sent',id:String(sms?data.request_id||data.message:data.messages[0].id).slice(0,300)};return {outcome:response.status>=500?'unknown':'failed'};}catch{return {outcome:'unknown'};}
}
