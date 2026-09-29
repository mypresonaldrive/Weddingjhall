import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { bookingDuration, bookingsOverlap } from './shared/booking-duration.js';
import { normalizeMenus } from './shared/food-menus.js';
import { renderConfirmation } from './shared/confirmation.js';
import { defaultPlans, defaultAddons, EVENT_TYPES, PLAN_MODES, ADDON_UNITS, ADDON_CATEGORIES, priceBooking, number, normalizeFeatures, RATE_KEYS } from './shared/booking-pricing.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const dataDir = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'gatherhall.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,name TEXT); CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,tenant TEXT,name TEXT,email TEXT UNIQUE,password TEXT,role TEXT); CREATE TABLE IF NOT EXISTS account_links(record_id TEXT PRIMARY KEY,user_id TEXT); CREATE TABLE IF NOT EXISTS client_access(user_id TEXT PRIMARY KEY,client_id TEXT); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,tenant TEXT,kind TEXT,body TEXT); CREATE TABLE IF NOT EXISTS catalog_initialized(tenant TEXT PRIMARY KEY);`);
const put=(id,tenant,kind,body)=>db.prepare('INSERT INTO records VALUES(?,?,?,?)').run(id,tenant,kind,JSON.stringify(body));
if(!db.prepare('SELECT id FROM tenants LIMIT 1').get()){
 for(const [tid,name] of [['t1','The Grand Estate'],['t2','Willow & Co. Venues']]){
 db.prepare('INSERT INTO tenants VALUES(?,?)').run(tid,name);
 for(const [role,person,email] of [['owner','Arjun Mehta',tid==='t1'?'owner@gatherhall.demo':'willow@gatherhall.demo'],['staff','Ananya Sharma',tid==='t1'?'staff@gatherhall.demo':'team@willow.demo'],['client','Priya Sharma',tid==='t1'?'client@gatherhall.demo':'client@willow.demo']]) db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(tid+role,tid,person,email,bcrypt.hashSync('Welcome123!',10),role);
 const halls=[['The Grand Ballroom','Indoor','500','185000','venue.jpg'],['The Garden Pavilion','Outdoor','300','125000','garden.jpg'],['The Royal Terrace','Rooftop','200','95000','terrace.jpg']];
 halls.forEach((h,i)=>put(tid+'h'+i,tid,'halls',{name:h[0],type:h[1],capacity:+h[2],price:+h[3],image:h[4],status:'Available',description:['Timeless elegance, crystal chandeliers, and room for your biggest moments.','An open-air celebration surrounded by lush gardens and warm lights.','An intimate rooftop setting with beautiful sunset views.'][i]}));
 const clients=[['Priya Sharma','priya.sharma@gmail.com','+91 98765 43210'],['Rohan Kapoor','rohan.k@gmail.com','+91 98234 56100'],['Ananya Patel','ananya.p@gmail.com','+91 99876 54321'],['Vikram Singh','vikram.s@gmail.com','+91 97654 32109'],['Meera Joshi','meera.j@gmail.com','+91 98761 23450'],['Aditya Rao','aditya.r@gmail.com','+91 99123 45678']];
 clients.forEach((c,i)=>put(tid+'c'+i,tid,'clients',{name:c[0],email:c[1],phone:c[2],notes:'',status:'Active'}));
 [['Ananya Sharma','Event manager','ananya@gatherhall.demo'],['Rahul Verma','Operations','rahul@gatherhall.demo'],['Neha Desai','Guest relations','neha@gatherhall.demo'],['Kabir Shah','Venue coordinator','kabir@gatherhall.demo']].forEach((s,i)=>put(tid+'s'+i,tid,'staff',{name:s[0],position:s[1],email:s[2],phone:'+91 98765 '+(43210+i),status:'Active'}));
 for(let i=0;i<36;i++){
 const ci=i%6,hi=i%3,up=i<6; const date=up?['2026-09-29','2026-09-30','2026-10-02','2026-10-04','2026-10-08','2026-10-12'][i]:`2026-${String(4+Math.floor((i-6)/5)).padStart(2,'0')}-${String(3+((i*3)%24)).padStart(2,'0')}`;
 const total=[185000,125000,95000][hi]; const status=up?(i===2||i===4?'Pending':'Confirmed'):'Completed';
 put(tid+'b'+i,tid,'bookings',{name:up?['Priya & Arjun','Rohan & Sneha','Ananya & Karan','Vikram & Aisha','Meera’s engagement','Aditya & Nisha'][i]:[clients[ci][0].split(' ')[0]+' & Family','The Kapoor celebration','Patel wedding reception'][hi],clientId:tid+'c'+ci,client:clients[ci][0],hallId:tid+'h'+hi,hall:halls[hi][0],date,time:hi===1?'10:00':'18:00',guests:[350,220,150][hi],type:i%5===4?'Engagement':'Wedding',status,total,notes:up?'Floral décor and welcome refreshments included.':''});
 put(tid+'p'+i,tid,'payments',{bookingId:tid+'b'+i,client:clients[ci][0],amount:up?Math.round(total*.5):total,date:up?'2026-09-20':date,method:i%2?'Bank transfer':'UPI',status:'Paid',reference:'GH-'+(2026001+i)});
 }
 }
}
for(const tid of ['t1','t2']){db.prepare('INSERT OR IGNORE INTO client_access VALUES(?,?)').run(tid+'client',tid+'c0');db.prepare('INSERT OR IGNORE INTO account_links VALUES(?,?)').run(tid+'c0',tid+'client');db.prepare('INSERT OR IGNORE INTO account_links VALUES(?,?)').run(tid+'s0',tid+'staff');}
function seedCatalog(tenant) {
 if (db.prepare('SELECT tenant FROM catalog_initialized WHERE tenant=?').get(tenant)) return;
 db.exec('BEGIN');
 try {
  defaultPlans.forEach((p,i) => put(tenant+'-plan-'+i, tenant, 'plans', p));
  defaultAddons.forEach((a,i) => put(tenant+'-addon-'+i, tenant, 'addons', a));
  db.prepare('INSERT INTO catalog_initialized VALUES(?)').run(tenant);
  db.exec('COMMIT');
 } catch(error) { db.exec('ROLLBACK'); throw error; }
}
for (const tenant of db.prepare('SELECT id FROM tenants').all()) seedCatalog(tenant.id);
// Add reference inclusions only to untouched, older seeded services. Never change
// custom entries, explicit empty lists, or previously agreed booking snapshots.
for (const {id:tenant} of db.prepare('SELECT id FROM tenants').all()) {
 defaultAddons.forEach((reference,index) => {
  const row=db.prepare('SELECT body FROM records WHERE id=? AND tenant=? AND kind=?').get(tenant+'-addon-'+index,tenant,'addons');
  if(!row)return;
  const service=JSON.parse(row.body);
  if(!Object.hasOwn(service,'features')&&['name','description','category','price','unit','status'].every(key=>service[key]===reference[key])) {
   db.prepare('UPDATE records SET body=? WHERE id=? AND tenant=?').run(JSON.stringify({...service,features:reference.features}),tenant+'-addon-'+index,tenant);
  }
 });
}

// Add reference food menus only to untouched legacy reference models.
for (const {id:tenant} of db.prepare('SELECT id FROM tenants').all()) {
 defaultPlans.forEach((reference,index) => {
  const row=db.prepare('SELECT body FROM records WHERE id=? AND tenant=? AND kind=?').get(tenant+'-plan-'+index,tenant,'plans');
  if(!row)return;
  const model=JSON.parse(row.body);
  if(!Object.hasOwn(model,'menus')&&Object.keys(reference).filter(key=>!['menus','terms'].includes(key)).every(key=>model[key]===reference[key])) {
   db.prepare('UPDATE records SET body=? WHERE id=? AND tenant=?').run(JSON.stringify({...model,menus:reference.menus,terms:model.terms||''}),tenant+'-plan-'+index,tenant);
  }
 });
}
const app=express();
app.disable('x-powered-by');
app.get('/api/config',(_req,res)=>res.json({mode:'demo',billingEnabled:false}));
// Public, lightweight readiness endpoint for Docker and Coolify.
app.get('/healthz', (_req, res) => {
 res.set('Cache-Control', 'no-store');
 try { db.prepare('SELECT 1').get(); res.json({ status: 'ok' }); }
 catch { res.status(503).json({ status: 'unavailable' }); }
});
app.use(express.json());app.use(cookieParser());
const publicUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,tenantId:u.tenant,tenant:db.prepare('SELECT name FROM tenants WHERE id=?').get(u.tenant).name});
app.post('/api/auth/login',(req,res)=>{const u=db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email||'').toLowerCase());if(!u||!bcrypt.compareSync(req.body.password||'',u.password))return res.status(401).json({error:'Email or password is incorrect.'});const linked=db.prepare('SELECT body FROM records JOIN account_links ON records.id=account_links.record_id WHERE account_links.user_id=?').get(u.id);if(linked&&JSON.parse(linked.body).status==='Inactive')return res.status(403).json({error:'This account is inactive. Contact your workspace owner.'});const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token,u.id,Date.now()+604800000);res.cookie('session',token,{httpOnly:true,sameSite:'lax',maxAge:604800000});res.json(publicUser(u));});
app.post('/api/auth/register',(req,res)=>{const {name,email,password,organization}=req.body;if(!name||!organization||!email?.includes('@')||password?.length<8)return res.status(400).json({error:'Complete all fields and use a password with at least 8 characters.'});if(db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase()))return res.status(409).json({error:'This email is already registered.'});const tid=randomBytes(8).toString('hex'),id=randomBytes(8).toString('hex');db.prepare('INSERT INTO tenants VALUES(?,?)').run(tid,organization);db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id,tid,name,email.toLowerCase(),bcrypt.hashSync(password,10),'owner');seedCatalog(tid);res.json({success:true});});
app.post('/api/auth/logout',(req,res)=>{db.prepare('DELETE FROM sessions WHERE token=?').run(req.cookies.session||'');res.clearCookie('session').json({success:true});});
app.use('/api',(req,res,next)=>{const u=db.prepare('SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE token=? AND expires>?').get(req.cookies.session||'',Date.now());if(!u)return res.status(401).json({error:'Please sign in to continue.'});const linked=db.prepare('SELECT body FROM records JOIN account_links ON records.id=account_links.record_id WHERE account_links.user_id=?').get(u.id);if(linked&&JSON.parse(linked.body).status==='Inactive')return res.status(403).json({error:'This account is inactive. Contact your workspace owner.'});req.user=u;next();});
app.get('/api/auth/me',(req,res)=>res.json(publicUser(req.user)));
const list=(tenant,kind)=>db.prepare('SELECT * FROM records WHERE tenant=? AND kind=?').all(tenant,kind).map(r=>({...JSON.parse(r.body),id:r.id}));
function visible(req,kind){let rows=list(req.user.tenant,kind);if(req.user.role==='client'){const access=db.prepare('SELECT client_id FROM client_access WHERE user_id=?').get(req.user.id);const cs=access?[access.client_id]:[];const bs=list(req.user.tenant,'bookings').filter(b=>cs.includes(b.clientId));if(kind==='clients')rows=rows.filter(c=>cs.includes(c.id));if(kind==='bookings')rows=bs.map(({operationsNotes,...b})=>b);if(kind==='payments')rows=rows.filter(p=>bs.some(b=>b.id===p.bookingId));if(kind==='staff')rows=[];if(['plans','addons'].includes(kind))rows=rows.filter(r=>r.status==='Active');}return rows;}
app.get('/api/availability', (req, res) => {
 const { date, exclude } = req.query;
 if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return res.status(400).json({ error: 'Choose a valid event date.' });
 let requested;try{requested=bookingDuration(req.query);}catch(error){return res.status(400).json({error:error.message});}
 const ownBooking = exclude && visible(req, 'bookings').some(b => b.id === exclude);
 const bookings = list(req.user.tenant, 'bookings');
 const halls = list(req.user.tenant, 'halls').map(hall => {
  const conflict = bookings.some(b => bookingsOverlap(b,req.query) && b.hallId === hall.id && b.status !== 'Cancelled' && !(ownBooking && b.id === exclude));
  const maintenance = hall.status === 'Maintenance';
  return { id: hall.id, available: !conflict && !maintenance, reason: maintenance ? 'Venue is under maintenance' : conflict ? 'Already reserved during this duration' : 'Available for your celebration' };
 });
 res.set('Cache-Control', 'no-store').json({ date, duration:requested, halls });
});
// New catalog terminology uses the existing tenant-scoped records for compatibility.
app.get('/api/pricing-models',(req,res)=>res.json(visible(req,'plans')));
app.get('/api/pricing-models/:id',(req,res)=>{const model=visible(req,'plans').find(model=>model.id===req.params.id);if(!model)return res.status(404).json({error:'Pricing model not found.'});res.json(model);});
app.get('/api/bookings/:id/confirmation',(req,res)=>{
 const format=req.query.format||'full';
 if(!['full','event'].includes(format))return res.status(400).json({error:'Choose full or event-only confirmation.'});
 const booking=visible(req,'bookings').find(booking=>booking.id===req.params.id);
 if(!booking)return res.status(404).json({error:'Booking not found.'});
 const client=list(req.user.tenant,'clients').find(client=>client.id===booking.clientId);
 const payments=list(req.user.tenant,'payments').filter(payment=>payment.bookingId===booking.id);
 const tenant=db.prepare('SELECT name FROM tenants WHERE id=?').get(req.user.tenant);
 res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'self'"});
 res.type('html').send(renderConfirmation({booking,client,payments,organization:tenant.name,format}));
});
app.get('/api/data',(req,res)=>res.json(Object.fromEntries(['halls','bookings','clients','payments','staff','plans','addons'].map(k=>[k,visible(req,k)]))));
const fields={halls:['name','type','capacity','price','morningPrice','afternoonPrice','eveningPrice','image','status','description'],bookings:['pricingVersion','actualGuests','durationMode','endDate','bookingEndTime','name','clientId','client','hallId','hall','date','time','guests','type','status','total','notes','planId','plateType','guaranteedPlates','extraPlates','addOns','discount','taxRate','advancePercent','baraatTime','muhuratTime','endTime','familyContact','familyPhone','menuNotes','operationsNotes'],plans:['minimumFoodValue','venueRate','eventRates','name','description','mode','minimumPlates','maxGuests','fixedPrice','vegRate','jainRate','nonVegRate','mixedRate','advancePercent','taxRate','status','features','menus','terms'],addons:['name','description','category','price','unit','status','features'],clients:['name','email','phone','notes','status'],staff:['name','email','phone','position','status'],payments:['bookingId','client','amount','date','method','status','reference']};
function access(req,res,next){if(req.params.kind==='pricing-models')req.params.kind='plans';const kind=req.params.kind;if(!fields[kind])return res.status(404).json({error:'Resource not found.'});if(req.user.role==='client'&&(kind!=='bookings'||req.method!=='POST'))return res.status(403).json({error:'This action requires a team member.'});if(req.user.role==='staff'&&['halls','staff','plans','addons'].includes(kind))return res.status(403).json({error:'Only owners can manage halls, staff, plans and add-ons.'});next();}
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
function provision(req,id,data){
 if(!req.body.loginPassword)return;
 if(req.user.role!=='owner'||!['clients','staff'].includes(req.params.kind))throw Error('Only owners can grant workspace access.');
 if(typeof req.body.loginPassword!=='string'||req.body.loginPassword.length<8)throw Error('The account password must have at least 8 characters.');
 const email=data.email.toLowerCase();
 if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw Error('An account with this email already exists. Leave the account password empty to update the directory record only.');
 if(db.prepare('SELECT user_id FROM account_links WHERE record_id=?').get(id))throw Error('This contact already has workspace access. Leave the password empty to update their directory details.');const uid=randomBytes(8).toString('hex');
 db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(uid,req.user.tenant,data.name,email,bcrypt.hashSync(req.body.loginPassword,10),req.params.kind==='clients'?'client':'staff');
 db.prepare('INSERT INTO account_links VALUES(?,?)').run(id,uid);if(req.params.kind==='clients')db.prepare('INSERT INTO client_access VALUES(?,?)').run(uid,id);
}
app.put('/api/settings/profile',(req,res)=>{if(!req.body.name?.trim())return res.status(400).json({error:'Name is required.'});db.prepare('UPDATE users SET name=? WHERE id=?').run(req.body.name.trim(),req.user.id);if(req.user.role==='owner'&&req.body.organization?.trim())db.prepare('UPDATE tenants SET name=? WHERE id=?').run(req.body.organization.trim(),req.user.tenant);res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)));});
app.post('/api/:kind',access,(req,res)=>{try{const data=validate(req,req.body);const id=randomBytes(8).toString('hex');db.exec('BEGIN');put(id,req.user.tenant,req.params.kind,data);provision(req,id,data);db.exec('COMMIT');res.status(201).json({...data,id});}catch(e){if(db.isTransaction)db.exec('ROLLBACK');res.status(400).json({error:e.message});}});
app.put('/api/:kind/:id',access,(req,res)=>{const row=db.prepare('SELECT * FROM records WHERE id=? AND tenant=? AND kind=?').get(req.params.id,req.user.tenant,req.params.kind);if(!row)return res.status(404).json({error:'Record not found.'});try{const data=validate(req,req.body,req.params.id);db.exec('BEGIN');db.prepare('UPDATE records SET body=? WHERE id=?').run(JSON.stringify(data),row.id);provision(req,row.id,data);db.exec('COMMIT');res.json({...data,id:row.id});}catch(e){if(db.isTransaction)db.exec('ROLLBACK');res.status(400).json({error:e.message});}});
app.delete('/api/:kind/:id',access,(req,res)=>{const {id,kind}=req.params;const row=db.prepare('SELECT * FROM records WHERE id=? AND tenant=? AND kind=?').get(id,req.user.tenant,kind);if(!row)return res.status(404).json({error:'Record not found.'});if((kind==='halls'&&list(req.user.tenant,'bookings').some(b=>b.hallId===id))||(kind==='clients'&&list(req.user.tenant,'bookings').some(b=>b.clientId===id)))return res.status(409).json({error:'This record has bookings. Remove its bookings before deleting it.'});if(kind==='bookings')for(const p of list(req.user.tenant,'payments').filter(p=>p.bookingId===id))db.prepare('DELETE FROM records WHERE id=? AND tenant=?').run(p.id,req.user.tenant);const link=db.prepare('SELECT user_id FROM account_links WHERE record_id=?').get(id);if(link){db.prepare('DELETE FROM sessions WHERE user_id=?').run(link.user_id);db.prepare('DELETE FROM client_access WHERE user_id=?').run(link.user_id);db.prepare('DELETE FROM users WHERE id=? AND tenant=?').run(link.user_id,req.user.tenant);db.prepare('DELETE FROM account_links WHERE record_id=?').run(id);}db.prepare('DELETE FROM records WHERE id=? AND tenant=?').run(id,req.user.tenant);res.json({success:true});});

if(process.env.NODE_ENV==='production'){app.use(express.static('dist'));app.get('*',(req,res)=>res.sendFile(process.cwd()+'/dist/index.html'));}else{const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true,allowedHosts:true},appType:'spa'});app.use(vite.middlewares);}
const server = app.listen(port, '0.0.0.0', () => console.log(`Gatherhall running on port ${port}`));
let shuttingDown = false;
function shutdown(signal) {
 if (shuttingDown) return;
 shuttingDown = true;
 console.log(`${signal}: stopping Gatherhall`);
 const deadline = setTimeout(() => process.exit(1), 10000);
 deadline.unref();
 server.close(() => {
  try { db.close(); clearTimeout(deadline); process.exit(0); }
  catch (error) { console.error('Database shutdown failed:', error.message); process.exit(1); }
 });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
