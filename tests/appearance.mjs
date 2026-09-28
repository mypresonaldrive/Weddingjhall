import assert from 'node:assert/strict';
import {normalizeAppearance,appearanceTokens,contrastRatio,PALETTES,DEFAULT_APPEARANCE} from '../src/appearance.js';
assert.deepEqual(normalizeAppearance(null),DEFAULT_APPEARANCE);
assert.deepEqual(normalizeAppearance({palette:'bad',mode:'bad',custom:{primary:'red; background:url(x)',accent:42}}),DEFAULT_APPEARANCE);
for(const palette of [...PALETTES.map(p=>p.id),'custom'])for(const mode of ['light','dark']){
 const {tokens,mode:result}=appearanceTokens({palette,mode});assert.equal(mode,result);
 for(const surface of ['--surface','--canvas','--subtle','--selected']){
  assert.ok(contrastRatio(tokens['--ink'],tokens[surface])>=4.5,`${palette} ${mode} primary text ${surface}`);
  assert.ok(contrastRatio(tokens['--text-secondary'],tokens[surface])>=4.5,`${palette} ${mode} secondary text ${surface}`);
  assert.ok(contrastRatio(tokens['--primary'],tokens[surface])>=4.5,`${palette} ${mode} accent ${surface}`);
 }
 for(const surface of ['--field-bg','--surface','--table-head'])assert.ok(contrastRatio(tokens['--field-border'],tokens[surface])>=3,`Field boundary contrast: ${mode} ${surface}`);
 assert.ok(contrastRatio(tokens['--ink'],tokens['--field-bg'])>=4.5);
 assert.ok(contrastRatio(tokens['--text-muted'],tokens['--field-bg'])>=4.5);
 assert.ok(contrastRatio(tokens['--primary'],tokens['--primary-ink'])>=4.5);
}
for(const primary of ['#ffffff','#000000','#ffff00','#777777','#ff00ff'])for(const accent of ['#ffffff','#000000','#ff0000','#ccccff'])for(const mode of ['light','dark']){
 const {tokens}=appearanceTokens({palette:'custom',mode,custom:{primary,accent}});
 for(const surface of ['--surface','--canvas','--subtle','--selected']){assert.ok(contrastRatio(tokens['--primary'],tokens[surface])>=4.5);assert.ok(contrastRatio(tokens['--text-secondary'],tokens[surface])>=4.5);}
 for(const surface of ['--field-bg','--surface','--table-head'])assert.ok(contrastRatio(tokens['--field-border'],tokens[surface])>=3,`Field boundary contrast: ${mode} ${surface}`);
 assert.ok(contrastRatio(tokens['--ink'],tokens['--field-bg'])>=4.5);
 assert.ok(contrastRatio(tokens['--text-muted'],tokens['--field-bg'])>=4.5);
 assert.ok(contrastRatio(tokens['--primary'],tokens['--primary-ink'])>=4.5);
}
assert.equal(appearanceTokens({mode:'system'},true).mode,'dark');assert.equal(appearanceTokens({mode:'system'},false).mode,'light');
console.log('PASS appearance: 3 presets, light/dark/system, custom color validation, extreme colors and contrast-safe text/button pairings.');
