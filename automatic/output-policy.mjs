import {generationPayload,options,provider} from '../native/protocol.mjs?v=0.3.0';

export const POLICY_VERSION='output-041';
const FLASH41=/^(?:(?:deepseek|deepseek-ai)\/)?deepseek-(?:v4[._-]1-flash(?:[-:][a-z0-9._-]+)?|flash)$/i;
/** Pure request planning. No settings writes, model substitution or retries.
 * 2048 + provider-default were the old simple-mode defaults; there was no saved
 * explicit/default flag. Users who deliberately want that exact pair can choose channel mode.
 */
export function planOutput(channel,model,messages,mode='auto') {
    if(!['auto','channel'].includes(mode))throw new Error('未知的辅助输出策略。');
    const original=options(channel.options),p=provider(channel.providerId);
    const copied={...channel,options:{...original,excludedOptionalParameters:[...original.excludedOptionalParameters]}};
    const knownFlash=FLASH41.test(model);
    const legacyDefaults=original.maxOutputTokens===2048&&original.reasoning==='provider-default';
    let adjustment='按接口已保存参数',reasoningControl=original.reasoning,reasoningVerified=false;
    let gateway=null;
    if(p.source==='openrouter')gateway='openrouter';
    else if(p.source==='custom'){
        // Only verified official origins get protocol-specific thinking controls.
        const u=new URL(channel.baseUrl||p.baseUrl);
        if(u.origin==='https://api.deepseek.com'&&['','/','/v1','/v1/'].includes(u.pathname))gateway='deepseek';
        else if(u.origin==='https://openrouter.ai'&&['/api/v1','/api/v1/'].includes(u.pathname))gateway='openrouter-custom';
    }
    const auto=mode==='auto'&&knownFlash&&legacyDefaults;
    if(auto){
        copied.options.maxOutputTokens=8192;
        adjustment='旧版2048默认值 → 本次8192总生成上限；不修改已保存接口';
        if(gateway&&!original.excludedOptionalParameters.includes('reasoning_effort')){
            copied.options.reasoning='low';reasoningControl='low';reasoningVerified=true;
        }else{
            adjustment+='；此渠道的思考参数未经核实，保持接口默认';
        }
    }
    const payload=generationPayload(copied,model,messages,false);
    if(auto&&reasoningVerified&&gateway==='openrouter-custom'){
        // ST custom_include_body is JSON/YAML merged into the upstream request.
        payload.custom_include_body=JSON.stringify({reasoning:{effort:'low'}});
    }
    const field=Object.hasOwn(payload,'max_completion_tokens')?'max_completion_tokens':'max_tokens';
    return {payload,diagnostics:{policyVersion:POLICY_VERSION,policy:mode,configuredLimit:original.maxOutputTokens,
        requestedLimit:payload[field],limitField:field,reasoningControl,reasoningVerified,adjustment,
        // max_tokens may include hidden thinking. This is a request cap, not a token-use forecast.
        retryCount:0}};
}
function count(...values){return values.find(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)??null;}
function visibleText(data){
    const content=data?.choices?.[0]?.message?.content;
    if(typeof content==='string')return content;
    if(Array.isArray(content))return content.filter(p=>p?.type==='text'&&typeof p.text==='string').map(p=>p.text).join('');
    if(Array.isArray(data?.content))return data.content.filter(p=>p?.type==='text'&&typeof p.text==='string').map(p=>p.text).join('');
    if(Array.isArray(data?.candidates?.[0]?.content?.parts))return data.candidates[0].content.parts.filter(p=>!p?.thought&&typeof p?.text==='string').map(p=>p.text).join('');
    return '';
}
/** Whitelisted numeric usage only. Never retain raw responses or reasoning text. */
export function outputDiagnostics(data,planned) {
    const u=data?.usage||{},g=data?.usageMetadata||{};
    const output=count(u.completion_tokens,u.output_tokens);
    const reasoning=count(u.completion_tokens_details?.reasoning_tokens,u.output_tokens_details?.reasoning_tokens,u.reasoning_tokens,g.thoughtsTokenCount);
    const rawFinish=data?.choices?.[0]?.finish_reason||data?.stop_reason||data?.candidates?.[0]?.finishReason;
    const finishes=new Set(['stop','length','max_tokens','MAX_TOKENS','STOP','end_turn','tool_calls','tool_use','content_filter','SAFETY','MAX_OUTPUT_TOKENS']);
    const finishReason=finishes.has(rawFinish)?rawFinish:'unknown';
    let totalOutput=output,visibleTokens=null;
    if(typeof g.candidatesTokenCount==='number'&&Number.isFinite(g.candidatesTokenCount)&&g.candidatesTokenCount>=0){
        visibleTokens=g.candidatesTokenCount;
        if(totalOutput===null&&reasoning!==null)totalOutput=visibleTokens+reasoning;
    }else if(output!==null&&reasoning!==null&&reasoning<=output)visibleTokens=output-reasoning;
    const usage={inputTokens:count(u.prompt_tokens,u.input_tokens,g.promptTokenCount),outputTokens:totalOutput,
        reasoningTokens:reasoning,visibleTokens,totalTokens:count(u.total_tokens,g.totalTokenCount)};
    return {...planned,finishReason,usage,visibleCharacters:visibleText(data).length,
        truncated:['length','max_tokens','MAX_TOKENS','MAX_OUTPUT_TOKENS'].includes(finishReason)};
}
export class OutputLimitError extends Error {
    constructor(diagnostics){
        const u=diagnostics.usage;
        const used=u.outputTokens===null?'接口未返回总输出token用量':`接口返回输出 ${u.outputTokens} token`;
        const thought=u.reasoningTokens===null?'未返回思考token明细':`其中思考 ${u.reasoningTokens} token`;
        super(`辅助输出被长度上限截断（本次请求上限 ${diagnostics.requestedLimit} token，不是余额不足）。${used}；${thought}。正文未发出，未自动重试。`);
        this.name='OutputLimitError';this.code='OUTPUT_LIMIT';this.diagnostics=diagnostics;
    }
}
export function describeOutput(d) {
    if(!d)return '';
    const u=d.usage;
    const cap=`本次生成上限 ${d.requestedLimit} token`;
    const thought=d.reasoningControl==='provider-default'?'思考沿用接口默认':`思考参数 ${d.reasoningControl}`;
    if(!u)return cap+'；'+thought+'（请求值，不是实际用量）';
    const used=u.outputTokens===null?'实际总输出未知':`实际输出 ${u.outputTokens} token`;
    const r=u.reasoningTokens===null?'思考用量未知':`思考 ${u.reasoningTokens} token`;
    return `${cap}；${thought}。${used}，${r}；可见结果 ${d.visibleCharacters} 字符。`;
}
