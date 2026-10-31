// Separate UI hosting from decision logic. Loading/opening never starts a model request.
import { installPanelHost } from './panel-host.js?v=0.1.4';
const host = installPanelHost('0.1.4-r2b');

function addStyle(id, path) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = new URL(path, import.meta.url).href;
    document.head.append(link);
}
addStyle('npc-r2b-base-style-v014', './style.css?v=0.1.4');
addStyle('npc-r2b-host-style-v014', './panel-host.css?v=0.1.4');

// index.js still owns globalThis.npcR2BInterceptor and all decision/injection logic.
import('./index.js?v=0.1.4').then(() => {
    let attempts = 0;
    const timer = setInterval(() => {
        if (document.getElementById('npc-r2b-overlay')) {
            clearInterval(timer);
            host.ready();
        } else if (++attempts >= 50) {
            clearInterval(timer);
            host.failed(new Error('实验台初始化未完成，请截图此提示。'));
        }
    }, 100);
}).catch(error => host.failed(error));
