// Same-origin only. This module never writes the main model settings or browser storage.
export async function channelRequest(action, body = {}, timeoutMs = 125000) {
    if (!['state','save','remove','routes','models','test','generate'].includes(action)) throw new Error('未知独立请求。');
    const context = globalThis.SillyTavern?.getContext?.();
    if (typeof context?.getRequestHeaders !== 'function') throw new Error('酒馆请求头接口不可用。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch('/api/plugins/npc-independent-api/' + action, {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: {...context.getRequestHeaders(), 'Content-Type':'application/json', 'X-NPC-Request':'1'},
            body: JSON.stringify(body), signal: controller.signal,
        });
        if (response.status === 404) throw new Error('独立渠道服务未安装或未启用；请按安装说明在酒馆电脑配置一次。不会改用正文接口。');
        let data;
        try { data = await response.json(); } catch { throw new Error('服务端未返回 JSON，请检查酒馆登录状态。'); }
        if (!response.ok || data.error) throw new Error(typeof data.error === 'string' ? data.error : '独立请求失败。');
        return data;
    } catch (error) {
        if (error?.name === 'AbortError') throw new Error('独立请求超时，未自动重试。若请求已发出，请核对服务商用量。');
        throw error;
    } finally { clearTimeout(timer); }
}
export function credentialTransportAdvice(location) {
    if (location.protocol === 'https:' || ['localhost','127.0.0.1','[::1]'].includes(location.hostname)) return 'secure';
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)) return 'lan-http';
    return 'public-http';
}
