import assert from 'node:assert/strict';
import {chromium as pw} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import {integrationFields} from '../shared/integrations.js';
import {previewOverview} from '../src/saas/preview.js';
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.UI_TEST_URL||'http://localhost:3000';
const data={settings:Object.fromEntries(Object.entries(integrationFields).map(([k,v])=>[k,{enabled:false,revision:0,fields:Object.fromEntries(v.fields.filter(x=>!x[2]).map(([field])=>[field,''])),secrets:{}}])),encryptionReady:true,workerEnabled:false,runtimeBilling:{enabled:true,mode:'test',restartRequired:false},razorpaySource:'Server environment'};
const posts=[];
const messageData={summary:{balances:{email:10},counts:{email:{sent:1,held:1}},charged:{email:1}},organizations:[],plans:[],allowances:[],packs:[],grants:[],events:[],orders:[],workerEnabled:false,jobs:[{id:'j1',booking_id:'b1',recipient:'customer',channel:'email',status:'sent',reason:'Accepted',created_at:new Date().toISOString()},{id:'j2',booking_id:'b2',recipient:'owner',channel:'sms',status:'held',reason:'No credits',created_at:new Date().toISOString()}]};
try{
 await page.route('**/api/config',r=>r.fulfill({json:{mode:'saas',billingEnabled:true,billingMode:'test'}}));
 await page.route('**/api/auth/me',r=>r.fulfill({json:{name:'Administrator',platformAdmin:true,mfaRequired:false}}));
 await page.route('**/api/platform/overview',r=>r.fulfill({json:previewOverview}));
 await page.route('**/api/platform/settings',r=>r.fulfill({json:data}));
 await page.route('**/api/platform/settings/*',async r=>{const kind=r.request().url().split('/').at(-1),p=r.request().postDataJSON();posts.push({kind,...p});data.settings[kind]={...data.settings[kind],revision:data.settings[kind].revision+1,enabled:p.enabled,fields:Object.fromEntries(Object.entries(p.fields).filter(([key])=>!integrationFields[kind].fields.find(f=>f[0]===key)?.[2])),secrets:{}};await r.fulfill({json:{saved:true}});});
 await page.route('**/api/platform/messages',r=>r.fulfill({json:messageData}));
 await page.goto(base+'/platform#settings');await page.getByRole('heading',{name:'Your platform, connected.'}).waitFor();
 await page.getByLabel('Key ID',{exact:true}).fill('login@example.test');
 assert.equal(await page.getByLabel('Key ID',{exact:true}).getAttribute('aria-invalid'),'true');assert(await page.getByRole('button',{name:'Save provider',exact:true}).isDisabled());
 await page.getByLabel('Key ID',{exact:true}).fill('rzp_test_example');await page.getByLabel('Enable this provider',{exact:false}).check();
 assert.match(await page.locator('.provider-editor .message-state').innerText(),/Unsaved/);
 await page.getByLabel('Key secret',{exact:true}).fill('not-a-real-key');await page.getByLabel('Webhook secret',{exact:true}).fill('not-a-real-webhook');
 assert.equal(await page.getByLabel('Key secret',{exact:true}).getAttribute('autocomplete'),'new-password');
 await page.getByRole('button',{name:'Email Not configured',exact:true}).click();await page.getByLabel('SMTP host',{exact:true}).fill('draft.example.test');
 await page.getByRole('button',{name:'Payments Unsaved changes',exact:true}).click();await page.getByRole('button',{name:'Save provider',exact:true}).click();await page.getByText('Saved. Restart all app instances to apply payment changes.',{exact:true}).waitFor();
 assert.equal(posts.length,1);await page.getByRole('button',{name:'Email Unsaved changes',exact:true}).click();assert.equal(await page.getByLabel('SMTP host',{exact:true}).inputValue(),'draft.example.test','saving another provider preserves draft');
 await page.getByRole('button',{name:'Discard changes'}).click();assert.equal(await page.getByLabel('SMTP host',{exact:true}).inputValue(),'');
 await page.getByRole('button',{name:'SMS Not configured',exact:true}).click();await page.getByLabel('Approved flow ID',{exact:true}).fill('flow123');await page.getByLabel('I confirm this SMS template').check();await page.getByLabel('Approved flow ID',{exact:true}).fill('flow456');assert.equal(await page.getByLabel('I confirm this SMS template').isChecked(),false);
 await page.getByRole('button',{name:'Discard changes'}).click();
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/platform#messages');await page.getByRole('heading',{name:'Message activity'}).waitFor();
 await page.getByLabel('Status',{exact:true}).selectOption('held');assert.equal(await page.locator('tbody tr').count(),1);await page.getByLabel('Search latest messages').fill('absent');await page.getByText('No matching messages',{exact:true}).waitFor();await page.getByRole('button',{name:'Clear filters'}).click();assert.equal(await page.locator('tbody tr').count(),2);
 await page.getByRole('tab',{name:'Credits & plans'}).click();assert(await page.getByRole('button',{name:'Allocate credits',exact:true}).isDisabled());
 await page.getByRole('button',{name:'Recharge packs Products venue owners can buy'}).click();await page.getByRole('heading',{name:'Create recharge pack'}).waitFor();
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Create recharge pack'})});await form.getByLabel('Name',{exact:true}).fill('Small email pack');await form.getByLabel('Final price (₹)',{exact:true}).fill('1.25');
 let firstId,attempt=0;await page.route('**/api/platform/messages/pack',async r=>{const p=r.request().postDataJSON();assert.equal(p.price_paise,125);if(!attempt++){firstId=p.id;return r.fulfill({status:503,json:{error:'Temporary save error'}});}assert.equal(p.id,firstId,'retry must reuse pack ID');messageData.packs=[p];await r.fulfill({json:{saved:true}});});
 await form.getByRole('button',{name:'Save pack'}).click();await page.getByText('Temporary save error',{exact:false}).waitFor();await form.getByRole('button',{name:'Save pack'}).click();await page.getByText('Recharge pack saved.',{exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('form')].find(f=>f.textContent.includes('Create recharge pack'))?.querySelector('input')?.value==='');assert.equal(await form.getByLabel('Name',{exact:true}).inputValue(),'');assert.match(await page.locator('.message-packs').innerText(),/1\.25/);
 // Missing encryption config visibly locks fields rather than allowing unusable secret drafts.
 data.encryptionReady=false;await page.goto(base+'/platform#settings');await page.getByRole('heading',{name:'Your platform, connected.'}).waitFor();assert(await page.getByLabel('Key ID',{exact:true}).isDisabled());await page.getByRole('button',{name:'Setup instructions'}).click();await page.getByRole('heading',{name:'Set up encryption once'}).waitFor();
 // Mount the actual owner component with mocked transport: no live payment or message sends.
 await page.route('**/api/messages',r=>r.fulfill({json:{...messageData,preferences:{channels:{email:false,sms:false,whatsapp:false},owner_alerts:false,customer_alerts:false},consents:[],clients:[],packs:[{id:'pack1',name:'Owner pack',channel:'email',credits:10,price_paise:125,active:true}]}}));
 let checkouts=0;await page.route('**/api/messages/recharge',r=>{checkouts++;return r.fulfill({json:{id:'recharge1',order_id:'order_test',key:'test',amount:125,currency:'INR'}});});
 await page.evaluate(async()=>{const React=await import('/node_modules/.vite/deps/react.js');const client=await import('/node_modules/.vite/deps/react-dom_client.js');const createRoot=client.createRoot||client.default.createRoot;const {default:Messages}=await import('/src/saas/Messages.jsx');document.body.innerHTML='<div id="owner-test"></div>';window.Razorpay=class{constructor(options){window.testCheckout=options;}open(){}};createRoot(document.getElementById('owner-test')).render((React.default||React).createElement(Messages));});
 await page.getByRole('heading',{name:'Messages & credits',exact:true}).waitFor();await page.getByRole('tab',{name:'Notifications & consent'}).click();await page.getByLabel('Send to me (I consent to owner alerts)',{exact:true}).check();await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:'Refresh',exact:true}).waitFor();assert(await page.getByLabel('Send to me (I consent to owner alerts)',{exact:true}).isChecked(),'refresh must not overwrite owner edits');
 await page.getByRole('tab',{name:'Buy credits',exact:true}).click();await page.getByRole('button',{name:'Buy credits',exact:true}).click();await page.waitForFunction(()=>!!window.testCheckout);assert(await page.getByRole('button',{name:'Buy credits',exact:true}).isDisabled(),'checkout stays locked while provider modal is open');assert.equal(checkouts,1);await page.evaluate(()=>window.testCheckout.modal.ondismiss());await page.waitForFunction(()=>!document.querySelector('.message-packs button')?.disabled);
 assert.deepEqual(errors,[]);console.log('PASS settings UX: input validation, truthful badges, secret autofill hints, preserved cross-provider drafts, reapproval, encryption lock, local report filters, empty-target guard, price precision and idempotent pack retry.');
}finally{await browser.close();}
