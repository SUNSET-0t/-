// Per-user isolated store. Does not import or touch SillyTavern secrets/settings.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID,createCipheriv,createDecipheriv} from 'node:crypto';
import {createChannelMetadata} from '../connections/providers.mjs';
import {ClientError,checkedOptions,checkedEndpoint,checkedModel,STAGES} from './protocol.mjs';

export class Vault {
    constructor(userRoot) {
        if (typeof userRoot!=='string' || !path.isAbsolute(userRoot)) throw new ClientError('未获得酒馆用户目录。',403);
        this.dir=path.join(userRoot,'npc-independent-api');
        if (fs.existsSync(this.dir) && fs.lstatSync(this.dir).isSymbolicLink()) throw new ClientError('独立存储目录不允许符号链接。',500);
        fs.mkdirSync(this.dir,{recursive:true,mode:0o700});
        this.file=path.join(this.dir,'channels.json'); this.keyFile=path.join(this.dir,'vault.key');
        for (const file of [this.file,this.keyFile]) if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new ClientError('存储文件不允许符号链接。',500);
        if (!fs.existsSync(this.keyFile)) {
            if (fs.existsSync(this.file)) throw new ClientError('独立密钥文件缺失。请恢复备份，不会覆盖现有记录。',500);
            fs.writeFileSync(this.keyFile,randomBytes(32),{flag:'wx',mode:0o600});
        }
        this.key=fs.readFileSync(this.keyFile);
        if (this.key.length!==32) throw new ClientError('独立密钥文件损坏。',500);
    }
    read() {
        if (!fs.existsSync(this.file)) return {schema:1,revision:0,channels:[],routes:{}};
        try {
            const data=JSON.parse(fs.readFileSync(this.file,'utf8'));
            if(data.schema!==1 || !Number.isSafeInteger(data.revision) || !Array.isArray(data.channels) || !data.routes) throw new Error();
            return data;
        } catch { throw new ClientError('独立渠道记录无法读取。不会重置或覆盖数据。',500); }
    }
    write(data) {
        const temp=path.join(this.dir,`.${randomUUID()}.tmp`);
        try {fs.writeFileSync(temp,JSON.stringify(data),{flag:'wx',mode:0o600});fs.renameSync(temp,this.file);}
        finally {if(fs.existsSync(temp)) fs.unlinkSync(temp);}
    }
    encrypt(value,id) {
        const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',this.key,iv);
        cipher.setAAD(Buffer.from(id));
        const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
        return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
    }
    secret(channel) {
        if(!channel.encryptedKey) throw new ClientError('此渠道尚未保存独立密钥。');
        try {const d=createDecipheriv('aes-256-gcm',this.key,Buffer.from(channel.encryptedKey.iv,'base64'));d.setAAD(Buffer.from(channel.id));d.setAuthTag(Buffer.from(channel.encryptedKey.tag,'base64'));return Buffer.concat([d.update(Buffer.from(channel.encryptedKey.data,'base64')),d.final()]).toString('utf8');}
        catch {throw new ClientError('独立密钥无法解密，请检查备份或重新填写。',500);}
    }
    publicChannel(c) { const {encryptedKey,...metadata}=c; return {...metadata,hasKey:Boolean(encryptedKey)}; }
    snapshot() { const d=this.read();return {revision:d.revision,channels:d.channels.map(c=>this.publicChannel(c)),routes:d.routes}; }
    expect(data,revision) { if(data.revision!==revision)throw new ClientError('渠道配置已被另一窗口修改，请刷新后重试。',409); }
    get(id) {const c=this.read().channels.find(c=>c.id===id);if(!c)throw new ClientError('渠道不存在。',404);return c;}
    save(input,apiKey,expectedRevision) {
        const d=this.read();this.expect(d,expectedRevision);
        if(!input || typeof input!=='object')throw new ClientError('渠道配置无效。');
        const old=d.channels.find(c=>c.id===input.id);
        if(!old && d.channels.length>=50)throw new ClientError('最多保存50个渠道。');
        const id=input.id || randomUUID();
        const c=createChannelMetadata({id,name:input.name,providerId:input.providerId,baseUrl:input.baseUrl,projectId:input.projectId,location:input.location,credentialRevision:old?.credentialRevision || 0});
        checkedEndpoint(c);
        c.options=checkedOptions(input.options);
        c.defaultModel=input.defaultModel?checkedModel(input.defaultModel):'';
        if(apiKey!==undefined && (typeof apiKey!=='string'||apiKey.length>8192||/[\r\n\x00]/.test(apiKey)))throw new ClientError('密钥格式无效。');
        const replacement=typeof apiKey==='string' && apiKey.trim()!=='';
        const endpointChanged=old && (old.providerId!==c.providerId || old.baseUrl!==c.baseUrl);
        if(endpointChanged && !replacement)throw new ClientError('更换提供商或地址时必须重新输入密钥，旧密钥不会发往新地址。');
        if(!old && !replacement)throw new ClientError('请为新渠道输入独立密钥。');
        c.encryptedKey=replacement?this.encrypt(apiKey.trim(),id):old.encryptedKey;
        c.credentialRevision=(old?.credentialRevision||0)+(replacement||endpointChanged?1:0);
        c.models=replacement||endpointChanged?[]:old?.models||[];
        c.modelsFetchedAt=replacement||endpointChanged?null:old?.modelsFetchedAt||null;
        c.revision=(old?.revision||0)+1;
        if(endpointChanged)for(const s of STAGES)if(d.routes[s.id]?.channelId===id)delete d.routes[s.id];
        d.channels=old?d.channels.map(x=>x.id===id?c:x):[...d.channels,c];d.revision++;this.write(d);return this.snapshot();
    }
    cacheModels(id,channelRevision,models) {
        const d=this.read(),c=d.channels.find(c=>c.id===id);
        if(!c || c.revision!==channelRevision)throw new ClientError('请求期间渠道已改变，本次模型列表已丢弃。',409);
        c.models=models;c.modelsFetchedAt=new Date().toISOString();d.revision++;this.write(d);return this.snapshot();
    }
    setRoutes(routes,expectedRevision) {
        const d=this.read();this.expect(d,expectedRevision);const clean={};
        for(const s of STAGES){const r=routes?.[s.id];if(!r)continue;const c=d.channels.find(c=>c.id===r.channelId);if(!c)throw new ClientError('阶段引用了不存在的渠道。');const modelId=checkedModel(r.modelId);const found=c.models?.find(m=>m.id===modelId);if(found?.textGeneration===false)throw new ClientError('不能为人物判断选择明确不支持文本生成的模型。');if(!found && r.manual!==true)throw new ClientError('模型未在列表中，请明确选择手动 ID。');clean[s.id]={channelId:c.id,modelId,manual:!found};}
        d.routes=clean;d.revision++;this.write(d);return this.snapshot();
    }
    remove(id,expectedRevision) {
        const d=this.read();this.expect(d,expectedRevision);
        if(Object.values(d.routes).some(r=>r.channelId===id))throw new ClientError('该渠道仍被阶段使用，请先取消其阶段选择。');
        d.channels=d.channels.filter(c=>c.id!==id);d.revision++;this.write(d);return this.snapshot();
    }
}
