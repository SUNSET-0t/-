import { PROVIDERS, getProvider, resolveEndpoint, normalizeModelPage, STAGES } from '../connections/providers.mjs';

export class ClientError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
export const VERSION = '0.2.0';
export const API_VERSION = 1;
export function providerCatalog() {
    return PROVIDERS.map(p => ({ ...p, supported: p.id !== 'google-vertex',
        discoverySupported: Boolean(p.modelsPath),
        notice: p.id === 'google-vertex' ? '项目/区域认证尚未接入，本版不可保存或调用。' : p.notice || '' }));
}
export function checkedEndpoint(channel) {
    const p = getProvider(channel.providerId);
    if (p.id === 'google-vertex') throw new ClientError('Vertex AI 的独立认证适配尚未完成；不会用 AI Studio 密钥替代。');
    const resolved = resolveEndpoint(channel);
    const url = new URL(resolved.baseUrl);
    if (url.protocol !== 'https:') throw new ClientError('本版独立服务仅允许 HTTPS 公网接口，不开放本机或内网转发。');
    if (url.port && url.port !== '443') throw new ClientError('本版独立服务仅允许 HTTPS 443 端口。');
    return resolved;
}
export function checkedModel(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\x00-\x20\x7f?#\\]/.test(value)) throw new ClientError('模型 ID 无效。');
    return value;
}
export function checkedOptions(input = {}) {
    const maxOutputTokens = input.maxOutputTokens ?? 2048;
    const timeoutSeconds = input.timeoutSeconds ?? 120;
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 32 || maxOutputTokens > 16384) throw new ClientError('输出上限需为 32–16384 的整数。');
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 10 || timeoutSeconds > 300) throw new ClientError('超时需为 10–300 秒的整数。');
    const temperature = input.temperature ?? null;
    if (temperature !== null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) throw new ClientError('温度须留空或设为 0–2。');
    const reasoning = input.reasoning ?? 'provider-default';
    if (!['provider-default','none','minimal','low','medium','high','xhigh','max'].includes(reasoning)) throw new ClientError('思考参数无效。');
    const tokenField = input.tokenField ?? 'provider-default';
    if (!['provider-default','max_tokens','max_completion_tokens'].includes(tokenField)) throw new ClientError('输出额度参数无效。');
    const excludedOptionalParameters = input.excludedOptionalParameters ?? [];
    if (!Array.isArray(excludedOptionalParameters) || !excludedOptionalParameters.every(p => ['temperature','reasoning_effort'].includes(p))) throw new ClientError('本版只允许排除 temperature / reasoning_effort；不能移除输出预算。');
    if (input.stream) throw new ClientError('本版只支持非流式独立调用。');
    return { maxOutputTokens, timeoutSeconds, temperature, reasoning, tokenField, stream: false, excludedOptionalParameters };
}
function messagesChecked(messages) {
    if (!Array.isArray(messages) || !messages.length || messages.length > 100) throw new ClientError('消息列表无效。');
    let count = 0;
    const result = messages.map(m => {
        if (!m || !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string') throw new ClientError('只接受文本消息。');
        count += m.content.length;
        return {role:m.role,content:m.content};
    });
    if (count > 120000 || !result.some(m=>m.role === 'user')) throw new ClientError('输入超过本版上限或缺少用户消息。');
    return result;
}
export function authHeaders(channel, key) {
    if (typeof key !== 'string' || !key || key.length > 8192 || /[\r\n\x00]/.test(key)) throw new ClientError('缺少有效密钥。');
    const protocol = checkedEndpoint(channel).protocol;
    if (protocol === 'gemini-native') return {'x-goog-api-key':key};
    if (protocol === 'anthropic-native') return {'x-api-key':key,'anthropic-version':'2023-06-01'};
    return {Authorization:`Bearer ${key}`};
}
export function modelRequest(channel, cursor = null) {
    const endpoint = checkedEndpoint(channel);
    if (!endpoint.modelListUrl) throw new ClientError('该渠道的模型列表适配尚未完成。可明确使用手动模型 ID，但不会显示伪造列表。');
    const url = new URL(endpoint.modelListUrl);
    if (endpoint.protocol === 'gemini-native') { url.searchParams.set('pageSize','1000'); if (cursor) url.searchParams.set('pageToken',cursor); }
    if (endpoint.protocol === 'anthropic-native') { url.searchParams.set('limit','100'); if (cursor) url.searchParams.set('after_id',cursor); }
    return url.href;
}
export function parseModelPage(channel, payload) {
    if (payload?.error) throw new ClientError('服务商返回模型列表错误；请检查渠道和权限。',502);
    const normalized = normalizeModelPage(channel.providerId, payload);
    if (normalized.models.length > 20000) throw new ClientError('模型列表过大。',502);
    if (payload?.has_more && channel.providerId !== 'anthropic') throw new ClientError('此接口使用未适配的分页格式，不能把部分列表当完整列表。',502);
    return {...normalized,models:normalized.models.map(m=>({
        id:checkedModel(m.id), label:typeof m.label === 'string' ? m.label.slice(0,240) : m.id,
        textGeneration:m.textGeneration, inferenceVerified:false,
    }))};
}
export function generationRequest(channel, key, model, messages, testOnly = false) {
    const endpoint = checkedEndpoint(channel);
    model = checkedModel(model);
    const settings = checkedOptions(channel.options);
    const limit = testOnly ? 64 : settings.maxOutputTokens;
    const input = messagesChecked(testOnly ? [{role:'user',content:'Reply with OK only.'}] : messages);
    const system = input.filter(m=>m.role === 'system').map(m=>m.content).join('\n\n');
    const turns = input.filter(m=>m.role !== 'system');
    const headers = {...authHeaders(channel,key),'Content-Type':'application/json'};
    const temp = !settings.excludedOptionalParameters.includes('temperature') ? settings.temperature : null;
    let body, url;
    if (endpoint.protocol === 'gemini-native') {
        const id = model.replace(/^models\//,'');
        if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new ClientError('Gemini 模型路径格式无效。');
        url = `${endpoint.baseUrl}/models/${encodeURIComponent(id)}:generateContent`;
        body = {contents:turns.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:limit}};
        if (system) body.systemInstruction={parts:[{text:system}]};
        if (temp !== null) body.generationConfig.temperature=temp;
        if (settings.reasoning !== 'provider-default') throw new ClientError('本版原生 Gemini 思考设置使用服务商默认，不发送通用 reasoning_effort。');
    } else if (endpoint.protocol === 'anthropic-native') {
        url = endpoint.baseUrl + '/messages';
        body = {model,messages:turns,max_tokens:limit};
        if (system) body.system=system;
        if (temp !== null) body.temperature=temp;
        if (settings.reasoning !== 'provider-default') throw new ClientError('本版 Claude 原生思考设置使用服务商默认。');
    } else {
        url = endpoint.baseUrl + '/chat/completions';
        const tokenField = settings.tokenField === 'provider-default' ? (channel.providerId === 'openai' ? 'max_completion_tokens' : 'max_tokens') : settings.tokenField;
        body = {model,messages:input,stream:false,[tokenField]:limit};
        if (temp !== null) body.temperature=temp;
        if (settings.reasoning !== 'provider-default' && !settings.excludedOptionalParameters.includes('reasoning_effort')) body.reasoning_effort=settings.reasoning;
    }
    return {url,method:'POST',headers,body,timeoutMs:settings.timeoutSeconds*1000};
}
export function parseGeneration(channel, payload) {
    if (payload?.error) throw new ClientError('服务商拒绝生成；未自动重试。请检查模型、权限与参数。',502);
    const protocol = checkedEndpoint(channel).protocol;
    let text, finish, sourceUsage;
    if (protocol === 'gemini-native') {
        text=(payload?.candidates?.[0]?.content?.parts || []).filter(p=>!p.thought && typeof p.text==='string').map(p=>p.text).join('');
        finish=payload?.candidates?.[0]?.finishReason || payload?.promptFeedback?.blockReason;
        sourceUsage=payload?.usageMetadata;
    } else if (protocol === 'anthropic-native') {
        text=(payload?.content || []).filter(p=>p.type==='text').map(p=>p.text).join(''); finish=payload?.stop_reason; sourceUsage=payload?.usage;
    } else { text=payload?.choices?.[0]?.message?.content; finish=payload?.choices?.[0]?.finish_reason; sourceUsage=payload?.usage; }
    if (typeof text!=='string' || !text.trim()) throw new ClientError('请求返回但没有可见文本，可能额度用于思考或响应被拦截。未自动重试；请查看服务商用量。',502);
    if (['length','MAX_TOKENS','max_tokens'].includes(finish)) throw new ClientError('输出已达到额度上限，结果可能不完整；不自动继续生成。',502);
    const usage={};
    for (const k of ['prompt_tokens','completion_tokens','total_tokens','input_tokens','output_tokens','promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount']) {
        if (Number.isFinite(sourceUsage?.[k])) usage[k]=sourceUsage[k];
    }
    return {text:text.slice(0,200000),finishReason:typeof finish==='string'?finish.slice(0,80):null,usage,price:null};
}
export { STAGES };
