import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:3000/api';
const cleanup=[];
async function request(path,method='GET',body,cookie){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function login(role){const r=await request('/auth/login','POST',{email:role+'@gatherhall.demo',password:'Welcome123!'});assert.equal(r.status,200);return r.cookie;}
const owner=await login('owner'),staff=await login('staff'),client=await login('client');
async function add(kind,body){const r=await request('/'+kind,'POST',body,owner);assert.equal(r.status,201,JSON.stringify(r.data));cleanup.push([kind,r.data.id]);return r.data;}
async function modify(kind,item,changes={}){const r=await request(`/${kind}/${item.id}`,'PUT',{...item,...changes},owner);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
try {
 const initial=(await request('/data','GET',null,owner)).data;
 assert.ok(initial.plans.length>=4);assert.ok(initial.addons.length>=8);
 assert.equal((await request('/plans','POST',{},staff)).status,403);
 assert.equal((await request('/addons','POST',{},client)).status,403);
 const hall=await add('halls',{name:'Package test hall',type:'Indoor',capacity:300,price:10000,status:'Available'});
 const person=initial.clients[0];
 const plan=await add('plans',{name:'Test combined plan',mode:'combined',minimumPlates:100,vegRate:100,jainRate:120,nonVegRate:150,mixedRate:140,fixedPrice:0,advancePercent:40,taxRate:5,status:'Active',description:'Menu and hall rental'});
 const addon=await add('addons',{name:'Test rooms',category:'Accommodation',price:1000,unit:'per room-night',description:'Room nights',status:'Active'});
 assert.equal((await request('/plans','POST',{...plan,vegRate:-1},owner)).status,400);
 assert.equal((await request('/plans','POST',{...plan,mode:'bad'},owner)).status,400);
 assert.equal((await request('/addons','POST',{...addon,unit:'bad'},owner)).status,400);
 const draft={name:'Package test celebration',clientId:person.id,hallId:hall.id,date:'2026-12-16',time:'18:00',guests:150,type:'Tilak',status:'Confirmed',planId:plan.id,plateType:'Jain / No onion-garlic',guaranteedPlates:100,extraPlates:20,addOns:[{id:addon.id,quantity:2,rate:1}],discount:400,taxRate:5,advancePercent:40,total:1,quote:{total:1},baraatTime:'19:00',muhuratTime:'22:00',endTime:'23:30',familyContact:'Family coordinator',familyPhone:'9876543210',menuNotes:'No onion or garlic',operationsNotes:'Internal vendor instruction'};
 let booking=await add('bookings',draft);
 assert.equal(booking.total,27300);assert.equal(booking.quote.venueAmount,10000);assert.equal(booking.quote.cateringAmount,14400);assert.equal(booking.quote.addonAmount,2000);assert.equal(booking.quote.taxAmount,1300);assert.equal(booking.quote.advanceAmount,10920);assert.equal(booking.quote.plateRate,120);assert.equal(booking.quote.addonLines[0].rate,1000);assert.equal(booking.baraatTime,'19:00');
 // Round-trip saves preserve agreement, including hidden operation notes for internal users.
 booking=await modify('bookings',booking);assert.equal(booking.total,27300);
 const clientView=(await request('/data','GET',null,client)).data.bookings.find(b=>b.id===booking.id);assert.ok(clientView);assert.equal(clientView.operationsNotes,undefined);assert.equal(clientView.quote.total,27300);
 await modify('plans',plan,{jainRate:900});await modify('addons',addon,{price:8000});await modify('halls',hall,{price:50000});
 booking=await modify('bookings',booking,{notes:'Saved rates stay unchanged'});assert.equal(booking.total,27300);assert.equal(booking.quote.venueRate,10000);assert.equal(booking.quote.plateRate,120);
 booking=await modify('bookings',booking,{addOns:[{id:addon.id,quantity:3}]});assert.equal(booking.quote.addonAmount,3000);assert.equal(booking.total,28350);
 // Client cannot change tax, advance, unit rates or provide discounts on a new request.
 const platePlan=await add('plans',{...plan,name:'Test plate plan',mode:'plate'});
 const requestBody={...draft,name:'Client plan request',date:'2026-12-17',planId:platePlan.id,total:1,discount:1000,taxRate:0,advancePercent:0,plateType:'Vegetarian',addOns:[]};
 const req=await request('/bookings','POST',requestBody,client);assert.equal(req.status,201,JSON.stringify(req.data));cleanup.push(['bookings',req.data.id]);assert.equal(req.data.status,'Pending');assert.equal(req.data.quote.venueAmount,0);assert.equal(req.data.total,12600);assert.equal(req.data.discount,0);assert.equal(req.data.taxRate,5);assert.equal(req.data.advancePercent,40);assert.equal(req.data.operationsNotes,'');
 const fixed=await add('plans',{...plan,name:'Test fixed',mode:'fixed',fixedPrice:80000,maxGuests:150});
 const fixedBooking=await add('bookings',{...draft,date:'2026-12-18',planId:fixed.id,addOns:[],discount:0,taxRate:0});assert.equal(fixedBooking.total,80000);assert.equal(fixedBooking.quote.venueAmount,0);assert.equal(fixedBooking.quote.cateringAmount,0);
 const venuePlan=initial.plans.find(p=>p.mode==='venue'&&p.status==='Active');
 const venueBooking=await add('bookings',{...draft,date:'2026-12-22',planId:venuePlan.id,discount:0,taxRate:0});assert.equal(venueBooking.total,66000);assert.equal(venueBooking.quote.venueAmount,50000);assert.equal(venueBooking.quote.addonAmount,16000);assert.equal(venueBooking.quote.cateringAmount,0);

 const fails=[{guaranteedPlates:99},{guaranteedPlates:300,extraPlates:1},{plateType:'Invalid'},{addOns:[{id:addon.id,quantity:0}]},{addOns:[{id:addon.id,quantity:1.5}]},{addOns:[{id:addon.id,quantity:1},{id:addon.id,quantity:2}]},{discount:999999},{taxRate:29},{advancePercent:101},{baraatTime:'25:01'},{planId:fixed.id,guests:151}];
 for(const changes of fails)assert.equal((await request('/bookings','POST',{...draft,date:'2026-12-19',...changes},owner)).status,400,JSON.stringify(changes));
 const other=(await request('/auth/login','POST',{email:'willow@gatherhall.demo',password:'Welcome123!'})).cookie;
 const otherData=(await request('/data','GET',null,other)).data;
 assert.equal((await request('/bookings','POST',{...draft,date:'2026-12-19',planId:otherData.plans[0].id},owner)).status,400);
 assert.equal((await request('/bookings','POST',{...draft,date:'2026-12-19',addOns:[{id:otherData.addons[0].id,quantity:1}]},owner)).status,400);
 assert.equal((await request('/plans/'+plan.id,'PUT',plan,other)).status,404);
 // Paid amount cannot exceed a revised quote.
 const payment=await add('payments',{bookingId:booking.id,amount:28000,date:'2026-09-28',method:'UPI',reference:'PKG-TEST'});
 assert.equal((await request('/bookings/'+booking.id,'PUT',{...booking,discount:5000},owner)).status,400);
 await modify('plans',plan,{status:'Inactive'});await modify('addons',addon,{status:'Inactive'});
 assert.equal((await request('/bookings','POST',{...draft,date:'2026-12-19'},owner)).status,400);
 const active=(await request('/data','GET',null,client)).data;assert.ok(!active.plans.some(p=>p.id===plan.id));assert.ok(!active.addons.some(a=>a.id===addon.id));
 booking=await modify('bookings',booking);assert.equal(booking.total,28350);
 await request('/plans/'+plan.id,'DELETE',null,owner);await request('/addons/'+addon.id,'DELETE',null,owner);
 booking=await modify('bookings',booking,{notes:'Catalog records removed, agreement preserved'});assert.equal(booking.quote.plan.name,plan.name);assert.equal(booking.quote.addonLines[0].name,addon.name);
 assert.equal((await request('/bookings/'+booking.id,'PUT',{...booking,planId:''},owner)).status,400);
 console.log('PASS packages: catalog CRUD and permissions, tenant isolation, server-priced quotes, all pricing modes, menu/plate/add-on validation, taxes/discount/advance, client restrictions, protected snapshots, internal notes, and paid-balance protection.');
} finally {
 // Remove dependent payment and booking records before halls/catalog records.
 for(const [kind,id] of [...cleanup].reverse())await request(`/${kind}/${id}`,'DELETE',null,owner);
}
