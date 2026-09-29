import assert from 'node:assert/strict';
import {chromium as pw} from 'playwright-core';import chromium from '@sparticuz/chromium';
const base=process.env.UI_TEST_URL||'http://localhost:3000';
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const noOverflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
try{
 await page.goto(base+'/');await page.locator('.mk-hero h1').waitFor();
 assert(await page.locator('.home-hero-photo img').evaluate(e=>e.complete&&e.naturalWidth>0));
 const ys=await page.locator('.mk-header>nav>a').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().top));assert(Math.max(...ys)-Math.min(...ys)<3,'Desktop navigation must stay horizontal');
 await page.screenshot({path:'/home/user/marketing-home-desktop.png',fullPage:true});
 for(const route of ['/features','/pricing','/about','/contact','/faq','/blog','/blog/wedding-season-checklist']){await page.goto(base+route);await page.locator('.mk-page-heading h1').waitFor();await noOverflow();}
 await page.goto(base+'/faq');await page.locator('summary').first().click();assert.equal(await page.locator('details').first().getAttribute('open'),'');
 await page.goto(base+'/hi');await page.locator('.mk-hero h1').waitFor();await page.evaluate(()=>document.fonts.ready);assert.equal(await page.locator('html').getAttribute('lang'),'hi');assert.match(await page.locator('h1').innerText(),/खूबसूरत/);assert(await page.evaluate(()=>document.fonts.check('400 20px "Noto Sans Devanagari"')));
 await page.setViewportSize({width:390,height:844});await noOverflow();await page.screenshot({path:'/home/user/marketing-hindi-mobile.png',fullPage:true});await page.getByRole('button',{name:'मेन्यू खोलें',exact:true}).click();await page.locator('#mk-mobile-nav').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('#mk-mobile-nav').count(),0);assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-controls')),'mk-mobile-nav');
 await page.goto(base+'/');await page.locator('.mk-hero').waitFor();await page.screenshot({path:'/home/user/marketing-home-mobile.png',fullPage:true});await noOverflow();
 await page.goto(base+'/platform#cms');await page.locator('.cms-layout').waitFor();await page.locator('.cms-entry-list button').filter({hasText:'/home'}).click();await page.getByLabel('Title',{exact:false}).first().fill('An edited celebration.\nA thoughtful business.');
 assert(await page.getByRole('button',{name:'Publish',exact:true}).isDisabled());await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Draft saved in this browser.',{exact:false}).waitFor();
 let entries=await page.evaluate(()=>JSON.parse(localStorage.getItem('gatherhall-cms-preview-v1')));assert.match(entries.find(e=>e.slug==='home'&&e.locale==='en').published.title,/beautiful celebration/);
 await page.getByRole('button',{name:'Preview draft',exact:true}).click();await page.getByRole('dialog').getByRole('heading',{name:/An edited celebration/}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Publish',exact:true}).click();await page.getByRole('button',{name:'Publish saved version'}).click();await page.getByText('Published to this browser’s website preview.',{exact:false}).waitFor();
 await page.goto(base+'/');await page.getByRole('heading',{name:/An edited celebration/}).waitFor();
 await page.goto(base+'/hi');await page.getByRole('heading',{name:/खूबसूरत/}).waitFor();
 await page.goto(base+'/platform#cms');await page.locator('.cms-entry-list button').filter({hasText:'/home'}).click();await page.getByRole('button',{name:'Unpublish',exact:true}).click();await page.getByRole('button',{name:'Unpublish page'}).click();await page.getByText('Unpublished. The public page is no longer available.').waitFor();
 await page.goto(base+'/');await page.getByRole('heading',{name:'This page has not been published in this language yet.'}).waitFor();
 await page.goto(base+'/platform#cms');await page.getByRole('button',{name:'New entry',exact:true}).click();await page.getByLabel('URL slug').fill('browser-safe-article');await page.getByLabel('Title',{exact:false}).first().fill('A safe little story');await page.getByLabel('Page content',{exact:false}).fill('## Safe text\n<img src=x onerror="window.cmsInjection=1">');await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Draft saved in this browser.',{exact:false}).waitFor();await page.getByRole('button',{name:'Publish',exact:true}).click();await page.getByRole('button',{name:'Publish saved version'}).click();await page.getByText('Published to this browser’s website preview.',{exact:false}).waitFor();
 await page.goto(base+'/blog/browser-safe-article');await page.getByRole('heading',{name:'A safe little story'}).waitFor();assert.equal(await page.locator('.mk-prose img').count(),0);assert.equal(await page.evaluate(()=>window.cmsInjection),undefined);
 await page.goto(base+'/contact');await page.getByLabel('Your name').fill('Demo visitor');await page.getByLabel('Email address').fill('demo@example.test');await page.getByLabel('How can we help?').fill('A demo enquiry that must not be sent.');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Send enquiry'}).click();await page.getByText('Preview only: your enquiry was not sent or stored.').waitFor();
 await page.goto(base+'/platform#cms');await page.locator('.cms-layout').waitFor();await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'/home/user/marketing-cms-desktop.png',fullPage:true});
 // Leave the browser's preview pristine; mutations were confined to this test context.
 await page.evaluate(()=>localStorage.removeItem('gatherhall-cms-preview-v1'));
 assert.deepEqual(errors,[]);console.log('PASS marketing/CMS browser: desktop nav, photo-led hero, public routes, Hindi font, mobile layout, draft isolation, publish/unpublish, article CRUD, escaped HTML and unsent demo enquiries.');
}finally{await browser.close();}
