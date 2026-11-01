import {buildMaterial,chatKey,guardKey,digest,shouldJudge,pickStage} from './material.mjs?v=0.4.0';
import {SYSTEM,validateDecision,makeInjection} from './decision.mjs?v=0.4.2';
export const STORE='npc_autonomy_runtime_v1', PROMPT='80_NPC_AUTONOMY_CURRENT', CHANNELS='npc_native_channels_v1';
/** Dependency-injected runtime. No chat, character, worldbook or affinity writes. */
export function createEngine({context,request,readLore,beforeGeneration=async()=>{},notify=()=>{}}) {
    let epoch=0,active=null,armed=null,skip=null;
    const cache=new Map(),listeners=new Set();
    let state={status:'waiting',message:'等待辅助 API 和模型',decision:null,packet:'',warnings:[],coverage:null,diagnostics:null,validation:null};
    const cfg=()=>({enabled:true,mode:'balanced',budget:18000,outputPolicy:'auto',...context().extensionSettings?.[STORE]});
    const channelSettings=()=>context().extensionSettings?.[CHANNELS];
    const configured=()=>Boolean(pickStage({intent:{text:''}},channelSettings()));
    const selectedRoute=material=>{const route=pickStage(material,channelSettings());return route?{...route,outputPolicy:cfg().outputPolicy,policyVersion:'output-041',validationVersion:'identity-042'}:null;};
    const view=()=>({...state,enabled:cfg().enabled,configured:configured(),mode:cfg().mode,outputPolicy:cfg().outputPolicy});
    function emit(patch){state={...state,...patch};for(const fn of listeners){try{fn(view());}catch{}}}
    function clear(){const c=context();if(typeof c.setExtensionPrompt==='function')c.setExtensionPrompt(PROMPT,'',1,0,false,0);armed=null;}
    function refresh(){if(active)return;emit({status:cfg().enabled?(configured()?'ready':'waiting'):'paused',message:!cfg().enabled?'自动人物判断已暂停':configured()?'已自动启用：正常发送消息即可，无需手动判定或注入':'先保存辅助 API 和一个模型，之后自动运行'});}
    function invalidate(reason='上下文已改变',reset=true){epoch++;active?.controller.abort();clear();skip=null;
        if(reset)emit({status:'stale',message:reason+'，旧结果不会用于新请求',decision:null,packet:'',coverage:null,warnings:[],diagnostics:null,validation:null});}
    function ended(){if(active)return;const seen=armed?.seen;clear();if(state.status==='injected')emit({status:'done',message:seen?'已确认人物立场进入本轮正文请求；没有生成后审核':'本轮已设置人物立场；未获得最终请求确认，没有生成后审核',confirmed:seen===true});}
    function persistConfig(values){const c=context();c.extensionSettings[STORE]={...cfg(),...values};c.saveSettingsDebounced?.();}
    async function intercept(_core,_max,abort,rawType='normal') {
        const type=rawType||'normal';
        const failMain=()=>{if(typeof abort==='function')abort(true);};
        if(!['normal','swipe','regenerate'].includes(type)){clear();return;}
        if(active){failMain();return;}
        clear();
        if(!cfg().enabled){refresh();return;}
        const c=context(),key=chatKey(c),guard=guardKey(c);
        if(!key){emit({status:'skipped',message:'没有有效聊天，未调用辅助模型'});return;}
        if(skip?.key===key){skip=null;emit({status:'skipped',message:'按你的选择，本轮只生成原正文',diagnostics:null,validation:null});return;}skip=null;
        if(!configured()){emit({status:'waiting',message:'辅助模型未配置，本轮仅按原正文运行'});return;}
        if(typeof c.setExtensionPrompt!=='function'){failMain();emit({status:'error',message:'酒馆没有提供注入接口，本轮正文已暂停'});return;}
        const owner={epoch:++epoch,controller:new AbortController()};active=owner;
        const fresh=()=>owner.epoch===epoch&&!owner.controller.signal.aborted&&chatKey(context())===key&&guardKey(context())===guard;
        try {
            await beforeGeneration(failMain);if(!fresh()){failMain();return;}
            emit({status:'reading',message:'正在自动读取当前人物与剧情',decision:null,packet:'',warnings:[],coverage:null,model:null,diagnostics:null,usage:null,cached:false,validation:null});
            const lore=await readLore(c,owner.controller.signal);if(!fresh()){failMain();return;}
            const material=buildMaterial(c,type,{...lore,budget:cfg().budget});
            const trigger=shouldJudge(material,cfg().mode);
            emit({coverage:material.coverage,warnings:material.warnings,sources:material.sources.map(s=>({id:s.id,kind:s.kind,label:s.label,truncated:s.truncated})),reason:trigger.reason});
            if(!trigger.run){emit({status:'skipped',message:trigger.reason+'，本轮不增加辅助生成'});return;}
            const route=selectedRoute(material);if(!route)throw new Error('已选辅助模型不可用，不会回退正文模型。');
            const routeState=JSON.stringify(route),cacheKey=key+'|'+digest(JSON.stringify([material,route]));
            const saved=cache.get(cacheKey);let decision=saved?.decision,cached=Boolean(saved);
            if(!decision){
                emit({status:'judging',message:'辅助人物判断中；完成后自动发送同一轮正文',model:route.modelId,stage:route.stage});
                const result=await request(route,[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify(material)}],owner.controller.signal,
                    diagnostics=>{if(fresh())emit({diagnostics});});
                if(!fresh()||JSON.stringify(selectedRoute(material))!==routeState){failMain();emit({status:'stale',message:'期间剧情或模型配置变化，结果已丢弃，未发送正文'});return;}
                emit({usage:result.usage||null,diagnostics:result.diagnostics||null});
                decision=validateDecision(result.text,material);cache.set(cacheKey,{decision,diagnostics:result.diagnostics||null});if(cache.size>16)cache.delete(cache.keys().next().value);
            }else emit({diagnostics:saved.diagnostics});
            if(!fresh()||JSON.stringify(selectedRoute(material))!==routeState){failMain();return;}
            const packet=makeInjection(decision);
            if(packet){armed={epoch:owner.epoch,key,seen:false};context().setExtensionPrompt(PROMPT,packet,1,0,false,0,()=>Boolean(armed&&armed.epoch===owner.epoch&&chatKey(context())===key&&cfg().enabled));}
            emit({status:packet?'injected':'skipped',message:packet?`${cached?'复用相同上下文判断；':'判断完成；'}已注入 ${decision.actors.length} 位人物立场，正文正常生成一次`:'未识别到相关NPC，本轮按原正文继续',decision,packet,cached,model:route.modelId,stage:route.stage,validation:decision.validation||null});
        } catch(error) {
            failMain();clear();
            if(owner.epoch!==epoch||owner.controller.signal.aborted)return;
            const message='正文发送前已暂停：'+String(error?.message||'辅助判断失败').slice(0,360);
            emit({status:'error',message,packet:'',diagnostics:error.diagnostics||state.diagnostics,validation:error.validation||null});try{notify(message);}catch{}
        } finally {if(active===owner)active=null;}
    }
    return {intercept,refresh,invalidate,ended,view,observePrompt(event){if(!event?.dryRun&&armed&&chatKey(context())===armed.key&&JSON.stringify(event.chat||event.prompt||'').includes('[NPC_AUTONOMY_CURRENT]'))armed.seen=true;},subscribe(fn){listeners.add(fn);fn(view());return()=>listeners.delete(fn);},
        setEnabled(value){persistConfig({enabled:Boolean(value)});invalidate('已改变启用状态');refresh();},
        setMode(value){if(!['balanced','always'].includes(value))return;persistConfig({mode:value});invalidate('已改变调用策略');refresh();},
        setOutputPolicy(value){if(!['auto','channel'].includes(value))return;persistConfig({outputPolicy:value});invalidate('已改变辅助输出策略');refresh();},
        skipOnce(){skip={key:chatKey(context()),guard:guardKey(context())};emit({status:'ready',message:'下一次在同一剧情发送时将跳过辅助判断'});}};
}
