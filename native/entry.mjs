import {installPanelHost} from '../panel-host.js?v=0.3.0';
import {mountNativeChannels} from './ui.mjs?v=0.3.0';
import {nativeClient} from './client.mjs?v=0.3.0';
import {VERSION} from './protocol.mjs?v=0.3.0';
const n=(tag,attrs={},text='')=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);e.textContent=text;return e;};
function init(){if(document.getElementById('npc-r2b-overlay'))return;const c=SillyTavern.getContext(),host=installPanelHost(VERSION);
 const entry=document.createElement('div');entry.className='npc-r2b-settings-entry';
 entry.innerHTML='<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header" role="button" tabindex="0"><b>NPC · 人物决策</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content" style="display:none"><p class="npc-r2b-settings-note">原生调用版 · 不需要配套服务</p><button type="button" class="menu_button" id="npc-r2b-open">打开实验台</button></div></div>';
 (document.getElementById('extensions_settings2')||document.getElementById('extensions_settings')).append(entry);
 const root=document.createElement('div');root.id='npc-r2b-overlay';root.className='npc-r2b-overlay';root.setAttribute('aria-hidden','true');
 root.innerHTML='<div class="npc-r2b-backdrop"></div><section class="npc-r2b-shell" role="dialog" aria-modal="true" aria-labelledby="npc-r2b-title"><header class="npc-r2b-header"><div class="npc-r2b-mark"><i class="fa-solid fa-brain"></i></div><div class="npc-r2b-heading"><span class="npc-r2b-eyebrow"></span><h2 id="npc-r2b-title">人物决策实验台</h2><div class="npc-r2b-subtitle">独立辅助 API · 酒馆原生调用</div></div><button type="button" id="npc-r2b-close" class="npc-r2b-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></header><div class="npc-r2b-info-bar"><span class="npc-r2b-chip">实验版</span><span>未自动调用模型</span></div><nav class="npc-r2b-tabs" aria-label="页面"></nav><main class="npc-r2b-scroll" id="npc-r2b-scroll"></main><footer class="npc-r2b-footer"><div id="npc-r2b-status" class="npc-r2b-status" role="status">就绪</div></footer></section>';
 root.querySelector('.npc-r2b-eyebrow').textContent='NPC SIMULATOR · '+VERSION;document.body.append(root);
 const tabs=root.querySelector('.npc-r2b-tabs'),main=root.querySelector('main');
 function switchTab(id){for(const t of tabs.children){const active=t.dataset.tab===id;t.classList.toggle('r2b-selected',active);t.setAttribute('aria-selected',String(active));}for(const v of main.children)v.hidden=v.dataset.view!==id;main.scrollTop=0;}
 for(const[id,label]of[['test','判定'],['result','结果'],['inject','注入'],['advanced','设置']]){
  const tab=n('button',{type:'button',class:'npc-r2b-tab','data-tab':id},label);tab.onclick=()=>switchTab(id);tabs.append(tab);
  const view=n('section',{class:'npc-r2b-view','data-view':id});main.append(view);
  if(id!=='advanced'){const home=n('div',{class:'nc-generic-home'});home.append(n('h3',{},id==='test'?'先配置辅助 API':id==='result'?'尚无当前聊天判断':'当前没有待注入判断'),n('p',{},'本批完成独立渠道和模型分工。自动读取当前聊天与人物判断尚未接入，不会默认载入固定人物或改写你的正文。'));const go=n('button',{type:'button',class:'menu_button'},'打开接口设置');go.onclick=()=>switchTab('advanced');home.append(go);view.append(home);}
 }
 const controller=mountNativeChannels(main.querySelector('[data-view=advanced]'),(text,error)=>{const footer=document.getElementById('npc-r2b-status');footer.textContent=text;footer.classList.toggle('r2b-error',error);});
 root.addEventListener('click',e=>{if(e.target.closest('#npc-r2b-close'))controller.clearSensitive();},true);
 entry.querySelector('.inline-drawer-header').onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.currentTarget.click();}};
 function wand(){const menu=document.getElementById('extensionsMenu');if(!menu||document.getElementById('npc-r2b-wand'))return;const item=n('div',{id:'npc-r2b-wand',class:'list-group-item flex-container flexGap5 interactable',role:'button',tabindex:'0'});item.append(n('div',{class:'fa-solid fa-brain extensionsMenuExtensionButton'}),n('span',{},'NPC · 人物决策'));item.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();item.click();}};menu.prepend(item);}
 wand();setTimeout(wand,700);const events=c.eventTypes||c.event_types;
 if(events){c.eventSource.on(events.CHAT_CHANGED,()=>{wand();controller.clearSensitive();});if(events.APP_READY)c.eventSource.on(events.APP_READY,wand);
  for(const key of ['GENERATION_ENDED','GENERATION_STOPPED'])if(events[key])c.eventSource.on(events[key],()=>nativeClient().setGenerating(false));
  if(events.GENERATION_STARTED)c.eventSource.on(events.GENERATION_STARTED,()=>nativeClient().setGenerating(true));}
 globalThis.npcR2BInterceptor=async(_chat,_size,abort)=>nativeClient().beforeGeneration(abort);
 host.ready();switchTab('advanced');
}
for(const[id,file]of[['base','../style.css'],['host','../panel-host.css'],['channels','../connections/ui.css'],['native','./ui.css']]){const link=document.createElement('link');link.id='npc-native-'+id;link.rel='stylesheet';link.href=new URL(file+'?v=0.3.0',import.meta.url).href;document.head.append(link);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
