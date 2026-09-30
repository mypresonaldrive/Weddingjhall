// Platform settings: quick-setup integrations with readiness, provider editor with
// configuration / webhooks / advanced, SaaS branding with live preview, and
// informational noticeboards for security, general, team and webhook endpoints.
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Puzzle,Palette,Bell,ShieldCheck,Settings as SettingsIcon,Users,Webhook,CreditCard,Mail,MessageCircle,Check,Copy,Save,RotateCcw,Eye,EyeOff,LockKeyhole,ArrowUpRight,Info,CheckCircle2,Circle,CircleDot,FileKey2,ChevronRight} from 'lucide-react';
import {saasApi} from './api.js';
import {Notice,Loading} from './components.jsx';
import {integrationFields,providerPlaceholders,providerInputError} from '../../shared/integrations.js';
import './settings-page.css';
const tabs=[['integrations','Integrations',Puzzle],['branding','Branding',Palette],['notifications','Notifications',Bell],['security','Security',ShieldCheck],['general','General',SettingsIcon],['team','Team',Users],['api','API & Webhooks',Webhook]];
const providerMeta={
 razorpay:{name:'Razorpay',subtitle:'Payments & Subscriptions',icon:CreditCard,enableHint:'Allow organization subscriptions and online payments.',tip:'Use test credentials for development. Switch to live mode only after testing sign-up, renewal, failure and cancellation.',link:['https://dashboard.razorpay.com','View Razorpay Dashboard'],readiness:s=>[['Key pair saved',s.revision>0],['Webhook secret saved',s.secrets.webhookSecret],['Live mode enabled',null]],tips:['Keep API keys secure and never share them in chat or screenshots.','Use environment parity: one provider account across all instances.','Rotate keys periodically and update saved credentials together.','Test in sandbox mode first; monitor webhook logs for failures.']},
 email:{name:'Email',subtitle:'SMTP / Transactional',icon:Mail,enableHint:'Send booking notifications from your domain over TLS.',tip:'SMTP here is for booking notifications only. Sign-in, invite and recovery email is configured in Supabase Auth.',link:null,readiness:s=>[['Credentials saved',s.revision>0],['Verified sender set',!!s.fields.from],['Delivery worker enabled',null]],tips:['Use an app password or API credential—not your mailbox login.','Enable STARTTLS (587) or TLS (465); plain-text ports are rejected.','Verify sender domain SPF/DKIM before announcing to venues.']},
 sms:{name:'SMS',subtitle:'OTP & Notifications',icon:MessageCircle,enableHint:'Send booking updates through an approved DLT flow.',tip:'Confirm your MSG91 flow has DLT approval before enabling; unapproved templates are blocked by providers.',link:null,readiness:s=>[['Auth key saved',s.revision>0],['DLT flow confirmed',s.fields.approved==='true'],['Delivery worker enabled',null]],tips:['Use the approved Flow ID—not your account email or login.','Variables are capped at 30 characters by DLT rules.','Allocate message credits only after a successful test send.']},
 whatsapp:{name:'WhatsApp',subtitle:'Customer Communication',icon:MessageCircle,enableHint:'Send booking updates via Meta’s approved utility template.',tip:'Only approved utility templates deliver at scale; confirm the template name and language exactly.',link:null,readiness:s=>[['Token & phone ID saved',s.revision>0],['Template approved',s.fields.approved==='true'],['Delivery worker enabled',null]],tips:['Use a permanent system-user token, not a temporary one.','Keep template names lowercase with underscores only.','Provider conversation pricing is separate from your credit packs.']},
 fcm:{name:'Push (FCM)',subtitle:'App Notifications',icon:Bell,enableHint:'Platform push notifications for broadcasts and reminders.',tip:'Credentials enable server-side push setup. In-app delivery already works; browser tokens are the next step.',link:['https://console.firebase.google.com','Open Firebase Console'],readiness:s=>[['Credentials saved',s.revision>0],['In-app delivery active',true],['VAPID key saved',s.secrets.vapidKey],['Browser token registration',null]],tips:['Create a dedicated Firebase project for this platform.','The server credential stays server-side and encrypted.','Hosted web push needs the VAPID key from the Firebase console.']},
};
const initial=()=>({settings:Object.fromEntries(Object.keys(integrationFields).map(k=>[k,{enabled:false,revision:0,fields:{},secrets:{}}])),encryptionReady:false,workerEnabled:false,runtimeBilling:{enabled:false,mode:'off'},razorpaySource:'Design preview'});
const code="node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64'))\"";
export default function PlatformSettings({preview=false}){
 const [data,setData]=useState(null),[drafts,setDrafts]=useState({}),[tab,setTab]=useState('integrations'),[active,setActive]=useState('razorpay'),[sub,setSub]=useState('configuration'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[showSetup,setShowSetup]=useState(false),[test,setTest]=useState(null);
 const request=useRef(0),saving=useRef(false);
 async function load(only){const n=++request.current;try{const d=preview?initial():await saasApi('/platform/settings');if(n!==request.current)return;setData(d);setDrafts(prev=>only?{...prev,[only]:structuredClone(d.settings[only])}:structuredClone(d.settings));setError('');}catch(e){if(n===request.current)setError(e.message);}}
 useEffect(()=>{load();return()=>{request.current++;};},[preview]);
 const dirty=k=>!!data&&JSON.stringify(drafts[k])!==JSON.stringify(data.settings[k]);
 const anyDirty=data&&Object.keys(drafts).some(dirty),activeDirty=!!data&&dirty(active);
 useEffect(()=>{if(!anyDirty)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[anyDirty]);
 const change=(key,value)=>setDrafts(d=>({...d,[active]:{...d[active],...(key==='enabled'?{enabled:value}:{fields:{...d[active].fields,[key]:value,...(['flowId','template','language'].includes(key)?{approved:'false'}:{})}})}}));
 async function save(e){e.preventDefault();if(saving.current||preview)return;saving.current=true;setBusy(true);setError('');setNotice('');const kind=active;try{const s=drafts[kind];for(const [key,value] of Object.entries(s.fields)){const problem=providerInputError(kind,key,value);if(problem)throw Error(problem);}await saasApi('/platform/settings/'+kind,'POST',{enabled:s.enabled,revision:s.revision,fields:s.fields});setTest(null);setNotice(kind==='razorpay'?'Saved. Restart all app instances to apply payment changes.':'Provider settings saved. This does not verify delivery.');await load(kind);}catch(err){setError(err.message);}finally{saving.current=false;setBusy(false);}}
 async function testConnection(){if(preview)return;setBusy(true);setTest(null);try{const r=await saasApi('/platform/integrations/test','POST',{kind:'razorpay'});setTest({ok:true,message:r.mode==='live'?'Connected — live key pair accepted by Razorpay.':'Connected — test key pair accepted by Razorpay.'});}catch(err){setTest({ok:false,message:err.message});}finally{setBusy(false);}}
 async function copy(text,label){try{await navigator.clipboard.writeText(text);setNotice(label+' copied to clipboard.');}catch{setError('Clipboard unavailable. Select and copy the value manually.');}}
 if(!data)return <div className="settings-page">{error?<Notice error>{error} <button onClick={()=>load()}>Retry loading settings</button></Notice>:<Loading/>}</div>;
 const s=drafts[active],definition=integrationFields[active],meta=providerMeta[active],saved=data.settings[active];
 const invalid=definition.fields.some(([key])=>providerInputError(active,key,s.fields[key]||''));
 const locked=preview||busy||!data.encryptionReady;
 const configured=Object.keys(integrationFields).filter(k=>{const row=data.settings[k];return row.revision>0;}).length;
 const selectProvider=k=>{if(dirty(active)&&!window.confirm('Discard unsaved changes to '+providerMeta[active].name+'?'))return;setActive(k);setSub('configuration');setTest(null);};
 return <div className="settings-page">
  <header className="settings-head"><h1>Settings</h1><p>Manage your platform configuration, integrations, and branding.</p></header>
  <nav className="settings-tabs" aria-label="Settings sections">{tabs.map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}><Icon size={15}/>{label}</button>)}</nav>
  {tab==='integrations'&&<KeyedIntegration preview={preview} data={data} drafts={drafts} active={active} sub={sub} setSub={setSub} meta={meta} definition={definition} s={s} saved={saved} invalid={invalid} locked={locked} busy={busy} configured={configured} error={error} notice={notice} test={test} selectProvider={selectProvider} change={change} save={save} copy={copy} setError={setError} setNotice={setNotice} setTest={setTest} testConnection={testConnection} showSetup={showSetup} setShowSetup={setShowSetup} dirty={dirty} activeDirty={activeDirty} code={code} load={load}/>}
  {tab==='branding'&&<BrandingPanel preview={preview}/>}
  {tab==='notifications'&&<section className="settings-card"><div className="settings-card-head"><span className="settings-icon"><Bell size={20}/></span><div><h2>Notification centre</h2><p>Broadcasts to entire organizations and automatic reminders — scheduled, dispatched and audited from one place.</p></div></div>
   <div className="settings-facts"><div><span>Categories</span><strong>announcement · maintenance · billing · event · system</strong></div><div><span>Media</span><strong>banner (bell feed) · popup (one-time) · push (FCM)</strong></div><div><span>Auto reminders</span><strong>subscription expiring · payment due · event tomorrow</strong></div><div><span>Audiences</span><strong>all organizations · organizations in trial</strong></div></div>
   <p className="settings-help">Dispatches are idempotent: re-sending a broadcast is rejected, and reminder generation never duplicates. Templates with variables like {'{{booking}}'} and {'{{date}}'} are edited on the same page.</p>
   <div className="settings-actions"><a className="saas-button primary" href="/platform#notifications">Open notification centre <ArrowUpRight size={14}/></a><button className="saas-button" onClick={()=>{setActive('fcm');setSub('configuration');setTab('integrations');}}>Configure FCM credentials</button></div></section>}
  {tab==='security'&&<section className="settings-card"><div className="settings-card-head"><span className="settings-icon"><ShieldCheck size={20}/></span><div><h2>Security posture</h2><p>How platform credentials, secrets and admin actions are protected.</p></div></div>
   <ul className="readiness-list large">{[
    ['Credential encryption',data.encryptionReady,data.encryptionReady?'INTEGRATION_ENCRYPTION_KEY is set — provider secrets are AES-256-GCM encrypted at rest.':'Missing encryption key — provider fields stay locked until it is configured (see Integrations → setup guide).'],
    ['Atomic saves with compare-and-swop',true,'Concurrent edits are rejected with “settings changed elsewhere”; every write records an audit entry.'],
    ['Secret handling',true,'Saved passwords are never returned to the browser; only their presence is shown.'],
    ['Connection testing',true,'“Test connection” verifies credentials against the provider API without exposing them.'],
    ['Administrator MFA',null,'Require an authenticator for every platform admin in Supabase Auth, and review sessions regularly.']].map(([label,ok,description])=><li key={label} className={ok===true?'ok':ok===false?'needs':'todo'}>{ok===true?<CheckCircle2 size={16}/>:ok===false?<CircleDot size={16}/>:<Circle size={16}/>}<div><strong>{label}</strong><small>{description}</small></div></li>)}</ul>
   <div className="settings-actions"><a className="saas-button" href="/platform#audit">Open audit trail <ArrowUpRight size={14}/></a><a className="saas-button" href="/platform#launch">Launch checklist</a></div></section>}
  {tab==='general'&&<section className="settings-card"><div className="settings-card-head"><span className="settings-icon"><SettingsIcon size={20}/></span><div><h2>General</h2><p>Environment facts about this deployment.</p></div></div>
   <div className="settings-kv">{[['Platform URL',location.origin,'copy'],['Billing mode',data.runtimeBilling.enabled?(data.runtimeBilling.mode==='live'?'Live Razorpay':'Test Razorpay'):'Not configured',''],['Message delivery worker',data.workerEnabled?'Enabled':'Disabled',''],['Credentials source',data.razorpaySource,''],['Design theme','Platform palette (light/dark follows your OS toggle)','']].map(([label,value,kind])=><div key={label} className="settings-kv-row"><span>{label}</span><strong>{value}</strong>{kind==='copy'&&<button className="saas-button small" onClick={()=>copy(location.origin,'Platform URL')}><Copy size={13}/>Copy</button>}</div>)}</div>
   <p className="settings-help">To change the product name, support email or logo shown on sign-in and marketing pages, use the Branding tab above.</p>
   <div className="settings-actions"><button className="saas-button" onClick={()=>setTab('branding')}>Edit branding <Palette size={14}/></button></div></section>}
  {tab==='team'&&<section className="settings-card"><div className="settings-card-head"><span className="settings-icon"><Users size={20}/></span><div><h2>Team access</h2><p>Platform administrators sign in with verified email and MFA.</p></div></div>
   <p className="settings-help">Additional platform administrators are created from the server bootstrap (out-of-band, never from this browser). Venue-level owners, staff and clients live inside each organization’s own workspace and receive invitations by email.</p>
   <div className="settings-facts"><div><span>Your role</span><strong>Platform administrator</strong></div><div><span>Session scope</span><strong>Platform console only</strong></div><div><span>Recommended</span><strong>One admin per person — never share sign-ins</strong></div></div>
   <div className="settings-actions"><a className="saas-button" href="/platform#organizations">View organizations <ArrowUpRight size={14}/></a></div></section>}
  {tab==='api'&&<WebhookCard preview={preview} copy={copy} compact={false}/>}
 </div>;
}

