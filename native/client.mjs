import {VERSION,STORE,STAGES,PROVIDERS,NativeError,provider,checkedUrl,checkedModel,options,routePayload,generationPayload,modelList,generatedText} from './protocol.mjs?v=0.3.0';
const clone=value=>JSON.parse(JSON.stringify(value));
const id=()=>globalThis.crypto?.randomUUID?.()||'npc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
// Only the native same-origin endpoints below may be called. Never /api/plugins, /secrets/find or /secrets/view.
const ENDPOINTS=new Set(['/api/secrets/read','/api/secrets/write','/api/secrets/rotate','/api/backends/chat-completions/status','/api/backends/chat-completions/generate']);
export function createNativeClient({context=()=>globalThis.SillyTavern?.getContext?.(),fetcher=(...args)=>fetch(...args),locks=globalThis.navigator?.locks}={}){
 let busy=false,saving=false,generationActive=false,credentialsFailure=false,gate=Promise.resolve(),releaseGate;
 function ctx(){const c=context();if(!c||!c.extensionSettings||typeof c.getRequestHeaders!=='function'||typeof c.saveSettingsDebounced!=='function')throw new NativeError('酒馆扩展接口不可用，请更新酒馆或刷新页面；无需安装配套服务。');return c;}
 function data(){const settings=ctx().extensionSettings;if(!settings[STORE])settings[STORE]={schema:1,revision:0,channels:[],routes:{},pendingKey:null};const d=settings[STORE];if(d.schema!==1||!Array.isArray(d.channels)||!d.routes)throw new NativeError('渠道记录格式不兼容；没有重置旧数据。');return d;}
 function persist(){const f=ctx().saveSettingsDebounced;f();if(typeof f.flush==='function')f.flush();}
 async function post(path,body={},timeout=30000){if(!ENDPOINTS.has(path))throw new NativeError('禁止未知请求目标。');const c=ctx(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{const r=await fetcher(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{...c.getRequestHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   if(!r.ok)throw new NativeError(`酒馆接口 HTTP ${r.status}。${r.status===404?'当前酒馆缺少此原生接口，请更新酒馆。':'请检查登录、接口版本或服务商状态。'}没有切换到正文 API。`);
   if(r.status===204)return null;const text=await r.text();if(!text.trim())return null;let result;try{result=JSON.parse(text);}catch{throw new NativeError('酒馆接口没有返回有效 JSON。');}if(result?.error)throw new NativeError('酒馆或服务商返回错误。请检查凭据、模型与参数；未自动重试。');return result;
  }catch(e){if(e instanceof NativeError)throw e;if(e?.name==='AbortError')throw new NativeError('请求超时，未自动重试。若生成已发出，请查看服务商实际用量。');throw new NativeError('请求失败，未自动重试，也未切换正文连接。');}finally{clearTimeout(timer);}
 }
 async function secretMetadata(){const raw=await post('/api/secrets/read');if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new NativeError('酒馆密钥管理接口格式不兼容。');const out={};
  for(const type of new Set(PROVIDERS.map(p=>p.secretType).filter(Boolean))){const values=raw[type];if(values!=null&&!Array.isArray(values))throw new NativeError('此酒馆不支持按 ID 引用密钥，请升级酒馆；不会用默认正文密钥代替。');out[type]=(values||[]).map(v=>({id:String(v.id||''),label:String(v.label||''),active:v.active===true})).filter(v=>v.id);}
  // Drop raw values immediately. We neither expose nor persist masked/plain values returned by the host.
  return out;
 }
 function active(list){return list.find(v=>v.active)?.id||null;}
 function snapshot(){const d=data();return{apiVersion:1,version:VERSION,transport:'sillytavern-native',revision:d.revision,channels:d.channels.map(c=>({...clone(c),hasKey:Boolean(c.secretRef)})),routes:clone(d.routes),providers:PROVIDERS.map(p=>({...p,supported:p.supported!==false})),stages:STAGES,warning:credentialsFailure?'密钥默认项未确认恢复，已暂停辅助调用。':null};}
 function expected(revision){if(data().revision!==revision)throw new NativeError('配置已变化，请刷新本面板后重试。');}
 function selected(channelId){const c=data().channels.find(c=>c.id===channelId);if(!c)throw new NativeError('渠道不存在。');return c;}
 async function verifyRef(c){const p=provider(c.providerId);if(!c.secretRef||c.secretRef.type!==p.secretType)throw new NativeError('密钥引用不匹配。');const metadata=await secretMetadata();if(!metadata[p.secretType].some(v=>v.id===c.secretRef.id))throw new NativeError('这个渠道的密钥已被删除；请重新保存，不会使用正文默认密钥。');}
 async function recover(){const pending=data().pendingKey;if(!pending){credentialsFailure=false;return;}
  const metadata=await secretMetadata(),list=metadata[pending.type]||[];
  const created=list.filter(v=>v.label===pending.label);const newId=pending.newId||created.at(-1)?.id;
  if(pending.previousId&&list.some(v=>v.id===pending.previousId)&&newId&&active(list)===newId){await post('/api/secrets/rotate',{key:pending.type,id:pending.previousId});const check=await secretMetadata();if(active(check[pending.type])!==pending.previousId)throw new NativeError('原默认密钥恢复校验失败。');}
  // Do not overwrite an intervening explicit key change from another window.
  if(newId&&active(list)===newId&&pending.previousId&&!list.some(v=>v.id===pending.previousId))throw new NativeError('原默认密钥已被删除，请在酒馆密钥管理中确认默认项。');
  data().pendingKey=null;persist();credentialsFailure=false;
 }
 async function writeKey(type,key,channelId){if(typeof key!=='string'||!key.trim()||key.length>8192||/[\r\n\x00]/.test(key))throw new NativeError('密钥格式无效。');
  const metadata=await secretMetadata();let previousId=active(metadata[type]);
  // A blank active item preserves the original effective default (empty) if this type was never configured.
  if(!previousId){const blank=await post('/api/secrets/write',{key:type,value:'',label:'[NPC] empty default / 保持原空默认'});if(!blank?.id)throw new NativeError('酒馆未返回密钥 ID。');previousId=blank.id;}
  const label='[NPC] '+channelId+' '+id();data().pendingKey={type,previousId,label,newId:null};persist();
  let created;
  try{created=await post('/api/secrets/write',{key:type,value:key.trim(),label});if(typeof created?.id!=='string'||!created.id)throw new NativeError('酒馆未返回密钥 ID。');data().pendingKey.newId=created.id;persist();await recover();return{type,id:created.id};}
  catch(e){try{await recover();}catch{credentialsFailure=true;throw new NativeError('保存中断且默认密钥恢复未确认，辅助调用已暂停。点“刷新渠道”重试恢复；请勿在其它窗口同时修改密钥。');}throw e;}
 }
 async function save(body){expected(body.expectedRevision);if(generationActive||ctx().streamingProcessor)throw new NativeError('请在当前正文生成结束后保存密钥。');
  const input=body.channel;if(!input||typeof input!=='object')throw new NativeError('渠道资料无效。');
  const old=input.id?selected(input.id):null,p=provider(input.providerId),url=checkedUrl(input),opts=options(input.options);
  if(data().channels.length>=50&&!old)throw new NativeError('最多保存50个渠道。');
  const next={id:old?.id||id(),name:String(input.name||p.label).trim().slice(0,100),providerId:p.id,baseUrl:url,defaultModel:input.defaultModel?checkedModel(input.defaultModel):'',options:opts,revision:(old?.revision||0)+1,credentialRevision:old?.credentialRevision||0,models:old?.models||[],modelsFetchedAt:old?.modelsFetchedAt||null,secretRef:old?.secretRef||null};
  const changed=old&&(old.providerId!==p.id||old.baseUrl!==url),newKey=typeof body.apiKey==='string'&&body.apiKey.trim()!=='';
  const useRef=body.existingSecretId;
  if(changed&&!newKey&&!useRef)throw new NativeError('更换渠道地址时请重新输入或明确选择密钥，不自动把旧 Key 发往新地址。');
  if(newKey&&useRef)throw new NativeError('填写新 Key 和选择已有 Key 请二选一。');
  if(useRef){const md=await secretMetadata();if(!md[p.secretType].some(v=>v.id===useRef))throw new NativeError('所选密钥引用不存在。');next.secretRef={type:p.secretType,id:useRef};}
  else if(newKey){saving=true;gate=new Promise(resolve=>releaseGate=resolve);try{next.secretRef=await writeKey(p.secretType,body.apiKey,next.id);}finally{saving=false;releaseGate?.();}}
  else if(!next.secretRef)throw new NativeError('请填写独立 API Key 或选择酒馆已保存的密钥。');
  if(newKey||useRef||changed){next.credentialRevision++;next.models=[];next.modelsFetchedAt=null;}
  expected(body.expectedRevision);const d=data();d.channels=old?d.channels.map(c=>c.id===old.id?next:c):[...d.channels,next];
  if(changed)for(const s of STAGES)if(d.routes[s.id]?.channelId===next.id)delete d.routes[s.id];d.revision++;persist();return snapshot();
 }
 async function execute(action,b={}){
  if(!['state','secrets','save','models','routes','remove','test','generate'].includes(action))throw new NativeError('未知渠道操作。');
  if(action==='state'){await recover();await secretMetadata();return snapshot();}
  if(data().pendingKey||credentialsFailure)await recover();
  if(action==='secrets'){const p=provider(b.providerId),md=await secretMetadata();return{secrets:md[p.secretType]};}
  if(action==='save')return save(b);
  if(action==='routes'){expected(b.expectedRevision);const routes={};for(const s of STAGES){const r=b.routes?.[s.id];if(!r)continue;const c=selected(r.channelId),model=checkedModel(r.modelId),found=c.models.find(m=>m.id===model);if(found?.textGeneration===false)throw new NativeError('此模型明确不支持文本生成。');if(!found&&r.manual!==true)throw new NativeError('此型号不在当前渠道列表，请勾选手动 ID。');routes[s.id]={channelId:c.id,modelId:model,manual:!found};}data().routes=routes;data().revision++;persist();return snapshot();}
  if(action==='remove'){expected(b.expectedRevision);if(Object.values(data().routes).some(r=>r.channelId===b.channelId))throw new NativeError('此渠道仍被阶段使用，请先取消对应选择。');selected(b.channelId);data().channels=data().channels.filter(c=>c.id!==b.channelId);data().revision++;persist();return snapshot();}
  const route=action==='generate'?data().routes[b.stageId]:null;if(action==='generate'&&!route)throw new NativeError('此阶段没有辅助模型，禁止使用正文模型代替。');
  const c=clone(selected(route?.channelId||b.channelId)),p=provider(c.providerId);await verifyRef(c);
  if(action==='models'){if(!p.models)throw new NativeError(p.notice||'此渠道暂需手填模型 ID。');const payload=await post('/api/backends/chat-completions/status',routePayload(c),c.options.timeoutSeconds*1000);const models=modelList(payload);const current=selected(c.id);if(current.revision!==c.revision)throw new NativeError('渠道已变化，列表已丢弃。');current.models=models;current.modelsFetchedAt=new Date().toISOString();data().revision++;persist();return snapshot();}
  const isTest=action==='test';if(isTest&&b.confirmPaid!==true)throw new NativeError('请先确认这一次可能收费的测试。');
  const model=checkedModel(route?.modelId||b.modelId||c.defaultModel),payload=generationPayload(c,model,b.messages,isTest),start=Date.now();
  const result=await post('/api/backends/chat-completions/generate',payload,c.options.timeoutSeconds*1000);
  if(selected(c.id).revision!==c.revision)throw new NativeError('请求期间渠道已变化，结果已丢弃；请查看服务商用量。');
  return{...generatedText(result),channelId:c.id,modelId:model,elapsedMs:Date.now()-start,generationRequests:1};
 }
 async function request(action,body={}){if(busy)throw new NativeError('本页面已有渠道操作正在进行，请勿重复点击。');busy=true;
  const task=()=>execute(action,body);try{return locks?.request?await locks.request('npc-native-channels',task):await task();}finally{busy=false;}}
 return{request,async beforeGeneration(abort){if(saving)await gate;if(credentialsFailure||data().pendingKey){if(typeof abort==='function')abort(true);throw new NativeError('密钥默认项恢复尚未确认，已阻止本页面继续生成。请刷新渠道状态。');}},setGenerating(value){generationActive=Boolean(value);}};
}
let singleton;
export function nativeClient(){return singleton??=createNativeClient();}
