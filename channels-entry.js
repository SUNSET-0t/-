// UI hotfix only. Does not alter credentials, server security or model scheduling.
import './bootstrap.js?v=0.2.1';
import { mountChannelManager } from './connections/ui.mjs?v=0.2.1';
const VERSION='0.2.1-r2b';
const stylesheet=document.createElement('link');
stylesheet.rel='stylesheet';stylesheet.href=new URL('./connections/ui.css?v=0.2.1',import.meta.url).href;
document.head.append(stylesheet);
let attempts=0;
const timer=setInterval(()=>{
    const advanced=document.querySelector('.npc-r2b-view[data-view=advanced]');
    if(!advanced){if(++attempts>100)clearInterval(timer);return;}
    clearInterval(timer);
    if(advanced.dataset.ncMounted)return;
    advanced.dataset.ncMounted=VERSION;
    const panel=document.getElementById('npc-r2b-overlay');
    const tabs=panel.querySelector('.npc-r2b-tabs');
    // Keep navigation independent of the network request and legacy event bindings.
    function showTab(name){
        if(!['test','result','inject','advanced'].includes(name))return;
        for(const tab of tabs.querySelectorAll('.npc-r2b-tab')){
            const active=tab.dataset.tab===name;
            tab.classList.toggle('r2b-selected',active);
            tab.setAttribute('aria-selected',String(active));
            tab.tabIndex=active?0:-1;
        }
        for(const view of panel.querySelectorAll('.npc-r2b-view'))view.hidden=view.dataset.view!==name;
        panel.querySelector('#npc-r2b-scroll').scrollTop=0;
    }
    tabs.addEventListener('click',event=>{
        const tab=event.target.closest('.npc-r2b-tab');
        if(!tab)return;
        event.preventDefault();event.stopImmediatePropagation();showTab(tab.dataset.tab);
    },true);
    const eyebrow=panel.querySelector('.npc-r2b-eyebrow');
    if(eyebrow)eyebrow.textContent='NPC SIMULATOR · '+VERSION;
    const old=document.createElement('details');old.className='nc-developer';
    const heading=document.createElement('summary');heading.textContent='旧实验回归区（手动选择样本；不是当前聊天）';old.append(heading);
    const note=document.createElement('p');note.textContent='本批只接通独立 API。真实聊天资料提取尚未启用；旧样本回归仍使用独立 Connection Profile，不会冒充真实聊天输入。';old.append(note);
    for(const name of ['test','result','inject']){
        const view=panel.querySelector(`.npc-r2b-view[data-view=${name}]`);if(!view)continue;
        const details=document.createElement('details'),title=document.createElement('summary');title.textContent='旧版 '+name+' 控件';details.append(title);
        while(view.firstChild)details.append(view.firstChild);old.append(details);
        const section=document.createElement('section');section.className='nc-generic-home';
        const h=document.createElement('h3');h.textContent=name==='test'?'先配置独立 API':name==='result'?'尚无当前聊天判断':'当前没有可注入的判断';
        const p=document.createElement('p');p.textContent='本次提供渠道管理、模型列表和阶段分工。当前聊天自动取材尚未接入，不会默认载入任何固定作品、人物或日期。';
        const b=document.createElement('button');b.type='button';b.className='menu_button';b.textContent='打开接口设置';b.onclick=()=>showTab('advanced');
        section.append(h,p,b);view.append(section);
    }
    const details=document.createElement('details'),title=document.createElement('summary');title.textContent='旧版实验参数';details.append(title);
    while(advanced.firstChild)details.append(advanced.firstChild);old.append(details);advanced.append(old);
    const input=document.getElementById('npc-r2b-input');if(input)input.value='';
    const mapping=document.getElementById('npc-r2b-mapping');if(mapping)mapping.value='';
    const footer=document.getElementById('npc-r2b-status');
    if(footer)footer.textContent='独立接口配置阶段 · 未读取聊天';
    let installGuide=null;
    function syncFooter(){
        const status=document.getElementById('nc-state');
        if(!status||!footer)return;
        const missing=/服务未安装|未安装或未启用/.test(status.textContent);
        if(installGuide)installGuide.hidden=!missing;
        const add=document.getElementById('nc-add');
        if(add){
            add.title=missing?'配套服务就绪后才能添加渠道；不是按钮失灵。':'';
            if(missing)add.setAttribute('aria-describedby','nc-install-guide');
            else add.removeAttribute('aria-describedby');
        }
        if(old.open)return;
        footer.textContent=missing?'网页 '+VERSION+' 已加载；下一步：在电脑启用配套服务。':status.textContent;
        footer.classList.toggle('r2b-error',!missing&&status.classList.contains('nc-error'));
        footer.classList.remove('r2b-ok','r2b-working');
    }
    document.addEventListener('click',event=>{
        if(!old.open&&event.target?.closest?.('#npc-r2b-refresh')){
            event.preventDefault();event.stopImmediatePropagation();syncFooter();
        }
    },true);
    mountChannelManager(advanced);
    const status=document.getElementById('nc-state');
    if(status){
        installGuide=document.createElement('section');installGuide.id='nc-install-guide';installGuide.className='nc-install-guide';installGuide.hidden=true;
        const h=document.createElement('strong');h.textContent='网页已更新，配套服务尚未就绪';
        const p=document.createElement('p');p.textContent='“添加渠道”暂时禁用是为了不让密钥在服务未就绪时被填写或误保存。清缓存不能安装服务器模块，切换标签页仍应正常。';
        const d=document.createElement('details'),s=document.createElement('summary');s.textContent='查看电脑端一次性安装步骤';d.append(s);
        for(const line of [
            '1. 在运行酒馆的电脑停止酒馆并备份 config.yaml，打开酒馆根目录的终端。',
            '2. 确认 plugins/npc-independent-api 尚不存在后执行下方命令；已存在时不要删除或重复 clone。',
        ]){const t=document.createElement('p');t.textContent=line;d.append(t);}
        const command=document.createElement('code');command.textContent='git clone https://github.com/SUNSET-0t/- plugins/npc-independent-api';d.append(command);
        for(const line of [
            '3. 检查 plugins 中只有可信插件，将 config.yaml 的 enableServerPlugins 设为 true。该开关会启用目录内其它服务器插件，不只本项目。',
            '4. 重新启动酒馆，再点“刷新服务状态”。若已经安装并启用仍报错，检查电脑启动日志里的 npc-independent-api。',
            '手机当前在公网 HTTP 时不要输入密钥；配置密钥请使用 HTTPS 或可信局域网。此说明不会执行任何命令或修改安全开关。',
        ]){const t=document.createElement('p');t.textContent=line;d.append(t);}
        installGuide.append(h,p,d);status.after(installGuide);
        new MutationObserver(syncFooter).observe(status,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    }
    old.addEventListener('toggle',()=>{if(!old.open)syncFooter();});
    syncFooter();showTab('advanced');
},100);
