import assert from 'node:assert/strict';
import {chromium as pw} from 'playwright-core';
import chromium from '@sparticuz/chromium';
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
const base=process.env.UI_TEST_URL||'http://localhost:3001';
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/platform');await page.getByRole('heading',{name:'A bigger picture. A clearer path.'}).waitFor();
 await page.screenshot({path:'/home/user/saas-platform-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Organizations',exact:false}).first().click();
 await page.getByRole('textbox',{name:'Search organizations'}).fill('Mithila');
 assert.equal(await page.locator('tbody tr').count(),1);
 await page.getByRole('button',{name:'Manage Mithila Banquets'}).click();await page.getByRole('dialog').waitFor();assert(await page.getByRole('button',{name:'Suspend access'}).isDisabled());await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Create plan',exact:true}).click();await page.getByLabel('Plan name').fill('Preview only');assert(await page.getByRole('button',{name:'Save plan'}).isDisabled());await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Switch to dark mode'}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 assert.equal(await page.locator('.saas-app').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(25, 25, 38)');
 await page.getByRole('button',{name:'Switch to light mode'}).click();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open platform navigation'}).click();await page.getByRole('button',{name:'Overview',exact:true}).click();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/home/user/saas-platform-mobile.png',fullPage:true});
 await page.goto(base+'/pricing');await page.getByRole('heading',{name:/Room for your business/}).waitFor();
 await page.getByRole('button',{name:'Preview registration'}).first().click();await page.getByRole('heading',{name:'Create your owner account'}).waitFor();assert(await page.getByRole('button',{name:'Create account',exact:true}).isDisabled());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/home/user/saas-owner-mobile.png',fullPage:true});
 // Browser-side production mode smoke: no demo auto-login, public registration, explicit MFA gate.
 await page.route('**/api/config',r=>r.fulfill({json:{mode:'saas',billingEnabled:false,billingMode:'test',registrationEnabled:false}}));
 await page.route('**/api/public/plans',r=>r.fulfill({json:[]}));
 await page.route('**/api/auth/me',r=>r.fulfill({status:401,json:{error:'Sign in required'}}));
 await page.goto(base+'/platform');await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();assert.equal(await page.getByText('Welcome123!',{exact:false}).count(),0);
 await page.unroute('**/api/auth/me');await page.route('**/api/auth/me',r=>r.fulfill({json:{name:'Admin',platformAdmin:true,mfaRequired:true}}));
 await page.route('**/api/auth/mfa',r=>r.fulfill({json:{factors:[]}}));await page.reload();await page.getByRole('heading',{name:'One more security check.'}).waitFor();
 assert.equal(await page.locator('.saas-sidebar').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS SaaS UI: preview navigation/search, disabled mutations, dark/light, mobile overflow, signup preview, production no-demo auth and MFA gate.');
}finally{await browser.close();}
