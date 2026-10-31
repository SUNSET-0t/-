// Execute the pinned upstream SecretManager and its original /secrets routes.
// Only unrelated module imports are replaced with test implementations. Credentials are fake.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import vm from 'node:vm';import {randomUUID} from 'node:crypto';
export function makeHost(){
 const source=fs.readFileSync(path.join(process.env.ST_SOURCE_DIR||'/tmp/npc-st-source','secrets.js'),'utf8');
 const handlers=new Map();const router={post:(url,handler)=>handlers.set('/api/secrets'+url,handler)};
 const env={fs,path,express:{Router:()=>router},writeFileAtomicSync:fs.writeFileSync,color:{red:s=>s,green:s=>s},getConfigValue:()=>false,uuidv4:randomUUID,console:{log(){},debug(){},info(){},warn(){},error(){}}};
 const code=source.replace(/^import[\s\S]*?;\s*$/gm,'').replace(/^export /gm,'');
 vm.runInNewContext(code+'\nglobalThis.native={SecretManager,SECRET_KEYS};',env,{filename:'upstream-secrets.js'});
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'npc-native-')),directories={root,backups:path.join(root,'backups')};fs.mkdirSync(directories.backups);
 const manager=new env.native.SecretManager(directories),calls=[],settings={},persisted=[];
 const main={chat_completion_source:'openai',openai_model:'main-model',custom_url:'https://main.example/v1'};
 const primary=manager.writeSecret('api_key_openai','PRIMARY_KEY_FAKE','Main');
 let failRotate=false,failStatus=false,failGenerate=false,hook=null,generateCount=0;
 const context={extensionSettings:settings,chatCompletionSettings:main,mainApi:'openai',getRequestHeaders:()=>({'X-CSRF-Token':'fixture'}),saveSettingsDebounced(){persisted.push(JSON.parse(JSON.stringify(settings)));}};
 async function route(url,body){calls.push({url,body:JSON.parse(JSON.stringify(body))});
  if(url==='/api/secrets/rotate'&&failRotate)return{status:500,data:{error:'forced'}};
  if(handlers.has(url)){
   const res={statusCode:200,status(n){this.statusCode=n;return this;},send(data){this.data=data;return this;},sendStatus(n){this.statusCode=n;this.data=null;return this;}};
   await handlers.get(url)({body,user:{directories}},res);if(hook)await hook(url,body,res);return{status:res.statusCode,data:res.data};
  }
  if(url==='/api/backends/chat-completions/status'){
   if(failStatus)return{status:200,data:{error:true,data:{data:[]}}};return{status:200,data:{data:[{id:'model-a',name:'Example A'},{id:'model-b',name:'Example B'}]}};
  }
  if(url==='/api/backends/chat-completions/generate'){
   generateCount++;if(failGenerate)return{status:500,data:{error:'FAKE_SECRET_MUST_NOT_APPEAR'}};
   const map={openai:'api_key_openai',custom:'api_key_custom',makersuite:'api_key_makersuite',claude:'api_key_claude',openrouter:'api_key_openrouter',siliconflow:'api_key_siliconflow'};
   const secret=manager.readSecret(map[body.chat_completion_source],body.secret_id);if(!secret)return{status:400,data:{error:true}};
   return{status:200,data:{choices:[{message:{content:'OK'},finish_reason:'stop'}],usage:{total_tokens:5}}};
  }
  return{status:404,data:{error:'not installed'}};
 }
 const fetcher=async(url,options)=>{const body=JSON.parse(options.body),result=await route(url,body);return new Response(result.status===204?null:JSON.stringify(result.data),{status:result.status,headers:{'Content-Type':'application/json'}});};
 return{manager,settings,main,primary,context,calls,persisted,route,fetcher,get generateCount(){return generateCount;},set failRotate(v){failRotate=v;},set failStatus(v){failStatus=v;},set failGenerate(v){failGenerate=v;},set hook(v){hook=v;},cleanup(){fs.rmSync(root,{recursive:true,force:true});}};
}
