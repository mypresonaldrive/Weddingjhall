import assert from 'node:assert/strict';
import {chromium as pw} from 'playwright-core';
import chromium from '@sparticuz/chromium';
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.UI_TEST_URL||'http://localhost:3000';
try{
 await page.goto(base+'/platform#settings');await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();await page.locator('.provider-selector').waitFor();
 assert.equal(await page.getByRole('button',{name:'Save provider'}).count(),1);assert(await page.getByRole('button',{name:'Save provider'}).first().isDisabled());
 await page.screenshot({path:'/home/user/settings-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Messages & credits',exact:true}).click();await page.getByRole('heading',{name:'Messages & credits',exact:true}).waitFor();
 await page.getByRole('tab',{name:'Credits & plans'}).click();await page.getByRole('button',{name:/Plan allowances Included/}).click();await page.getByRole('heading',{name:'Included plan credits'}).waitFor();await page.getByRole('button',{name:/Allocate credits One-time/}).click();assert(await page.getByRole('button',{name:'Allocate credits',exact:true}).isDisabled());
 await page.screenshot({path:'/home/user/messages-desktop.png',fullPage:true});
 for(const width of [390,768]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No message page overflow');}
 await page.goto(base+'/platform#settings');await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();await page.locator('.provider-selector').waitFor();await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No settings overflow');await page.screenshot({path:'/home/user/settings-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/workspace');await page.locator('#sidebar-toggle').waitFor();await page.getByRole('button',{name:'Messages & credits',exact:true}).click();await page.getByRole('heading',{name:'Messages & credits',exact:true}).waitFor();await page.getByRole('tab',{name:'Notifications & consent'}).click();await page.getByRole('heading',{name:'Customer consent',exact:true}).waitFor();assert(await page.getByRole('button',{name:'Record consent',exact:true}).isDisabled());
 await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.notEqual(await page.locator('.integration-card').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/home/user/messages-owner-mobile-dark.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS messaging UI: settings navigation, disabled preview secrets/actions, reports tabs, grant/allowance forms, responsive 390/768/1440px layouts, no runtime errors.');
}finally{await browser.close();}
