// Pure adapter for the existing SillyTavern chat-completions API. No global connection changes.
export const VERSION='0.3.0-r2b';
export const STORE='npc_native_channels_v1';
export const STAGES=[{id:'prepare',label:'资料整理'},{id:'regular',label:'常规人物判断'},{id:'complex',label:'复杂人物判断'},{id:'review',label:'累积变化检查'}];
export const PROVIDERS=Object.freeze([
 {id:'openai',label:'OpenAI（GPT）',source:'openai',secretType:'api_key_openai',baseUrl:'https://api.openai.com/v1',models:true},
 {id:'google-ai-studio',label:'Google AI Studio（Gemini）',source:'makersuite',secretType:'api_key_makersuite',baseUrl:'https://generativelanguage.googleapis.com/v1beta',models:true},
 {id:'anthropic',label:'Anthropic（Claude）',source:'claude',secretType:'api_key_claude',baseUrl:'https://api.anthropic.com/v1',models:false,notice:'原生 Claude 可以生成；此版酒馆 status 接口不提供 Claude 列表，请手填模型 ID。'},
 {id:'deepseek',label:'DeepSeek 官方',source:'custom',secretType:'api_key_custom',baseUrl:'https://api.deepseek.com',models:true},
 {id:'openrouter',label:'OpenRouter',source:'openrouter',secretType:'api_key_openrouter',baseUrl:'https://openrouter.ai/api/v1',models:true},
 {id:'siliconflow',label:'硅基流动 SiliconFlow',source:'siliconflow',secretType:'api_key_siliconflow',baseUrl:'https://api.siliconflow.cn/v1',models:true},
 {id:'volcengine-ark-beijing',label:'火山方舟（北京·按量 API）',source:'custom',secretType:'api_key_custom',baseUrl:'https://ark.cn-beijing.volces.com/api/v3',models:false,notice:'请手填已开通的模型或推理接入点 ID；不是 Coding Plan 接口。'},
 {id:'google-vertex',label:'Google Vertex AI',supported:false,notice:'项目与认证适配尚未完成；不自动借用正文凭据。'},
 {id:'custom-openai',label:'自定义（兼容 OpenAI）',source:'custom',secretType:'api_key_custom',baseUrl:null,models:true},
]);
export class NativeError extends Error { constructor(message,code='NATIVE'){super(message);this.code=code;} }
export function provider(id){const p=PROVIDERS.find(p=>p.id===id);if(!p||p.supported===false)throw new NativeError('此渠道类型尚未支持。');return p;}
export function checkedModel(value){if(typeof value!=='string'||!value.trim()||value.length>240||/[\x00-\x20\x7f?#\\]/.test(value))throw new NativeError('请填写有效的模型 ID。');return value;}
export function checkedUrl(channel){const p=provider(channel.providerId);let u;try{u=new URL(channel.baseUrl||p.baseUrl);}catch{throw new NativeError('API 地址无效。');}
 if(u.username||u.password||u.search||u.hash)throw new NativeError('API 地址不能携带密钥、账号或查询参数。');
 if(!['https:','http:'].includes(u.protocol))throw new NativeError('只支持 HTTP/HTTPS API 地址。');
 if(u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new NativeError('远程 API 地址请使用 HTTPS。');
 const url=u.href.replace(/\/+$/,'');if(p.baseUrl&&url!==p.baseUrl)throw new NativeError('官方渠道地址固定，中转请选择“自定义”。');
 if(/\/(chat\/completions|models|responses)$/.test(u.pathname))throw new NativeError('请填写 Base URL，不是完整生成路径。');return url;
}
export function options(input={}){const o={maxOutputTokens:input.maxOutputTokens??2048,timeoutSeconds:input.timeoutSeconds??120,temperature:input.temperature??null,reasoning:input.reasoning??'provider-default',tokenField:input.tokenField??'provider-default',excludedOptionalParameters:input.excludedOptionalParameters??[]};
 if(!Number.isInteger(o.maxOutputTokens)||o.maxOutputTokens<32||o.maxOutputTokens>16384)throw new NativeError('输出额度应在32–16384之间。');
 if(!Number.isInteger(o.timeoutSeconds)||o.timeoutSeconds<10||o.timeoutSeconds>300)throw new NativeError('超时应在10–300秒之间。');
 if(o.temperature!==null&&(!Number.isFinite(o.temperature)||o.temperature<0||o.temperature>2))throw new NativeError('温度需留空或设置为0–2。');
 if(!['provider-default','none','minimal','low','medium','high','xhigh','max'].includes(o.reasoning))throw new NativeError('思考参数无效。');
 if(!['provider-default','max_tokens','max_completion_tokens'].includes(o.tokenField))throw new NativeError('输出预算字段无效。');
 if(!Array.isArray(o.excludedOptionalParameters)||!o.excludedOptionalParameters.every(k=>['temperature','reasoning_effort'].includes(k)))throw new NativeError('只能排除可选温度/思考参数，不能排除输出预算。');
 if(input.stream)throw new NativeError('本版辅助调用使用非流式。');return o;
}
export function routePayload(channel){const p=provider(channel.providerId),url=checkedUrl(channel);const ref=channel.secretRef;
 if(!ref||ref.type!==p.secretType||typeof ref.id!=='string'||!ref.id)throw new NativeError('渠道没有有效的酒馆密钥引用；不会使用正文默认 Key。');
 const data={chat_completion_source:p.source,secret_id:ref.id};if(p.source==='custom')data.custom_url=url;
 if(p.source==='siliconflow')data.siliconflow_endpoint='cn';return data;
}
export function generationPayload(channel,model,messages,testOnly=false){const p=provider(channel.providerId),o=options(channel.options);model=checkedModel(model);
 const input=testOnly?[{role:'user',content:'Reply with OK only.'}]:messages;
 if(!Array.isArray(input)||!input.length||input.length>100||!input.some(m=>m.role==='user'))throw new NativeError('消息格式无效。');
 let size=0;const turns=input.map(m=>{if(!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string')throw new NativeError('只接受文本消息。');size+=m.content.length;return{role:m.role,content:m.content};});
 if(size>120000)throw new NativeError('输入超过本实验版上限。');
 const payload={...routePayload(channel),model:p.source==='makersuite'?model.replace(/^models\//,''):model,messages:turns,stream:false,n:1};
 const budget=testOnly?64:o.maxOutputTokens;
 const field=['makersuite','claude'].includes(p.source)?'max_tokens':o.tokenField==='provider-default'?(p.source==='openai'?'max_completion_tokens':'max_tokens'):o.tokenField;
 payload[field]=budget;
 if(o.temperature!==null&&!o.excludedOptionalParameters.includes('temperature'))payload.temperature=o.temperature;
 if(['makersuite','claude'].includes(p.source)){payload[p.source==='claude'?'use_sysprompt':'use_makersuite_sysprompt']=true;if(o.reasoning!=='provider-default')throw new NativeError('原生 Gemini/Claude 暂使用酒馆默认思考适配，不发送通用思考参数。');}
 else if(o.reasoning!=='provider-default'&&!o.excludedOptionalParameters.includes('reasoning_effort')){
  if(p.source==='custom')payload.custom_include_body=JSON.stringify({reasoning_effort:o.reasoning});else payload.reasoning_effort=o.reasoning;
 }
 if(p.source==='openrouter'){payload.use_fallback=false;payload.middleout='off';payload.allow_fallbacks=false;}
 return payload;
}
export function modelList(data){if(data?.error)throw new NativeError('模型列表请求失败，请检查接口、密钥和权限。未更换渠道。');
 if(data?.has_more||data?.nextPageToken||data?.next_cursor)throw new NativeError('接口返回了分页但酒馆未完成分页；不把部分结果当作完整列表。');
 const rows=data?.data;if(!Array.isArray(rows))throw new NativeError('酒馆接口没有返回可识别的模型列表。可以手填 ID，不会补造型号。');
 if(rows.length>20000)throw new NativeError('模型列表过大。');const seen=new Set(),result=[];
 for(const row of rows){const id=checkedModel(row?.id);if(seen.has(id))continue;seen.add(id);const methods=row.supportedGenerationMethods,outputs=row.architecture?.output_modalities;
 result.push({id,label:String(row.name||row.display_name||row.displayName||id).slice(0,240),textGeneration:Array.isArray(methods)?methods.includes('generateContent'):Array.isArray(outputs)?outputs.includes('text'):null,inferenceVerified:false});}
 return result;
}
export function generatedText(data){if(data?.error)throw new NativeError('服务商拒绝生成，请检查模型、参数或额度。插件没有自动重试。');
 const content=data?.choices?.[0]?.message?.content;
 let text=typeof content==='string'?content:Array.isArray(content)?content.filter(p=>p.type==='text').map(p=>p.text||'').join(''):null;
 if(text===null&&Array.isArray(data?.content))text=data.content.filter(p=>p.type==='text').map(p=>p.text||'').join('');
 if(text===null&&data?.candidates)text=(data.candidates[0]?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('');
 const finish=data?.choices?.[0]?.finish_reason||data?.stop_reason||data?.candidates?.[0]?.finishReason||null;
 if(['length','max_tokens','MAX_TOKENS'].includes(finish))throw new NativeError('输出被额度截断，未自动继续或重试。');
 if(typeof text!=='string'||!text.trim())throw new NativeError('请求没有返回可见文本；可能已消耗思考额度，请查看服务商用量。');
 const usage={};for(const[k,v]of Object.entries(data.usage||data.usageMetadata||{}))if(Number.isFinite(v))usage[k]=v;
 return {text,finishReason:finish,usage,price:null};
}
