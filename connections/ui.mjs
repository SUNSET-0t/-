import { channelRequest, credentialTransportAdvice } from './client.mjs';
import { STAGES } from './providers.mjs';

function node(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) if (v != null) n.setAttribute(k,String(v));
    for (const child of children.flat()) if (child != null) n.append(typeof child === 'string' ? document.createTextNode(child) : child);
    return n;
}
function button(label, fn, id) { const b=node('button',{type:'button',class:'menu_button',id},label);b.addEventListener('click',fn);return b; }
function field(label,control) { return node('label',{class:'nc-field'},node('span',{},label),control); }
function text(id,value='',type='text') { const n=node('input',{id,type,class:'text_pole',autocomplete:'off'});n.value=value;return n; }
function choice(id,items,value='') { const n=node('select',{id,class:'text_pole'});for(const item of items)n.append(node('option',{value:item.id,disabled:item.disabled?'disabled':null},item.label));n.value=value;return n; }

export function mountChannelManager(target) {
    if (target.querySelector('#npc-channels')) return;
    let state=null, busy=false, editing=null;
    const root=node('section',{id:'npc-channels',class:'nc-root'});
    const notice=node('p',{id:'nc-state',role:'status',class:'nc-state'},'尚未检查独立服务。');
    const stages=node('div',{id:'nc-stages'}),list=node('div',{id:'nc-list'}),editor=node('div',{id:'nc-editor'});
    const add=button('＋ 添加渠道',()=>edit(), 'nc-add');add.disabled=true;
    root.append(node('h3',{},'独立 API 与阶段模型'),notice,button('刷新服务状态',()=>run(refresh),'nc-refresh'),
        node('details',{},node('summary',{},'首次安装说明'),node('p',{},'此功能需要独立服务端模块。请按照仓库 docs/CHANNELS_020.md 在酒馆电脑安装一次；本面板不会自动开启服务器插件或改变安全配置。'),node('p',{},'密钥不写入正文配置，也不保存在浏览器普通设置中。公网 HTTP 页面禁止输入密钥。')),
        node('p',{class:'nc-note'},'保存不生成；获取模型只访问列表接口；“测试生成”会单独确认可能收费。列表存在不代表调用权限或价格已验证。'),
        stages,node('div',{class:'nc-toolbar'},node('h4',{},'渠道'),add),list,editor);
    target.prepend(root);
    function status(message,error=false){notice.textContent=message;notice.classList.toggle('nc-error',error);}
    async function run(task) {
        if(busy)return;busy=true;root.setAttribute('aria-busy','true');
        const buttons=[...root.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);
        try { await task(); } catch(e) {status(e.message||'操作失败',true);}
        finally {busy=false;root.removeAttribute('aria-busy');buttons.forEach(([b,d])=>{if(b.isConnected)b.disabled=d;});add.disabled=!state;}
    }
    async function refresh(){const data=await channelRequest('state',{},15000);if(data.apiVersion!==1)throw new Error('独立服务版本不兼容。');state=data;render();status('独立服务 '+data.version+' 已连接，未调用生成模型。');}
    function accept(data){state={...state,...data};render();}
    function available(c){return(c?.models||[]).filter(m=>m.textGeneration!==false);}
    function fillList(datalist,c){datalist.replaceChildren();available(c).forEach(m=>datalist.append(node('option',{value:m.id,label:m.label})));}
    function closeEditor(){editor.querySelector('#nc-key')?.replaceChildren();const key=editor.querySelector('#nc-key');if(key)key.value='';editor.replaceChildren();editing=null;}
    function render(){
        add.disabled=false;list.replaceChildren();
        for(const c of state.channels){const p=state.providers.find(x=>x.id===c.providerId);list.append(node('div',{class:'nc-channel'},node('div',{},node('strong',{},c.name),node('small',{},p?.label||c.providerId),node('small',{},c.defaultModel||'未设默认模型'),node('small',{},c.hasKey?'已保存独立密钥':'无独立密钥')),button('编辑',()=>edit(c))));}
        if(!state.channels.length)list.append(node('p',{class:'nc-note'},'暂无渠道。选择官方提供商后地址自动填写。'));
        renderStages();
    }
    function renderStages(){
        stages.replaceChildren(node('h4',{},'阶段使用模型'),node('p',{class:'nc-note'},'阶段表示任务分工，不会每轮依次调用四次。当前聊天自动取材尚未接入。'));
        for(const s of STAGES){
            const route=state.routes[s.id]||{},c=state.channels.find(x=>x.id===route.channelId);
            const channel=choice('nc-route-'+s.id,[{id:'',label:'未配置'},...state.channels.map(x=>({id:x.id,label:x.name}))],route.channelId||'');
            const model=text('nc-model-'+s.id,route.modelId||'');
            const models=node('datalist',{id:'nc-options-'+s.id});model.setAttribute('list',models.id);fillList(models,c);
            const manual=text('nc-manual-'+s.id,'','checkbox');manual.checked=Boolean(route.manual);
            channel.addEventListener('change',()=>{const ch=state.channels.find(x=>x.id===channel.value);model.value=ch?.defaultModel||'';manual.checked=Boolean(model.value&&!ch.models.some(m=>m.id===model.value));fillList(models,ch);});
            stages.append(node('div',{class:'nc-stage'},node('strong',{},s.label),field('渠道',channel),field('模型 ID（从当前接口列表选择）',model),models,node('label',{class:'nc-check'},manual,'允许手动模型 ID（未验证）')));
        }
        stages.append(node('div',{class:'nc-actions'},button('全部沿用常规判断',()=>{
            const c=document.getElementById('nc-route-regular').value,m=document.getElementById('nc-model-regular').value,v=document.getElementById('nc-manual-regular').checked;
            for(const s of STAGES){document.getElementById('nc-route-'+s.id).value=c;document.getElementById('nc-model-'+s.id).value=m;document.getElementById('nc-manual-'+s.id).checked=v;fillList(document.getElementById('nc-options-'+s.id),state.channels.find(x=>x.id===c));}
            status('已复制，请保存阶段选择。');
        },'nc-use-same'),button('保存阶段选择',()=>run(async()=>{
            const routes={};for(const s of STAGES){const channelId=document.getElementById('nc-route-'+s.id).value;if(channelId)routes[s.id]={channelId,modelId:document.getElementById('nc-model-'+s.id).value.trim(),manual:document.getElementById('nc-manual-'+s.id).checked};}
            accept(await channelRequest('routes',{routes,expectedRevision:state.revision},15000));status('阶段选择已保存，未生成。');
        }),'nc-save-routes')));
    }
    function edit(saved=null){
        if(!state)return;closeEditor();editing=saved?.id||null;
        const provider=choice('nc-provider',state.providers.map(p=>({id:p.id,label:p.label+(p.supported?'':'（暂不支持）'),disabled:!p.supported})),saved?.providerId||'openai');
        const name=text('nc-name',saved?.name||'新渠道'),url=text('nc-url'),key=text('nc-key','','password');key.autocomplete='new-password';key.placeholder=saved?'留空保留；已存密钥不回读':'仅填写此渠道的密钥';
        const model=text('nc-default-model',saved?.defaultModel||''),models=node('datalist',{id:'nc-default-options'});model.setAttribute('list',models.id);fillList(models,saved);
        const tokens=text('nc-tokens',saved?.options?.maxOutputTokens??2048,'number'),timeout=text('nc-timeout',saved?.options?.timeoutSeconds??120,'number');
        const temp=text('nc-temperature',saved?.options?.temperature??'','number');temp.step='0.1';temp.placeholder='留空跟随接口';
        const reasoning=choice('nc-reasoning',[{id:'provider-default',label:'服务商默认（不发送）'},...['none','minimal','low','medium','high','xhigh','max'].map(x=>({id:x,label:x+'（需模型支持）'}))],saved?.options?.reasoning||'provider-default');
        const budget=choice('nc-budget',[{id:'provider-default',label:'按协议默认'},{id:'max_tokens',label:'max_tokens'},{id:'max_completion_tokens',label:'max_completion_tokens'}],saved?.options?.tokenField||'provider-default');
        const exclude=text('nc-exclude',(saved?.options?.excludedOptionalParameters||[]).join(','));
        const providerNote=node('p',{class:'nc-note'}),consent=text('nc-lan-confirm','','checkbox');
        const advice=credentialTransportAdvice(window.location);
        const update=(changed=false)=>{const p=state.providers.find(x=>x.id===provider.value);url.readOnly=p.endpointMode!=='custom';url.value=p.baseUrl||(changed?'':saved?.baseUrl||'');providerNote.textContent=p.notice||'官方地址固定；第三方中转选择自定义。';const native=['gemini-native','anthropic-native'].includes(p.protocol);reasoning.disabled=native;budget.disabled=native;if(native)reasoning.value='provider-default';if(changed){key.value='';model.value='';models.replaceChildren();}};
        update();provider.addEventListener('change',()=>update(true));
        const form=node('form',{class:'nc-editor-card'});form.addEventListener('submit',e=>e.preventDefault());
        form.append(node('div',{class:'nc-toolbar'},node('h4',{},saved?'编辑渠道':'添加渠道'),button('关闭',closeEditor)),field('渠道类型',provider),field('渠道名',name),field('API 地址',url),providerNote,field('API 密钥',node('div',{class:'nc-key-row'},key,button('显示',e=>{key.type=key.type==='password'?'text':'password';e.currentTarget.textContent=key.type==='password'?'显示':'隐藏';}))),field('默认模型（列表选择或手填未验证 ID）',model),models,
            node('details',{},node('summary',{},'高级参数'),node('div',{class:'nc-grid'},field('输出额度',tokens),field('超时（秒）',timeout),field('温度',temp),field('思考强度',reasoning)),field('输出预算字段',budget),field('排除可选参数',exclude),node('p',{class:'nc-note'},'本版仅非流式；允许排除 temperature、reasoning_effort。不能排除输出预算。思考费用是否包含在额度内取决于提供商。')));
        if(advice==='public-http'){key.disabled=true;form.append(node('p',{class:'nc-error'},'当前是公网 HTTP。请改为 HTTPS 或可信局域网后再填写密钥。'));}
        if(advice==='lan-http')form.append(node('label',{class:'nc-check nc-warning'},consent,'当前是局域网 HTTP，我确认正在可信内网操作。'));
        function requireSaved(){if(!editing)throw new Error('请先保存渠道。');if(key.value||provider.value!==saved.providerId||url.value!==saved.baseUrl)throw new Error('接口或密钥有未保存变化，请先保存。');}
        const save=button('保存渠道',()=>run(async()=>{
            if(advice==='public-http')throw new Error('禁止通过公网 HTTP 发送密钥。');
            if(advice==='lan-http'&&!consent.checked)throw new Error('请先确认处于可信内网。');
            const previous=editing,oldIds=new Set(state.channels.map(c=>c.id));
            const channel={id:editing||undefined,name:name.value.trim(),providerId:provider.value,baseUrl:url.value.trim(),defaultModel:model.value.trim(),options:{maxOutputTokens:Number(tokens.value),timeoutSeconds:Number(timeout.value),temperature:temp.value===''?null:Number(temp.value),reasoning:reasoning.value,tokenField:budget.value,stream:false,excludedOptionalParameters:exclude.value.split(',').map(x=>x.trim()).filter(Boolean)}};
            const data=await channelRequest('save',{channel,apiKey:key.value||undefined,expectedRevision:state.revision},15000);key.value='';accept(data);const c=previous?state.channels.find(x=>x.id===previous):state.channels.find(x=>!oldIds.has(x.id));edit(c);status('独立渠道已保存，未触碰正文配置，未发起生成。');
        }),'nc-save');save.disabled=advice==='public-http';
        form.append(node('div',{class:'nc-actions'},save,button('获取模型列表',()=>run(async()=>{requireSaved();accept(await channelRequest('models',{channelId:editing}));saved=state.channels.find(c=>c.id===editing);fillList(models,saved);status(`从接口读取到 ${saved.models.length} 个模型；未发起生成。`);}), 'nc-model-refresh'),button('测试生成（可能收费）',()=>run(async()=>{
            requireSaved();const m=model.value.trim();if(!m)throw new Error('请选择或填写模型 ID。');if(!window.confirm('发送一次固定短测试，输出额度64。不发送游戏聊天，不重试。服务商可能收费，继续？'))return;
            const result=await channelRequest('test',{channelId:editing,modelId:m,confirmPaid:true},Number(timeout.value)*1000+5000);
            status(`独立测试完成：${result.modelId}；${result.generationRequests}次生成；${result.elapsedMs}ms。费用以服务商账单为准。`);
            form.querySelector('.nc-test-output')?.remove();form.append(node('pre',{class:'nc-test-output'},result.text));
        }),'nc-test'),saved?button('删除',()=>run(async()=>{if(!window.confirm('删除此独立渠道和密钥？被阶段引用时须先取消选择。'))return;accept(await channelRequest('remove',{channelId:editing,expectedRevision:state.revision},15000));closeEditor();status('已删除独立渠道，正文密钥不受影响。');}),'nc-delete'):null));
        editor.append(form);form.scrollIntoView({block:'nearest'});
    }
    void run(refresh);
}
