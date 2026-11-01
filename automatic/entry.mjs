import {installPanelHost} from '../panel-host.js?v=0.4.0';
import {mountNativeChannels} from '../native/simple-ui.mjs?v=0.3.1';
import {nativeClient} from '../native/client.mjs?v=0.3.0';
import {createEngine} from './engine.mjs?v=0.4.2';
import {createTransport} from './transport.mjs?v=0.4.1';
import {createLoreReader} from './host.mjs?v=0.4.0';
import {describeOutput} from './output-policy.mjs?v=0.4.1';
export const VERSION='0.4.2-r2b';
const context=()=>globalThis.SillyTavern.getContext();
const engine=createEngine({context,request:createTransport({context}),readLore:createLoreReader(),notify:text=>globalThis.toastr?.error(text,'NPC 人物判断',{timeOut:12000})});
globalThis.npcR2BInterceptor=async(chat,max,abort,type)=>{
    try{await nativeClient().beforeGeneration(abort);await engine.intercept(chat,max,abort,type);}
    catch(error){if(typeof abort==='function')abort(true);globalThis.toastr?.error('NPC 生成前检查失败，正文未发送。','NPC');}
};
const e=(tag,text='',attrs={})=>{const n=document.createElement(tag);n.textContent=text;for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
const button=(text,fn,attrs={})=>{const n=e('button',text,{type:'button',class:'menu_button',...attrs});n.addEventListener('click',fn);return n;};
function init(){
    if(document.getElementById('npc-r2b-overlay'))return;
    const c=context(),anchor=document.getElementById('extensions_settings2')||document.getElementById('extensions_settings');
    if(!anchor)return false;
    const host=installPanelHost(VERSION),entry=e('div','',{class:'npc-r2b-settings-entry'});
    entry.innerHTML='<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header" role="button" tabindex="0"><b>NPC · 人物自主模拟</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content" style="display:none"><p class="npc-r2b-settings-note">配置辅助 API 和模型后自动运行</p><button type="button" class="menu_button" id="npc-r2b-open">打开设置与记录</button></div></div>';
    anchor.append(entry);
    const root=e('div','',{id:'npc-r2b-overlay',class:'npc-r2b-overlay','aria-hidden':'true'});
    root.innerHTML='<div class="npc-r2b-backdrop"></div><section class="npc-r2b-shell" role="dialog" aria-modal="true" aria-labelledby="npc-r2b-title"><header class="npc-r2b-header"><div class="npc-r2b-mark"><i class="fa-solid fa-brain"></i></div><div class="npc-r2b-heading"><span class="npc-r2b-eyebrow"></span><h2 id="npc-r2b-title">NPC 人物自主模拟</h2><div class="npc-r2b-subtitle">保存辅助 API 和模型后，正常聊天即可</div></div><button type="button" id="npc-r2b-close" class="npc-r2b-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></header><div class="npc-r2b-info-bar"><span class="npc-r2b-chip">自动运行版</span><span id="npc-auto-mini">正在检查配置</span></div><nav class="npc-r2b-tabs" aria-label="页面"></nav><main class="npc-r2b-scroll" id="npc-r2b-scroll"></main><footer class="npc-r2b-footer"><div id="npc-r2b-status" class="npc-r2b-status" role="status"></div></footer></section>';
    root.querySelector('.npc-r2b-eyebrow').textContent='NPC SIMULATOR · '+VERSION;document.body.append(root);
    const tabs=root.querySelector('nav'),main=root.querySelector('main'),views={};
    function show(id){for(const t of tabs.children){const selected=t.dataset.tab===id;t.classList.toggle('r2b-selected',selected);t.setAttribute('aria-selected',String(selected));}for(const v of main.children)v.hidden=v.dataset.view!==id;main.scrollTop=0;}
    for(const[id,label]of[['test','运行'],['result','记录'],['inject','进阶'],['advanced','API 设置']]){
        const tab=e('button',label,{type:'button',class:'npc-r2b-tab','data-tab':id});tab.onclick=()=>show(id);tabs.append(tab);
        views[id]=e('section','',{class:'npc-r2b-view','data-view':id});main.append(views[id]);
    }
    const footer=(text,error=false)=>{const n=root.querySelector('#npc-r2b-status');n.textContent=text;n.classList.toggle('r2b-error',error);};
    const settings=mountNativeChannels(views.advanced,(text,error)=>{if(!error&&/设置已就绪|已保存|全部任务共用/.test(text))engine.refresh();footer(text,error);});
    const running=e('p','',{class:'na-state',id:'npc-auto-message'}),coverage=e('p','',{class:'nc-note'}),model=e('p','',{class:'nc-note'}),budgetInfo=e('p','',{class:'nc-note',id:'npc-output-summary'});
    const setup=button('配置辅助 API',()=>show('advanced'));
    const pause=button('暂停自动判断',()=>engine.setEnabled(!engine.view().enabled),{id:'npc-auto-toggle'});
    const skip=button('仅下一轮跳过辅助判断',()=>engine.skipOnce(),{id:'npc-auto-skip'});skip.hidden=true;
    const home=e('div','',{class:'nc-generic-home'});home.append(e('h3','自动运行'),running,model,coverage,budgetInfo,setup,pause,skip,e('p','照常发送消息：必要时先进行一次辅助判断，再注入同一轮正文。无需手动执行或注入；不做生成后审核，不自动重跑正文。',{class:'nc-note'}));views.test.append(home);
    const recordState=e('p','尚未运行',{class:'nc-note'}),actors=e('div','',{id:'npc-auto-actors'}),warning=e('p','',{class:'nc-note'});views.result.append(e('h3','本轮人物判断'),recordState,actors,warning);
    const mode=e('select','',{id:'npc-auto-mode',class:'text_pole'});for(const[value,label]of[['balanced','自动按需（默认）'],['always','每轮判断']])mode.append(e('option',label,{value}));mode.onchange=()=>engine.setMode(mode.value);
    const outputPolicy=e('select','',{id:'npc-output-policy',class:'text_pole'});for(const[value,label]of[['auto','自动适配旧默认预算（推荐）'],['channel','严格使用接口中保存的参数']])outputPolicy.append(e('option',label,{value}));outputPolicy.onchange=()=>engine.setOutputPolicy(outputPolicy.value);
    const outputDetail=e('details'),outputJson=e('pre','',{id:'npc-output-diagnostics',class:'na-data'});outputDetail.append(e('summary','本次输出上限与实际用量（不含思考原文）'),outputJson);
    const packet=e('pre','',{class:'na-data'}),details=e('details'),source=e('pre','',{class:'na-data',id:'npc-source-diagnostics'}),sources=e('details');details.append(e('summary','查看本轮注入文本'),packet);sources.append(e('summary','资料范围与人物身份校验'),source);
    views.inject.append(e('h3','进阶查看（不影响默认使用）'),e('p','调用策略'),mode,e('p','自动按需只跳过明确的状态/背包查看等输入；日常互动和继续指令仍会判断。每次最多一个辅助生成请求。',{class:'nc-note'}),details,sources,
        e('p','辅助输出策略'),outputPolicy,e('p','自动模式仅调整已识别 DeepSeek V4.1 Flash 的旧2048＋默认思考组合：本次上限8192 token；已核对的 OpenRouter/DeepSeek官方接口使用 low 思考。保留思考，不保证绝不截断。其它手动参数不改；上限不是必花用量。',{class:'nc-note'}),outputDetail);
    function badge(s){
        if(!['reading','judging','injected','done','error','skipped'].includes(s.status))return;
        const messages=document.querySelectorAll('#chat .mes[is_user="true"]');const target=messages[messages.length-1]?.querySelector('.mes_block');if(!target)return;
        let n=target.querySelector('.npc-auto-message-badge');if(!n){n=button('',()=>{void host.open();show('test');},{class:'npc-auto-message-badge'});target.append(n);}
        n.textContent='NPC · '+({reading:'读取资料中',judging:'人物判断中',injected:'已注入本轮',done:s.confirmed?'已参与本轮':'已设置立场',error:'正文前暂停',skipped:'本轮跳过'}[s.status]);n.title=s.message;
    }
    engine.subscribe(s=>{
        running.textContent=s.message;running.dataset.status=s.status;mode.value=s.mode;outputPolicy.value=s.outputPolicy;setup.hidden=s.configured;pause.hidden=!s.configured;pause.textContent=s.enabled?'暂停自动判断':'恢复自动判断';skip.hidden=s.status!=='error';
        model.textContent=s.model?'本次辅助模型：'+s.model:'';coverage.textContent=s.coverage?`读取 ${s.coverage.messageIndices.length} 条聊天、${s.coverage.loreRead} 条世界书，约 ${s.coverage.characters} 字符（不是token）。`:'';
        budgetInfo.textContent=(s.cached?'复用上次有效结果；以下是上次用量，不是新增费用。':'')+describeOutput(s.diagnostics);budgetInfo.hidden=!s.diagnostics;
        outputJson.textContent=s.diagnostics?JSON.stringify(s.diagnostics,null,2):'尚无本轮请求数据。接口未返回的用量显示为 null，不推定为0。';
        const label={waiting:'等待配置',ready:'自动运行已就绪',reading:'读取资料中',judging:'辅助判断中',injected:'已注入本轮',done:'本轮已处理',skipped:'本轮已跳过',paused:'已暂停',error:'正文前已暂停',stale:'上下文已改变'}[s.status];root.querySelector('#npc-auto-mini').textContent=label||s.status;
        entry.querySelector('.npc-r2b-settings-note').textContent=s.message;footer(s.message,s.status==='error');recordState.textContent=s.decision?`${s.decision.actors.length} 位相关人物；${s.cached?'复用了相同上下文的判断':'本轮辅助判断'}`:'暂无有效人物判断';
        actors.replaceChildren();for(const a of s.decision?.actors||[]){const box=e('section','',{class:'na-actor'});box.append(e('h4',a.name));for(const[k,t]of[['goal','自身目标'],['stance','当前立场'],['known','可知信息'],['unknown','仍不确定'],['response','回应方向'],['initiative','自身下一步']])box.append(e('p',t+'：'+a[k]));box.append(e('small','行为依据：'+a.evidence.join('、')),e('small','身份出处：'+(a.identity_evidence||[]).join('、')));actors.append(box);}
        warning.textContent=[...(s.warnings||[]),...(s.decision?.notes||[])].join('\n');packet.textContent=s.packet||'本轮没有注入内容。';source.textContent=JSON.stringify({coverage:s.coverage,sources:s.sources,warnings:s.warnings,validation:s.validation},null,2);badge(s);
    });
    new MutationObserver(()=>{if(root.hidden||root.getAttribute('aria-hidden')==='true')settings.clearSensitive();}).observe(root,{attributes:true,attributeFilter:['hidden','aria-hidden']});
    window.addEventListener('pagehide',()=>{settings.clearSensitive();engine.invalidate('页面已退出');});
    entry.querySelector('.inline-drawer-header').onkeydown=ev=>{if(['Enter',' '].includes(ev.key)){ev.preventDefault();ev.currentTarget.click();}};
    const wand=()=>{const menu=document.getElementById('extensionsMenu');if(menu&&!document.getElementById('npc-r2b-wand')){const item=e('div','',{id:'npc-r2b-wand',class:'list-group-item flex-container flexGap5 interactable',role:'button',tabindex:'0'});item.append(e('div','',{class:'fa-solid fa-brain extensionsMenuExtensionButton'}),e('span','NPC · 人物自主模拟'));item.onkeydown=ev=>{if(['Enter',' '].includes(ev.key)){ev.preventDefault();item.click();}};menu.prepend(item);}};
    wand();setTimeout(wand,700);
    const events=c.eventTypes||c.event_types;
    const on=(key,fn)=>{if(events?.[key])c.eventSource?.on(events[key],fn);};
    on('APP_READY',wand);
    on('CHAT_CHANGED',()=>{settings.clearSensitive();engine.invalidate('已切换聊天');engine.refresh();wand();});
    for(const key of ['MESSAGE_EDITED','MESSAGE_DELETED','WORLDINFO_UPDATED','WORLDINFO_SETTINGS_UPDATED','CHARACTER_EDITED','PERSONA_CHANGED'])on(key,()=>engine.invalidate('剧情或设定已改变'));
    on('MESSAGE_SWIPED',()=>{if(engine.view().status!=='injected')engine.invalidate('已切换回复候选');});
    on('GENERATION_STARTED',(_type,_options,dry)=>{if(!dry)nativeClient().setGenerating(true);});
    on('GENERATION_STOPPED',()=>{nativeClient().setGenerating(false);engine.invalidate('已停止生成');});
    on('GENERATION_ENDED',()=>{nativeClient().setGenerating(false);engine.ended();});
    on('CHAT_COMPLETION_PROMPT_READY',data=>engine.observePrompt(data));
    on('GENERATE_AFTER_COMBINE_PROMPTS',data=>engine.observePrompt(data));
    host.ready();engine.refresh();show(engine.view().configured?'test':'advanced');return true;
}
for(const[id,path]of[['base','../style.css'],['host','../panel-host.css'],['channels','../connections/ui.css'],['native','../native/ui.css'],['simple','../native/simple-ui.css'],['auto','./style.css']]){const link=e('link','',{rel:'stylesheet',id:'npc-auto-'+id});link.href=new URL(path+'?v=0.4.0',import.meta.url).href;document.head.append(link);}
function boot(){let tries=0;if(init()===false){const timer=setInterval(()=>{if(init()!==false||++tries>=30)clearInterval(timer);},100);}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
