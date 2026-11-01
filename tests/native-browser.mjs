// Real Chromium touch/UI test, actual pinned host secret routes, fake provider responses.
// Structural password-field checks are NOT a promise about signed-in Android password-manager popups.
import {chromium} from 'playwright';import express from 'express';import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {makeHost} from './native-host.mjs';
const require=createRequire(import.meta.url),root=process.cwd(),base='/scripts/extensions/third-party/-/';
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
const h=makeHost(),app=express();app.use(express.json({limit:'1mb'}));let savedSettings={};const traffic=[];
app.post('/fixture/settings',(req,res)=>{savedSettings=req.body;res.sendStatus(204);});
app.post('/api/*',async(req,res)=>{traffic.push(req.path);const result=await h.route(req.path,req.body);res.status(result.status);if(result.status===204)res.end();else res.json(result.data);});
const core=`export const Popup=class{constructor(content,type,value,options){this.options=options;this.dlg=document.createElement('dialog');this.dlg.className='popup';const body=document.createElement('div');body.className='popup-body';const box=document.createElement('div');box.className='popup-content';box.append(content);body.append(box);this.dlg.append(body);this.dlg.addEventListener('cancel',e=>{e.preventDefault();void this.complete(null)});}show(){document.body.append(this.dlg);this.dlg.showModal();return new Promise(r=>this.resolve=r)}async complete(v){await this.options.onClose?.(this);this.dlg.close();this.dlg.remove();this.resolve?.(v)}};`;
app.get('/script.js',(_req,res)=>res.type('js').send(core));app.get('/jquery.js',(_req,res)=>res.type('js').send(fs.readFileSync(require.resolve('jquery/dist/jquery.min.js'))));
app.get('/',(_req,res)=>res.type('html').send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--SmartThemeBlurTintColor:#eee6c4;--SmartThemeBodyColor:#222;--SmartThemeBorderColor:#bcb48f;--SmartThemeQuoteColor:#705f91}*{box-sizing:border-box}body{background:#eee6c4;margin:0;font:16px sans-serif}.menu_button{width:min-content;display:flex;align-items:center;justify-content:center;padding:3px 5px}.menu_button[disabled]{opacity:.5;pointer-events:none}.popup{background:#eee6c4;color:#222;max-height:95vh;overflow:auto}.inline-drawer-content{display:none}.inline-drawer-header{padding:14px}#extensions_settings2{padding:12px;width:min(450px,100%)}button,input,select{font:inherit}</style><script src="/jquery.js"></script><div id="extensions_settings2"></div><div id="extensionsMenu"></div><script type="module">import {Popup} from '/script.js';window.errors=[];window.addEventListener('error',e=>errors.push(e.message));window.settings=${JSON.stringify(savedSettings).replace(/</g,'\\u003c')};window.main={model:'main-model',source:'openai',url:'https://main.example/v1'};const events={on(){}};window.SillyTavern={getContext:()=>({extensionSettings:window.settings,chatCompletionSettings:window.main,mainApi:'openai',getRequestHeaders:()=>({'X-CSRF-Token':'fixture'}),saveSettingsDebounced(){void fetch('/fixture/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(window.settings)})},Popup,POPUP_TYPE:{DISPLAY:4},eventSource:events,eventTypes:{APP_READY:'ready',CHAT_CHANGED:'chat',GENERATION_STARTED:'start',GENERATION_ENDED:'end',GENERATION_STOPPED:'stop'}})};$(document).on('click','.inline-drawer-toggle',function(){$(this).closest('.inline-drawer').children('.inline-drawer-content').toggle()});await import('${base}${manifest.js}');</script>`));
app.get(base+'*',(req,res)=>{const rel=req.path.slice(base.length);if(!/^[\w./-]+$/.test(rel)||rel.includes('..'))return res.sendStatus(404);const file=path.join(root,rel);if(!fs.existsSync(file)||!fs.statSync(file).isFile())return res.sendStatus(404);res.type(rel.endsWith('.css')?'css':'js').send(fs.readFileSync(file));});
const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
async function horizontal(page,id){const r=await page.locator(id).evaluate(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,wrap:getComputedStyle(e).whiteSpace,scroll:e.scrollWidth,client:e.clientWidth}));assert(r.w>=60);assert.equal(r.wrap,'nowrap');assert(r.scroll<=r.client+1);}
async function waitIdle(page){await page.waitForFunction(()=>!document.getElementById('npc-channels').hasAttribute('aria-busy'));}
const state=page=>page.evaluate(()=>JSON.parse(JSON.stringify(window.settings.npc_native_channels_v1)));
fs.mkdirSync('test-artifacts',{recursive:true});
try{
 for(const[label,width]of[['narrow',320],['mobile',393],['desktop',1366]]){
  savedSettings={};
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<500,isMobile:width<500}),page=await context.newPage();
  const click=selector=>width<500?page.locator(selector).tap():page.locator(selector).click();const initial=h.generateCount;
  await page.goto(url);await page.waitForFunction(()=>document.getElementById('nc-state')?.textContent.includes('设置已就绪'));
  await click('#npc-r2b-wand');await page.locator('dialog[open] #nc-add').waitFor({state:'visible'});await horizontal(page,'#nc-add');
  assert.equal(await page.locator('#nc-advanced').getAttribute('open'),null);assert.equal(await page.locator('.nc-stage:visible').count(),0);assert.equal(await page.locator('#nc-manage').getAttribute('open'),null);
  for(const name of ['test','result','inject','advanced']){await click(`.npc-r2b-tab[data-tab=${name}]`);assert(await page.locator(`.npc-r2b-view[data-view=${name}]`).isVisible());}
  await click('#nc-add');assert(await page.locator('#nc-key').isVisible());
  assert.equal(await page.locator('#nc-key').getAttribute('autocomplete'),'off');assert.equal(await page.locator('#nc-key').getAttribute('type'),'text');assert.equal(await page.locator('#nc-key').getAttribute('name'),null);
  assert.equal(await page.locator('#npc-r2b-overlay form').count(),0);assert.equal(await page.locator('#npc-r2b-overlay input[type=password]').count(),0);assert.equal(await page.locator('#npc-r2b-overlay [autocomplete=new-password]').count(),0);
  assert(await page.locator('#nc-url').evaluate(e=>e.readOnly));assert.equal(await page.locator('#nc-url').inputValue(),'https://api.openai.com/v1');assert(!(await page.locator('#nc-url').isVisible()));
  assert.equal(await page.locator('#nc-request-advanced').getAttribute('open'),null);
  await page.locator('#nc-provider').selectOption('custom-openai');assert(await page.locator('#nc-url').isVisible());assert.equal(await page.locator('#nc-url').evaluate(e=>e.readOnly),false);
  await page.locator('#nc-provider').selectOption('openai');
  await page.locator('#nc-key').fill('BROWSER_AUX_FAKE_KEY');
  assert.equal(await page.locator('#nc-key').evaluate(e=>getComputedStyle(e).webkitTextSecurity),'disc');
  await click('#nc-show-key');assert.equal(await page.locator('#nc-key').evaluate(e=>getComputedStyle(e).webkitTextSecurity),'none');assert.equal(await page.locator('#nc-key').getAttribute('type'),'text');
  await click('#nc-show-key');assert.equal(await page.locator('#nc-key').evaluate(e=>getComputedStyle(e).webkitTextSecurity),'disc');
  const beforeEnter=h.calls.length;await page.locator('#nc-key').press('Enter');await page.waitForTimeout(100);assert.equal(h.calls.length,beforeEnter);
  await page.screenshot({path:`test-artifacts/editor-${label}.png`});
  await click('#nc-save');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('接口已保存'));await waitIdle(page);
  assert.equal(await page.locator('#nc-key').count(),0);assert.equal(h.manager.readSecret('api_key_openai'),'PRIMARY_KEY_FAKE');assert.equal(h.generateCount,initial);
  let s=await state(page);const channel=s.channels[0];assert(channel);assert(!JSON.stringify(s).includes('BROWSER_AUX_FAKE_KEY'));assert.equal(Object.keys(s.routes).length,0);
  await click('#nc-model-refresh');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('2 个模型'));await waitIdle(page);
  await page.locator('#nc-simple-model').selectOption('model-a');await click('#nc-save-simple');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('全部任务共用'));await waitIdle(page);
  s=await state(page);assert.equal(Object.keys(s.routes).length,4);assert(Object.values(s.routes).every(r=>r.channelId===channel.id&&r.modelId==='model-a'));assert.equal(h.generateCount,initial);
  assert(!(await page.locator('#nc-route-regular').isVisible()));await horizontal(page,'#nc-save-simple');await horizontal(page,'#nc-test-simple');
  await page.locator('#npc-r2b-scroll').evaluate(e=>e.scrollTop=0);await page.screenshot({path:`test-artifacts/simple-${label}.png`});
  // Advanced legacy split survives reload. Simple mode only overwrites after explicit confirmation.
  await click('#nc-advanced > summary');await click('.nc-stage > summary:text-is("复杂人物判断")');
  await page.locator('#nc-model-complex').selectOption('model-b');await click('#nc-save-routes');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('高级分工已保存'));await waitIdle(page);
  const split=(await state(page)).routes;assert.equal(split.complex.modelId,'model-b');assert.equal(split.regular.modelId,'model-a');
  await page.reload();await page.waitForFunction(()=>document.getElementById('nc-state')?.textContent.includes('设置已就绪'));await click('#npc-r2b-wand');assert((await page.locator('#nc-current-summary').innerText()).includes('已保留你的高级分工'));assert.deepEqual((await state(page)).routes,split);assert.equal(await page.locator('#nc-advanced').getAttribute('open'),null);
  page.once('dialog',d=>d.dismiss());await click('#nc-save-simple');await waitIdle(page);assert.deepEqual((await state(page)).routes,split);
  page.once('dialog',d=>d.accept());await click('#nc-save-simple');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('全部任务共用'));await waitIdle(page);assert(Object.values((await state(page)).routes).every(r=>r.modelId==='model-a'));assert.equal(h.generateCount,initial);
  // Editing saved channels does not require another key or rewrite its native secret.
  await click('#nc-edit-current');assert.equal(await page.locator('#nc-key').inputValue(),'');assert.equal(await page.locator('#nc-key').getAttribute('placeholder'),'已保存；留空不更换');
  const writes=h.calls.filter(x=>x.url.endsWith('/secrets/write')).length;
  await click('#nc-save');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('接口已保存'));await waitIdle(page);assert.equal(h.calls.filter(x=>x.url.endsWith('/secrets/write')).length,writes);
  // Native host capture prevents ordinary bubbling; hide observer still clears token text.
  await click('#nc-edit-current');await page.locator('#nc-key').fill('UNSAVED_TEMP_FAKE');await click('#nc-show-key');await click('#npc-r2b-close');
  await page.waitForFunction(()=>document.getElementById('nc-key')?.value==='');await click('#npc-r2b-wand');assert.equal(await page.locator('#nc-key').inputValue(),'');assert.equal(await page.locator('#nc-key').evaluate(e=>getComputedStyle(e).webkitTextSecurity),'disc');
  await click('#nc-close-editor');await waitIdle(page);
  // Only an explicit, confirmed test sends a single provider-generation request.
  page.once('dialog',d=>d.accept());await click('#nc-test-simple');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('测试完成'));await waitIdle(page);assert.equal(h.generateCount,initial+1);
  const payload=h.calls.filter(c=>c.url.endsWith('/generate')).at(-1).body;assert.equal(payload.secret_id,channel.secretRef.id);assert.equal(payload.messages[0].content,'Reply with OK only.');assert.equal(payload.model,'model-a');
  assert.deepEqual(await page.evaluate(()=>window.main),{model:'main-model',source:'openai',url:'https://main.example/v1'});assert.equal(h.manager.readSecret('api_key_openai'),'PRIMARY_KEY_FAKE');
  await click('#npc-r2b-close');await click('.npc-r2b-settings-entry .inline-drawer-header');await click('[data-npc-r2b-open-inline]');assert(await page.locator('#nc-save-simple').isVisible());await horizontal(page,'#nc-save-simple');
  assert.equal(await page.evaluate(()=>localStorage.length),0);assert.deepEqual(await page.evaluate(()=>window.errors),[]);assert(!JSON.stringify(savedSettings).includes('BROWSER_AUX_FAKE_KEY'));assert(!JSON.stringify(savedSettings).includes('UNSAVED_TEMP_FAKE'));
  assert(!traffic.some(p=>p.includes('/secrets/find')||p.includes('/secrets/view')||p.startsWith('/api/plugins/')));
  await context.close();console.log('PASS '+label+': simple one-model setup, advanced collapsed, split routes preserved/confirmation, non-login masked key and clear-on-close, no implicit generation');
 }
}finally{await browser.close();await new Promise(r=>server.close(r));h.cleanup();}
