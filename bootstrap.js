// Keep UI hosting separate from decision logic. Opening never starts a model request.
import { installPanelHost } from './panel-host.js?v=0.2.0';
const host = installPanelHost('0.2.0-r2b');
function addStyle(id,path){
    if(document.getElementById(id))return;
    const link=document.createElement('link');link.id=id;link.rel='stylesheet';
    link.href=new URL(path,import.meta.url).href;document.head.append(link);
}
addStyle('npc-r2b-base-style-v020','./style.css?v=0.2.0');
addStyle('npc-r2b-host-style-v020','./panel-host.css?v=0.2.0');
import('./index.js?v=0.2.0').then(()=>{
    let attempts=0;
    const timer=setInterval(()=>{
        if(document.getElementById('npc-r2b-overlay')){clearInterval(timer);host.ready();}
        else if(++attempts>=50){clearInterval(timer);host.failed(new Error('实验台初始化未完成，请截图此提示。'));}
    },100);
}).catch(error=>host.failed(error));
