// Real Chromium + real extension modules + real isolated service; only provider network is mocked.
import {chromium} from 'playwright';
import express from 'express';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {registerRoutes} from '../server/index.mjs';import {Vault} from '../server/vault.mjs';
const require=createRequire(import.meta.url),root=process.cwd(),base='/scripts/extensions/third-party/-/';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'npc-browser-'));let generated=0,listed=0;
const providerRequests=[];
const app=express();app.use(express.json({limit:'1mb'}));
const router=express.Router();registerRoutes(router,{transport:async request=>{providerRequests.push(request);if(request.method==='GET'){listed++;return{data:[{id:'model-a'},{id:'model-b'}]};}generated++;return{choices:[{message:{content:'OK'},finish_reason:'stop'}],usage:{total_tokens:5}};}});
app.use('/api/plugins/npc-independent-api',(req,_res,next)=>{req.user={directories:{root:temp}};next();},router);
const core=`export const extension_prompt_types={IN_CHAT:1};export const extension_prompt_roles={SYSTEM:0};export const event_types={GENERATION_ENDED:'ended',GENERATION_STOPPED:'stopped',CHAT_CHANGED:'changed',APP_READY:'ready'};export const eventSource={on(){}};export function saveSettingsDebounced(){};export function setExtensionPrompt(){};export function getRequestHeaders(){return {'Content-Type':'application/json'}};
export class Popup{constructor(content,type,value,options){this.options=options;this.dlg=document.createElement('dialog');this.dlg.className='popup';const body=document.createElement('div');body.className='popup-body';const box=document.createElement('div');box.className='popup-content';box.append(content);body.append(box);this.dlg.append(body);this.dlg.addEventListener('cancel',e=>{e.preventDefault();void this.complete(null)});}show(){document.body.append(this.dlg);this.dlg.showModal();return new Promise(r=>this.resolve=r)}async complete(v){await this.options.onClose?.(this);this.dlg.close();this.dlg.remove();this.resolve?.(v)}}`;
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--SmartThemeBlurTintColor:#eee6c4;--SmartThemeBodyColor:#222;--SmartThemeBorderColor:#bcb48f;--SmartThemeQuoteColor:#705f91}*{box-sizing:border-box}body{margin:0;background:#eee6c4;font:16px sans-serif}button,select,input{font:inherit}.popup{background:#eee6c4;color:#222;max-height:95vh;overflow:auto}#extensions_settings2{width:min(450px,100%);padding:12px}.inline-drawer-content{display:none}.inline-drawer-header{padding:12px}#extensionsMenu{padding:8px}</style><script src="/jquery.js"></script><div id="extensions_settings2"></div><div id="extensionsMenu"></div><script type="module">import * as core from '/script.js';window.pageErrors=[];window.addEventListener('error',e=>window.pageErrors.push(e.message));window.SillyTavern={getContext:()=>({...core,POPUP_TYPE:{DISPLAY:4},characterId:0,chatId:'other-story',chat:[{mes:'A contemporary office scene.'}]})};$(document).on('click','.inline-drawer-toggle',function(){$(this).closest('.inline-drawer').children('.inline-drawer-content').toggle()});await import('${base}channels-entry.js');</script>`;
app.get('/',(_req,res)=>res.type('html').send(html));app.get('/jquery.js',(_req,res)=>res.type('js').send(fs.readFileSync(require.resolve('jquery/dist/jquery.min.js'))));app.get('/script.js',(_req,res)=>res.type('js').send(core));app.get('/scripts/extensions.js',(_req,res)=>res.type('js').send('export const extension_settings={};'));app.get('/scripts/extensions/shared.js',(_req,res)=>res.type('js').send('export class ConnectionManagerRequestService{static getSupportedProfiles(){return []}static sendRequest(){throw new Error("Legacy paid model forbidden")}}'));
app.get(base+'*',(req,res)=>{const rel=req.path.slice(base.length);if(!/^[\w./-]+$/.test(rel)||rel.includes('..'))return res.sendStatus(404);const p=path.join(root,rel);if(!fs.existsSync(p)||!fs.statSync(p).isFile())return res.sendStatus(404);res.type(rel.endsWith('.css')?'css':'js').send(fs.readFileSync(p));});
const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({headless:true});
try{
 for(const [label,viewport] of [['mobile',{width:393,height:851}],['desktop',{width:1366,height:900}]]){
    const ctx=await browser.newContext({viewport,hasTouch:label==='mobile',isMobile:label==='mobile'}),page=await ctx.newPage();
    const click=async selector=>label==='mobile'?page.locator(selector).tap():page.locator(selector).click();
    const initial=generated;await page.goto(url);await page.waitForFunction(()=>document.getElementById('nc-state')?.textContent.includes('已连接'));
    await click('#npc-r2b-wand');await page.locator('dialog[open] #nc-add').waitFor({state:'visible'});
    const visible=await page.locator('dialog[open]').innerText();assert(!visible.includes('萧薰儿'));assert(!visible.includes('1月16日'));assert.equal(generated,initial);
    await click('#nc-add');assert.equal(await page.locator('#nc-url').inputValue(),'https://api.openai.com/v1');assert(await page.locator('#nc-url').evaluate(n=>n.readOnly));
    await page.locator('#nc-provider').selectOption('google-ai-studio');assert.equal(await page.locator('#nc-url').inputValue(),'https://generativelanguage.googleapis.com/v1beta');
    await page.locator('#nc-provider').selectOption('openai');await page.locator('#nc-name').fill(label+'-test');await page.locator('#nc-key').fill('TEST_ONLY_NO_REAL_API_KEY');
    await click('#nc-save');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('已保存'));
    assert.equal(await page.locator('#nc-key').inputValue(),'');assert.equal(generated,initial);
    await click('#nc-model-refresh');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('2 个模型'));
    assert.equal(await page.locator('#nc-default-options option').count(),2);assert.equal(generated,initial);
    await page.locator('#nc-default-model').fill('model-a');await click('#nc-save');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('已保存'));
    const state=new Vault(temp).snapshot(),channel=state.channels.find(c=>c.name===label+'-test');
    assert(channel);assert(!JSON.stringify(state).includes('TEST_ONLY_NO_REAL_API_KEY'));
    await page.locator('#nc-route-regular').selectOption(channel.id);await page.locator('#nc-model-regular').fill('model-a');await click('#nc-use-same');await click('#nc-save-routes');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('阶段选择已保存'));
    assert.equal(Object.keys(new Vault(temp).snapshot().routes).length,4);assert.equal(generated,initial);
    page.once('dialog',d=>d.accept());await click('#nc-test');await page.waitForFunction(()=>document.getElementById('nc-state').textContent.includes('独立测试完成'));
    assert.equal(generated,initial+1);assert.equal(providerRequests.at(-1).body.messages[0].content,'Reply with OK only.');assert(!JSON.stringify(providerRequests.at(-1).body).includes('office scene'));
    fs.mkdirSync('test-artifacts',{recursive:true});await page.screenshot({path:`test-artifacts/channels-${label}.png`});
    assert.equal(await page.evaluate(()=>localStorage.length),0);assert.deepEqual(await page.evaluate(()=>window.pageErrors),[]);
    await click('#npc-r2b-close');await ctx.close();console.log('PASS '+label+': channel editor, official URLs, isolated save, discovery, four routes, explicit one-call test, no fixture text on normal UI');
 }
 const ctx=await browser.newContext({viewport:{width:393,height:851}}),page=await ctx.newPage();await page.route('**/api/plugins/npc-independent-api/state',r=>r.fulfill({status:404,contentType:'application/json',body:'{}'}));await page.goto(url);await page.waitForFunction(()=>document.getElementById('nc-state')?.textContent.includes('未安装'));
 assert(await page.locator('#nc-add').isDisabled());assert.equal(await page.locator('#nc-key').count(),0);await ctx.close();console.log('PASS missing service: clear notice, no key entry, no fallback');
 assert(listed>=2);
}finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
