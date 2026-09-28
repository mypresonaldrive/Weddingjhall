import React, { useRef, useState } from 'react';
import { Check, Plus, ListChecks, ArrowUp, ArrowDown, Trash2, ChevronDown, Eye } from 'lucide-react';
import { MAX_SERVICE_FEATURES, MAX_FEATURE_LENGTH, normalizeFeatures } from '../shared/booking-pricing.js';
import './inclusions.css';

export function FeatureList({ features = [], compact = false, title = "What’s included", expandable = true }) {
  const [expanded, setExpanded] = useState(false);
  if (!features.length) return null;
  const limit = compact ? 3 : 4;
  const visible = !expandable || expanded ? features : features.slice(0, limit);
  return <div className={'service-features '+(compact?'compact':'')}>
    {title&&<div className="features-list-heading"><span>{title}</span><span>{features.length}</span></div>}
    <ul>{visible.map((feature,index)=><li key={index}><span className="feature-check"><Check size={12} strokeWidth={2}/></span><span>{feature}</span></li>)}</ul>
    {expandable&&features.length>limit&&<button type="button" className="features-expand" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':`Show ${features.length-limit} more inclusions`}<ChevronDown size={13} className={expanded?'expanded':''}/></button>}
  </div>;
}

export function ServiceFeaturesEditor({ value = [], onChange, serviceName = '', category = '' }) {
  const inputs = useRef([]);
  const addButton = useRef(null);
  const [error,setError] = useState('');
  const [announcement,setAnnouncement] = useState('');
  const rows = value;
  const completed = normalizeFeatures(rows);
  const focus = index => requestAnimationFrame(()=>inputs.current[index]?.focus());
  const add = (text='', after=rows.length-1) => {
    if(rows.length>=MAX_SERVICE_FEATURES)return;
    const next=[...rows];next.splice(after+1,0,text);onChange(next);setError('');setAnnouncement('Inclusion added.');focus(after+1);
  };
  const remove = index => {onChange(rows.filter((_,i)=>i!==index));setError('');setAnnouncement(`Inclusion ${index+1} removed.`);if(rows.length>1)focus(Math.min(index,rows.length-2));else requestAnimationFrame(()=>addButton.current?.focus());};
  const move = (index,direction) => {const next=[...rows];[next[index],next[index+direction]]=[next[index+direction],next[index]];onChange(next);setError('');setAnnouncement(`Inclusion moved to position ${index+direction+1}.`);focus(index+direction);};
  const paste = (event,index) => {
    const text=event.clipboardData.getData('text');
    if(!/[\r\n]/.test(text))return;
    event.preventDefault();
    const lines=text.split(/\r?\n/).map(line=>line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/,'').trim()).filter(Boolean);
    if(!lines.length)return;
    if(rows.length-1+lines.length>MAX_SERVICE_FEATURES||lines.some(line=>line.length>MAX_FEATURE_LENGTH)){setError(`Paste up to ${MAX_SERVICE_FEATURES} inclusions, each ${MAX_FEATURE_LENGTH} characters or fewer. Nothing was changed.`);return;}
    const next=[...rows];next.splice(index,1,...lines);onChange(next);setError('');setAnnouncement(`${lines.length} inclusions pasted.`);focus(index+lines.length-1);
  };
  const suggestions = /camera|photo|video/i.test(serviceName) ? ['Professional camera equipment','On-site photographer','Edited digital photos'] : category==='Accommodation' ? ['Fresh linen and towels','Check-in assistance','Daily housekeeping'] : category==='Catering' ? ['Serving staff','Serving essentials','Counter setup'] : category==='Entertainment' ? ['On-site operator','Sound check','Equipment setup'] : ['Equipment & setup','On-site assistance','Setup and dismantling'];
  return <section className="inclusions-editor" aria-labelledby="inclusions-editor-title">
    <div className="inclusions-editor-heading"><span className="inclusions-icon"><ListChecks size={19}/></span><div><h3 id="inclusions-editor-title">What’s included</h3><p>Give clients a clear picture of what comes with this service.</p></div><span className="inclusions-count" title={`${completed.length} completed inclusions`}>{rows.length}/{MAX_SERVICE_FEATURES}</span></div>
    {!rows.length&&<div className="inclusions-empty"><ListChecks size={24}/><div><strong>Small details. Clear expectations.</strong><p>Add equipment, deliverables, support or anything included in the rate.</p></div></div>}
    <div className="inclusion-rows">{rows.map((feature,index)=><div className="inclusion-row" key={index}><span className="inclusion-number">{String(index+1).padStart(2,'0')}</span><div className="inclusion-input-wrap"><input ref={el=>inputs.current[index]=el} aria-label={`Included feature ${index+1}`} placeholder="e.g. Professional camera equipment" value={feature} maxLength={MAX_FEATURE_LENGTH} onPaste={event=>paste(event,index)} onChange={event=>{onChange(rows.map((r,i)=>i===index?event.target.value:r));setError('');}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(feature.trim())add('',index);}}}/><small>{feature.length}/{MAX_FEATURE_LENGTH}</small></div><div className="inclusion-actions"><button type="button" className="icon-button" aria-label={`Move inclusion ${index+1} up`} disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={13}/></button><button type="button" className="icon-button" aria-label={`Move inclusion ${index+1} down`} disabled={index===rows.length-1} onClick={()=>move(index,1)}><ArrowDown size={13}/></button><button type="button" className="icon-button inclusion-remove" aria-label={`Remove inclusion ${index+1}`} onClick={()=>remove(index)}><Trash2 size={14}/></button></div></div>)}</div>
    <button ref={addButton} type="button" className="add-inclusion-button" disabled={rows.length>=MAX_SERVICE_FEATURES} onClick={()=>add()}><Plus size={15}/>Add inclusion<span>Enter ↵</span></button>
    <div className="inclusion-suggestions"><span>Try an example</span>{suggestions.filter(text=>!rows.some(row=>row.trim().toLowerCase()===text.toLowerCase())).map(text=><button type="button" key={text} disabled={rows.length>=MAX_SERVICE_FEATURES} onClick={()=>add(text)}><Plus size={11}/>{text}</button>)}</div>
    <p className="inclusion-tip">One inclusion per line. Paste a multi-line list to add several at once. Blank lines and duplicates are removed when saved.</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {completed.length>0&&<div className="inclusions-preview"><div className="inclusions-preview-label"><Eye size={13}/>CLIENT PREVIEW</div><FeatureList features={completed} expandable={false}/></div>}
  </section>;
}
