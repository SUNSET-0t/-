/** Read-only context selection; never reads unselected swipes, keys or settings wholesale. */
export const DEFAULT_BUDGET = 18000;
const OMIT = new Set(['lore_search','acg_think','combat_driver','story_driver','parallel_line_drive','think','thinking','reasoning','analysis','selection','script','style']);
const KINDS = { npc_log:'private_interpretation', memory_log:'unverified_summary', parallel_line:'offscreen_event', wlog:'plan_and_state', status:'state_claim', affinity:'relationship_claim' };
export function clean(value) { return String(value ?? '').replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim(); }
export function clip(value, max) {
    const text = clean(value); if (text.length <= max) return {text, truncated:false};
    if (max < 100) return {text:text.slice(0, Math.max(0,max)), truncated:true};
    const mark='\n[中间部分省略，不可补作已知事实]\n', head=Math.floor((max-mark.length)*.58);
    return {text:text.slice(0,head)+mark+text.slice(-(max-mark.length-head)), truncated:true};
}
export function splitText(value) {
    const text=String(value??''), stack=[], parts=[]; const tags=/<\/?([A-Za-z_][\w:.-]*)\b[^>]*>/g; let pos=0,m;
    const add=fragment=>{ if(stack.some(t=>OMIT.has(t)))return; const body=clean(fragment);if(!body)return;
        const kind=KINDS[[...stack].reverse().find(t=>KINDS[t])]||'narration';
        if(parts.at(-1)?.kind===kind)parts.at(-1).text+='\n'+body;else parts.push({kind,text:body}); };
    while((m=tags.exec(text))){add(text.slice(pos,m.index));const tag=m[1].toLowerCase();
        if(m[0].startsWith('</')){const i=stack.lastIndexOf(tag);if(i>=0)stack.splice(i);}else if(!m[0].endsWith('/>'))stack.push(tag);pos=tags.lastIndex;}
    add(text.slice(pos));return parts;
}
// Lightweight content fingerprint; no claim of cryptographic integrity.
export function digest(value) { let a=2166136261,b=2246822519;for(const ch of String(value)){const c=ch.codePointAt(0);a=Math.imul(a^c,16777619);b=Math.imul(b^c,3266489917);}return(a>>>0).toString(36)+(b>>>0).toString(36); }
export function chatKey(ctx) { const id=ctx.getCurrentChatId?.()??ctx.chatId;return id==null||id===''?null:JSON.stringify([ctx.groupId??null,ctx.characterId??null,String(id)]); }
export function guardKey(ctx) { return digest(JSON.stringify([chatKey(ctx),ctx.name1,ctx.name2,(ctx.chat||[]).map(m=>[m.is_user,m.is_system,m.name,m.mes,m.swipe_id,m.send_date]),ctx.characters?.[ctx.characterId]?.data,ctx.powerUserSettings?.persona_description])); }
export function rawMessages(ctx,type) {
    let rows=(ctx.chat||[]).map((m,index)=>({m,index})).filter(x=>!x.m.is_system);
    // SillyTavern drops the last assistant from coreChat on swipe; regeneration has already removed it.
    if(type==='swipe'&&rows.at(-1)&&!rows.at(-1).m.is_user)rows=rows.slice(0,-1);
    return rows;
}
export function casts(ctx) {
    const list=[], add=c=>{if(c&&!list.some(x=>x.avatar===c.avatar&&x.name===c.name))list.push(c);};
    add(ctx.characters?.[ctx.characterId]);
    const group=ctx.groups?.find(g=>String(g.id)===String(ctx.groupId));
    for(const avatar of group?.members||[])if(!group.disabled_members?.includes(avatar))add(ctx.characters?.find(c=>c.avatar===avatar));
    return list.slice(0,8);
}
function safeMatch(key,text) { return typeof key==='string'&&key.length>=2&&key.length<=100&&!key.startsWith('/')&&text.toLowerCase().includes(key.toLowerCase()); }
function pickLore(entries,text,type) {
    let skipped=0;
    const list=[];
    for(const [i,entry] of (entries||[]).entries()) {
        const e={...entry,...entry.extensions};
        if(e.disable||e.disabled||e.enabled===false||typeof e.content!=='string')continue;
        // Do not activate advanced trigger rules or probabilistic entries independently of the host.
        if(e.content.startsWith('@@dont_activate')||e.decorators?.includes('@@dont_activate'))continue;
        if(e.triggers?.length&&!e.triggers.includes(type||'normal'))continue;
        if((e.selective&&e.keysecondary?.length)||e.characterFilter?.names?.length||e.characterFilter?.tags?.length||e.cooldown||e.delay||(e.useProbability&&Number(e.probability)<100)) {skipped++;continue;}
        const keys=Array.isArray(e.key)?e.key:Array.isArray(e.keys)?e.keys:[];
        const hit=keys.some(k=>safeMatch(k,text));
        if(!hit&&!e.constant)continue;
        const character=/人物|角色|关系|character|personality/i.test(e.comment||e.name||'');
        list.push({e,i,score:(hit?30:0)+(character?10:0)+(e.constant?1:0)});
    }
    return {rows:list.sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,10),skipped};
}
export function buildMaterial(ctx,type,{entries=[],warnings:inputWarnings=[],budget=DEFAULT_BUDGET}={}) {
    budget=Math.max(6000,Math.min(36000,Number(budget)||DEFAULT_BUDGET));
    const selected=rawMessages(ctx,type), lastUser=[...selected].reverse().find(r=>r.m.is_user);
    const intent=clip(lastUser?.m.mes||'',1800), prior=selected.filter(r=>r!==lastUser), recent=prior.slice(-8);
    const warnings=[...inputWarnings],player=clean(ctx.name1||'玩家');
    const history=[];
    for(const {m,index} of [...recent].reverse()) {
        if(m.is_user){history.push({id:`U${index}`,kind:'prior_intent',label:m.name||player,...clip(m.mes,600),message:index,swipe:m.swipe_id??null});continue;}
        for(const [p,part] of splitText(m.mes).entries()) {
            history.push({id:`H${index}_${p}`,kind:part.kind,label:m.name||'叙述',...clip(part.text,part.kind==='narration'?3000:650),message:index,swipe:m.swipe_id??null});
        }
    }
    // Prefer observable narration over private guesses and summaries in a bounded request.
    history.sort((a,b)=>(a.kind==='narration'?0:1)-(b.kind==='narration'?0:1)||b.message-a.message);
    const cards=[];
    for(const [i,c] of casts(ctx).entries()) { const d=c.data||c;
        const value=[['姓名',c.name||d.name],['设定',d.description||c.description],['性格',d.personality||c.personality],['场景',ctx.chatMetadata?.scenario||d.scenario||c.scenario]].filter(x=>x[1]).map(x=>x.join('：')).join('\n');
        if(value)cards.push({id:`C${i}`,kind:'character_setting',label:c.name||'角色卡',...clip(value,2400)});
    }
    if(ctx.powerUserSettings?.persona_description)cards.push({id:'P0',kind:'player_setting',label:player,...clip(ctx.powerUserSettings.persona_description,1000)});
    const search=intent.text+'\n'+history.filter(s=>['narration','offscreen_event'].includes(s.kind)).map(s=>s.text).join('\n');
    const lore=pickLore(entries,search,type==='swipe'?'normal':type);
    const loreSources=lore.rows.map(({e,i})=>({id:`W${i}`,kind:'lore_setting',label:String(e.comment||e.name||'世界书条目').slice(0,100),book:String(e.world||'').slice(0,100),...clip(e.content,1200)}));
    const sources=[]; let used=0;
    function addGroup(items,allowance){let count=0;for(const s of items){const left=Math.min(allowance-count,budget-used);if(left<150)break;const value=clip(s.text,left);sources.push({...s,...value,truncated:s.truncated||value.truncated});used+=value.text.length;count+=value.text.length;}}
    addGroup(cards,Math.floor(budget*.2));
    addGroup(loreSources,Math.floor(budget*.25));
    addGroup(history,budget-used);
    if(!cards.length)warnings.push('未读到角色卡资料；原创人物只依据已经发生的言行，缺失经历保持未知。');
    if(lore.skipped)warnings.push(`有 ${lore.skipped} 条世界书涉及高级触发/过滤，本次未擅自激活。`);
    if(intent.truncated||sources.some(s=>s.truncated)||sources.length<cards.length+history.length+loreSources.length)warnings.push('材料经过长度限制与筛选，不是完整聊天或完整世界书。');
    if(entries.length&&!loreSources.length)warnings.push('关联世界书中未选到可用条目；不表示相关设定不存在。');
    // Only known literal substitutions. Never execute macros from worldbook text.
    for(const s of sources)s.text=s.text.replace(/\{\{user\}\}/gi,player).replace(/\{\{char\}\}/gi,ctx.name2||'当前角色');
    return {schema:'npc-context/1',player,cardName:ctx.name2||'',intent:{text:intent.text,status:'planned_not_observed'},sources,warnings,
        coverage:{messageIndices:[...new Set(sources.map(s=>s.message).filter(Number.isInteger))].sort((a,b)=>a-b),loreRead:sources.filter(s=>s.kind==='lore_setting').length,loreAvailable:entries.length,characters:used,selectedMessages:selected.length},
        userTurn:selected.filter(r=>r.m.is_user).length};
}
export function shouldJudge(material,mode='balanced') {
    if(!material.intent.text)return {run:false,reason:'没有新的玩家输入'};
    if(!material.sources.length)return {run:false,reason:'尚无人物或历史材料，先由正文建立场景'};
    if(mode==='always')return {run:true,reason:'每轮模式'};
    // Conservative local rule: skip only explicit UI/ledger-only requests, not ambiguous daily interaction.
    if(/^(?:[（(]?\s*)?(?:查看|显示|打开|检查)(?:我的)?(?:背包|物品栏|状态栏|余额|地图)(?:\s*[）)]?[。！! ]*)$/.test(material.intent.text))return {run:false,reason:'仅查看状态/物品，本轮不额外调用'};
    return {run:true,reason:'本轮可能涉及人物或场景发展'};
}
export function pickStage(material,settings) {
    const available=id=>{const r=settings?.routes?.[id];return r&&settings.channels?.some(c=>c.id===r.channelId&&c.secretRef)&&r.modelId;};
    const text=material.intent.text;
    const stage=/快进|推进.*(?:天|日|月|年)|接下来几|几天|几日|一周|一个月|time.?skip/i.test(text)?'review':/背叛|赴死|全部身家|牺牲|决裂|重大|最后通牒|ultimatum|betray/i.test(text)?'complex':'regular';
    const chosen=available(stage)?stage:available('regular')?'regular':null;
    if(!chosen)return null;
    const route=settings.routes[chosen],channel=settings.channels.find(c=>c.id===route.channelId);
    return {stage:chosen,channelId:route.channelId,modelId:route.modelId,revision:channel.revision,credentialRevision:channel.credentialRevision,options:channel.options};
}
