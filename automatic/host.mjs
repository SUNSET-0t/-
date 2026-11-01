import {casts} from './material.mjs?v=0.4.0';
/** Read selected/linked books without rerunning WI activation, macros or event callbacks. */
export function createLoreReader({loadModule=()=>import(new URL('../../../../world-info.js',import.meta.url).href)}={}) {
    let modulePromise;
    return async function readLore(ctx,signal) {
        const warnings=[],entries=[],books=new Set();
        const cards=casts(ctx);
        const add=value=>{if(typeof value==='string'&&value.trim())books.add(value);};
        add(ctx.chatMetadata?.world_info);add(ctx.powerUserSettings?.persona_description_lorebook);
        for(const c of cards)add(c.data?.extensions?.world);
        try {const mod=await(modulePromise??=loadModule());
            for(const book of mod.selected_world_info||[])add(book);
            for(const c of cards){const name=String(c.avatar||'').replace(/\.[^.]+$/,'');const extra=mod.world_info?.charLore?.find(r=>r.name===name);for(const book of extra?.extraBooks||[])add(book);}
        } catch {modulePromise=null;warnings.push('无法读取全局世界书选择，仍读取角色、聊天和人格关联的书。');}
        const selected=[...books].slice(0,12);if(books.size>12)warnings.push('关联书超过12本，本次只读前12本。');
        for(const book of selected){
            if(signal?.aborted)throw new Error('已取消读取');
            try {if(typeof ctx.loadWorldInfo!=='function')throw new Error('unsupported');const value=await ctx.loadWorldInfo(book);
                if(!value?.entries)throw new Error('missing');for(const e of Object.values(value.entries))entries.push({...e,world:book});
            }catch{warnings.push('未读到关联世界书：'+book.slice(0,100));}
        }
        if(!entries.length)for(const c of cards){const embedded=c.data?.character_book?.entries;if(Array.isArray(embedded))for(const e of embedded)entries.push({...e,world:'内嵌角色书'});}
        if(entries.length)warnings.push('仅检索相关设定，不等于主模型最终激活清单；秘密/未来剧情不自动成为NPC所知。');
        return {entries,warnings};
    };
}
