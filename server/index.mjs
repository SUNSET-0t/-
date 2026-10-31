import {Vault} from './vault.mjs';
import {safeJson} from './network.mjs';
import {VERSION,API_VERSION,ClientError,providerCatalog,STAGES,authHeaders,modelRequest,parseModelPage,generationRequest,parseGeneration} from './protocol.mjs';

export const info={id:'npc-independent-api',name:'NPC 独立渠道服务',description:'Per-user isolated API credentials and bounded auxiliary model requests; never edits the main API.'};
const locks=new Set();
export function registerRoutes(router,{transport=safeJson,vaultFactory=root=>new Vault(root)}={}) {
    router.use((req,res,next)=>{
        res.set('Cache-Control','no-store');
        if(!req.user?.directories?.root)return res.status(403).json({error:'未取得酒馆登录用户。'});
        if(req.method!=='POST')return res.status(405).json({error:'仅允许插件内的 POST 请求。'});
        if(req.headers['x-npc-request']!=='1'||req.headers['sec-fetch-site']==='cross-site'||!String(req.headers['content-type']||'').includes('application/json'))return res.status(403).json({error:'请求来源或格式无效。'});
        if(JSON.stringify(req.body||{}).length>1100000)return res.status(413).json({error:'请求过大。'});
        next();
    });
    function route(path,handler,network=false){router.post(path,async(req,res)=>{
        const user=req.user.directories.root;
        let held=false;
        const abort=new AbortController();
        const onClose=()=>{if(!res.writableEnded)abort.abort();};
        try{
            if(network){if(locks.has(user))throw new ClientError('另一个独立请求正在运行，请勿重复点击。',409);locks.add(user);held=true;res.on('close',onClose);}
            const vault=vaultFactory(user);const result=await handler(vault,req.body||{},abort.signal);
            if(!res.destroyed)res.json(result);
        }catch(e){if(!res.headersSent&&!res.destroyed)res.status(e instanceof ClientError?e.status:400).json({error:e instanceof ClientError?e.message:'独立服务处理失败，请检查配置或数据；不会回退到主接口。'});}
        finally{if(held)locks.delete(user);res.off('close',onClose);}
    });}
    route('/state',v=>({apiVersion:API_VERSION,version:VERSION,providers:providerCatalog(),stages:STAGES,...v.snapshot()}));
    route('/save',(v,b)=>v.save(b.channel,b.apiKey,b.expectedRevision));
    route('/remove',(v,b)=>v.remove(b.channelId,b.expectedRevision));
    route('/routes',(v,b)=>v.setRoutes(b.routes,b.expectedRevision));
    route('/models',async(v,b,signal)=>{
        const c=v.get(b.channelId),key=v.secret(c),models=[],seen=new Set();let cursor=null;
        for(let n=0;n<20;n++){
            const payload=await transport({url:modelRequest(c,cursor),method:'GET',headers:authHeaders(c,key),timeoutMs:30000},{signal});
            const page=parseModelPage(c,payload);models.push(...page.models);
            if(models.length>20000)throw new ClientError('模型列表超过上限，未保存不完整结果。',502);
            if(!page.nextCursor){const unique=[...new Map(models.map(m=>[m.id,m])).values()];return v.cacheModels(c.id,c.revision,unique);}
            if(seen.has(page.nextCursor))throw new ClientError('模型分页游标重复，未保存部分结果。',502);
            seen.add(page.nextCursor);cursor=page.nextCursor;
        }
        throw new ClientError('模型列表超过20页，未保存部分结果。',502);
    },true);
    async function run(v,b,signal,testOnly){
        let channel,model;
        if(testOnly){if(b.confirmPaid!==true)throw new ClientError('请先明确确认收费测试。');channel=v.get(b.channelId);model=b.modelId||channel.defaultModel;}
        else{const state=v.read(),r=state.routes[b.stageId];if(!r)throw new ClientError('该阶段未选择独立模型。');channel=v.get(r.channelId);model=r.modelId;}
        const revision=channel.revision;
        const request=generationRequest(channel,v.secret(channel),model,b.messages,testOnly);
        const started=Date.now();const payload=await transport(request,{signal});
        if(v.get(channel.id).revision!==revision)throw new ClientError('请求期间配置已变更，结果已丢弃；请查看服务商用量。',409);
        return {...parseGeneration(channel,payload),channelId:channel.id,modelId:model,elapsedMs:Date.now()-started,generationRequests:1};
    }
    route('/test',(v,b,s)=>run(v,b,s,true),true);
    route('/generate',(v,b,s)=>run(v,b,s,false),true);
}
export async function init(router){registerRoutes(router);console.log('[NPC 独立渠道] v'+VERSION+' ready; credentials isolated from main API.');}
