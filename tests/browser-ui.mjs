// Real Chromium rendering + touch tests. Host API is mocked; extension modules/CSS are real.
// No API keys, model calls, or chat generation are involved.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const root = process.cwd();
const base = '/scripts/extensions/third-party/-/';
const core = `
export const extension_prompt_types={IN_CHAT:1};
export const extension_prompt_roles={SYSTEM:0};
export const event_types={GENERATION_ENDED:'ended',GENERATION_STOPPED:'stopped',CHAT_CHANGED:'changed',APP_READY:'ready'};
export const eventSource={on(){}};
export function saveSettingsDebounced(){}
export function setExtensionPrompt(){window.promptWrites++}
export class Popup {
 constructor(content,type,value,options){
  this.options=options; this.dlg=document.createElement('dialog');this.dlg.className='popup';
  this.body=document.createElement('div');this.body.className='popup-body';
  this.content=document.createElement('div');this.content.className='popup-content';
  this.content.append(content);this.body.append(this.content);this.dlg.append(this.body);
  this.dlg.addEventListener('cancel',e=>{e.preventDefault();void this.complete(null)});
 }
 show(){document.body.append(this.dlg);this.dlg.showModal();return new Promise(r=>{this.resolve=r})}
 async complete(value){await this.options.onClose?.(this);this.dlg.close();this.dlg.remove();this.resolve?.(value)}
}`;
const shared = `export class ConnectionManagerRequestService {
 static getSupportedProfiles(){if(window.noProfiles)throw new Error('Connection Manager unavailable');return [{id:'test',name:'Test only',model:'mock'}]}
 static sendRequest(){window.modelCalls++;throw new Error('UI tests must not invoke any paid API')}
}`;
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--SmartThemeBlurTintColor:#eee6c4;--SmartThemeBodyColor:#222;--SmartThemeBorderColor:#bcb48f;--SmartThemeQuoteColor:#705f91}
*{box-sizing:border-box}body{margin:0;color:#222;background:#eee6c4;font:16px sans-serif}
button,input,select{font:inherit;padding:10px}.inline-drawer-content{display:none}.popup{background:#eee6c4;color:#222;border:1px solid #aaa;max-height:95vh;overflow:auto}
#extensions_settings2{width:min(450px,100%);padding:12px} .inline-drawer-header{padding:12px;border:1px solid #aaa}#extensionsMenu{padding:8px}
</style><script src="/jquery.js"></script><div id="extensions_settings2"></div><div id="extensionsMenu"></div><div id="chat"></div>
<script type="module">
import * as core from '/script.js';
window.modelCalls=0;window.promptWrites=0;window.pageErrors=[];window.noProfiles=false;
window.addEventListener('error',e=>window.pageErrors.push(e.message));
window.SillyTavern={getContext:()=>({...core,POPUP_TYPE:{DISPLAY:4},characterId:0,groupId:null,chatId:'test',chat:[{mes:'test'}]})};
$(document).on('click','.inline-drawer-toggle',function(){
 const d=$(this).closest('.inline-drawer');d.children('.inline-drawer-content').toggle();
 d.find('.inline-drawer-icon').toggleClass('down up').toggleClass('fa-circle-chevron-down fa-circle-chevron-up');
});
await import('${base}bootstrap.js');
</script>`;
const server = http.createServer((req,res)=>{
 const url = new URL(req.url,'http://local');
 let content; let type='text/javascript';
 if(url.pathname==='/'){content=html;type='text/html'}
 else if(url.pathname==='/jquery.js')content=fs.readFileSync(require.resolve('jquery/dist/jquery.min.js'));
 else if(url.pathname==='/script.js')content=core;
 else if(url.pathname==='/scripts/extensions.js')content='export const extension_settings={};';
 else if(url.pathname==='/scripts/extensions/shared.js')content=shared;
 else if(url.pathname.startsWith(base)){
  const name=url.pathname.slice(base.length);
  if(!/^[a-zA-Z0-9_.-]+$/.test(name)||!fs.existsSync(path.join(root,name))){res.writeHead(404);res.end();return}
  content=fs.readFileSync(path.join(root,name));type=name.endsWith('.css')?'text/css':'text/javascript';
 }else{res.writeHead(404);res.end();return}
 res.writeHead(200,{'Content-Type':type});res.end(content);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({headless:true});
try {
 for(const [label,viewport] of [['mobile',{width:393,height:851}],['desktop',{width:1366,height:900}]]){
  const context=await browser.newContext({viewport,hasTouch:label==='mobile',isMobile:label==='mobile'});
  const page=await context.newPage();
  const click=async selector=>label==='mobile'?page.locator(selector).tap():page.locator(selector).click();
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelector('[data-npc-r2b-ui-status]')?.textContent.includes('就绪'));
  await click('.npc-r2b-settings-entry .inline-drawer-header');
  await click('#npc-r2b-open');
  await page.locator('dialog[open] #npc-r2b-mode').waitFor({state:'visible'});
  assert.equal(await page.locator('dialog[open]').count(),1);
  const hit=await page.locator('#npc-r2b-close').evaluate(el=>{
   const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  });
  assert(hit,'Close control must be on screen and not behind another layer');
  await page.locator('#npc-r2b-profile').selectOption('test');
  await click('.npc-r2b-tab[data-tab="result"]');
  assert(await page.locator('#npc-r2b-result').isVisible());
  await click('.npc-r2b-tab[data-tab="test"]');
  fs.mkdirSync('test-artifacts',{recursive:true});
  await page.screenshot({path:`test-artifacts/${label}-native.png`});
  await click('#npc-r2b-close');
  assert.equal(await page.locator('dialog[open]').count(),0);
  await page.evaluate(()=>{const e=document.querySelector('.npc-r2b-settings-entry');e.replaceWith(e.cloneNode(true))});
  await click('#npc-r2b-open');
  await page.locator('dialog[open] #npc-r2b-mode').waitFor({state:'visible'});
  assert.equal(await page.locator('#npc-r2b-profile').inputValue(),'test');
  await click('#npc-r2b-close');
  await click('[data-npc-r2b-open-inline]');
  assert(await page.locator('#npc-r2b-mode').isVisible());
  assert.equal(await page.locator('dialog[open]').count(),0);
  await click('#npc-r2b-close');
  await page.evaluate(()=>window.noProfiles=true);
  await click('#npc-r2b-wand');
  await page.locator('dialog[open] #npc-r2b-mode').waitFor({state:'visible'});
  assert((await page.locator('#npc-r2b-status').textContent()).includes('无法读取'));
  await click('#npc-r2b-close');
  await page.evaluate(()=>{window.noProfiles=false;const old=window.SillyTavern.getContext;window.SillyTavern.getContext=()=>({...old(),Popup:undefined})});
  await click('#npc-r2b-open');
  assert(await page.locator('#npc-r2b-mode').isVisible());
  assert.equal(await page.locator('dialog[open]').count(),0);
  assert.equal(await page.evaluate(()=>window.modelCalls),0);
  assert.deepEqual(await page.evaluate(()=>window.pageErrors),[]);
  console.log(`PASS ${label}: real modules/styles, visible native popup, touch/click, cloned settings, inline mode, missing profile/API, zero model calls`);
  await context.close();
 }
} finally {
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
