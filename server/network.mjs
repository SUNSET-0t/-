import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import {ClientError} from './protocol.mjs';

// Conservative IPv4-only egress: reject private, loopback, link-local, documentation and reserved ranges.
export function isPublicIPv4(ip) {
    if(net.isIP(ip)!==4)return false;
    const [a,b,c]=ip.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===192&&b===0)||(a===192&&b===88&&c===99)||(a===198&&(b===18||b===19))||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113));
}
export async function safeJson(request,{signal,lookup=dns.lookup,requestImpl=https.request}={}) {
    const url=new URL(request.url);
    if(url.protocol!=='https:' || (url.port&&url.port!=='443') || url.username || url.password || url.hash)throw new ClientError('不允许的 API 地址。');
    if(signal?.aborted)throw new ClientError('请求已取消。',499);
    const deadline=Date.now()+Math.min(request.timeoutMs||120000,300000);
    let records,timer;
    try {records=await Promise.race([lookup(url.hostname,{all:true,family:4}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new ClientError('DNS 查询超时。',504)),10000)})]);}
    catch(e){if(e instanceof ClientError)throw e;throw new ClientError('无法解析 API 主机。',502);}
    finally{clearTimeout(timer);}
    if(!records.length||records.some(r=>!isPublicIPv4(r.address)))throw new ClientError('接口解析到本机、内网或保留地址，已阻止请求。');
    const pinned=records[0].address;
    const body=request.body===undefined?null:Buffer.from(JSON.stringify(request.body));
    if(body&&body.length>1024*1024)throw new ClientError('请求体超过1MB。');
    return new Promise((resolve,reject)=>{
        let total=0,finished=false,req;
        const done=(error,data)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(data);};
        const cancel=()=>{req?.destroy();done(new ClientError('请求已取消；若已发出，请在服务商查看用量。',499));};
        const headers={...request.headers,Accept:'application/json'};
        if(body)headers['Content-Length']=String(body.length);
        try {
            req=requestImpl(url,{method:request.method||'GET',headers,agent:false,
                lookup(_host,options,callback){if(options?.all)callback(null,[{address:pinned,family:4}]);else callback(null,pinned,4);},
            },res=>{
                const chunks=[];
                // Never follow redirects with an API credential.
                if(res.statusCode<200||res.statusCode>=300){res.resume();done(new ClientError(`服务商 HTTP ${res.statusCode}；未重试、未切换正文接口。请检查密钥、权限、额度及参数。`,502));return;}
                res.on('data',chunk=>{total+=chunk.length;if(total>8*1024*1024){res.destroy();done(new ClientError('服务商响应超过8MB，已中止。',502));return;}chunks.push(chunk);});
                res.on('end',()=>{try{done(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{done(new ClientError('接口没有返回有效 JSON。',502));}});
                res.on('error',()=>done(new ClientError('读取服务商响应失败。',502)));
            });
            req.on('error',()=>done(new ClientError('连接服务商失败或已中断；未自动重试。',502)));
            timer=setTimeout(()=>{req.destroy();done(new ClientError('独立请求超时，未自动重试；请核对服务商实际用量。',504));},Math.max(1,deadline-Date.now()));
            signal?.addEventListener('abort',cancel,{once:true});
            if(signal?.aborted){cancel();return;}
            req.end(body);
        }catch{done(new ClientError('独立网络请求失败。',502));}
    });
}
