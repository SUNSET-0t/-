import {generatedText,provider} from '../native/protocol.mjs?v=0.3.0';
import {planOutput,outputDiagnostics,OutputLimitError} from './output-policy.mjs?v=0.4.1';
/** Cancellation-aware native host request. Selected references only; no raw keys or retries. */
export function createTransport({context,fetcher=(...a)=>fetch(...a)}) {
    return async function request(route,messages,signal,onDiagnostics=()=>{}) {
        const ctx=context(),channel=ctx.extensionSettings?.npc_native_channels_v1?.channels?.find(c=>c.id===route.channelId);
        if(!channel)throw new Error('辅助渠道已删除，未使用正文渠道。');
        const snapshot=JSON.parse(JSON.stringify(channel)),p=provider(snapshot.providerId);
        const plan=planOutput(snapshot,route.modelId,messages,route.outputPolicy||'auto');
        let diagnostics=plan.diagnostics;
        const report=()=>{try{onDiagnostics(diagnostics);}catch{}};report();
        const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
        const timer=setTimeout(cancel,Math.max(10,Math.min(300,snapshot.options?.timeoutSeconds||120))*1000);
        const post=async(path,body)=>{
            if(controller.signal.aborted||signal?.aborted)throw new Error('辅助请求已取消');
            const response=await fetcher(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{...ctx.getRequestHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
            if(!response.ok)throw new Error(`酒馆接口 HTTP ${response.status}；未自动重试，请检查辅助接口。`);
            let result;try{result=await response.json();}catch{throw new Error('辅助接口未返回 JSON。');}
            if(result?.error)throw new Error('辅助接口或服务商返回错误，未自动重试。');return result;
        };
        try {
            if(!snapshot.secretRef||snapshot.secretRef.type!==p.secretType)throw new Error('辅助密钥引用无效，未调用正文密钥。');
            const metadata=await post('/api/secrets/read',{}),rows=metadata?.[p.secretType];
            if(!Array.isArray(rows)||!rows.some(r=>r.id===snapshot.secretRef.id))throw new Error('辅助密钥已失效，请重新保存该接口。');
            const raw=await post('/api/backends/chat-completions/generate',plan.payload);
            diagnostics=outputDiagnostics(raw,plan.diagnostics);report();
            // Preserve usage on errors; never hide, stitch, accept or retry truncated JSON.
            if(diagnostics.truncated)throw new OutputLimitError(diagnostics);
            return {...generatedText(raw),modelId:route.modelId,diagnostics};
        } catch(error) {
            const out=error?.name==='AbortError'?new Error('辅助请求已取消或超时；若已送达服务商，仍可能计费。'):error;
            out.diagnostics=diagnostics;throw out;
        } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    };
}
