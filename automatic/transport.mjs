import {generationPayload,generatedText,provider} from '../native/protocol.mjs?v=0.3.0';
/** Cancellation-aware normal host request. Only selected secret references, never raw keys. */
export function createTransport({context,fetcher=(...a)=>fetch(...a)}) {
    return async function request(route,messages,signal) {
        const ctx=context(),channel=ctx.extensionSettings?.npc_native_channels_v1?.channels?.find(c=>c.id===route.channelId);
        if(!channel)throw new Error('辅助渠道已删除，未使用正文渠道。');
        const snapshot=JSON.parse(JSON.stringify(channel)),p=provider(snapshot.providerId);
        const controller=new AbortController();const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
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
            const payload=generationPayload(snapshot,route.modelId,messages,false);
            const raw=await post('/api/backends/chat-completions/generate',payload);
            return {...generatedText(raw),modelId:route.modelId};
        } catch(error) {if(error?.name==='AbortError')throw new Error('辅助请求已取消或超时；若已送达服务商，仍可能计费。');throw error;}
        finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    };
}
