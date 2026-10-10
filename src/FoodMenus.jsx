import React, { useState } from 'react';
import { Utensils, Plus, Trash2, ArrowUp, ArrowDown, ChevronDown, Sparkles, Check } from 'lucide-react';
import { FOOD_TYPES, MENU_SECTIONS, sampleMenus, menuItemCount } from '../shared/food-menus.js';
import './food-menus.css';
export function FoodMenuView({menu, expanded=false, title='Food menu'}) {
 if(!menu)return null;
 return <details className="food-menu-view" open={expanded}><summary><span className="menu-summary-icon"><Utensils size={16}/></span><span><strong>{title}</strong><small>{menu.plateType} · {menuItemCount(menu)} food items · {menu.sections.length} courses</small></span><ChevronDown size={15}/></summary><div className="food-menu-courses">{menu.sections.map((section,i)=><section key={i}><h4>{section.name}</h4><ul>{section.items.map((item,j)=><li key={j}><Check size={11}/><span>{item}</span></li>)}</ul></section>)}</div></details>;
}
export function MenuCatalogPreview({menus=[]}) {
 const [choice,setChoice]=useState('');
 const menu=menus.find(m=>m.plateType===choice)||menus[0];
 if(!menu)return <p className="no-food-menu"><Utensils size={13}/> No itemized food menu listed</p>;
 return <div className="menu-catalog-preview">{menus.length>1&&<select aria-label="Preview meal type" value={menu.plateType} onChange={e=>setChoice(e.target.value)}>{menus.map(m=><option key={m.plateType}>{m.plateType}</option>)}</select>}<FoodMenuView menu={menu} title="Explore the menu"/></div>;
}
export function FoodMenuEditor({value=[],onChange,mode}) {
 const [active,setActive]=useState(''),[choice,setChoice]=useState(FOOD_TYPES[0]),[course,setCourse]=useState('');
 const available=FOOD_TYPES.filter(type=>!value.some(menu=>menu.plateType===type));
 const chosen=available.includes(choice)?choice:available[0];
 const index=Math.max(0,value.findIndex(menu=>menu.plateType===active)),menu=value[index];
 const names=menu?.sections.map(section=>section.name)||[];
 const selectedCourse=course||MENU_SECTIONS.find(name=>!names.includes(name))||'Custom course';
 const updateSections=sections=>onChange(value.map((m,i)=>i===index?{...m,sections}:m));
 const updateSection=(sectionIndex,patch)=>updateSections(menu.sections.map((s,i)=>i===sectionIndex?{...s,...patch}:s));
 const addMenu=()=>{onChange([...value,{plateType:chosen,sections:[]}]);setActive(chosen);setCourse('');};
 const move=(i,delta)=>{const sections=[...menu.sections];[sections[i],sections[i+delta]]=[sections[i+delta],sections[i]];updateSections(sections);};
 return <section className="food-menu-editor"><div className="food-editor-heading"><span><Utensils size={21}/></span><div><h3>Build the food menu</h3><p>Add actual dishes—not just a description. Each meal type has its own menu.</p></div><small>{value.length}/4 menus</small></div>{mode==='venue'&&<div className="menu-advisory">Venue-only billing does not include food. Remove food menus or choose a catering/fixed billing method.</div>}
 {available.length>0&&<div className="add-food-menu"><select aria-label="New menu meal type" value={chosen} onChange={e=>setChoice(e.target.value)}>{available.map(type=><option key={type}>{type}</option>)}</select><button type="button" className="button small" onClick={addMenu}><Plus size={14}/>Add food menu</button></div>}
 {!menu?<div className="food-menu-empty"><Utensils size={27}/><h4>Your menu starts here</h4><p>Add a meal type, then list the drinks, starters, main course, breads and desserts you offer.</p></div>:<><div className="food-menu-tabs" role="group" aria-label="Edit meal type">{value.map(m=><button type="button" key={m.plateType} aria-pressed={m.plateType===menu.plateType} className={m.plateType===menu.plateType?'selected':''} onClick={()=>{setActive(m.plateType);setCourse('')}}>{m.plateType}<span>{menuItemCount(m)}</span></button>)}</div><div className="active-menu-header"><div><strong>{menu.plateType}</strong><small>{menu.sections.length}/8 courses · {menuItemCount(menu)} food items</small></div><button type="button" className="text-button menu-remove" onClick={()=>{onChange(value.filter((_,i)=>i!==index));setActive('');setCourse('')}}><Trash2 size={13}/>Remove this menu</button></div>
 {!menu.sections.length&&<div className="menu-template"><Sparkles size={19}/><div><strong>A helpful starting point</strong><p>Use an editable North Indian sample, or add your own courses below.</p></div><button type="button" className="button small" onClick={()=>updateSections(structuredClone(sampleMenus.find(m=>m.plateType===menu.plateType).sections))}>Use sample menu</button></div>}
 <div className="menu-section-editors">{menu.sections.map((section,i)=><section className="menu-section-editor" key={i}><div className="menu-course-top"><span>{String(i+1).padStart(2,'0')}</span><input aria-label={`Course ${i+1} name`} value={section.name} maxLength={50} placeholder="e.g. Welcome drinks" onChange={e=>updateSection(i,{name:e.target.value})}/><div><button type="button" className="icon-button" aria-label={`Move course ${i+1} up`} disabled={!i} onClick={()=>move(i,-1)}><ArrowUp size={13}/></button><button type="button" className="icon-button" aria-label={`Move course ${i+1} down`} disabled={i===menu.sections.length-1} onClick={()=>move(i,1)}><ArrowDown size={13}/></button><button type="button" className="icon-button" aria-label={`Remove course ${i+1}`} onClick={()=>updateSections(menu.sections.filter((_,j)=>j!==i))}><Trash2 size={14}/></button></div></div><label>Food items · one per line<textarea aria-label={`Food items for course ${i+1}`} rows={4} maxLength={2020} value={section.items.join('\n')} placeholder={'Paneer tikka\nHara bhara kebab'} onChange={e=>updateSection(i,{items:e.target.value.split('\n')})}/></label><div className="menu-course-hint"><span>{section.items.filter(item=>item.trim()).length}/20 items</span><span>Up to 100 characters per item</span></div></section>)}</div>
 <div className="add-food-course"><select aria-label="New food course" value={selectedCourse} onChange={e=>setCourse(e.target.value)}>{[...MENU_SECTIONS,'Custom course'].map(name=><option key={name}>{name}</option>)}</select><button type="button" className="button small" disabled={menu.sections.length>=8} onClick={()=>{updateSections([...menu.sections,{name:selectedCourse,items:[]}]);setCourse('')}}><Plus size={14}/>Add course</button></div>
 </>}
 <p className="menu-editor-note">Only configured meal types can be selected for a new booking. Rates belong to the billing method; individual dishes are included, not priced again. Existing bookings keep their saved menu.</p></section>;
}