function KeyedIntegration(props){
 const {preview,data,drafts,active,sub,setSub,meta,definition,s,saved,invalid,locked,busy,configured,error,notice,test,selectProvider,select,change,save,copy,setError,setNotice,setTest,testConnection,showSetup,setShowSetup,dirty,activeDirty,code,load,jump}=props;
 const [show,setShow]=useState({});
 const MetaIcon=meta.icon;
 const readinessComputed=meta.readiness(saved).map(([label,ok])=>{let v=ok;if(v===null){v=null;}else if(label==='Live mode enabled')v=data.runtimeBilling.mode==='live';else if(label==='Delivery worker enabled')v=data.workerEnabled;else if(label==='Connection verified')v=!!(test&&test.ok);return [label,v];});
 return <>
  {!data.encryptionReady&&!preview&&<Notice error>One setup step before saving providers: <button type="button" onClick={()=>setShowSetup(true)}>Open setup guide</button></Notice>}
  <section className="settings-card quick-setup">
   <div className="qs-head"><div className="settings-card-head"><span className="settings-icon"><Puzzle size={20}/></span><div><h2>Quick Setup</h2><p>Configure the essential services to get your platform running smoothly.</p></div></div>
    <div className="qs-progress"><small>{configured} of {Object.keys(integrationFields).length} configured</small><div className="qs-bar"><span style={{width:(100*configured/Object.keys(integrationFields).length)+'%'}}/></div></div>
    <button type="button" className="saas-button" aria-expanded={showSetup} onClick={()=>setShowSetup(v=>!v)}><FileKey2 size={15}/>{showSetup?'Hide setup guide':'View setup guide'}</button></div>
   {showSetup&&<div className="qs-guide">
    {data.encryptionReady?<Notice><CheckCircle2 size={15}/> Credential encryption is ready — secrets are stored with AES-256-GCM and never returned to the browser.</Notice>:<>
     <p><LockKeyhole size={14}/> Provider fields are locked until a valid encryption key exists. Set it once:</p>
     <ol><li>In your own terminal, generate a key:<div className="copy-code"><code>{code}</code><button type="button" className="saas-button" onClick={()=>copy(code,'command')}><Copy size={13}/>Copy command</button></div></li><li>Add the result as <code>INTEGRATION_ENCRYPTION_KEY</code> in your deployment environment (runtime, same value on every instance; keep a private backup).</li><li>Redeploy, then <button type="button" className="text-link" onClick={()=>load()}>recheck setup</button>. Already encrypted credentials require the original key — do not replace it blindly.</li></ol></>}
   </div>}
   <div className="provider-chips" role="listbox" aria-label="Choose a provider">{Object.keys(integrationFields).map(kind=>{const m=providerMeta[kind],row=data.settings[kind],Ico=m.icon,on=row.revision>0;return <button type="button" role="option" aria-selected={active===kind} key={kind} className={'provider-chip '+(active===kind?'selected':'')} onClick={()=>selectProvider(kind)}>
     <span className="chip-icon"><Ico size={20}/></span>
     <span className="chip-text"><strong>{m.name}</strong><small>{m.subtitle}</small><em className={'chip-state '+(on?(row.enabled||kind==='razorpay'&&data.runtimeBilling.enabled?'ok':'held'):'pending')}>{on?(row.enabled||kind==='razorpay'&&data.runtimeBilling.enabled?'Configured':'Saved · disabled'):(kind==='razorpay'&&data.runtimeBilling.enabled?'Using server credentials':'Not configured')}</em></span>
     <ChevronRight size={14} className="chip-caret"/></button>;})}</div>
  </section>
  {error&&<Notice error>{error}</Notice>}{notice&&<Notice>{notice}</Notice>}
  <div className="provider-layout">
   <section className="settings-card provider-card">
    <div className="provider-head"><span className="provider-icon"><MetaIcon size={22}/></span><div><h2>{definition.label}</h2><p>{definition.hint}</p></div>
     <div className="provider-badges"><span className={'chip-state '+(activeDirty?'held':saved.revision>0&&saved.enabled?'ok':'pending')}>{activeDirty?'Unsaved':saved.revision>0?(saved.enabled?'Configured':'Saved · disabled'):'Not configured'}</span>{active==='razorpay'&&<button type="button" className="saas-button" disabled={locked||busy||saved.revision===0} onClick={testConnection} title={saved.revision===0?'Save credentials first':'Verify saved credentials with Razorpay'}>{busy?'Testing…':'Test Connection'}</button>}</div></div>
    {test&&<Notice error={!test.ok}>{test.message}</Notice>}
    <nav className="provider-subtabs" aria-label={'Sections for '+meta.name}>{[['configuration','Configuration'],['webhooks','Webhook & Events'],['advanced','Advanced']].map(([id,label])=>(id!=='webhooks'||active==='razorpay')&&<button key={id} className={sub===id?'active':''} onClick={()=>setSub(id)}>{label}</button>)}</nav>
    {sub==='configuration'&&<>
     <div className="enable-card"><div><strong>{saved.enabled?'Enabled':'Enable '+meta.name}</strong><small>{meta.enableHint}</small></div>
      <label className="switch"><input type="checkbox" checked={s.enabled} disabled={locked} onChange={e=>change('enabled',e.target.checked)}/><span/></label></div>
     <form onSubmit={save} autoComplete="off" key={active+':'+saved.revision}>
      <fieldset disabled={locked} className="field-grid">{definition.fields.map(([key,label,secret,type])=>{const problem=providerInputError(active,key,s.fields[key]||''),id=`field-${active}-${key}`;
       if(type==='checkbox')return <label key={key} htmlFor={id} className={'approval-field full '+type}><input id={id} type="checkbox" checked={s.fields[key]==='true'} onChange={e=>change(key,String(e.target.checked))}/><span><strong>{label}</strong><small>Unchecking resets whenever the template or language changes.</small></span></label>;
       const visible=!!show[key];
       return <label key={key} htmlFor={id}><span>{label}{secret&&<LockKeyhole size={11}/>}</span>
        {key==='port'?<select id={id} value={s.fields[key]||''} required={s.enabled} onChange={e=>change(key,e.target.value)}><option value="">Choose secure port</option><option value="587">587 · STARTTLS</option><option value="465">465 · TLS</option></select>:
        <span className="input-action"><input id={id} name={`provider-${active}-${key}`} type={secret&&!visible?'password':key==='from'?'email':'text'} autoComplete="new-password" data-lpignore="true" spellCheck={false} autoCapitalize="none" required={s.enabled&&(!secret||!s.secrets[key])} aria-invalid={!!problem} aria-describedby={problem?id+'-error':undefined} maxLength={4096} placeholder={secret?(s.secrets[key]?'Saved securely — leave blank to keep':'Paste provider secret'):providerPlaceholders[key]||label} value={s.fields[key]||''} onChange={e=>change(key,e.target.value)}/>
        {secret?<button type="button" className="input-tool" aria-label={visible?'Hide value':'Show value'} onClick={()=>setShow(v=>({...v,[key]:!v[key]}))}>{visible?<EyeOff size={14}/>:<Eye size={14}/>}</button>:!!(s.fields[key])&&<button type="button" className="input-tool" aria-label={'Copy '+label} onClick={()=>copy(s.fields[key],label)}><Copy size={14}/></button>}</span>}
        {problem&&<small className="field-error" id={id+'-error'}>{problem}</small>}
        {secret&&s.secrets[key]&&!problem&&<small className="field-hint">Leave blank to retain the saved secret.</small>}
       </label>;})}</fieldset>
      <div className="provider-tip"><Info size={15}/><p><strong>Important.</strong> {meta.tip}{meta.link&&<a href={meta.link[0]} target="_blank" rel="noopener noreferrer">{meta.link[1]} <ArrowUpRight size={12}/></a>}</p></div>
      <div className="provider-actions"><span className="save-state">{!data.encryptionReady?'Encryption setup required':activeDirty?'You have unsaved changes':'No unsaved changes'}</span>
       <button type="button" className="saas-button" disabled={busy||!activeDirty} onClick={()=>load(active)}><RotateCcw size={14}/>Discard changes</button>
       <button className="saas-button primary" disabled={locked||!activeDirty||invalid}><Save size={15}/>{busy?'Saving…':'Save Changes'}</button></div>
     </form></>}
    {sub==='webhooks'&&<WebhookCard preview={preview} copy={copy} compact/>}
    {sub==='advanced'&&<div className="advanced-list"><h3>Operational notes</h3><ul>{(active==='razorpay'?[
      'Saved credentials take effect after restarting every app instance; the runtime badge confirms which set is live.',
      'Do not switch Razorpay accounts while active mandates exist — migrate first, then update keys.',
      'Test keys (rzp_test_) are rejected in production unless ALLOW_TEST_BILLING is set for staging.']:
     active==='email'?[
      'Ports 465 (TLS) and 587 (STARTTLS) only; the server blocks private SMTP hosts.',
      'Failed deliveries retry from the credit wallet queue; unknown outcomes are skipped, never retried blindly.']:
     active==='fcm'?[
      'Device delivery additionally requires registering browser tokens with the Firebase client SDK — that step is pending; in-app delivery already works.',
      'Rotate the server credential from the Firebase console and save the new value here.']:
      ['Unapproved templates are rejected; the “approved” confirmation is required to enable.',
       'Message credits are decremented per accepted provider message — allocate packs from Messages & credits.']).map((t,i)=><li key={i}>{t}</li>)}</ul>
     <div className="settings-facts"><div><span>Credentials source</span><strong>{active==='razorpay'?data.razorpaySource:'Saved dashboard settings'}</strong></div>{active==='razorpay'&&<div><span>Runtime mode</span><strong>{data.runtimeBilling.enabled?data.runtimeBilling.mode:'off'}</strong></div>}<div><span>Last saved</span><strong>{saved.updatedAt?new Date(saved.updatedAt).toLocaleString():'Never'}</strong></div></div></div>}
   </section>
   <aside className="provider-side">
    <section className="settings-card readiness-card"><div className="settings-card-head"><span className="settings-icon small"><CreditCard size={17}/></span><div><h2>{active==='razorpay'?'Payment Readiness':active==='fcm'?'Push Readiness':'Sending Readiness'}</h2><p>{active==='razorpay'?'Get your platform ready to accept payments.':'Get your platform ready to send.'}</p></div></div>
     <ul className="readiness-list">{readinessComputed.map(([label,ok])=><li key={label} className={ok===true?'ok':ok===false?'needs':'todo'}>{ok===true?<CheckCircle2 size={15}/>:ok===false?<Circle size={15}/>:<CircleDot size={15}/>}<span>{label}</span>{ok===true&&<small>Done</small>}{ok===false&&<small>Pending</small>}{ok===null&&<small>Review</small>}</li>)}</ul>
     {active!=='razorpay'&&<a className="saas-button wide" href="/platform#messages">Open Messages & Credits <ArrowUpRight size={13}/></a>}
     {active==='razorpay'&&<a className="saas-button wide" href="/platform#plans">Review subscription plans <ArrowUpRight size={13}/></a>}</section>
    <section className="settings-card tips-card"><div className="settings-card-head"><span className="settings-icon small"><ShieldCheck size={17}/></span><div><h2>Security Tips</h2></div></div>
     <ul>{meta.tips.map((t,i)=><li key={i}>{t}</li>)}</ul></section>
   </aside>
  </div></>;
}

