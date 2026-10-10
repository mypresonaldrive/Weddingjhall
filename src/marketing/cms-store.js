import {starterEntries} from '../../shared/marketing-content.js';
const KEY='gatherhall-cms-preview-v1';
export function readPreviewEntries(){try{const data=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(data))return data;}catch{}return starterEntries();}
export function writePreviewEntries(entries){localStorage.setItem(KEY,JSON.stringify(entries));window.dispatchEvent(new Event('cms-preview-updated'));}
export function resetPreviewEntries(){localStorage.removeItem(KEY);window.dispatchEvent(new Event('cms-preview-updated'));}
export function publicPreviewEntries(locale){return readPreviewEntries().filter(e=>e.locale===locale&&e.published).sort((a,b)=>(Date.parse(b.published_at)||0)-(Date.parse(a.published_at)||0)).map(({id,kind,slug,locale,published,published_at})=>({id,kind,slug,locale,content:published,published_at}));}
