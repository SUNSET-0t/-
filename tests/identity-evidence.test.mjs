import test from 'node:test';import assert from 'node:assert/strict';
import {validateDecision,makeInjection} from '../automatic/decision.mjs';
import {normalizeName,sourceNames} from '../automatic/identity.mjs';
import {createEngine,PROMPT} from '../automatic/engine.mjs';
const source=(id,kind,text,label='资料')=>({id,kind,text,label});
function material(extra=[]){return{player:'玩家',intent:{text:'关心林乔',status:'planned_not_observed'},sources:[source('C0','character_setting','姓名：林乔\n性格：重视朋友但有自己的日程。'),source('H0_0','narration','她表示今天要先完成工作。'),...extra]};}
function actor(name='林乔',evidence=['H0_0']){return{name,goal:'完成工作',stance:'尊重朋友也保留自己的安排',known:'自己已说明日程',unknown:'对方未表达的想法',response:'依据实际关心方式回应',initiative:'继续工作',evidence};}
const parse=(a,m=material())=>validateDecision(JSON.stringify({schema:'npc-autonomy/1',actors:Array.isArray(a)?a:[a],notes:[]}),m);

test('identity can be on a character sheet while behavioral citation uses a pronoun',()=>{
 const a=actor(),m=material(),before=structuredClone({a,m});const d=parse(a,m);
 assert.deepEqual(d.actors[0].identity_evidence,['C0']);assert.deepEqual(d.actors[0].evidence,['H0_0']);
 assert(d.validation.actors[0].linkedLocally);assert.deepEqual({a,m},before);
});
test('new explicit identity_evidence and old output without it both work',()=>{
 const old=parse(actor()),explicit=parse({...actor(),identity_evidence:['C0']});assert.deepEqual(old.actors,explicit.actors);
});
test('name found directly in original behavior evidence remains supported',()=>{
 const d=parse(actor('林乔',['C0']));assert.equal(d.validation.actors[0].linkedLocally,false);
});
test('wrong identity reference with an existing ID is locally replaced, never behavior evidence',()=>{
 const m=material([source('W9','lore_setting','仓库的用途')]),d=parse({...actor(),identity_evidence:['W9']},m);
 assert.deepEqual(d.actors[0].identity_evidence,['C0']);assert.deepEqual(d.actors[0].evidence,['H0_0']);
});
test('missing behavioral ID is not repaired merely because a name exists elsewhere',()=>{
 assert.throws(()=>parse(actor('林乔',['H404'])),e=>e.code==='EVIDENCE_VALIDATION'&&e.validation.reason==='invalid_evidence');
});
test('invented identity reference still fails instead of disabling evidence validation',()=>{
 assert.throws(()=>parse({...actor(),identity_evidence:['C404']}),e=>e.validation.reason==='invalid_identity_reference');
});
test('truly absent identity reports its specific name and cited IDs without retaining raw output',()=>{
 assert.throws(()=>parse(actor('不存在的角色')),e=>{
  assert.match(e.message,/不存在的角色/);assert.match(e.message,/H0_0/);assert.equal(e.validation.checkedSourceCount,2);assert.equal(e.validation.reason,'identity_not_found');assert(!('raw' in e.validation));return true;
 });
});
test('no alias, full-name, phonetic or simplified/traditional guess is introduced',()=>{
 const m=material([source('W1','lore_setting','角色：林夫人。')]);
 for(const name of ['林巧','林乔（母亲）','林夫人（林乔）','林喬'])assert.throws(()=>parse(actor(name),m));
 assert.equal(parse(actor('林夫人'),m).actors[0].name,'林夫人');
});
test('format normalization handles wrappers, Han spacing, width and canonical accents only',()=>{
 const d=parse(actor(' **林　乔** '));assert.equal(d.actors[0].name,'林乔');assert(d.validation.actors[0].normalized);
 assert.equal(normalizeName('Ａｌｉｃｅ'),'Alice');
 const m={player:'Player',sources:[source('C0','character_setting','Élodie met Alice.'),source('H0_0','narration','She went home.')]};
 assert.equal(parse(actor('E\u0301lodie'),m).actors[0].name,'Élodie');assert.equal(parse(actor('Ａｌｉｃｅ'),m).actors[0].name,'Alice');
});
test('Latin substring is not treated as an exact person name',()=>{
 assert.equal(sourceNames(source('C','character_setting','Joanna and Leela'), 'Ann'),false);
 assert.equal(sourceNames(source('C','character_setting','Joanna and Leela'), 'Lee'),false);
 assert.equal(sourceNames(source('C','character_setting','Ann and Lee'), 'Ann'),true);
});
test('a one-character name needs an explicit name label, not a shared syllable',()=>{
 assert.equal(sourceNames(source('C','character_setting','林乔在场'), '乔'),false);
 assert.equal(sourceNames(source('C','character_setting','姓名：乔\n年龄未知'), '乔'),true);
});
test('current intent, past instructions, player settings and plans do not establish NPC identity',()=>{
 const m={player:'玩家',intent:{text:'让李四来帮忙'},sources:[source('H0_0','narration','她正在工作。'),...['prior_intent','player_setting','plan_and_state'].map((kind,i)=>source('U'+i,kind,'李四'))]};
 assert.throws(()=>parse(actor('李四'),m),e=>e.validation.reason==='identity_not_found');
});
test('normalized player names, pronouns and duplicate identities still fail',()=>{
 assert.throws(()=>parse(actor(' **玩家** ')));assert.throws(()=>parse(actor('她')));
 assert.throws(()=>parse([actor('林乔'),actor('林　乔')]));
});
test('identity attestation does not inject debug reports or silently turn intention into fact',()=>{
 const d=parse(actor()),packet=makeInjection(d);assert(packet.includes('identity_evidence'));assert(packet.includes('不证明代词指向'));assert(!packet.includes('linkedLocally'));assert(!packet.includes('identity-042'));
 assert.equal(d.actors[0].known,'自己已说明日程');assert.equal(d.actors[0].response,'依据实际关心方式回应');
});
test('a later invalid actor prevents partial injection of an earlier valid actor',()=>{
 assert.throws(()=>parse([actor(),actor('不存在的人')]));
});
function pipeline(name='林乔'){
 let calls=0;const prompts={},ctx={chatId:'identity-test',characterId:0,name1:'玩家',name2:'叙述者',characters:[{name:'叙述者',data:{description:'姓名：林乔\n重视自己的安排。'}}],chat:[{is_user:false,name:'叙述者',mes:'她先完成了自己已经安排的工作。'},{is_user:true,name:'玩家',mes:'照常相处'}],extensionSettings:{npc_native_channels_v1:{channels:[{id:'aux',secretRef:{id:'fake'},revision:1}],routes:{regular:{channelId:'aux',modelId:'fake-model'}}}},setExtensionPrompt(k,value){prompts[k]=value;}};
 const engine=createEngine({context:()=>ctx,readLore:async()=>({entries:[],warnings:[]}),request:async(_route,messages)=>{calls++;const m=JSON.parse(messages[1].content),ev=m.sources.find(s=>s.kind==='narration');return{text:JSON.stringify({schema:'npc-autonomy/1',actors:[actor(name,[ev.id])],notes:[]}),diagnostics:{requestedLimit:8192,usage:{outputTokens:1200}}};}});
 return{ctx,prompts,engine,get calls(){return calls;}};
}
test('automatic identity linking sends one auxiliary request then allows one main request',async()=>{
 const h=pipeline(),before=JSON.stringify(h.ctx.chat);let abort=0,main=0;await h.engine.intercept(h.ctx.chat,10000,()=>abort++,'normal');if(!abort)main++;
 assert.equal(h.calls,1);assert.equal(main,1);assert(h.prompts[PROMPT].includes('identity_evidence'));assert(h.engine.view().validation.actors[0].linkedLocally);assert.equal(JSON.stringify(h.ctx.chat),before);
 h.engine.ended();await h.engine.intercept(h.ctx.chat,10000,()=>abort++,'normal');assert.equal(h.calls,1);assert(h.engine.view().cached);
});
test('true identity mismatch keeps usage and useful validation details, no retries or main request',async()=>{
 const h=pipeline('未知角色');let abort=0;await h.engine.intercept(h.ctx.chat,10000,()=>abort++,'normal');assert.equal(h.calls,1);assert.equal(abort,1);assert.equal(h.prompts[PROMPT],'');assert.equal(h.engine.view().diagnostics.usage.outputTokens,1200);assert.equal(h.engine.view().validation.name,'未知角色');
 h.engine.invalidate('切换聊天');assert.equal(h.engine.view().validation,null);
});
