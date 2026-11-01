import {nativeClient} from './client.mjs?v=0.3.0';
import {STAGES} from './protocol.mjs?v=0.3.0';
import {UI_VERSION,STAGE_HELP,inspectRoutes,sharedRoutes,currentChoice} from './settings-model.mjs?v=0.3.1';
import {createKeyField} from './key-field.mjs?v=0.3.1';
const n=(tag,attrs={},...children)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs))if(v!=null)e.setAttribute(k,String(v));for(const x of children.flat())if(x!=null)e.append(typeof x==='string'?document.createTextNode(x):x);return e;};
function button(id,text,fn){const b=n('button',{id,type:'button',class:'menu_button'},text);b.addEventListener('click',fn);return b;}
function input(id,value='',type='text'){const e=n('input',{id,type,class:'text_pole',autocomplete:'off'});e.value=value;return e;}
function select(id,items,value=''){const e=n('select',{id,class:'text_pole'});for(const x of items)e.append(n('option',{value:x.id,disabled:x.disabled?'disabled':null},x.label));e.value=value;return e;}
function field(label,control){return n('div',{class:'nc-field'},n('label',{for:control.id||null},label),control);}
function picker(id,models,chosen='',manualSelected=false){
 const rows=(models||[]).filter(m=>m.textGeneration!==false),box=select(id,[{id:'',label:rows.length?'选择一个辅助模型':'先获取模型列表'},...rows.map(m=>({id:m.id,label:m.id}))],rows.some(m=>m.id===chosen)?chosen:'');
 const manual=input(id+'-manual',chosen),filter=input(id+'-search');filter.placeholder='输入模型名筛选';
 const mode=input(id+'-manual-on','','checkbox');mode.checked=manualSelected||Boolean(chosen&&!rows.some(m=>m.id===chosen));
 const search=n('details',{class:'nc-picker-extra'},n('summary',{},'搜索或手填模型'),filter,n('label',{class:'nc-check'},mode,'手动填写模型 ID（未验证）'));
 const help=n('p',{class:'nc-note'},rows.length?'只显示这个接口返回的模型；调用权限和费用以服务商为准。':'列表尚未获取。接口不支持列表时，可展开“搜索或手填模型”。');
 function sync(){manual.hidden=!mode.checked;box.hidden=mode.checked;filter.disabled=mode.checked;}
 mode.onchange=sync;box.onchange=()=>{manual.value=box.value;};
 filter.oninput=()=>{const value=box.value,q=filter.value.toLowerCase();box.replaceChildren(n('option',{value:''},'选择一个辅助模型'));for(const m of rows)if(m.id===value||`${m.label} ${m.id}`.toLowerCase().includes(q))box.append(n('option',{value:m.id},m.id));box.value=value;};sync();
 const element=n('div',{class:'nc-model-picker'},box,manual,search,help);
 return{element,value:()=>mode.checked?manual.value.trim():box.value,manual:()=>mode.checked,sync,set(value,forceManual=false){mode.checked=forceManual||Boolean(value&&!rows.some(m=>m.id===value));manual.value=value;box.value=value;sync();}};
}
export function mountNativeChannels(target,onStatus=()=>{}){
 const api=nativeClient();let state=null,busy=false,editing=null,tokenField=null,preferred=null,mainPicker=null;let syncControls=()=>{};
 const root=n('section',{id:'npc-channels',class:'nc-root nc-simple'}),notice=n('p',{id:'nc-state',role:'status',class:'nc-state'},'正在读取已有设置……');
 const basic=n('div',{id:'nc-basic'}),editor=n('div',{id:'nc-editor'}),extras=n('div',{id:'nc-extras'});
 const refreshButton=button('nc-refresh','刷新',()=>run(async()=>{await refresh();}));
 root.append(n('div',{class:'nc-toolbar'},n('h3',{},'辅助模型设置'),refreshButton),notice,basic,editor,extras);target.append(root);
 function status(text,error=false){notice.textContent=text;notice.classList.toggle('nc-error',error);onStatus(text,error);}
 async function run(task){if(busy)return;busy=true;root.setAttribute('aria-busy','true');const controls=[...root.querySelectorAll('button,input,select')].map(e=>[e,e.disabled]);for(const[e]of controls)e.disabled=true;
  try{await task();}catch(e){status(e.message||'操作失败',true);}finally{busy=false;root.removeAttribute('aria-busy');for(const[e,value]of controls)if(e.isConnected)e.disabled=value;syncControls();}}
 async function refresh(){state=await api.request('state');render();status('设置已就绪。选一个接口和一个模型即可，无需配置四套。');}
 function clearSensitive(){tokenField?.clear();}
 function closeEditor(){clearSensitive();tokenField=null;editor.replaceChildren();editing=null;basic.hidden=false;extras.hidden=false;}
 function render(){if(!state)return;basic.replaceChildren();extras.replaceChildren();mainPicker=null;syncControls=()=>{};
  const info=inspectRoutes(state.routes),selected=currentChoice(state,preferred);preferred=selected;
  const summary=n('div',{id:'nc-current-summary',class:'nc-current'});
  if(info.kind==='shared'){const c=state.channels.find(c=>c.id===info.route.channelId);summary.append(n('strong',{},'已保存的辅助模型'),n('p',{},`${c?.name||'接口已失效'} · ${info.route.modelId}`),n('small',{},info.complete?'全部任务共用，不会因此多调用四次。':'旧配置只覆盖部分任务；保存简单设置可统一补齐。'));}
  else if(info.kind==='split'){summary.append(n('strong',{},'已保留你的高级分工'),n('p',{},'不同阶段的模型没有被自动修改。要简化为同一个模型，请选择后点“保存并统一使用”。'));}
  else{summary.append(n('strong',{},'先用一个模型就够了'),n('p',{},'不需要理解资料整理、复杂判断等分工。先选一个你熟悉的辅助模型。'));}
  basic.append(summary,n('p',{class:'nc-note'},'当前仍在连接测试阶段，自动读取聊天和人物判断尚未接入。配置保存不会生成正文。'));
  if(!state.channels.length){basic.append(button('nc-add','配置辅助 API',()=>edit()));}
  else{
   const cs=select('nc-simple-channel',state.channels.map(c=>({id:c.id,label:c.name})),selected?.channelId||state.channels[0].id);const modelHolder=n('div',{id:'nc-simple-model-holder'});
   function buildModel(value='',manual=false){const c=state.channels.find(c=>c.id===cs.value);mainPicker=picker('nc-simple-model',c?.models||[],value,manual);modelHolder.replaceChildren(mainPicker.element);}
   buildModel(selected?.modelId||'',Boolean(selected?.manual));
   cs.onchange=()=>{const c=state.channels.find(c=>c.id===cs.value);preferred={channelId:c.id,modelId:c.defaultModel||'',manual:false};buildModel(c.defaultModel||'');};
   const refreshModels=button('nc-model-refresh','获取模型列表',()=>run(async()=>{const before={channelId:cs.value,modelId:mainPicker.value(),manual:mainPicker.manual()};const result=await api.request('models',{channelId:cs.value});state={...state,...result};preferred=before;render();status(`接口返回 ${state.channels.find(c=>c.id===before.channelId).models.length} 个模型，没有生成请求。`);}));
   basic.append(field('辅助接口',cs),n('div',{class:'nc-inline-actions'},button('nc-edit-current','编辑接口',()=>edit(state.channels.find(c=>c.id===cs.value))),button('nc-add','新增接口',()=>edit())),field('辅助模型',modelHolder),refreshModels);
   basic.append(n('div',{class:'nc-actions'},button('nc-save-simple','保存并统一使用',()=>run(async()=>{
    const value=mainPicker.value();if(!value)throw new Error('请先选择一个辅助模型。');
    if(inspectRoutes(state.routes).kind==='split'&&!window.confirm('将把已保存的四阶段模型改成这一个接口和模型。现有接口与密钥不会删除。继续？'))return;
    preferred={channelId:cs.value,modelId:value,manual:mainPicker.manual()};const result=await api.request('routes',{routes:sharedRoutes(preferred.channelId,value,preferred.manual),expectedRevision:state.revision});state={...state,...result};render();status('已保存：全部任务共用这一个辅助模型。没有生成请求。');
   })),button('nc-test-simple','测试连接（可能收费）',()=>run(async()=>{
    const value=mainPicker.value();if(!value)throw new Error('请先选择模型。');
    if(!window.confirm('向所选接口发送一次固定短测试，输出预算64；不发送游戏内容，插件不自动重试。服务商可能收费，继续？'))return;
    const result=await api.request('test',{channelId:cs.value,modelId:value,confirmPaid:true});basic.querySelector('.nc-test-output')?.remove();basic.append(n('pre',{class:'nc-test-output'},result.text));status(`测试完成：${result.modelId}，一次辅助请求；没有生成正文。`);
   }))));
  }
  const channels=n('details',{id:'nc-manage',class:'nc-fold'},n('summary',{},`管理已保存接口（${state.channels.length}）`));
  for(const c of state.channels){channels.append(n('div',{class:'nc-channel'},n('div',{},n('strong',{},c.name),n('small',{},state.providers.find(p=>p.id===c.providerId)?.label||c.providerId)),button(null,'编辑',()=>edit(c))));}extras.append(channels);
  renderAdvanced();
  syncControls=()=>mainPicker?.sync();
 }
 function renderAdvanced(){const box=n('details',{id:'nc-advanced',class:'nc-fold'},n('summary',{},'高级设置（可以不动）'),n('p',{class:'nc-note'},'只有想让不同任务使用不同模型时才需要。它们不是固定的四次调用流程；不会自动启用多模型或重跑正文。'));
  const controls={};
  for(const s of STAGES){const route=state.routes[s.id]||{},c=state.channels.find(c=>c.id===route.channelId),cs=select('nc-route-'+s.id,[{id:'',label:'未配置'},...state.channels.map(c=>({id:c.id,label:c.name}))],route.channelId||'');const holder=n('div');let model=picker('nc-model-'+s.id,c?.models||[],route.modelId||'',Boolean(route.manual));holder.append(model.element);
   cs.onchange=()=>{const c=state.channels.find(c=>c.id===cs.value);model=picker('nc-model-'+s.id,c?.models||[],c?.defaultModel||'');holder.replaceChildren(model.element);};controls[s.id]={channel:cs,get model(){return model;}};
   box.append(n('details',{class:'nc-stage'},n('summary',{},s.label),n('p',{class:'nc-note'},STAGE_HELP[s.id]),field('接口',cs),holder));
  }
  box.append(button('nc-save-routes','保存高级分工',()=>run(async()=>{const routes={};for(const s of STAGES){const c=controls[s.id];if(c.channel.value)routes[s.id]={channelId:c.channel.value,modelId:c.model.value(),manual:c.model.manual()};}const result=await api.request('routes',{routes,expectedRevision:state.revision});state={...state,...result};preferred=null;render();status('高级分工已保存；没有增加任何自动调用。');})));extras.append(box);
 }
 function edit(saved=null){if(!state||busy)return;closeEditor();editing=saved?.id||null;basic.hidden=true;extras.hidden=true;
  tokenField=createKeyField();const key=tokenField.input;
  key.placeholder=saved?'已保存；留空不更换':'粘贴 API Key';
  const provider=select('nc-provider',state.providers.map(p=>({id:p.id,label:p.label+(p.supported?'':'（暂未支持）'),disabled:!p.supported})),saved?.providerId||'openai');
  const name=input('nc-name',saved?.name||''),url=input('nc-url');name.placeholder='留空自动使用服务商名称';
  const existing=select('nc-existing-secret',[{id:'',label:'不用已有密钥（填写新的或保留原项）'}]);
  const notes=n('p',{class:'nc-note'}),address=field('API 地址',url),addressDetails=n('details',{class:'nc-fold'},n('summary',{},'官方地址（已自动填写）'));
  const addressSlot=n('div');
  const tokens=input('nc-tokens',saved?.options?.maxOutputTokens??2048,'number'),timeout=input('nc-timeout',saved?.options?.timeoutSeconds??120,'number'),temperature=input('nc-temperature',saved?.options?.temperature??'','number');temperature.step='0.1';
  const effort=select('nc-reasoning',[{id:'provider-default',label:'跟随服务商默认'},...['none','minimal','low','medium','high','xhigh','max'].map(id=>({id,label:id+'（需接口支持）'}))],saved?.options?.reasoning||'provider-default');
  const budget=select('nc-budget',[{id:'provider-default',label:'按接口默认'},{id:'max_tokens',label:'max_tokens'},{id:'max_completion_tokens',label:'max_completion_tokens'}],saved?.options?.tokenField||'provider-default'),exclude=input('nc-exclude',(saved?.options?.excludedOptionalParameters||[]).join(','));
  // A settings group, not a login/sign-up form. Every action is an explicit type=button.
  const card=n('section',{class:'nc-editor-card',role:'group','aria-labelledby':'nc-editor-title'});
  function syncProvider(changed=false){const p=state.providers.find(p=>p.id===provider.value);url.readOnly=Boolean(p.baseUrl);url.value=p.baseUrl||(changed?'':saved?.baseUrl||'');notes.textContent=p.notice||'';notes.hidden=!p.notice;addressSlot.replaceChildren();if(p.baseUrl){addressDetails.append(address);addressSlot.append(addressDetails);}else addressSlot.append(address);
   const native=['makersuite','claude'].includes(p.source);effort.disabled=native;budget.disabled=native;if(native)effort.value='provider-default';
   if(changed){tokenField.clear();existing.replaceChildren(n('option',{value:''},'不用已有密钥'));}}
  syncProvider();provider.onchange=()=>syncProvider(true);
  card.append(n('div',{class:'nc-toolbar'},n('h4',{id:'nc-editor-title'},saved?'编辑辅助接口':'添加辅助接口'),button('nc-close-editor','返回',()=>{closeEditor();render();})),field('服务商',provider),addressSlot,notes,
   field('API Key',n('div',{class:'nc-key-row'},key,tokenField.toggle)),n('p',{class:'nc-note'},saved?'已有 Key 不回显；不更换时直接留空。':'只保存到酒馆密钥库，不需要保存到 Google 密码管理器。'),
   n('details',{class:'nc-fold'},n('summary',{},'使用酒馆已有密钥'),button('nc-read-keys','读取密钥名称',()=>run(async()=>{const result=await api.request('secrets',{providerId:provider.value});existing.replaceChildren(n('option',{value:''},'不选择'));for(const r of result.secrets)existing.append(n('option',{value:r.id},r.label+(r.active?'（默认项）':'')));status('已读取名称和编号，未读取完整 Key。');})),existing),
   n('details',{id:'nc-request-advanced',class:'nc-fold'},n('summary',{},'名称与请求参数（默认即可）'),field('接口名称',name),n('div',{class:'nc-grid'},field('输出额度',tokens),field('超时（秒）',timeout),field('温度（可留空）',temperature),field('思考参数',effort)),field('输出预算字段',budget),field('排除可选参数',exclude),n('p',{class:'nc-note'},'只有接口要求时才修改。插件不自动重试；思考与输出费用以服务商规则为准。')));
  if(!tokenField.cssMask)card.append(n('p',{class:'nc-note'},'此浏览器不支持文本遮罩，已退回安全密码框，浏览器仍可能提示保存。'));
  if(location.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(location.hostname))card.append(n('p',{class:'nc-note'},'当前使用 HTTP；填写 Key 请使用可信网络或 HTTPS。'));
  card.append(n('p',{class:'nc-note'},'保存新 Key 时会恢复原默认项；请勿在另一个窗口同时切换密钥。'),
   button('nc-save','保存接口',()=>run(async()=>{
    const oldIds=new Set(state.channels.map(c=>c.id)),changed=saved&&(saved.providerId!==provider.value||saved.baseUrl!==url.value.replace(/\/+$/,''));
    const channel={id:editing||undefined,providerId:provider.value,name:name.value.trim(),baseUrl:url.value,defaultModel:changed?'':saved?.defaultModel||'',options:{maxOutputTokens:Number(tokens.value),timeoutSeconds:Number(timeout.value),temperature:temperature.value===''?null:Number(temperature.value),reasoning:effort.value,tokenField:budget.value,excludedOptionalParameters:exclude.value.split(',').map(v=>v.trim()).filter(Boolean)}};
    const body={channel,apiKey:key.value||undefined,existingSecretId:existing.value||undefined,expectedRevision:state.revision};
    try{const result=await api.request('save',body);tokenField?.clear();existing.value='';state={...state,...result};const c=editing?state.channels.find(c=>c.id===editing):state.channels.find(c=>!oldIds.has(c.id));const route=inspectRoutes(state.routes).route;preferred={channelId:c.id,modelId:route?.channelId===c.id?route.modelId:c.defaultModel||'',manual:route?.channelId===c.id?Boolean(route.manual):false};closeEditor();render();status('接口已保存。接着获取模型列表、选一个模型即可。没有生成请求。');}
    finally{body.apiKey=undefined;tokenField?.clear();}
   })),saved?button('nc-delete','删除此接口',()=>run(async()=>{if(!window.confirm('只删除本插件接口配置，酒馆密钥保留。正在使用的接口请先更换模型选择。继续？'))return;const result=await api.request('remove',{channelId:editing,expectedRevision:state.revision});state={...state,...result};preferred=null;closeEditor();render();status('接口已删除，酒馆密钥未删除。');})):null);
  editor.append(card);card.scrollIntoView({block:'nearest'});
 }
 void run(refresh);
 return{clearSensitive,refresh:()=>run(refresh)};
}
