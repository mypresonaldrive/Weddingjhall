import { useEffect, useState } from 'react';
const STORAGE_KEY = 'gatherhall-sidebar-collapsed';
export function useSidebar(mobile, setMobile) {
 const [compact, setCompact] = useState(()=>window.matchMedia('(max-width:700px)').matches);
 const [collapsed, setCollapsed] = useState(()=>{try{return localStorage.getItem(STORAGE_KEY)==='true';}catch{return false;}});
 useEffect(()=>{
  const media=window.matchMedia('(max-width:700px)');
  const change=()=>{setCompact(media.matches);setMobile(false);};
  media.addEventListener('change',change);
  return ()=>media.removeEventListener('change',change);
 },[setMobile]);
 useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,String(collapsed));}catch{/* Storage is optional. */}},[collapsed]);
 useEffect(()=>{
  if(!compact||!mobile)return;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const sidebar=document.getElementById('workspace-sidebar');
  sidebar?.querySelector('.sidebar-close')?.focus();
  const keyboard=e=>{
   if(e.key==='Escape'){e.preventDefault();setMobile(false);return;}
   if(e.key!=='Tab'||!sidebar)return;
   const controls=[...sidebar.querySelectorAll('a[href],button:not(:disabled),input,select,textarea,[tabindex="0"]')].filter(el=>el.getClientRects().length);
   const first=controls[0],last=controls.at(-1);
   if(e.shiftKey&&(document.activeElement===first||!sidebar.contains(document.activeElement))){e.preventDefault();last?.focus();}
   else if(!e.shiftKey&&(document.activeElement===last||!sidebar.contains(document.activeElement))){e.preventDefault();first?.focus();}
  };
  document.addEventListener('keydown',keyboard);
  return ()=>{
   document.body.style.overflow=previousOverflow;
   document.removeEventListener('keydown',keyboard);
   document.getElementById('sidebar-toggle')?.focus();
  };
 },[compact,mobile,setMobile]);
 const expanded=compact?mobile:!collapsed;
 return {compact,collapsed,expanded,toggle:()=>compact?setMobile(open=>!open):setCollapsed(value=>!value)};
}
