import assert from 'node:assert/strict';
import {chromium as pw} from 'playwright-core';
import chromium from '@sparticuz/chromium';
import {starterEntries} from '../shared/marketing-content.js';
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));const base=process.env.UI_TEST_URL||'http://localhost:3000';
try{
 await page.goto(base+'/');await page.locator('.home-hero-photo img').waitFor();await page.locator('.home-hero-photo img').evaluate(img=>img.decode());assert.equal(await page.locator('.home-venue-card').count(),4);
 await page.locator('.home-faq summary').first().click();assert(await page.locator('.home-faq details').first().evaluate(d=>d.open));
 await page.getByLabel('Marriage halls',{exact:true}).selectOption('2');await page.getByLabel('Team size',{exact:true}).selectOption('5');await page.getByRole('button',{name:'Compare plans',exact:true}).click();await page.locator('.home-recommendation').waitFor();assert.match(page.url(),/halls=2&team=5/);assert.match(await page.locator('.mk-price-grid .featured').innerText(),/Growth/);await page.getByRole('button',{name:'Yearly',exact:true}).click();assert.equal(await page.locator('.home-recommendation').count(),1);
 await page.goto(base+'/pricing?halls=100&team=500');await page.getByText('No published plan currently meets these limits.',{exact:false}).waitFor();assert.equal(await page.locator('.home-recommendation').count(),0);
 await page.goto(base+'/hi');await page.getByLabel('मैरिज हॉल',{exact:true}).selectOption('2');await page.getByLabel('टीम का आकार',{exact:true}).selectOption('5');await page.getByRole('button',{name:'प्लान की तुलना करें',exact:true}).click();assert.match(page.url(),/\/hi\/pricing\?/);await page.getByText('आपकी टीम के लिए उपयुक्त',{exact:true}).waitFor();
 for(const locale of ['','hi']){await page.goto(base+'/'+locale);await page.locator('.home-plan-finder').waitFor();for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No overflow ${locale} ${width}`);}await page.getByRole('button',{name:locale?'मेन्यू खोलें':'Open menu',exact:true}).click();await page.locator('#mk-mobile-nav').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('#mk-mobile-nav').count(),0);}
 await page.setViewportSize({width:1440,height:1000});let plansCalls=0;
 await page.route('**/api/config',r=>r.fulfill({json:{mode:'saas'}}));await page.route('**/api/public/plans',r=>{plansCalls++;return r.abort();});
 await page.route('**/api/public/content?*',r=>r.fulfill({json:starterEntries().filter(e=>e.locale==='en'&&e.published).map(e=>({...e,content:e.published}))}));
 await page.goto(base+'/');await page.locator('.home-plan-finder').waitFor();assert.equal(plansCalls,0,'home must not wait for pricing API');assert.equal(await page.getByText('The website is temporarily unavailable',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS homepage: hero imagery, FAQ, published plan matching, no-match case, Hindi routing, 320–1440px layouts, mobile menu/Escape and no unused pricing request.');
}finally{await browser.close();}