function WebhookCard({preview,copy,compact=false}){
 const rows=[['Subscriptions','Receive events for subscription payments and plan changes.','/api/webhooks/razorpay'],['Credit recharges','Handle wallet recharges and payment captures.','/api/webhooks/credits']];
 return <section className={'settings-card webhook-card'+(compact?' compact':'')}><div className="settings-card-head"><span className="settings-icon"><Webhook size={20}/></span><div><h2>Webhook Endpoints</h2><p>Configure these in Razorpay with the matching webhook secret.</p></div><a className="saas-button doc-link" href="https://razorpay.com/docs/webhooks/" target="_blank" rel="noopener noreferrer">View webhook documentation <ArrowUpRight size={13}/></a></div>
  <div className="webhook-rows">{rows.map(([label,description,path])=><div className="webhook-row" key={path}><span className="settings-icon tiny"><Webhook size={15}/></span><div><strong>{label}</strong><small>{description}</small><code>{location.origin+path}</code></div><button className="saas-button" onClick={()=>copy(location.origin+path,label+' URL')}><Copy size={13}/>Copy</button></div>)}</div>
  <p className="settings-help">Signatures must verify against the saved webhook secret; unverified events are rejected. Monitor failed webhooks and reconcile from the billing ledger.</p></section>;
}

