import { bookingDuration, bookingsOverlap } from '../shared/booking-duration.js';
import { normalizeMenus } from '../shared/food-menus.js';
import { EVENT_TYPES, PLAN_MODES, ADDON_UNITS, ADDON_CATEGORIES, priceBooking, number, normalizeFeatures, RATE_KEYS } from '../shared/booking-pricing.js';
export const fields={halls:['name','type','capacity','price','morningPrice','afternoonPrice','eveningPrice','image','status','description'],bookings:['pricingVersion','actualGuests','durationMode','endDate','bookingEndTime','name','clientId','client','hallId','hall','date','time','guests','type','status','total','notes','planId','plateType','guaranteedPlates','extraPlates','addOns','discount','taxRate','advancePercent','baraatTime','muhuratTime','endTime','familyContact','familyPhone','menuNotes','operationsNotes'],plans:['minimumFoodValue','venueRate','eventRates','name','description','mode','minimumPlates','maxGuests','fixedPrice','vegRate','jainRate','nonVegRate','mixedRate','advancePercent','taxRate','status','features','menus','terms'],addons:['name','description','category','price','unit','status','features'],clients:['name','email','phone','notes','status'],staff:['name','email','phone','position','status'],payments:['bookingId','client','amount','date','method','status','reference']};
export function validateTenantRecord({kind,body,id,tenant,role,records}){
 const req={params:{kind},user:{tenant,role}};const list=(_tenant,resource)=>records[resource]||[];const visible=(_req,resource)=>list(tenant,resource);
function validate(req,body,id){const kind=req.params.kind;const data=Object.fromEntries(fields[kind].filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));for(const k of ['name','email','phone','description','notes','position','familyContact','familyPhone','menuNotes','operationsNotes'])if(data[k]!==undefined)data[k]=String(data[k]).trim().slice(0,2000);
 if(kind==='bookings'){
 const hall=list(req.user.tenant,'halls').find(h=>h.id===data.hallId);const client=visible(req,'clients').find(c=>c.id===data.clientId);if(!hall||!client)throw Error('Select a valid hall and client.');if(hall.status==='Maintenance'&&!id)throw Error('This hall is under maintenance. Please choose an available hall.');if(!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||isNaN(Date.parse(data.date))||new Date(data.date).toISOString().slice(0,10)!==data.date)throw Error('Enter a valid event date.');if(!data.name||!data.time)throw Error('Event name and time are required.');if(!Number.isFinite(+data.guests)||+data.guests<1||+data.guests>hall.capacity)throw Error(`Guest count must be between 1 and ${hall.capacity}.`);const duration=bookingDuration(data);if((req.user.role==='client'||data.status!=='Cancelled')&&list(req.user.tenant,'bookings').some(b=>b.id!==id&&b.hallId===hall.id&&b.status!=='Cancelled'&&bookingsOverlap(b,data)))throw Error('This hall is already booked during the selected duration. Choose another hall or time.');data.hall=hall.name;data.client=client.name;if(req.user.role==='client'){data.status='Pending';data.total=Number(hall[duration.rateKey]??hall.price)*duration.rentalUnits;}if(!['Confirmed','Pending','Completed','Cancelled'].includes(data.status))throw Error('Choose a valid booking status.');
 const previous = id ? list(req.user.tenant, 'bookings').find(b => b.id === id) : undefined;
 if (previous?.planId && !data.planId) throw Error('Choose a plan for this packaged booking. Saved package pricing cannot be removed.');
 if(!data.planId && (data.addOns||[]).length) throw Error('Choose a booking plan before adding catering or extra services.');
 if(data.planId){
  if(!EVENT_TYPES.includes(data.type) && !['Engagement','Corporate event'].includes(data.type)) throw Error('Choose a valid event type.');
  const quote=priceBooking(data,{plans:list(req.user.tenant,'plans'),addons:list(req.user.tenant,'addons'),hall,previous,isClient:req.user.role==='client'});
  data.pricingVersion=quote.version;data.actualGuests=quote.actualGuests;data.quote=quote;data.total=quote.total;data.plateType=quote.plateType;data.guaranteedPlates=quote.guaranteedPlates;data.extraPlates=quote.extraPlates;
  data.addOns=quote.addonLines.map(line=>({id:line.id,quantity:line.quantity,quantityMode:line.quantityMode}));data.discount=quote.discount;data.taxRate=quote.taxRate;data.advancePercent=quote.advancePercent;
 }
 for(const key of ['time','baraatTime','muhuratTime','endTime'])if(data[key]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(data[key]))throw Error('Enter valid ceremony times.');
 if(req.user.role==='client')data.operationsNotes='';
 const paid=list(req.user.tenant,'payments').filter(p=>p.bookingId===id).reduce((sum,p)=>sum+p.amount,0);
 if(Number(data.total)<paid)throw Error('Booking total cannot be lower than payments already received. Adjust payments before reducing the quote.');

 }
 if(['plans','addons'].includes(kind)){
  if(!data.name||data.name.length>120)throw Error('Enter a name of up to 120 characters.');
  if(!['Active','Inactive'].includes(data.status))throw Error('Choose a valid catalog status.');
  const previousCatalogItem=id?list(req.user.tenant,kind).find(item=>item.id===id):undefined;
  data.features=normalizeFeatures(data.features===undefined?previousCatalogItem?.features:data.features);
  if(kind==='plans'){
   data.menus=normalizeMenus(data.menus===undefined?previousCatalogItem?.menus:data.menus);
   const terms=data.terms===undefined?(previousCatalogItem?.terms||''):data.terms;
   if(typeof terms!=='string'||terms.length>3000)throw Error('Booking terms must be text, up to 3000 characters.');
   data.terms=terms.trim();
   if(data.mode==='venue'&&data.menus.length)throw Error('Venue-only billing does not include food. Remove its menus or choose a catering/fixed billing method.');
   if(!PLAN_MODES.some(m=>m.value===data.mode))throw Error('Choose a valid pricing mode.');
   data.minimumFoodValue=number(data.minimumFoodValue??previousCatalogItem?.minimumFoodValue??0,'Minimum food billing');
   data.venueRate=data.venueRate===undefined?(previousCatalogItem?.venueRate??null):data.venueRate===null||data.venueRate===''?null:number(data.venueRate,'Model rental rate');
   const rules=data.eventRates??previousCatalogItem?.eventRates??[];
   if(!Array.isArray(rules)||rules.length>EVENT_TYPES.length)throw Error('Choose valid event-specific rates.');
   const seenEvents=new Set();
   data.eventRates=rules.map(rule=>{
    if(!rule||!EVENT_TYPES.includes(rule.eventType)||seenEvents.has(rule.eventType))throw Error('Each event rate requires a unique valid event type.');
    seenEvents.add(rule.eventType);const result={eventType:rule.eventType};
    for(const key of ['venueRate','fixedPrice','vegRate','jainRate','nonVegRate','mixedRate'])if(rule[key]!==undefined&&rule[key]!==null&&rule[key]!=='')result[key]=number(rule[key],key,{min:key==='venueRate'?0:0.01});
    return result;
   });
   for(const k of ['minimumPlates','maxGuests'])data[k]=number(data[k]??0,k,{max:10000,integer:true});
   for(const k of ['fixedPrice','vegRate','jainRate','nonVegRate','mixedRate'])data[k]=number(data[k]??0,k);
   data.advancePercent=number(data.advancePercent??30,'Advance percentage',{max:100});
   data.taxRate=number(data.taxRate??0,'Tax rate',{max:28});
   if(['plate','combined'].includes(data.mode)&&(data.menus.length?data.menus.map(menu=>RATE_KEYS[menu.plateType]):['vegRate','jainRate','nonVegRate','mixedRate']).some(k=>data[k]<=0))throw Error('Set a positive price for each plate type.');
   if(data.mode==='fixed'&&(!data.fixedPrice||!data.maxGuests))throw Error('Set a fixed package price and included guest limit.');
  }else{
   data.price=number(data.price,'Service rate');
   if(!ADDON_UNITS.includes(data.unit)||!ADDON_CATEGORIES.includes(data.category))throw Error('Choose a valid service category and billing unit.');
  }
 }
 if(kind==='halls'){const old=id?list(req.user.tenant,'halls').find(h=>h.id===id):null;for(const key of ['morningPrice','afternoonPrice','eveningPrice'])data[key]=data[key]===undefined?(old?.[key]??null):data[key]===''||data[key]===null?null:number(data[key],key);}
 if(['clients','staff','halls'].includes(kind)&&!data.name)throw Error('Name is required.');
 for(const k of ['capacity','price','total','guests','amount'])if(data[k]!==undefined){data[k]=Number(data[k]);if(!Number.isFinite(data[k])||data[k]<0)throw Error(`${k} must be a positive number.`);}
 if(['clients','staff'].includes(kind)&&!String(data.email||'').match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))throw Error('Enter a valid email address.');
 if(kind==='payments'){const booking=list(req.user.tenant,'bookings').find(b=>b.id===data.bookingId);if(!booking)throw Error('Choose a valid booking.');if(!data.amount||!data.date)throw Error('Amount and payment date are required.');const paid=list(req.user.tenant,'payments').filter(p=>p.bookingId===booking.id&&p.id!==id).reduce((a,p)=>a+p.amount,0);if(paid+data.amount>booking.total)throw Error('Payment exceeds the remaining balance.');data.client=booking.client;data.status='Paid';}
 return data;
}
return validate(req,body,id);
}
