import {nativeClient} from './client.mjs?v=0.3.0';
import {VERSION,STAGES} from './protocol.mjs?v=0.3.0';
const n=(tag,attrs={},...children)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!=null)e.setAttribute(k,String(v));for(const x of children.flat())if(x!=null)e.append(typeof x==='string'?document.createTextNode(x):x);return e;};
function button(id,text,fn){const b=n('button',{id,type:'button',class:'menu_button'},text);b.addEventListener('click',fn);return b;}
function input(id,value='',type='text'){const e=n('input',{id,type,class:'text_pole',autocomplete:type==='password'?'new-password':'off'});e.value=value;return e;}
function select(id,items,value=''){const e=n('select',{id,class:'text_pole'});for(const x of items)e.append(n('option',{value:x.id,disabled:x.disabled?'disabled':null},x.label));e.value=value;return e;}
const field=(label,control)=>n('label',{class:'nc-field'},n('span',{},label),control);
function picker(id,models,chosen=''){
 const rows=models.filter(m=>m.textGeneration!==false),manual=input(id+'-manual',chosen),filter=input(id+'-search');filter.placeholder='搜索接口返回的模型';
 const box=select(id,[{id:'',label:'请选择模型'},...rows.map(m=>({id:m.id,label:m.label===m.id?m.id:`${m.label} · ${m.id}`}))],rows.some(m=>m.id===chosen)?chosen:'');
 const mode=input(id+'-manual-on','','checkbox');mode.checked=Boolean(chosen&&!rows.some(m=>m.id===chosen));
 const sync=()=>{manual.hidden=!mode.checked;box.disabled=mode.checked;filter.disabled=mode.checked;};
 mode.onchange=sync;box.onchange=()=>manual.value=box.value;
 filter.oninput=()=>{const value=box.value,q=filter.value.toLowerCase();box.replaceChildren(n('option',{value:''},'请选择模型'));for(const m of rows)if(m.id===value||`${m.label} ${m.id}`.toLowerCase().includes(q))box.append(n('option',{value:m.id},m.label===m.id?m.id:`${m.label} · ${m.id}`));box.value=value;};sync();
 const element=n('div',{class:'nc-model-picker'},filter,box,n('label',{class:'nc-check'},mode,'手动填写模型 ID（未验证）'),manual);
 return{element,value:()=>mode.checked?manual.value.trim():box.value,manual:()=>mode.checked,set(value,forceManual=false){mode.checked=forceManual||!rows.some(m=>m.id===value);manual.value=value;box.value=value;sync();}};
}
export function mountNativeChannels(target,onStatus=()=>{}){
 const api=nativeClient();let state=null,busy=false,editing=null;
 const root=n('section',{id:'npc-channels',class:'nc-root'}),notice=n('p',{id:'nc-state',role:'status',class:'nc-state'},'正在读取渠道配置……');
 const list=n('div',{id:'nc-list'}),editor=n('div',{id:'nc-editor'}),stages=n('div',{id:'nc-stages'});
 function status(text,error=false){notice.textContent=text;notice.classList.toggle('nc-error',error);onStatus(text,error);}
 const add=button('nc-add','＋ 添加渠道',()=>edit());add.disabled=true;
 root.append(n('h3',{},'独立 API 与阶段模型'),notice,button('nc-refresh','刷新渠道',()=>run(refresh)),n('p',{class:'nc-note'},'使用酒馆现有接口，无需额外安装。保存和获取模型不生成正文；测试生成需要单独确认。'),n('div',{class:'nc-toolbar'},n('h4',{},'渠道'),add),list,editor,stages);
 target.append(root);
 async function run(task){if(busy)return;busy=true;root.setAttribute('aria-busy','true');const controls=[...root.querySelectorAll('button,input,select')].map(e=>[e,e.disabled]);for(const[e]of controls)e.disabled=true;
  try{await task();}catch(e){status(e.message||'操作失败',true);}finally{busy=false;root.removeAttribute('aria-busy');for(const[e,value]of controls)if(e.isConnected)e.disabled=value;add.disabled=!state;}}
 async function refresh(){state=await api.request('state');render();status(`原生调用 ${VERSION} 已就绪；不需要配套服务。`);}
 function accept(result){state={...state,...result};render();}
 function closeEditor(){const key=editor.querySelector('#nc-key');if(key)key.value='';editor.replaceChildren();editing=null;}
 function render(){add.disabled=false;list.replaceChildren();for(const c of state.channels){list.append(n('div',{class:'nc-channel'},n('div',{},n('strong',{},c.name),n('small',{},state.providers.find(p=>p.id===c.providerId)?.label||c.providerId),n('small',{},c.defaultModel||'尚未选择模型'),n('small',{},c.hasKey?'酒馆密钥引用已保存':'缺少密钥')),button(null,'编辑',()=>edit(c))));}if(!state.channels.length)list.append(n('p',{class:'nc-note'},'尚无渠道。选择提供商、填写 Key、保存后获取模型即可。'));renderStages();}
 function renderStages(){stages.replaceChildren(n('h4',{},'阶段模型分工'),n('p',{class:'nc-note'},'这里保存任务分工，不会每轮依次调用四次。当前聊天自动取材尚未接入。'));const controls={};
  for(const stage of STAGES){const route=state.routes[stage.id]||{},c=state.channels.find(c=>c.id===route.channelId);const channel=select('nc-route-'+stage.id,[{id:'',label:'未配置'},...state.channels.map(c=>({id:c.id,label:c.name}))],route.channelId||'');
   const holder=n('div');let model=picker('nc-model-'+stage.id,c?.models||[],route.modelId||'');holder.append(model.element);
   channel.onchange=()=>{const c=state.channels.find(c=>c.id===channel.value);model=picker('nc-model-'+stage.id,c?.models||[],c?.defaultModel||'');holder.replaceChildren(model.element);};
   controls[stage.id]={channel,get model(){return model;}};stages.append(n('details',{class:'nc-stage',open:stage.id==='regular'?'open':null},n('summary',{},stage.label),field('渠道',channel),field('模型',holder)));
  }
  stages.append(n('div',{class:'nc-actions'},button('nc-use-same','全部沿用常规判断',()=>{const regular=controls.regular;for(const s of STAGES){if(s.id==='regular')continue;const control=controls[s.id];control.channel.value=regular.channel.value;control.channel.dispatchEvent(new Event('change'));control.model.set(regular.model.value(),regular.model.manual());}status('已复制，请保存阶段选择。');}),button('nc-save-routes','保存阶段选择',()=>run(async()=>{const routes={};for(const s of STAGES){const c=controls[s.id];if(c.channel.value)routes[s.id]={channelId:c.channel.value,modelId:c.model.value(),manual:c.model.manual()};}accept(await api.request('routes',{routes,expectedRevision:state.revision}));status('阶段选择已保存，没有生成请求。');}))));
 }
 function edit(saved=null){if(!state||busy)return;closeEditor();editing=saved?.id||null;
  const provider=select('nc-provider',state.providers.map(p=>({id:p.id,label:p.label+(p.supported?'':'（暂未支持）'),disabled:!p.supported})),saved?.providerId||'openai');
  const name=input('nc-name',saved?.name||'新渠道'),url=input('nc-url'),key=input('nc-key','','password');key.placeholder=saved?'留空保留原密钥；保存后不回显':'API Key';
  const existing=select('nc-existing-secret',[{id:'',label:'不选择（填写新 Key 或保留原 Key）'}]);
  const notes=n('p',{id:'nc-provider-note',class:'nc-note'}),modelArea=n('div');let model=picker('nc-default-model',saved?.models||[],saved?.defaultModel||'');modelArea.append(model.element);
  const tokens=input('nc-tokens',saved?.options?.maxOutputTokens??2048,'number'),timeout=input('nc-timeout',saved?.options?.timeoutSeconds??120,'number'),temperature=input('nc-temperature',saved?.options?.temperature??'','number');temperature.step='0.1';
  const effort=select('nc-reasoning',[{id:'provider-default',label:'默认（不额外指定）'},...['none','minimal','low','medium','high','xhigh','max'].map(id=>({id,label:id+'（需接口支持）'}))],saved?.options?.reasoning||'provider-default');
  const budget=select('nc-budget',[{id:'provider-default',label:'按接口默认'},{id:'max_tokens',label:'max_tokens'},{id:'max_completion_tokens',label:'max_completion_tokens'}],saved?.options?.tokenField||'provider-default');const exclude=input('nc-exclude',(saved?.options?.excludedOptionalParameters||[]).join(','));
  const form=n('form',{class:'nc-editor-card'});form.onsubmit=e=>e.preventDefault();
  function syncProvider(changed=false){const p=state.providers.find(p=>p.id===provider.value);url.readOnly=Boolean(p.baseUrl);url.value=p.baseUrl||(changed?'':saved?.baseUrl||'');notes.textContent=p.notice||'官方地址自动填写；第三方中转请选择自定义。';const native=['makersuite','claude'].includes(p.source);effort.disabled=native;budget.disabled=native;if(native)effort.value='provider-default';if(changed){key.value='';existing.replaceChildren(n('option',{value:''},'不选择'));model=picker('nc-default-model',[]);modelArea.replaceChildren(model.element);}}
  syncProvider();provider.onchange=()=>syncProvider(true);
  const checkClean=()=>{if(!editing)throw new Error('请先保存渠道。');if(key.value||existing.value||provider.value!==saved.providerId||url.value.replace(/\/+$/,'')!==saved.baseUrl)throw new Error('接口或密钥有未保存变化，请先保存。');};
  const settings=()=>({maxOutputTokens:Number(tokens.value),timeoutSeconds:Number(timeout.value),temperature:temperature.value===''?null:Number(temperature.value),reasoning:effort.value,tokenField:budget.value,excludedOptionalParameters:exclude.value.split(',').map(v=>v.trim()).filter(Boolean)});
  const loadModels=button('nc-model-refresh','获取模型列表',()=>run(async()=>{checkClean();const result=await api.request('models',{channelId:editing});accept(result);saved=state.channels.find(c=>c.id===editing);const value=model.value();model=picker('nc-default-model',saved.models,value);modelArea.replaceChildren(model.element);status(`接口返回 ${saved.models.length} 个模型；没有生成正文。`);}));
  const showKey=button('nc-show-key','显示',()=>{key.type=key.type==='password'?'text':'password';showKey.textContent=key.type==='password'?'显示':'隐藏';});
  form.append(n('div',{class:'nc-toolbar'},n('h4',{},saved?'编辑渠道':'添加渠道'),button('nc-close-editor','关闭',closeEditor)),field('渠道类型',provider),field('渠道名',name),field('API 地址',url),notes,field('API 密钥',n('div',{class:'nc-key-row'},key,showKey)),n('details',{},n('summary',{},'或选择酒馆已经保存的密钥'),button('nc-read-keys','读取密钥名称（不读取 Key）',()=>run(async()=>{const result=await api.request('secrets',{providerId:provider.value});existing.replaceChildren(n('option',{value:''},'不选择'));for(const r of result.secrets)existing.append(n('option',{value:r.id},`${r.label}${r.active?'（当前默认）':''}`));status('只读取密钥名称和编号；未切换默认项。');})),existing),field('默认模型',modelArea),loadModels,
   n('details',{},n('summary',{},'高级参数'),n('div',{class:'nc-grid'},field('输出额度',tokens),field('超时（秒）',timeout),field('温度（可留空）',temperature),field('思考参数',effort)),field('输出预算字段',budget),field('排除参数',exclude),n('p',{class:'nc-note'},'仅支持排除 temperature、reasoning_effort。非流式；预算与思考费用遵循酒馆和提供商行为，插件不自动重试。')),
   n('p',{class:'nc-note'},'密钥保存到酒馆原生密钥库；保存新 Key 后恢复原默认项。保存期间请勿在其它窗口同时切换密钥。选择已有密钥不会改变默认项。'));
  if(location.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(location.hostname))form.append(n('p',{class:'nc-note nc-warning'},'当前酒馆地址使用 HTTP；填写 Key 请使用可信网络或 HTTPS。此提示不要求安装额外组件。'));
  form.append(n('div',{class:'nc-actions'},button('nc-save','保存渠道',()=>run(async()=>{
   const channel={id:editing||undefined,providerId:provider.value,name:name.value.trim(),baseUrl:url.value,defaultModel:model.value(),options:settings()};const oldIds=new Set(state.channels.map(c=>c.id));
   const result=await api.request('save',{channel,apiKey:key.value||undefined,existingSecretId:existing.value||undefined,expectedRevision:state.revision});key.value='';existing.value='';accept(result);const c=editing?state.channels.find(c=>c.id===editing):state.channels.find(c=>!oldIds.has(c.id));
   // Rebuild after the busy guard is released, so saved IDs and provider checks match.
   saved=c;editing=c.id;name.value=c.name;url.value=c.baseUrl;status('渠道已保存到酒馆；原默认密钥项已恢复，没有生成请求。');
  })),button('nc-test','测试生成（可能收费）',()=>run(async()=>{
   checkClean();if(JSON.stringify(settings())!==JSON.stringify(saved.options))throw new Error('参数有未保存变化，请先保存。');const m=model.value();if(!m)throw new Error('请选择或填写模型。');
   if(!window.confirm('只发起一次辅助生成：固定短测试，输出预算64；不发送游戏聊天，不自动重试。思考用量及收费以服务商为准。继续？'))return;
   const result=await api.request('test',{channelId:editing,modelId:m,confirmPaid:true});form.querySelector('.nc-test-output')?.remove();form.append(n('pre',{class:'nc-test-output'},result.text));status(`测试完成：${result.modelId}，${result.generationRequests}次辅助请求。未生成正文。`);
  })),saved?button('nc-delete','删除渠道',()=>run(async()=>{if(!window.confirm('只删除渠道配置，酒馆密钥保留，避免影响其他用途。继续？'))return;accept(await api.request('remove',{channelId:editing,expectedRevision:state.revision}));closeEditor();status('渠道已删除，原生密钥没有删除。');})):null));
  editor.append(form);form.scrollIntoView({block:'nearest'});
 }
 void run(refresh);
 return{clearSensitive(){const key=editor.querySelector('#nc-key');if(key)key.value='';},refresh:()=>run(refresh)};
}
