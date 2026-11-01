// Presentation/selection helpers only; never infer price, capability or make requests.
import {STAGES} from './protocol.mjs?v=0.3.0';
export const UI_VERSION='0.3.1-r2b';
export const STAGE_HELP={prepare:'从资料中整理人物、关系和已知经历。',regular:'处理一般的重要互动和请求。',complex:'处理多方冲突、重大承诺等复杂情况。',review:'检查多轮互动积累带来的变化。'};
export function inspectRoutes(routes={}){
 const entries=STAGES.map(s=>routes[s.id]).filter(r=>r&&typeof r.channelId==='string'&&r.channelId&&typeof r.modelId==='string'&&r.modelId);
 if(!entries.length)return{kind:'empty',route:null,complete:false};
 const distinct=new Set(entries.map(r=>JSON.stringify([r.channelId,r.modelId])));
 return{kind:distinct.size===1?'shared':'split',route:{...(routes.regular||entries[0])},complete:entries.length===STAGES.length};
}
export function sharedRoutes(channelId,modelId,manual=false){
 if(typeof channelId!=='string'||!channelId||typeof modelId!=='string'||!modelId.trim())throw new Error('请选择一个接口和一个模型。');
 return Object.fromEntries(STAGES.map(s=>[s.id,{channelId,modelId:modelId.trim(),manual:Boolean(manual)}]));
}
export function currentChoice(state,preferred=null){
 if(preferred&&state.channels.some(c=>c.id===preferred.channelId))return{...preferred};
 const info=inspectRoutes(state.routes);
 if(info.route&&state.channels.some(c=>c.id===info.route.channelId))return{...info.route};
 const first=state.channels[0];return first?{channelId:first.id,modelId:first.defaultModel||'',manual:Boolean(first.defaultModel&&!first.models?.some(m=>m.id===first.defaultModel))}:null;
}
