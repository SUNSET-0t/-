// Preserve the full 0.3.1 settings regression suite. Only adapt navigation: configured users
// now land on Runtime by default, so the old suite must explicitly open API settings.
import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const original=fs.readFileSync('tests/native-browser.mjs','utf8');
const needle="await click('#npc-r2b-wand');";
if(!original.includes(needle))throw new Error('Settings regression navigation changed; review adapter.');
const updated=original.replaceAll(needle,needle+"await click('.npc-r2b-tab[data-tab=advanced]');");
const file='tests/.settings-regression.generated.mjs';
try{fs.writeFileSync(file,updated);const result=spawnSync(process.execPath,[file],{stdio:'inherit'});if(result.status!==0)process.exitCode=result.status||1;}
finally{fs.rmSync(file,{force:true});}
