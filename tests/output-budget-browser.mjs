// Run existing full browser pipeline under the user's model ID and an explicit
// thinking-budget failure. Provider data are simulated, not a paid-model benchmark.
import fs from 'node:fs';import {spawnSync} from 'node:child_process';
let code=fs.readFileSync('tests/automatic-browser.mjs','utf8');
function replace(old,value){if(!code.includes(old))throw new Error('Budget fixture anchor changed: '+old.slice(0,70));code=code.replace(old,value);}
replace("'api_key_openai','AUTOMATIC_FAKE_AUX'","'api_key_openrouter','AUTOMATIC_FAKE_AUX'");
replace("providerId:'openai',baseUrl:'https://api.openai.com/v1'","providerId:'openrouter',baseUrl:'https://openrouter.ai/api/v1'");
replace("secretRef:{id:aux,type:'api_key_openai'}","secretRef:{id:aux,type:'api_key_openrouter'}");
code=code.replaceAll('aux-model','deepseek/deepseek-v4.1-flash-1017');
replace("release-0.4.0.js","release-0.4.1.js");
replace("const text=providerMode==='bad'?'bad-json':decision(material);",`assert.equal(req.body.max_tokens,8192);assert.equal(req.body.reasoning_effort,'low');
        if(providerMode==='length'){res.json({choices:[{message:{content:'',reasoning:'PRIVATE_FAKE_THOUGHT'},finish_reason:'length'}],usage:{prompt_tokens:5000,completion_tokens:8192,total_tokens:13192,completion_tokens_details:{reasoning_tokens:8192}}});return;}
        const text=providerMode==='bad'?'bad-json':decision(material);`);
replace("providerMode='bad';const fail=trace.length;",`providerMode='length';const limitedAt=trace.length;
    const limited=await page.evaluate(()=>fixtureSend('和林乔聊一下今天的安排'));assert(limited.aborted);assert.deepEqual(trace.slice(limitedAt).map(t=>t.kind),['aux']);
    await click('#npc-r2b-wand');await click('.npc-r2b-tab[data-tab=test]');
    assert((await page.locator('#npc-output-summary').innerText()).includes('8192'));
    assert((await page.locator('#npc-auto-message').innerText()).includes('不是余额不足'));
    assert(!(await page.locator('#npc-r2b-overlay').innerText()).includes('PRIVATE_FAKE_THOUGHT'));
    fs.mkdirSync('test-artifacts',{recursive:true});await page.screenshot({path:'test-artifacts/output-limit-'+label+'.png'});
    await click('.npc-r2b-tab[data-tab=inject]');await page.locator('details').filter({has:page.locator('#npc-output-diagnostics')}).locator('summary').click();
    const diagnostic=JSON.parse(await page.locator('#npc-output-diagnostics').innerText());assert.equal(diagnostic.usage.reasoningTokens,8192);assert.equal(diagnostic.usage.visibleTokens,0);
    await click('#npc-r2b-close');
    providerMode='bad';const fail=trace.length;`);
const file='tests/.output-budget-browser.generated.mjs';
try{fs.writeFileSync(file,code);const result=spawnSync(process.execPath,[file],{stdio:'inherit'});if(result.status!==0)process.exitCode=result.status||1;}
finally{fs.rmSync(file,{force:true});}
