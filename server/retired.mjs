// Compatibility stub only for users who previously installed the optional v0.2 server copy.
// The browser no longer calls it. No file access, keys, outbound calls or migration.
export const info={id:'npc-independent-api',name:'NPC old companion (retired)',description:'The current browser extension uses native SillyTavern APIs.'};
export async function init(router){router.use((_req,res)=>res.status(410).json({error:'此配套服务已停用。更新网页扩展到原生调用版即可，无需本模块。'}));}
