import assert from 'node:assert/strict';
import { chromium as pw } from 'playwright-core';
import chromium from '@sparticuz/chromium';
import { sampleMenus } from '../shared/food-menus.js';
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[],cleanup=[];
page.on('pageerror',e=>errors.push(e.message));const root=process.env.UI_TEST_URL||'http://localhost:3000';
async function add(kind,body){const r=await page.request.post(root+'/api/'+kind,{data:body});assert.equal(r.status(),201,await r.text());const value=await r.json();cleanup.push([kind,value.id]);return value;}
const step=async n=>{await page.getByRole('button',{name:new RegExp('^Step '+n+':')}).click();};
const activeStep=()=>page.locator('.booking-stepper [aria-current="step"]').getAttribute('aria-label');
try{
 await page.goto(root);await page.locator('#sidebar-toggle').waitFor();
 const oldData=await (await page.request.get(root+'/api/data')).json();for(const b of oldData.bookings.filter(b=>b.name==='Mobile draft preserved'))await page.request.delete(root+'/api/bookings/'+b.id);for(const h of oldData.halls.filter(h=>h.name==='Wizard test hall'))await page.request.delete(root+'/api/halls/'+h.id);
 for(const m of oldData.plans.filter(m=>m.name==='Wizard test menu'))await page.request.delete(root+'/api/pricing-models/'+m.id);
 const hall=await add('halls',{name:'Wizard test hall',type:'Indoor',capacity:300,price:50000,status:'Available'});
 const model=await add('pricing-models',{name:'Wizard test menu',mode:'combined',minimumPlates:100,vegRate:650,status:'Active',menus:[sampleMenus[0]],advancePercent:30,taxRate:5,terms:'Agreed venue and food services. Final attendance is subject to the minimum guarantee.'});
 await page.reload();await page.getByRole('button',{name:'Create a booking',exact:true}).click();
 // An empty required name cannot be skipped with Continue or direct step navigation.
 await page.getByRole('button',{name:'Continue',exact:true}).click();assert.match(await activeStep(),/^Step 1:/);assert.ok(await page.locator('.modal [role="alert"]').first().isVisible());
 await step(4);assert.match(await activeStep(),/^Step 1:/);
 await page.getByLabel('Event name',{exact:true}).fill('Mobile draft preserved');
 await page.getByLabel('Event date',{exact:true}).fill('2027-02-10');
 await page.getByLabel('Marriage hall',{exact:true}).selectOption(hall.id);
 await page.getByLabel('Expected guests',{exact:true}).fill('301');await step(2);assert.match(await activeStep(),/^Step 1:/);
 await page.getByLabel('Expected guests',{exact:true}).fill('150');
 await page.getByRole('button',{name:'Continue',exact:true}).click();assert.match(await activeStep(),/^Step 2:/);
 assert.equal(await page.getByLabel('Expected guests',{exact:true}).isVisible(),false);
 assert.equal(await page.getByRole('button',{name:'Create booking',exact:true}).count(),0);
 await page.getByLabel('Pricing model',{exact:true}).selectOption(model.id);
 await page.getByText('Minimum guarantee & actual served (optional)',{exact:true}).click();
 await page.getByLabel('Minimum guaranteed guests',{exact:true}).fill('99');await step(3);assert.match(await activeStep(),/^Step 2:/);
 await page.getByLabel('Minimum guaranteed guests',{exact:true}).fill('100');await step(3);assert.match(await activeStep(),/^Step 3:/);
 await page.getByRole('button',{name:'Review booking',exact:true}).click();assert.match(await activeStep(),/^Step 4:/);
 assert.ok(await page.getByRole('button',{name:'Create booking',exact:true}).isVisible());
 const total=await page.locator('.quote-total strong').innerText();assert.equal(total,'₹1,54,875');
 await page.getByRole('button',{name:'Edit event',exact:true}).click();assert.match(await activeStep(),/^Step 1:/);
 assert.equal(await page.getByLabel('Event name',{exact:true}).inputValue(),'Mobile draft preserved');
 await page.getByLabel('Expected guests',{exact:true}).fill('160');await step(4);assert.equal(await page.locator('.quote-total strong').innerText(),'₹1,61,700');
 for(const [width,height] of [[320,568],[390,500],[768,900]]){
  await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const footer=await page.locator('.wizard-footer').boundingBox();assert.ok(footer.y+footer.height<=height+1);assert.ok(footer.width<=width);
  assert.ok(await page.getByRole('button',{name:'Create booking',exact:true}).isVisible());
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(async()=>{const {applyAppearance}=await import('/src/appearance.js');applyAppearance({mode:'dark'});});
 await page.screenshot({path:'/home/user/booking-wizard-dark.png'});
 await page.getByRole('button',{name:'Create booking',exact:true}).click();await page.locator('.modal').waitFor({state:'hidden'});
 const data=await (await page.request.get(root+'/api/data')).json();const booking=data.bookings.find(b=>b.name==='Mobile draft preserved');assert.ok(booking);cleanup.push(['bookings',booking.id]);
 await add('payments',{bookingId:booking.id,amount:50000,date:'2026-09-28',method:'UPI',reference:'TEST-RECEIPT-100'});
 const print=await page.context().newPage();await print.setViewportSize({width:1080,height:950});
 await print.context().addCookies(await page.context().cookies());
 const response=await print.goto(root+`/api/bookings/${booking.id}/confirmation`);assert.equal(response.status(),200);
 assert.equal(await print.locator('.charges-table th').count(),4);
 const body=await print.locator('body').innerText();assert.ok(body.indexOf('Booking charges')<body.indexOf('Agreed food menu'));assert.ok(body.includes('₹1,11,700.00'));assert.ok(body.includes('not a statutory tax invoice'));
 await print.screenshot({path:'/home/user/booking-statement-desktop.png'});
 await print.pdf({path:'/home/user/booking-statement-a4.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});
 await print.getByLabel('Compact layout').check();assert.ok(await print.locator('body').evaluate(el=>el.classList.contains('compact-print')));
 await print.pdf({path:'/home/user/booking-statement-compact-a4.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});
 await print.evaluate(()=>{window.print=()=>{window.__printCalled=true;};});await print.getByRole('button',{name:'Print / Save as PDF',exact:true}).click();assert.ok(await print.evaluate(()=>window.__printCalled));
 await print.setViewportSize({width:320,height:740});assert.ok(await print.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await print.screenshot({path:'/home/user/booking-statement-mobile.png'});
 await print.getByRole('link',{name:'Event-only copy',exact:true}).click();const event=await print.locator('body').innerText();assert.ok(!event.includes('₹'));assert.ok(!event.includes('TEST-RECEIPT-100'));assert.ok(event.includes('Paneer tikka'));assert.equal(await print.locator('.money-overview').count(),0);
 assert.ok(await print.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await print.close();

 // An original manual-price booking remains editable without forcing a catalog conversion.
 const legacy=await add('bookings',{name:'Wizard legacy event',clientId:booking.clientId,hallId:hall.id,date:'2027-02-12',time:'10:00',type:'Engagement',guests:100,status:'Confirmed',total:12000});
 await page.setViewportSize({width:1440,height:1000});await page.reload();await page.getByRole('button',{name:'Bookings',exact:false}).first().click();await page.getByLabel('Search bookings',{exact:true}).fill('Wizard legacy event');await page.getByRole('button',{name:'Edit Wizard legacy event',exact:true}).click();
 assert.equal(await page.getByLabel('Event type',{exact:true}).inputValue(),'Engagement');
 await step(4);assert.ok((await page.locator('.quote-total').innerText()).includes('₹12,000'));await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.locator('.modal').waitFor({state:'hidden'});
 const latest=(await (await page.request.get(root+'/api/data')).json()).bookings.find(b=>b.id===legacy.id);assert.equal(latest.total,12000);assert.equal(latest.type,'Engagement');
 assert.deepEqual(errors,[]);console.log('PASS wizard/print: gated steps, field validation, preserved drafts, changed attendance, 320px/short-screen/tablet layouts, dark mode, saved totals, A4/compact PDF, print control and financial privacy.');
}finally{for(const [kind,id] of cleanup.reverse())await page.request.delete(root+'/api/'+kind+'/'+id);await browser.close();}