const defaultBrandingValues={logoText:'Gatherhall',logoUrl:'',title:'Gatherhall',tagline:'Every celebration, beautifully managed',description:'',supportEmail:'',footerNote:''};
function BrandingPanel({preview}){
 const [data,setData]=useState(null),[values,setValues]=useState(defaultBrandingValues),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[logoOk,setLogoOk]=useState(false);
 const request=useRef(0);
 async function load(){const n=++request.current;try{const d=preview?{values:defaultBrandingValues,revision:0,updatedAt:null}:await saasApi('/platform/branding');if(n!==request.current)return;setData(d);setValues({...defaultBrandingValues,...d.values});setLogoOk(false);setError('');}catch(e){if(n===request.current)setError(e.message);}}
 useEffect(()=>{load();},[preview]);
 const merged={...defaultBrandingValues,...(data?.values||{})};
 const dirty=data&&JSON.stringify(values)!==JSON.stringify(merged);
 async function save(e){e.preventDefault();if(preview||busy)return;setBusy(true);setError('');setNotice('');try{await saasApi('/platform/branding','POST',{values,revision:data?data.revision:0});setNotice('Branding saved. Sign-in and workspaces pick it up within a few seconds.');await load();}catch(err){setError(err.message);}finally{setBusy(false);}}
 const set=(k,v)=>setValues(s=>({...s,[k]:v}));
 const monogram=(values.logoText||values.title||'G').replace(/\s+/g,'').slice(0,2)||'G';
 const validLogo=/^https:\/\//.test(values.logoUrl||'');
 if(!data)return <Loading/>;
 return <>
  {error&&<Notice error>{error}</Notice>}{notice&&<Notice>{notice}</Notice>}
  <section className="settings-card branding-panel">
   <div className="settings-card-head"><span className="settings-icon"><Palette size={20}/></span><div><h2>SaaS Branding</h2><p>This information will be shown on the sign-in page, emails and marketing pages.</p></div><span className={'chip-state '+(dirty?'held':'ok')}>{dirty?'Unsaved':'Saved'}{data.updatedAt?' · '+new Date(data.updatedAt).toLocaleDateString():''}</span></div>
   <div className="branding-layout">
    <form onSubmit={save} autoComplete="off"><fieldset disabled={preview||busy} className="field-grid branding-grid">
     <label htmlFor="br-title"><span>Platform Name</span><input id="br-title" required maxLength={80} value={values.title} onChange={e=>set('title',e.target.value)} placeholder="Gatherhall"/></label>
     <label htmlFor="br-logo"><span>Logo (Monogram)</span><input id="br-logo" required maxLength={12} value={values.logoText} onChange={e=>set('logoText',e.target.value)} placeholder="Gatherhall"/></label>
     <label htmlFor="br-url"><span>Logo Image URL (optional)</span><span className="input-action"><input id="br-url" type="url" maxLength={500} value={values.logoUrl} onChange={e=>{set('logoUrl',e.target.value);setLogoOk(false);}} placeholder="https://your-domain.com/logo.png"/>{validLogo&&logoOk&&<a className="input-tool" href={values.logoUrl} target="_blank" rel="noreferrer" aria-label="Open logo preview"><ArrowUpRight size={14}/></a>}</span></label>
     <label htmlFor="br-tag"><span>Tagline</span><input id="br-tag" maxLength={160} value={values.tagline} onChange={e=>set('tagline',e.target.value)} placeholder="Every celebration, beautifully managed"/></label>
     <label htmlFor="br-mail"><span>Support Email</span><input id="br-mail" type="email" maxLength={120} value={values.supportEmail} onChange={e=>set('supportEmail',e.target.value)} placeholder="support@your-domain.com"/></label>
     <label htmlFor="br-foot"><span>Footer Note (optional)</span><input id="br-foot" maxLength={200} value={values.footerNote} onChange={e=>set('footerNote',e.target.value)} placeholder="© Your company · privacy · terms"/></label>
     <label htmlFor="br-desc" className="full"><span>Description</span><textarea id="br-desc" maxLength={400} rows={3} value={values.description} onChange={e=>set('description',e.target.value)} placeholder="A complete platform for wedding and banquet hall management, bookings, teams and payments."/></label>
    </fieldset>
    <div className="provider-actions"><button type="button" className="saas-button" disabled={busy||!dirty} onClick={()=>setValues(merged)}><RotateCcw size={14}/>Discard</button><button className="saas-button primary" disabled={preview||busy||!dirty}><Save size={15}/>{busy?'Saving…':'Save Branding'}</button></div></form>
    <div className="brand-side">
     <article className="brand-preview"><small>Brand preview</small>
      <div className="brand-clay">{validLogo&&logoOk!==false?<img src={values.logoUrl} alt="" onLoad={()=>setLogoOk(true)} onError={()=>setLogoOk(false)}/>:<span>{monogram}</span>}</div>
      <strong>{values.title}</strong><p>{values.tagline||'Find · Compare · Book'}</p>
      {values.description&&<small className="brand-desc">{values.description}</small>}
      {values.footerNote&&<footer>{values.footerNote}</footer>}
     </article>
     <article className="app-icon"><div className="app-icon-tile">{validLogo&&logoOk!==false?<img src={values.logoUrl} alt="" onLoad={()=>setLogoOk(true)} onError={()=>setLogoOk(false)}/>:<span>{monogram}</span>}</div><strong>App icon</strong><small>PNG, JPG or SVG over HTTPS. Hosted URLs (under 200 KB) keep sign-in fast; use the Logo Image URL field.</small></article>
    </div>
   </div>
  </section></>;
}
