import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const root=process.env.TEST_URL||'http://127.0.0.1:5198';
const output=new URL('../artifacts/',import.meta.url).pathname;
await mkdir(output,{recursive:true});
const checks=[],errors=[];
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,acceptDownloads:true});
await context.addInitScript(()=>{
  const Base=window.AudioContext;
  window.__audio=[];window.__tones=0;
  window.AudioContext=class extends Base { constructor(...args){super(...args);window.__audio.push(this);}createOscillator(){window.__tones++;return super.createOscillator();} };
});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const ready=async(p)=>{await p.goto(root);await expect(p.locator('#loading-layer')).toBeHidden();await p.waitForTimeout(1000);};
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
try{
await ready(page);
await check('WebGL scene starts with no audio permission or autoplay',async()=>{expect(await page.evaluate(()=>window.__audio.length)).toBe(0);expect(await page.locator('#scene').evaluate(c=>c.width)).toBeGreaterThan(1000);});
await page.waitForTimeout(1500);
await page.screenshot({path:output+'desktop.png'});
await check('Sound starts by gesture and water pointer creates actual chime oscillator',async()=>{
 await page.locator('#sound-toggle').click();await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>window.__audio[0].state)).toBe('running');
 await page.mouse.click(760,650);await page.waitForTimeout(250);expect(await page.evaluate(()=>window.__tones)).toBeGreaterThan(0);
 await page.mouse.move(680,630);await page.mouse.down();await page.mouse.move(850,700,{steps:12});await page.mouse.up();
});
await check('Mute suspends Web Audio',async()=>{await page.locator('#sound-toggle').click();await page.waitForTimeout(300);expect(await page.evaluate(()=>window.__audio[0].state)).toBe('suspended');});
await check('Director sliders, camera and mood persist on reload',async()=>{
 await page.locator('#direction-toggle').click();await expect(page.locator('#direction-panel')).toHaveAttribute('aria-hidden','false');
 await page.locator('#fog').fill('64');await expect(page.locator('#fog-value')).toHaveText('64');
 await page.locator('[data-camera=water]').click();await page.locator('[data-mood=ember]').click();await page.waitForTimeout(1700);
 await page.screenshot({path:output+'ember-director.png'});
 await page.reload();await expect(page.locator('[data-mood=ember]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-camera=water]')).toHaveAttribute('aria-pressed','true');expect(await page.locator('#fog').inputValue()).toBe('64');
});
await check('Escape closes inspector while range has focus',async()=>{await page.locator('#direction-toggle').click();await page.locator('#fog').focus();await page.keyboard.press('Escape');await expect(page.locator('#direction-panel')).toHaveAttribute('aria-hidden','true');});
await check('Immersive mode restores with click and keyboard',async()=>{
 await page.locator('#immersive-toggle').click();await expect(page.locator('#interface')).toHaveJSProperty('inert',true);await page.locator('#hidden-restore').click();await expect(page.locator('#interface')).toHaveJSProperty('inert',false);
 await page.locator('#direction-toggle').focus();await page.keyboard.press('h');await expect(page.locator('#app')).toHaveClass('is-immersive');await page.keyboard.press('Escape');await expect(page.locator('#app')).not.toHaveClass('is-immersive');
});
await check('Pause freezes actual canvas and reset returns all controls',async()=>{
 await page.locator('#direction-toggle').click();await page.locator('#pause-toggle').click();await page.waitForTimeout(150);
 const before=await page.locator('#scene').screenshot();await page.waitForTimeout(300);const after=await page.locator('#scene').screenshot();expect(before.equals(after)).toBe(true);
 await page.locator('#reset-scene').click();await expect(page.locator('[data-mood=moon]')).toHaveAttribute('aria-pressed','true');expect(await page.locator('#fog').inputValue()).toBe('42');await page.locator('#panel-close').click();
});
await page.waitForTimeout(2000);
await check('4K PNG export is 3840×2160 and viewport restores',async()=>{
 const before=await page.locator('#scene').evaluate(c=>[c.width,c.height]);const wait=page.waitForEvent('download');await page.locator('#capture-scene').click();const d=await wait;await d.saveAs(output+'nocturne-moon-4k.png');
 const b=await import('node:fs/promises').then(fs=>fs.readFile(output+'nocturne-moon-4k.png'));expect(b.readUInt32BE(16)).toBe(3840);expect(b.readUInt32BE(20)).toBe(2160);
 expect(await page.locator('#scene').evaluate(c=>[c.width,c.height])).toEqual(before);await expect(page.locator('#capture-scene')).toBeEnabled();
});
await check('Help opens and closes with keyboard',async()=>{await page.locator('#about-toggle').click();await expect(page.locator('#about-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#about-dialog')).toBeHidden();});
await page.locator('[data-mood=dawn]').click();await page.waitForTimeout(2000);await page.screenshot({path:output+'dawn.png'});
await page.locator('[data-mood=moon]').click();await page.waitForTimeout(1500);await page.screenshot({path:output+'desktop.png'});
const mobile=await context.newPage({viewport:{width:390,height:844}});
await mobile.setViewportSize({width:390,height:844});await ready(mobile);
await check('Mobile viewport has no overflow and all actions reachable',async()=>{
 expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await mobile.screenshot({path:output+'mobile.png'});
 await mobile.locator('#direction-toggle').click();await expect(mobile.locator('#direction-panel')).toBeVisible();await mobile.locator('#moonlight').fill('90');await mobile.locator('#panel-close').click();await mobile.locator('#immersive-toggle').click();await mobile.locator('#hidden-restore').click();
});
await mobile.setViewportSize({width:844,height:390});await mobile.waitForTimeout(500);
await check('Short landscape inspector scrolls to reset',async()=>{await mobile.locator('#direction-toggle').click();await mobile.locator('#reset-scene').click();await mobile.screenshot({path:output+'landscape.png'});expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});
const reduced=await browser.newContext({viewport:{width:1200,height:800},reducedMotion:'reduce'});const rp=await reduced.newPage();await ready(rp);
await check('Reduced motion starts still and accessible keyboard playback works',async()=>{await expect(rp.locator('#pause-toggle')).toHaveAttribute('aria-pressed','true');await rp.locator('#scene').focus();await rp.keyboard.press('Space');await expect(rp.locator('#pause-toggle')).toHaveAttribute('aria-pressed','false');});
await reduced.close();
await check('WebGL failure produces a useful retry screen',async()=>{
 const p=await context.newPage();await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(String(t).startsWith('webgl'))return null;return get.call(this,t,...a);};});
 await p.goto(root);await expect(p.locator('.error-card')).toBeVisible();await expect(p.getByRole('button',{name:'다시 시도'})).toBeVisible();await p.close();
});
await check('No console or runtime errors in primary workflow',async()=>expect(errors).toEqual([]));
await writeFile(output+'verification.json',JSON.stringify({date:new Date().toISOString(),checks,errors,desktopFps:await page.locator('#app').getAttribute('data-fps'),note:'Mobile verification is Chromium viewport emulation, not physical phone GPU testing.'},null,2));
console.log(JSON.stringify({passed:checks.length,errors}));
}finally{await browser.close();}
