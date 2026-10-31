// Connection phase: keep the proven native popup/inline host, isolate old test fixtures.
import './bootstrap.js?v=0.2.0';
import { mountChannelManager } from './connections/ui.mjs?v=0.2.0';
const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('./connections/ui.css?v=0.2.0',import.meta.url).href;document.head.append(stylesheet);
let attempts=0;
const timer=setInterval(()=>{
    const advanced=document.querySelector('.npc-r2b-view[data-view=advanced]');
    if(!advanced){if(++attempts>100)clearInterval(timer);return;}
    clearInterval(timer);
    const old=document.createElement('details');old.className='nc-developer';
    const heading=document.createElement('summary');heading.textContent='旧实验回归区（手动选择样本；不是当前聊天）';old.append(heading);
    const note=document.createElement('p');note.textContent='本批只接通独立 API。真实聊天资料提取尚未启用；旧样本回归仍使用独立 Connection Profile，不会冒充真实聊天输入。';old.append(note);
    for(const name of ['test','result','inject']){
        const view=document.querySelector(`.npc-r2b-view[data-view=${name}]`);if(!view)continue;
        const details=document.createElement('details'),title=document.createElement('summary');title.textContent='旧版 '+name+' 控件';details.append(title);
        while(view.firstChild)details.append(view.firstChild);old.append(details);
        const section=document.createElement('section');section.className='nc-generic-home';
        const h=document.createElement('h3');h.textContent=name==='test'?'先配置独立 API':name==='result'?'尚无当前聊天判断':'当前没有可注入的判断';
        const p=document.createElement('p');p.textContent='本次提供渠道管理、模型列表和阶段分工。当前聊天自动取材尚未接入，不会默认载入任何固定作品、人物或日期。';
        const b=document.createElement('button');b.type='button';b.className='menu_button';b.textContent='打开接口设置';b.onclick=()=>document.querySelector('.npc-r2b-tab[data-tab=advanced]')?.click();section.append(h,p,b);view.append(section);
    }
    const details=document.createElement('details'),title=document.createElement('summary');title.textContent='旧版实验参数';details.append(title);while(advanced.firstChild)details.append(advanced.firstChild);old.append(details);advanced.append(old);
    const input=document.getElementById('npc-r2b-input');if(input)input.value='';
    const mapping=document.getElementById('npc-r2b-mapping');if(mapping)mapping.value='';
    const status=document.getElementById('npc-r2b-status');if(status)status.textContent='独立接口配置阶段 · 未读取聊天 · 未调用模型';
    mountChannelManager(advanced);
    document.querySelector('.npc-r2b-tab[data-tab=advanced]')?.click();
},100);
