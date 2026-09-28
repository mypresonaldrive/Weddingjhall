import React, { useEffect, useState } from 'react';
import { Check, CalendarDays, Utensils, Sparkles, ClipboardCheck, Pencil } from 'lucide-react';
import { bookingDuration, durationDescription } from '../shared/booking-duration.js';
export const BOOKING_STEPS=[
 {name:'Event',title:'Event & duration',hint:'Who, where and when',Icon:CalendarDays},
 {name:'Pricing',title:'Pricing & catering',hint:'Choose your agreement',Icon:Utensils},
 {name:'Extras',title:'Optional services',hint:'Only what you need',Icon:Sparkles},
 {name:'Review',title:'Review & confirm',hint:'Check before saving',Icon:ClipboardCheck},
];
export function useBookingWizard({kind,values,item,capacityExceeded,hallAvailability,pricingPreview,setError}){
 const [step,setStep]=useState(0);
 useEffect(()=>{
  if(kind!=='bookings')return;
  document.querySelector('.booking-modal .modal-body')?.scrollTo({top:0});
  document.querySelector('#booking-step-heading')?.focus({preventScroll:true});
 },[step,kind]);
 const reject=(index,message,input)=>{
  setStep(index);setError(message);
  if(input)requestAnimationFrame(()=>{for(let node=input.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;input.focus();input.scrollIntoView({block:'center'});});
  return false;
 };
 const validate=index=>{
  const section=document.querySelector(`[data-booking-step="${index}"]`);
  const invalid=[...(section?.querySelectorAll('input,select,textarea')||[])].find(input=>!input.checkValidity());
  if(invalid)return reject(index,`${invalid.getAttribute('aria-label')||invalid.closest('label')?.textContent?.split('\n')[0]||'This field'}: ${invalid.validationMessage}`,invalid);
  if(index===0){
   if(!values.name?.trim())return reject(0,'Enter an event name.');
   if(!Number.isInteger(Number(values.guests))||Number(values.guests)<1)return reject(0,'Expected guests must be a whole number of at least 1.');
   if(capacityExceeded)return reject(0,'Expected guests exceed the selected hall’s capacity.');
   try{bookingDuration(values);}catch(error){return reject(0,error.message);}
   if(hallAvailability?.available===false&&values.status!=='Cancelled')return reject(0,hallAvailability.reason+' Choose another hall or duration.');
  }
  if(index===1&&!values.planId&&!item)return reject(1,'Choose a pricing model.');
  return true;
 };
 const go=target=>{
  if(target>step)for(let index=0;index<target;index++)if(!validate(index))return;
  setError('');setStep(target);
 };
 const validateAll=()=>{
  for(let index=0;index<4;index++)if(!validate(index))return false;
  if(pricingPreview.error){setError(pricingPreview.error);return false;}
  return true;
 };
 return {step,go,validateAll};
}
export function BookingStepper({step,onSelect,busy}){
 return <nav className="booking-stepper" aria-label="Booking progress"><div className="stepper-caption"><span>Step {step+1} of 4</span><strong>{BOOKING_STEPS[step].title}</strong><small>{step===2?'Optional':'Changes stay in this form'}</small></div><ol>{BOOKING_STEPS.map((entry,index)=><li key={entry.name}><button type="button" disabled={busy} onClick={()=>onSelect(index)} aria-current={index===step?'step':undefined} aria-label={`Step ${index+1}: ${entry.title}`} className={index===step?'current':index<step?'complete':''}><span>{index<step?<Check size={15}/>:<entry.Icon size={16}/>}</span><strong>{entry.name}</strong></button></li>)}</ol><h3 className="sr-only" tabIndex={-1} id="booking-step-heading">Step {step+1}: {BOOKING_STEPS[step].title}</h3></nav>;
}
export function BookingReviewCard({values,data,onEdit}){
 const rows=[['Client',data.clients.find(c=>c.id===values.clientId)?.name],['Hall',data.halls.find(h=>h.id===values.hallId)?.name],['Event',values.type],['Expected guests',values.guests]];
 return <section className="booking-review-card"><div className="review-card-heading"><div><small>READY FOR YOUR REVIEW</small><h3>{values.name||'Your event'}</h3></div><button type="button" className="text-button" onClick={()=>onEdit(0)}><Pencil size={14}/>Edit event</button></div><dl>{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Not selected'}</dd></div>)}</dl><p>{durationDescription(values)}</p><span className={'badge '+String(values.status).toLowerCase()}>{values.status}</span><div className="review-edit-links"><button type="button" onClick={()=>onEdit(1)}>Edit pricing & menu</button><button type="button" onClick={()=>onEdit(2)}>Edit extras ({values.addOns?.length||0})</button></div></section>;
}
