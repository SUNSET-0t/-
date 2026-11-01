/** Local identity attestation, not semantic identity resolution or factual validation.
 * Only inspect the exact bounded material already sent in this request.
 * Do not guess aliases, transliterations, pronoun antecedents or missing names.
 */
export const IDENTITY_VERSION='identity-042';
const IDENTITY_KINDS=new Set(['character_setting','lore_setting','narration','earlier_narration','offscreen_event','private_interpretation','unverified_summary','state_claim','relationship_claim']);
const PRONOUNS=new Set(['他','她','它','他们','她们','你','您','我','我们','对方','这个人','此人','he','she','they','you','i','someone','npc']);
export function normalizeName(value){
    let name=String(value??'').normalize('NFKC').replace(/[\u200b\ufeff]/g,'').replace(/\s+/g,' ').trim();
    // Display wrappers only; do not remove parenthetical aliases or relationship claims.
    const pairs=[['**','**'],['`','`'],['“','”'],['‘','’'],['「','」'],['『','』'],['"','"']];
    for(let pass=0;pass<2;pass++){const pair=pairs.find(([a,b])=>name.startsWith(a)&&name.endsWith(b)&&name.length>a.length+b.length);if(!pair)break;name=name.slice(pair[0].length,-pair[1].length).trim();}
    return name.replace(/([\p{Script=Han}]) +(?=[\p{Script=Han}])/gu,'$1');
}
function normalizedSource(value){return String(value??'').normalize('NFKC').replace(/[\u200b\ufeff]/g,'').replace(/\s+/g,' ').replace(/([\p{Script=Han}]) +(?=[\p{Script=Han}])/gu,'$1');}
function literalPresent(text,name){
    const haystack=normalizedSource(text);let offset=0;
    const latin=/[\p{Script=Latin}\p{N}_]/u;
    while(offset<=haystack.length){const at=haystack.indexOf(name,offset);if(at<0)return false;
        const before=at>0?Array.from(haystack.slice(0,at)).at(-1):'',after=Array.from(haystack.slice(at+name.length))[0]||'';
        // Ann inside Joanna, or Lee inside Leela, is not a supported literal name.
        if(!(latin.test(name[0])&&latin.test(before))&&!(latin.test(name.at(-1))&&latin.test(after)))return true;
        offset=at+Math.max(1,name.length);
    }
    return false;
}
export function sourceNames(source,name){
    if(!source||!IDENTITY_KINDS.has(source.kind))return false;
    if(normalizeName(source.label)===name)return true;
    // Single-character names are allowed only when explicitly labeled, not any matching syllable.
    if(Array.from(name).length===1){
        return String(source.text||'').split(/\r?\n/).some(line=>{const m=line.match(/^\s*(?:姓名|名字|name)\s*[:：]\s*(.*?)\s*$/i);return m&&normalizeName(m[1])===name;});
    }
    return literalPresent(source.label,name)||literalPresent(source.text,name);
}
export function validName(raw,player){
    if(typeof raw!=='string'||raw.length>120||/[\r\n<>\u0000-\u001f\u007f]/.test(raw))return null;
    const name=normalizeName(raw);
    if(!name||name.length>60||!/[\p{L}\p{N}]/u.test(name)||PRONOUNS.has(name.toLowerCase())||name===normalizeName(player))return null;
    return name;
}
export function resolveIdentity(name,evidence,requested,sources){
    // Keep identity provenance separate from behavior evidence. A name outside the cited
    // event can attest identity, but must not become invented support for that event.
    const order=[...new Set([...(requested||[]),...evidence,...sources.keys()])];
    const matches=order.filter(id=>sourceNames(sources.get(id),name));
    if(!matches.length)return null;
    const preferred=matches.find(id=>['character_setting','lore_setting'].includes(sources.get(id).kind))||matches[0];
    return {ids:[preferred],linked:!evidence.some(id=>sourceNames(sources.get(id),name))};
}
export function shortRef(value){return typeof value==='string'?value.replace(/[^A-Za-z0-9_.:-]/g,'').slice(0,40):'?';}
export class EvidenceError extends Error {
    constructor(message,details){super(message);this.name='EvidenceError';this.code='EVIDENCE_VALIDATION';this.validation={version:IDENTITY_VERSION,...details};}
}
