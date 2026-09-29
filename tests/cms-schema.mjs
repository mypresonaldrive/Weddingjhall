import assert from 'node:assert/strict';
import {cmsSave,cmsAction,enquirySchema} from '../server/cms.js';
import {cmsSeeds} from '../shared/marketing-content.js';
for(const e of cmsSeeds)assert(cmsSave.safeParse({kind:e.kind,slug:e.slug,locale:e.locale,draft:e.draft}).success);
const valid={kind:'blog',slug:'my-story',locale:'en',draft:cmsSeeds[0].draft};
for(const patch of [{slug:'../../admin'},{slug:'javascript:alert(1)'},{locale:'fr'},{kind:'page',slug:'arbitrary-page'},{draft:{...valid.draft,title:''}},{draft:{...valid.draft,body:'a'.repeat(30001)}},{id:'00000000-0000-4000-8000-000000000001'}])assert(!cmsSave.safeParse({...valid,...patch}).success);
assert(!cmsAction.safeParse({id:'00000000-0000-4000-8000-000000000001',revision:1,action:'restore'}).success);
assert(!enquirySchema.safeParse({name:'Visitor',email:'test@example.test',organization:'',message:'A valid request.',locale:'en',consent:false,policyId:'00000000-0000-4000-8000-000000000001',policyRevision:1}).success);
console.log('PASS CMS schemas: all bilingual seeds valid; bounded documents, safe URLs/locales, revision guards and consent validation.');
