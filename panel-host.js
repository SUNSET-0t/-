/** UI host only: no model requests, prompt writes, or chat mutations. */
export function installPanelHost(version = '0.1.4-r2b') {
    const key = Symbol.for('npc-r2b.panel-host');
    if (globalThis[key]) return globalThis[key];
    let popup = null;
    let mode = 'closed';
    let opening = false;
    let lastOpener = null;

    const entries = () => [...document.querySelectorAll('.npc-r2b-settings-entry')];
    function hint(message) {
        for (const entry of entries()) {
            const content = entry.querySelector('.inline-drawer-content') || entry;
            let note = content.querySelector('[data-npc-r2b-ui-status]');
            if (!note) {
                note = document.createElement('p');
                note.dataset.npcR2bUiStatus = '';
                note.setAttribute('role', 'status');
                note.className = 'npc-r2b-settings-note';
                content.append(note);
            }
            note.textContent = `界面 ${version} · ${message}`;
        }
    }
    function decorate() {
        for (const entry of entries()) {
            const content = entry.querySelector('.inline-drawer-content') || entry;
            if (!content.querySelector('[data-npc-r2b-open-inline]')) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'menu_button';
                button.dataset.npcR2bOpenInline = '';
                button.textContent = '在当前栏打开（兼容模式）';
                content.append(button);
            }
        }
    }
    function parking() {
        let park = document.getElementById('npc-r2b-panel-parking');
        if (!park) {
            park = document.createElement('div');
            park.id = 'npc-r2b-panel-parking';
            park.hidden = true;
            document.body.append(park);
        }
        return park;
    }
    function rootNode() {
        const root = document.getElementById('npc-r2b-overlay');
        if (!root?.querySelector('.npc-r2b-shell')) {
            throw new Error('界面内容未完成初始化；请保留本提示并截图。');
        }
        return root;
    }
    function prepare(root, nextMode) {
        root.hidden = false;
        root.classList.remove('r2b-visible');
        root.classList.add('r2b-hosted');
        root.dataset.npcR2bHost = nextMode;
        root.setAttribute('aria-hidden', 'false');
        for (const property of ['display', 'visibility', 'z-index', 'position', 'inset']) {
            root.style.removeProperty(property);
        }
        mode = nextMode;
    }
    function parkRoot(root) {
        parking().append(root); // Move, never clone: preserve all handlers and form values.
        root.classList.remove('r2b-hosted', 'r2b-visible');
        delete root.dataset.npcR2bHost;
        root.setAttribute('aria-hidden', 'true');
        root.hidden = true;
        mode = 'closed';
    }
    function refreshProfiles() {
        // Existing refresh button reads saved connection profiles only; no LLM call.
        document.getElementById('npc-r2b-refresh')?.click();
    }
    async function close() {
        if (popup) {
            await popup.complete(null);
        } else {
            const root = document.getElementById('npc-r2b-overlay');
            if (root) parkRoot(root);
            hint('已收起；没有调用模型。');
        }
        if (lastOpener?.isConnected) lastOpener.focus({ preventScroll: true });
    }
    function inline(root, note = '已在当前栏打开。') {
        const entry = entries()[0];
        if (!entry) throw new Error('找不到扩展设置入口。');
        const content = entry.querySelector('.inline-drawer-content') || entry;
        content.style.display = 'block';
        const arrow = entry.querySelector('.inline-drawer-icon');
        if (arrow) {
            arrow.classList.remove('down', 'fa-circle-chevron-down');
            arrow.classList.add('up', 'fa-circle-chevron-up');
        }
        prepare(root, 'inline');
        content.append(root);
        hint(note);
        const drawer = entry.closest('.drawer-content');
        if (drawer && !drawer.classList.contains('openDrawer')) {
            const toggle = drawer.parentElement?.querySelector('.drawer-toggle');
            toggle?.click();
        }
        root.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
    async function open(useInline = false, opener = null) {
        if (opening) return;
        opening = true;
        if (opener) lastOpener = opener;
        decorate();
        hint('已收到点击，正在打开界面……');
        try {
            const root = rootNode();
            if (popup && !useInline) {
                popup.dlg?.focus();
                hint('原生弹窗已打开。');
                return;
            }
            if (popup) await close();
            const context = globalThis.SillyTavern?.getContext?.();
            const Popup = context?.Popup;
            if (useInline || typeof Popup !== 'function') {
                inline(root, useInline ? '已在当前栏打开。' : '此版本无原生弹窗接口，已切换为栏内显示。');
                refreshProfiles();
                return;
            }
            prepare(root, 'popup');
            const current = new Popup(root, context.POPUP_TYPE?.DISPLAY ?? 4, '', {
                wide: true,
                leftAlign: true,
                animation: 'none',
                onClose() {
                    parkRoot(root);
                    if (popup === current) popup = null;
                    hint('已收起；输入和判定结果仍保留。');
                },
            });
            popup = current;
            current.dlg?.classList.add('npc-r2b-native-popup');
            Promise.resolve(current.show()).catch(error => {
                if (popup !== current) return;
                popup = null;
                inline(root, `原生弹窗失败，已栏内打开：${error.message || error}`);
                current.dlg?.remove();
            });
            hint('已打开酒馆原生弹窗；没有调用模型。');
            refreshProfiles();
        } catch (error) {
            console.error('[NPC R2-B UI]', error);
            popup = null;
            try {
                inline(rootNode(), `已切换为栏内显示：${error.message || error}`);
            } catch {
                hint(`打开失败：${error.message || error}`);
            }
        } finally {
            opening = false;
        }
    }
    function intercept(event) {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        const launcher = target?.closest('#npc-r2b-open, #npc-r2b-wand, [data-npc-r2b-open-inline]');
        const closer = target?.closest('#npc-r2b-close');
        if (!launcher && !(closer && mode !== 'closed')) return;
        // Capture-phase delegation survives settings layouts that replace/clone DOM nodes.
        event.preventDefault();
        event.stopImmediatePropagation();
        if (launcher) void open(launcher.hasAttribute('data-npc-r2b-open-inline'), launcher);
        else void close().catch(error => hint(`关闭失败：${error.message || error}`));
    }
    document.addEventListener('click', intercept, true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && mode === 'inline') {
            event.preventDefault();
            event.stopImmediatePropagation();
            void close();
        }
    }, true);
    const host = { open, close, ready() { decorate(); hint('就绪；可以打开原生弹窗或栏内模式。'); }, failed(error) { decorate(); hint(`加载失败：${error.message || error}`); } };
    globalThis[key] = host;
    return host;
}
