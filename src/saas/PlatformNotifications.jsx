// SaaS-admin notification centre: broadcasts with categories/audience/media/schedules,
// triggered auto-reminder templates, and branding is edited from Settings.
import React,{useEffect,useRef,useState} from 'react';
import {Bell,Rss,ScrollText,Plus,Send,CalendarClock,Ban,Pencil,Megaphone,Wallet,Settings as SettingsIcon,CalendarCheck,ShieldCheck} from 'lucide-react';
import {Badge,Notice,Modal,Submit,Loading} from './components.jsx';
import {saasApi,date} from './api.js';
const icons={announcement:Megaphone,billing:Wallet,maintenance:SettingsIcon,event:CalendarCheck,system:ShieldCheck};
const categories=['announcement','maintenance','billing','event','system'];
const medias=['banner','popup','push'];
const audiences=[['all','All organizations'],['trial','Organizations in trial']];
const empty={category:'announcement',audience:'all',media:'banner',title:'',body:'',status:'draft',scheduledAt:''};
const previewData={
 notifications:[
  {id:'p1',category:'announcement',audience:'all',media:'banner',title:'Welcome to the new season',body:'Share your best celebration photos in your workspace gallery.',status:'sent',sent_at:'2026-09-28T10:00:00Z',scheduled_at:null,revision:1},
  {id:'p2',category:'maintenance',audience:'all',media:'popup',title:'Scheduled maintenance tonight',body:'The workspace will pause 11:30 PM–12:00 AM IST for upgrades.',status:'scheduled',scheduled_at:'2026-10-01T18:00:00Z',sent_at:null,revision:1},
  {id:'p3',category:'billing',audience:'trial',media:'push',title:'Trial ending soon',body:'Choose a plan to keep your workspace editable.',status:'draft',scheduled_at:null,sent_at:null,revision:1},
 ],
 templates:[
  {slug:'subscription.expiring',category:'billing',channel:'banner',title:'Your subscription access ends soon',body:'Your Gatherhall access for {{organization}} ends in {{days}} day(s), on {{date}}.',variables:['organization','days','date'],enabled:true,revision:1},
  {slug:'payment.due',category:'billing',channel:'popup',title:'Balance due for {{booking}}',body:'{{booking}} on {{date}} has a remaining balance of {{balance}}.',variables:['booking','date','balance'],enabled:true,revision:1},
  {slug:'booking.tomorrow',category:'event',channel:'banner',title:'Celebration tomorrow: {{booking}}',body:'{{booking}} at {{venue}} starts on {{date}} ({{duration}}).',variables:['booking','venue','date','duration'],enabled:true,revision:1},
 ],
};
const card={icon:icon=>{const I=icons[icon]||Bell;return <I size={17}/>;}};
export default function PlatformNotifications({preview=false}){
 const [data,setData]=useState(preview?previewData:null),[tab,setTab]=useState('broadcasts'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[modal,setModal]=useState(null);
 const request=useRef(0);
 const load=async()=>{if(preview)return;const id=++request.current;try{const d=await saasApi('/platform/notifications');if(id===request.current)setData(d);}catch(e){if(id===request.current)setError(e.message);}};
 useEffect(()=>{load();},[]);
 const run=async(fn,success)=>{if(preview)return;setBusy(true);setError('');setNotice('');try{await fn();setNotice(success);await load();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const saveBroadcast=(values,sendNow)=>run(async()=>{
  const scheduledAt=values.status==='scheduled'&&values.scheduledAt?new Date(values.scheduledAt).toISOString():null;
  if(values.id)await saasApi('/platform/notifications/update','POST',{...values,scheduledAt});
  else await saasApi('/platform/notifications','POST',{...values,scheduledAt});
  if(sendNow){const id=values.id||(await saasApi('/platform/notifications')).notifications.find(n=>n.status==='draft'&&n.title===values.title)?.id;if(id)await saasApi('/platform/notifications/dispatch','POST',{id});}
 },sendNow?'Broadcast created and dispatched.':'Broadcast saved.');
 const saveTemplate=(values)=>run(()=>saasApi('/platform/notifications/template','POST',values),'Template saved. Reminders use it from the next generation.');
 const fill=(tpl)=>{const sample=Object.fromEntries((tpl.variables||[]).map(v=>[v,v==='days'?'5':v==='date'?'12 Oct 2026':v==='balance'?'₹ 12,500':v==='venue'?'Crystal ballroom':v==='duration'?'morning':v==='organization'?'The Grand Estate':v==='booking'?'Sharma wedding':'sample']));const render=t=>t.replaceAll(/\{\{(\w+)\}\}/g,(_,k)=>sample[k]??'');return {title:render(tpl.title),body:render(tpl.body)};};
 if(!data)return <>{error?<Notice error>{error}</Notice>:<Loading/>}</>;
 return <div className="platform-notifications">
  <div className="saas-segment platform-notify-tabs">{[['broadcasts','Broadcasts',Rss],['templates','Reminder templates',ScrollText]].map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={15}/> {label}</button>)}</div>
  {error&&<Notice error>{error}</Notice>}{notice&&<Notice>{notice}</Notice>}
  {tab==='broadcasts'&&<>
   <div className="platform-plan-tools"><div className="platform-notify-hint"><Bell size={15}/> Categories, audience, media (banner / popup / push), and schedules. Dispatch is idempotent and audited.</div><button className="saas-button primary" onClick={()=>setModal({kind:'broadcast',values:{...empty}})}><Plus size={15}/>New broadcast</button></div>
   <section className="saas-panel"><div className="saas-table-wrap"><table className="saas-table"><thead><tr><th>Broadcast</th><th>Category</th><th>Media</th><th>Audience</th><th>Status</th><th>Timing</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
    {data.notifications.map(n=><tr key={n.id}><td><div className="platform-notify-title">{card.icon(n.category)}<div><strong>{n.title}</strong><small>{n.body}</small></div></div></td><td><Badge value={n.category}/></td><td>{n.media}</td><td>{n.audience==='trial'?'Trial organizations':'All organizations'}</td><td><Badge value={n.status}/></td><td>{n.status==='scheduled'?<span className="platform-when"><CalendarClock size={13}/> {date(n.scheduled_at)}</span>:n.sent_at?date(n.sent_at):'—'}</td><td className="platform-notify-actions">{['draft','scheduled'].includes(n.status)&&<button className="saas-icon" aria-label={'Send '+n.title} disabled={busy||preview} onClick={()=>run(()=>saasApi('/platform/notifications/dispatch','POST',{id:n.id}),'Broadcast dispatched to its audience.')}><Send size={15}/></button>}{['draft','scheduled'].includes(n.status)&&<button className="saas-icon" aria-label={'Edit '+n.title} onClick={()=>setModal({kind:'broadcast',values:{id:n.id,revision:n.revision,category:n.category,audience:n.audience,media:n.media,title:n.title,body:n.body,status:n.status,scheduledAt:n.scheduled_at?String(n.scheduled_at).slice(0,16):''}})}><Pencil size={15}/></button>}{['draft','scheduled'].includes(n.status)&&<button className="saas-icon" aria-label={'Cancel '+n.title} disabled={busy||preview} onClick={()=>run(()=>saasApi('/platform/notifications/cancel','POST',{id:n.id}),'Broadcast cancelled.')}><Ban size={15}/></button>}</td></tr>)}
   </tbody></table>{!data.notifications.length&&<div className="saas-empty">No broadcasts yet. Create the first announcement.</div>}</div></section></>}
  {tab==='templates'&&<div className="platform-template-grid">{data.templates.map(t=>{const sample=fill(t);return <article className="saas-panel platform-template" key={t.slug}>
    <div><span className="saas-plan-icon">{card.icon(t.category)}</span><Badge value={t.enabled?'enabled':'disabled'}/></div>
    <h2>{sample.title}</h2><p>{sample.body}</p>
    <dl><div><dt>Trigger</dt><dd>{t.slug}</dd></div><div><dt>Channel</dt><dd>{t.channel}</dd></div><div><dt>Variables</dt><dd>{(t.variables||[]).map(v=>'{{'+v+'}}').join(' ')||'none'}</dd></div></dl>
    <div className="saas-button-row"><button className="saas-button" onClick={()=>setModal({kind:'template',values:{...t,variables:(t.variables||[]).join(', ')}})}><Pencil size={14}/> Edit template</button><button className="saas-button" disabled={busy||preview} onClick={()=>saveTemplate({slug:t.slug,category:t.category,channel:t.channel,title:t.title,body:t.body,variables:t.variables||[],enabled:!t.enabled,revision:t.revision})}>{t.enabled?'Disable':'Enable'}</button></div>
   </article>;})}</div>}
  {modal?.kind==='broadcast'&&<BroadcastEditor values={modal.values} busy={busy} error={''} onClose={()=>setModal(null)} onSave={(v,send)=>{
   const payload={...v,scheduledAt:v.status==='scheduled'&&v.scheduledAt?v.scheduledAt:null};
   if(v.id)return saveBroadcast(payload,send);
   return saveBroadcast(payload,send);
  }}/>}
  {modal?.kind==='template'&&<TemplateEditor values={modal.values} busy={busy} onClose={()=>setModal(null)} onSave={v=>saveTemplate({...v,variables:v.variables.split(',').map(x=>x.trim()).filter(Boolean)})}/>}
 </div>;
}
function BroadcastEditor({values,busy,onClose,onSave}){
 const [v,setV]=useState(values),[error,setError]=useState('');const set=(k,x)=>setV(s=>({...s,[k]:x}));
 return <Modal title={v.id?'Edit broadcast':'New broadcast'} description="Delivered to workspace notification bells; popup shows once per member, push needs the platform’s FCM credentials." onClose={onClose}>
  <form onSubmit={e=>{e.preventDefault();if(v.status==='scheduled'&&!v.scheduledAt){setError('Choose a schedule time, or keep it a draft / send now.');return;}onSave(v,false);}}><div className="saas-modal-body">
  {error&&<Notice error>{error}</Notice>}
  <div className="saas-form-grid">
   <label>Category<select value={v.category} onChange={e=>set('category',e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
   <label>Audience<select value={v.audience} onChange={e=>set('audience',e.target.value)}>{audiences.map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
   <label>Media / type<select value={v.media} onChange={e=>set('media',e.target.value)}>{medias.map(m=><option key={m}>{m}</option>)}</select></label>
   <label>Delivery<select value={v.status} onChange={e=>set('status',e.target.value)}><option value="draft">Save as draft</option><option value="scheduled">Schedule for later</option></select></label>
   {v.status==='scheduled'&&<label>Schedule time (IST)<input type="datetime-local" value={v.scheduledAt} onChange={e=>set('scheduledAt',e.target.value)}/></label>}
  </div>
  <label>Title<input required maxLength={160} value={v.title} onChange={e=>set('title',e.target.value)} placeholder="Short, clear title"/></label>
  <label>Message<textarea required maxLength={2000} rows={4} value={v.body} onChange={e=>set('body',e.target.value)} placeholder="What should teams know?"/></label>
  <p className="saas-form-hint">Sent broadcasts fan out once and cannot be edited; drafts and scheduled items can be updated or cancelled.</p>
  </div><footer><button type="button" className="saas-button" onClick={onClose}>Cancel</button><Submit busy={busy}>{v.id?'Save changes':v.status==='scheduled'?'Schedule broadcast':'Save draft'}</Submit>{!v.id&&v.status==='draft'&&<button type="button" className="saas-button" disabled={busy} onClick={()=>{if(v.title&&v.body)onSave({...v,status:'draft'},true);}}>Save & send now</button>}</footer></form></Modal>;
}
function TemplateEditor({values,busy,onClose,onSave}){
 const [v,setV]=useState(values);const set=(k,x)=>setV(s=>({...s,[k]:x}));
 return <Modal title={'Edit reminder · '+v.slug} description="Triggered automatically. Use {{variables}} — empty values render as blank." onClose={onClose}>
  <form onSubmit={e=>{e.preventDefault();onSave(v);}}><div className="saas-modal-body">
  <div className="saas-form-grid">
   <label>Category<select value={v.category} onChange={e=>set('category',e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
   <label>Channel<select value={v.channel} onChange={e=>set('channel',e.target.value)}>{medias.map(m=><option key={m}>{m}</option>)}</select></label>
  </div>
  <label>Title<input required maxLength={160} value={v.title} onChange={e=>set('title',e.target.value)}/></label>
  <label>Body<textarea required maxLength={2000} rows={4} value={v.body} onChange={e=>set('body',e.target.value)}/></label>
  <label>Variables (comma separated)<input value={v.variables} onChange={e=>set('variables',e.target.value)} placeholder="booking, date, balance"/></label>
  <label className="saas-checkbox"><input type="checkbox" checked={v.enabled} onChange={e=>set('enabled',e.target.checked)}/>Enabled — generation uses this copy; disabled uses safe built-in fallback text</label>
  </div><footer><button type="button" className="saas-button" onClick={onClose}>Cancel</button><Submit busy={busy}>Save template</Submit></footer></form></Modal>;
}
