import assert from 'node:assert/strict';
import {chromium as pw} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import {previewOverview} from '../src/saas/preview.js';
import {integrationFields} from '../shared/integrations.js';
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
const base=process.env.UI_TEST_URL||'http://localhost:3000';
try{
 await page.route('**/api/config',r=>r.fulfill({json:{mode:'saas',billingEnabled:false,billingMode:'test'}}));
 await page.route('**/api/auth/me',r=>r.fulfill({json:{name:'Admin',platformAdmin:true,mfaRequired:false}}));
 const settings={settings:Object.fromEntries(Object.keys(integrationFields).map(k=>[k,{enabled:false,revision:0,fields:{},secrets:{}}])),encryptionReady:false,workerEnabled:false};
 await page.route('**/api/platform/settings',r=>r.fulfill({json:settings}));
 let overviewCount=0,release;const gate=new Promise(r=>release=r);
 await page.route('**/api/platform/overview',async r=>{overviewCount++;await gate;await r.fulfill({json:previewOverview});});
 await page.goto(base+'/platform#settings');await page.locator('.provider-selector').waitFor();assert.equal(overviewCount,0,'settings must not wait on or fetch overview');assert(!requests.some(url=>url.includes('/src/Workspace.jsx')),'platform must not load venue workspace');
 assert.equal(await page.locator('.saas-page-heading').count(),0);assert.equal(await page.locator('.saas-topbar h1').innerText(),'Settings');
 await page.getByRole('button',{name:'Overview',exact:true}).click();await page.getByRole('status',{name:'Loading platform data'}).waitFor();assert(await page.locator('.saas-sidebar').isVisible(),'shell remains available');release();await page.locator('.platform-kpis').waitFor();assert.equal(overviewCount,1);
 assert.equal(await page.locator('.saas-overview-banner').count(),0);assert(!await page.getByText('A bigger picture. A clearer path.',{exact:true}).count());
 await page.getByLabel('Chart period').selectOption('3');assert.equal(await page.locator('.platform-chart').first().locator('tbody tr').count(),3);
 await page.getByLabel('Find organizations').fill('Mithila');await page.getByRole('button',{name:'Search organizations',exact:true}).click();await page.getByRole('button',{name:'Manage Mithila Banquets'}).waitFor();assert.equal(await page.locator('.saas-table tbody tr').count(),1);
 await page.getByRole('button',{name:'Subscription plans',exact:true}).click();await page.getByRole('button',{name:'Create plan',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');assert.equal(overviewCount,1,'tab switches reuse this session snapshot');
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});await page.goto(base+'/platform');await page.locator('.platform-kpis').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No overflow at ${width}`);}
 await page.getByRole('button',{name:'Switch to dark mode'}).click();await page.screenshot({path:'/home/user/dashboard-mobile-dark.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS compact dashboard: cold Settings skips overview/workspace, shell during slow load, real-data charts, organization search, plan actions, cached tab navigation and responsive dark mode.');
}finally{await browser.close();}
