/** Channel presets and pure validation. No requests, secrets or main-model changes. */
const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
};
export const PROVIDERS = freeze([
    { id:'openai', label:'OpenAI（GPT）', protocol:'openai', endpointMode:'fixed',
      baseUrl:'https://api.openai.com/v1', modelsPath:'/models', modelFormat:'data',
      source:'https://developers.openai.com/api/reference/resources/models/methods/list' },
    { id:'google-ai-studio', label:'Google AI Studio（Gemini）', protocol:'gemini-native', endpointMode:'fixed',
      baseUrl:'https://generativelanguage.googleapis.com/v1beta', modelsPath:'/models', modelFormat:'gemini',
      source:'https://ai.google.dev/api/models' },
    { id:'anthropic', label:'Anthropic（Claude）', protocol:'anthropic-native', endpointMode:'fixed',
      baseUrl:'https://api.anthropic.com/v1', modelsPath:'/models', modelFormat:'anthropic',
      source:'https://platform.claude.com/docs/en/api/models/list' },
    { id:'deepseek', label:'DeepSeek 官方', protocol:'openai-compatible', endpointMode:'fixed',
      baseUrl:'https://api.deepseek.com', modelsPath:'/models', modelFormat:'data',
      source:'https://api-docs.deepseek.com/api/list-models/' },
    { id:'openrouter', label:'OpenRouter', protocol:'openai-compatible', endpointMode:'fixed',
      baseUrl:'https://openrouter.ai/api/v1', modelsPath:'/models', modelFormat:'data',
      source:'https://openrouter.ai/docs/client-sdks/typescript/api-reference/models/models',
      notice:'模型目录不代表当前账号对每个模型都有调用权限，需另行连通测试。' },
    { id:'siliconflow', label:'硅基流动 SiliconFlow', protocol:'openai-compatible', endpointMode:'fixed',
      baseUrl:'https://api.siliconflow.cn/v1', modelsPath:'/models?sub_type=chat', modelFormat:'data',
      source:'https://api-docs.siliconflow.cn/docs/api/models-get',
      notice:'按官方 sub_type=chat 筛选模型；列表存在不保证账号额度或请求参数兼容。' },
    { id:'volcengine-ark-beijing', label:'火山方舟（北京·按量 API）', protocol:'openai-compatible', endpointMode:'fixed',
      baseUrl:'https://ark.cn-beijing.volces.com/api/v3', modelsPath:null, modelFormat:'data',
      source:'https://docs.volcengine.com/docs/ark/base-url-and-authentication?lang=zh',
      notice:'按量数据面接口，不是 Coding Plan。当前请手填已开通的模型 ID；模型列表发现尚未接入。' },
    { id:'google-vertex', label:'Google Vertex AI（项目／区域）', protocol:'vertex-native', endpointMode:'project-location',
      baseUrl:null, modelsPath:null, modelFormat:null,
      source:'https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations',
      notice:'需要独立项目与认证适配；本版暂不支持，不会套用 AI Studio 密钥。' },
    { id:'custom-openai', label:'自定义（兼容 OpenAI）', protocol:'openai-compatible', endpointMode:'custom',
      baseUrl:null, modelsPath:'/models', modelFormat:'data', source:null,
      notice:'第三方中转使用此项。本版服务端仅支持 HTTPS443 公网接口，不开放本机/私网转发。' },
]);
export const STAGES = freeze([
    {id:'prepare',label:'资料整理',defaultBehavior:'merge-with-decision'},
    {id:'regular',label:'常规人物判断',defaultBehavior:'on-demand'},
    {id:'complex',label:'复杂人物判断',defaultBehavior:'route-directly'},
    {id:'review',label:'累积变化检查',defaultBehavior:'merge-with-next-decision'},
]);
export const DEFAULT_GENERATION_OPTIONS = freeze({maxOutputTokens:2048,timeoutSeconds:120,temperature:null,reasoning:'provider-default',stream:false,excludedOptionalParameters:[]});
export function getProvider(id) {
    const provider=PROVIDERS.find(item=>item.id===id);
    if(!provider)throw new Error('未知渠道类型；禁止自动回退到正文接口。');
    return provider;
}
function cleanCustomBase(value) {
    let url;
    try{url=new URL(String(value||'').trim());}catch{throw new Error('请填写有效的 API Base URL。');}
    if(url.username||url.password||url.search||url.hash)throw new Error('API 地址不能包含凭据、查询参数或片段。');
    const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))throw new Error('远程 API 必须使用 HTTPS；仅本机回环地址可使用 HTTP。');
    if(/\/(models|chat\/completions|responses)\/?$/.test(url.pathname))throw new Error('请填写 Base URL，而不是 models 或生成请求的完整路径。');
    return url.href.replace(/\/+$/,'');
}
export function resolveEndpoint(channel) {
    if(!channel||typeof channel!=='object')throw new Error('缺少渠道配置。');
    const provider=getProvider(channel.providerId);let baseUrl=provider.baseUrl;
    if(provider.endpointMode==='custom')baseUrl=cleanCustomBase(channel.baseUrl);
    else if(provider.endpointMode==='project-location'){
        const projectId=String(channel.projectId||'').trim(),location=String(channel.location||'').trim();
        if(!/^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{6,20})$/.test(projectId))throw new Error('请填写有效的 Google Cloud 项目 ID 或项目编号。');
        if(!/^(global|[a-z]+(?:-[a-z]+)+[0-9])$/.test(location))throw new Error('请选择有效的区域或 global。');
        const origin=location==='global'?'https://aiplatform.googleapis.com':`https://${location}-aiplatform.googleapis.com`;
        baseUrl=`${origin}/v1/projects/${projectId}/locations/${location}/publishers/google`;
    }
    if(provider.endpointMode!=='custom'&&channel.baseUrl&&String(channel.baseUrl).replace(/\/+$/,'')!==baseUrl)throw new Error('官方地址不可覆盖；使用中转地址请新建自定义渠道。');
    return {providerId:provider.id,protocol:provider.protocol,baseUrl,modelListUrl:provider.modelsPath?baseUrl+provider.modelsPath:null,requiresDiscoveryAdapter:!provider.modelsPath};
}
export function createChannelMetadata(input) {
    const prohibited=['apiKey','api_key','key','token','accessToken','authorization','headers','credentials'];
    if(prohibited.some(key=>Object.hasOwn(input||{},key)))throw new Error('渠道元数据不能包含密钥、令牌或认证请求头。');
    if(!input||!/^[A-Za-z0-9_-]{1,80}$/.test(input.id||''))throw new Error('渠道 ID 无效。');
    const provider=getProvider(input.providerId),endpoint=resolveEndpoint(input),revision=input.credentialRevision??0;
    if(!Number.isSafeInteger(revision)||revision<0)throw new Error('凭据版本无效。');
    return {id:input.id,name:String(input.name||provider.label).trim().slice(0,100),providerId:provider.id,baseUrl:endpoint.baseUrl,
        projectId:provider.endpointMode==='project-location'?String(input.projectId).trim():null,
        location:provider.endpointMode==='project-location'?String(input.location).trim():null,credentialRevision:revision};
}
export function modelCacheScope(channel) {
    const endpoint=resolveEndpoint(channel);
    return JSON.stringify([channel.id,channel.providerId,endpoint.baseUrl,channel.credentialRevision??0]);
}
export function normalizeModelPage(providerId,payload) {
    const provider=getProvider(providerId);
    if(!provider.modelFormat)throw new Error('该渠道需要独立的模型发现适配器。');
    const rows=provider.modelFormat==='gemini'?payload?.models:payload?.data;
    if(!Array.isArray(rows))throw new Error('接口未返回有效的模型列表；不能使用内置型号替代。');
    const models=[],ids=new Set();
    for(const row of rows){
        const id=provider.modelFormat==='gemini'?row?.name:row?.id;
        if(typeof id!=='string'||!id.trim())throw new Error('模型列表中包含缺失 ID 的项目。');
        if(ids.has(id))continue;ids.add(id);
        const methods=Array.isArray(row.supportedGenerationMethods)?row.supportedGenerationMethods.filter(x=>typeof x==='string'):null;
        const outputs=Array.isArray(row.architecture?.output_modalities)?row.architecture.output_modalities:null;
        models.push({id,label:row.displayName||row.display_name||row.name||id,
            textGeneration:methods?methods.includes('generateContent'):outputs?outputs.includes('text'):null,inferenceVerified:false});
    }
    let nextCursor=null;
    if(provider.modelFormat==='gemini'){
        if(payload.nextPageToken!=null&&typeof payload.nextPageToken!=='string')throw new Error('无效的模型分页标识。');
        nextCursor=payload.nextPageToken||null;
    }else if(provider.modelFormat==='anthropic'&&payload.has_more){
        if(typeof payload.last_id!=='string'||!payload.last_id)throw new Error('模型列表声称有下一页，但没有游标。');
        nextCursor=payload.last_id;
    }
    return {models,nextCursor};
}
export function resolveStageRoute(stageId,routes,channels) {
    if(!STAGES.some(stage=>stage.id===stageId))throw new Error('未知任务阶段。');
    const selected=routes?.[stageId];
    if(!selected||typeof selected.modelId!=='string'||!selected.modelId.trim())throw new Error('尚未为该阶段选择模型。');
    const channel=channels.find(item=>item.id===selected.channelId);
    if(!channel)throw new Error('所选渠道不存在；不会回退到正文 API。');
    return {stageId,channelId:channel.id,modelId:selected.modelId,...resolveEndpoint(channel),plannedGenerationRequests:1};
}
