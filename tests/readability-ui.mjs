// Optional browser checks: npm install --no-save --package-lock=false playwright-core @sparticuz/chromium
import assert from 'node:assert/strict';
import {chromium as pw} from 'playwright-core';
import chromium from '@sparticuz/chromium';
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.UI_TEST_URL||'http://localhost:3000');
 await page.getByRole('button',{name:'Pricing models',exact:true}).waitFor();
 await page.screenshot({path:'/home/user/readability-dashboard.png'});
 await page.getByRole('button',{name:'Pricing models',exact:true}).click();
 await page.getByRole('button',{name:'Add pricing model',exact:true}).click();
 const name=page.getByLabel('Pricing model name',{exact:true});
 await name.fill('Unsaved readability check');
 await page.getByLabel('Billing method',{exact:true}).selectOption('plate');
 await page.getByRole('button',{name:'Add food menu',exact:true}).click();
 await page.getByRole('button',{name:'Use sample menu',exact:true}).click();
 for(const mode of ['light','dark']){
  await page.evaluate(async mode=>{const{applyAppearance}=await import('/src/appearance.js');applyAppearance({mode,palette:'periwinkle'});},mode);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===390?844:1000});
   await name.scrollIntoViewIfNeeded();await name.focus();
   assert.equal(await name.inputValue(),'Unsaved readability check');
   const style=await name.evaluate(el=>{const s=getComputedStyle(el);return {font:parseFloat(s.fontSize),height:el.getBoundingClientRect().height,outline:s.outlineWidth}});
   assert.ok(style.font>=(width===390?16:14));assert.ok(style.height>=44);assert.equal(style.outline,'3px');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflow');
   assert.ok(await page.locator('.modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Modal overflow');
   await page.screenshot({path:`/home/user/readability-${mode}-${width}.png`});
   await page.getByLabel('Food items for course 1',{exact:true}).scrollIntoViewIfNeeded();
   assert.ok(await page.locator('.modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  }
 }
 // Errors in a long menu form must be visible and announced instead of hidden below the fold.
 await page.getByLabel('Food items for course 1',{exact:true}).fill('');
 await page.getByRole('button',{name:'Save model',exact:true}).click();
 const alert=page.locator('.modal [role="alert"]');await alert.waitFor();
 assert.ok(await alert.evaluate(el=>document.activeElement===el));
 assert.match(await alert.innerText(),/food item/i);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.deepEqual(errors,[]);
 console.log('PASS readability browser: light/dark desktop/mobile, 14/16px fields, visible focus, no modal overflow, preserved draft and focused validation error.');
}finally{await browser.close();}
