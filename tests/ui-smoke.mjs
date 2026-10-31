// Browser-style regression smoke test: no external model request, no paid API.
import { JSDOM } from 'jsdom';
import jquery from 'jquery';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
  '<div id="extensions_settings2"></div>' +
  '<div id="extensionsMenu"></div>' +
  '<div id="chat"></div>' +
  '</body></html>';
const dom = new JSDOM(html, { url: 'http://localhost/' });
const $ = jquery(dom.window);
const prompts = fs.readFileSync('prompts.js','utf8').replace(/^export /gm, '');
const fixtures = fs.readFileSync('fixtures.js','utf8').replace(/^export /gm, '');
const original = fs.readFileSync('index.js','utf8');
const index = original.replace(/^import[\s\S]*?;\s*$/gm, '');

const events = {};
const context = vm.createContext({
  console,
  setTimeout, clearTimeout,
  AbortController,
  window:dom.window, document:dom.window.document,
  navigator:dom.window.navigator, jQuery:$, $,
  extension_settings:{},
  saveSettingsDebounced(){},
  setExtensionPrompt(){},
  extension_prompt_types:{IN_CHAT:1},
  extension_prompt_roles:{SYSTEM:0},
  event_types:{GENERATION_ENDED:'generation_ended',GENERATION_STOPPED:'generation_stopped',CHAT_CHANGED:'chat_changed'},
  eventSource:{on:(type,handler)=>{events[type]??=[];events[type].push(handler);}},
  SillyTavern:{getContext(){return {characterId:0,groupId:null,chatId:'test-chat',chat:[{mes:'hi'}]};}},
  ConnectionManagerRequestService:{
    getSupportedProfiles(){return [{id:'lite',name:'Flash-Lite Test',model:'gemini-3.5-flash-lite'}];},
    sendRequest(){throw new Error('Automated UI smoke test must never invoke model APIs');},
  },
});
vm.runInContext(prompts,context,{filename:'prompts.js'});
vm.runInContext(fixtures,context,{filename:'fixtures.js'});
vm.runInContext(index,context,{filename:'index.js'});
await new Promise(resolve => setTimeout(resolve, 100));

assert.equal($('#npc-r2b-wand').length,1,'Wand shortcut must be visible');
assert.equal($('#npc-r2b-open').length,1,'Settings shortcut must be visible');
assert.equal($('#npc-r2b-overlay').length,1,'Dialog must exist');
assert.equal($('#npc-r2b-input').length,1,'Input editor must exist');
assert.equal($('#npc-r2b-profile option[value="lite"]').length,1,'Profile must be listed');

$('#npc-r2b-wand').trigger('click');
assert($('#npc-r2b-overlay').hasClass('r2b-visible'),'Wand click must open the dialog');
assert.equal($('#npc-r2b-overlay').attr('aria-hidden'),'false');

$('.npc-r2b-tab[data-tab="result"]').trigger('click');
assert.equal($('.npc-r2b-view[data-view="result"]').prop('hidden'),false,'Result tab must open');
assert.equal($('.npc-r2b-view[data-view="test"]').prop('hidden'),true,'Other tab must hide');

$('#npc-r2b-close').trigger('click');
assert(!$('#npc-r2b-overlay').hasClass('r2b-visible'),'Close button must close the dialog');

$('#npc-r2b-open').trigger('click');
assert($('#npc-r2b-overlay').hasClass('r2b-visible'),'Settings shortcut must open the same dialog');

$('.npc-r2b-tab[data-tab="test"]').trigger('click');
$('#npc-r2b-mode').val('decision').trigger('change');
const payload = JSON.parse($('#npc-r2b-input').val());
assert.equal(payload.mode,'decision','Fixture change must be reflected in editor');

console.log('PASS: app startup, wand menu, popup, tabs, close, settings shortcut and fixtures');
