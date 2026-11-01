// Reuse full mobile/native-host integration; vary evidence instead of adding a paid repair call.
// This is a synthetic reproduction, not the user's unavailable raw model reply.
import fs from 'node:fs';import {spawnSync} from 'node:child_process';
let code=fs.readFileSync('tests/automatic-browser.mjs','utf8');
function replace(old,value){if(!code.includes(old))throw new Error('Identity fixture anchor changed: '+old.slice(0,80));code=code.replace(old,value);}
replace('release-0.4.0.js','release-0.4.2.js');
replace("const s=material.sources.find(s=>(s.label+' '+s.text).includes(name));","const s=material.sources.find(s=>s.kind==='narration');");
replace("<story_scene>林乔表示要先完成自己的工作。","<story_scene>她表示要先完成自己的工作。");
replace("const text=providerMode==='bad'?'bad-json':decision(material);",`let text=providerMode==='bad'?'bad-json':decision(material);
        if(providerMode==='identity'){const parsed=JSON.parse(text);parsed.actors[0].name='完全无来源的角色';text=JSON.stringify(parsed);}`);
replace("assert((await page.locator('#npc-auto-actors').innerText()).includes('林乔'));",`assert((await page.locator('#npc-auto-actors').innerText()).includes('林乔'));
    assert((await page.locator('#npc-auto-actors').innerText()).includes('身份出处：C0'));
    assert((await page.locator('#npc-auto-actors').innerText()).includes('行为依据：H0_0'));
    const injected=trace[1].body.messages.find(m=>m.content.includes('[NPC_AUTONOMY_CURRENT]')).content;
    assert(injected.includes('"identity_evidence":["C0"]'));
    assert(injected.includes('"evidence":["H0_0"]'));
    assert(!injected.includes('linkedLocally'));
    await page.screenshot({path:'test-artifacts/identity-record-'+label+'.png'});`);
replace("providerMode='bad';const fail=trace.length;",`providerMode='identity';const identityStart=trace.length;
    const identityResult=await page.evaluate(()=>fixtureSend('再聊一下日程'));
    assert(identityResult.aborted);assert.deepEqual(trace.slice(identityStart).map(t=>t.kind),['aux']);
    await click('#npc-r2b-wand');await click('.npc-r2b-tab[data-tab=test]');
    assert((await page.locator('#npc-auto-message').innerText()).includes('完全无来源的角色'));
    await page.screenshot({path:'test-artifacts/identity-error-'+label+'.png'});
    await click('.npc-r2b-tab[data-tab=inject]');
    await page.locator('details').filter({has:page.locator('#npc-source-diagnostics')}).locator('summary').click();
    const validation=JSON.parse(await page.locator('#npc-source-diagnostics').innerText()).validation;
    assert.equal(validation.reason,'identity_not_found');assert.equal(validation.name,'完全无来源的角色');
    assert(!('raw' in validation));await click('#npc-r2b-close');
    providerMode='bad';const fail=trace.length;`);
const file='tests/.identity-browser.generated.mjs';
try{fs.writeFileSync(file,code);const result=spawnSync(process.execPath,[file],{stdio:'inherit'});if(result.status!==0)process.exitCode=result.status||1;}
finally{fs.rmSync(file,{force:true});}
