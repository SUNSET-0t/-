// NPC R2-B 决策实验台 — 从零编写的独立生成前人物判定实验扩展。
// 不使用旧版 Claude 判官代码，不修改存档、世界书与原有预设。
import { extension_settings } from '../../../extensions.js';
import {
    saveSettingsDebounced, setExtensionPrompt, extension_prompt_types,
    extension_prompt_roles, eventSource, event_types,
} from '../../../../script.js';
import { ConnectionManagerRequestService } from '../../shared.js';
import { JUDGE_PROMPT, INJECTION_TEMPLATE } from './prompts.js';
import { FIXTURES } from './fixtures.js';

const KEY = 'npc_r2b_experiment';
const INJECTION_ID = 'NPC_R2B_ONESHOT_INJECTION';
const defaults = { profileId: '', maxTokens: 2400, timeoutSec: 120 };
const state = {
    busy: false, input: null, verdict: null, raw: '',
    armed: false, used: false, packet: '', chatKey: '',
};

function settings() {
    extension_settings[KEY] ??= {};
    const s = extension_settings[KEY];
    for (const [k, v] of Object.entries(defaults)) {
        if (s[k] === undefined) s[k] = v;
    }
    return s;
}

function getChatKey() {
    const c = SillyTavern.getContext();
    const id = typeof c.getCurrentChatId === 'function' ? c.getCurrentChatId() : (c.chatId || '');
    return String(c.groupId || c.characterId || '') + '/' + String(id);
}

function status(message, level = '') {
    const el = $('#npc-r2b-status').removeClass('r2b-ok r2b-error r2b-working');
    if (level) el.addClass('r2b-' + level);
    el.text(message);
}

function applyPacket(text = '') {
    setExtensionPrompt(INJECTION_ID, text, extension_prompt_types.IN_CHAT, 1, false, extension_prompt_roles.SYSTEM);
}

function disarm(silent = false) {
    state.armed = false;
    state.used = false;
    state.packet = '';
    state.chatKey = '';
    applyPacket('');
    refreshButtons();
    if (!silent) status('已取消注入。');
}

function refreshButtons() {
    $('#npc-r2b-judge').prop('disabled', state.busy);
    $('#npc-r2b-arm').prop('disabled', state.busy || !state.verdict);
    $('#npc-r2b-cancel').prop('disabled', !state.armed);
    $('#npc-r2b-ready').text(state.armed ? '下一次正常正文生成将注入此判定（只使用一次）' : '未准备注入');
    $('#npc-r2b-mini-state').text(state.busy ? '判定中' : state.armed ? '待注入' : state.verdict ? '已获得判定' : '尚未判定');
}

function loadFixture() {
    const mode = $('#npc-r2b-mode').val();
    $('#npc-r2b-input').val(JSON.stringify(FIXTURES[mode], null, 2));
    state.input = null;
    state.verdict = null;
    state.raw = '';
    $('#npc-r2b-result').text('尚未运行判官。');
    disarm(true);
    status('已载入' + (mode === 'stance' ? '短指令立场' : '具体事件行动') + '样本，尚未调用 API。', 'ok');
}

function readInput() {
    let payload;
    try { payload = JSON.parse($('#npc-r2b-input').val()); }
    catch (e) { throw new Error('输入 JSON 无法解析：' + e.message); }
    if (payload?.schema !== 'npc-decision-input-r2b/1') throw new Error('输入 schema 不符合本实验版协议');
    if (!['stance', 'decision'].includes(payload.mode)) throw new Error('未知测试模式');
    if (!Array.isArray(payload?.task?.target_actor_ids) || !payload.task.target_actor_ids.length) throw new Error('缺少目标人物');
    return payload;
}

function parseJson(raw) {
    let s = String(raw || '').trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    try { return JSON.parse(s); } catch {
        const begin = s.indexOf('{'), end = s.lastIndexOf('}');
        if (begin < 0 || end <= begin) throw new Error('判官没有返回完整 JSON');
        return JSON.parse(s.slice(begin, end + 1));
    }
}

function validate(payload, verdict) {
    const errors = [];
    if (verdict?.schema !== 'npc-decision-r2b/1') errors.push('输出 schema 不匹配');
    if (verdict?.mode !== payload.mode) errors.push('输出 mode 与输入不同');
    if (!Array.isArray(verdict?.actors)) errors.push('输出缺少 actors 数组');
    if (!Array.isArray(verdict?.open_questions)) errors.push('输出缺少 open_questions 数组');
    if (errors.length) return errors;
    const expected = payload.task.target_actor_ids;
    const ids = verdict.actors.map(a => a?.id);
    if (ids.length !== expected.length || new Set(ids).size !== ids.length || expected.some(id => !ids.includes(id))) {
        errors.push('返回人物 ID 不符合目标清单');
    }
    for (const a of verdict.actors) {
        if (!a || typeof a !== 'object') { errors.push('人物数据无效'); continue; }
        const id = String(a.id || '未知人物');
        if (typeof a.interpretation !== 'string' || !Array.isArray(a.uncertain)
            || typeof a.own_priority !== 'string' || typeof a.initiative !== 'string'
            || !a.response || typeof a.response !== 'object' || !Array.isArray(a.response.conditions)
            || !Array.isArray(a.basis)) {
            errors.push(id + ' 缺少必要字段');
            continue;
        }
        const known = new Set([...(payload.actors?.[id]?.known_fact_ids || []), payload.actors?.[id]?.profile_id]);
        if (!a.basis.every(b => typeof b === 'string' && known.has(b))) {
            errors.push(id + ' 引用了不可知的事实编号');
        }
        if (!a.uncertain.every(x => typeof x === 'string')) {
            errors.push(id + ' uncertain 类型错误');
        }
        if (payload.mode === 'stance') {
            if (a.response.kind !== 'conditional' || a.response.action !== '' || a.response.conditions.length > 2) {
                errors.push(id + ' 不符合 stance 格式');
            }
            if (!a.response.conditions.every(c => typeof c?.observable_condition === 'string' && typeof c?.likely_response === 'string')) {
                errors.push(id + ' 条件响应格式错误');
            }
        } else if (a.response.kind !== 'concrete' || typeof a.response.action !== 'string'
            || !a.response.action.trim() || a.response.conditions.length !== 0) {
            errors.push(id + ' 没有选定唯一的具体行动');
        }
    }
    return errors;
}

function loadProfiles() {
    const s = settings();
    const el = $('#npc-r2b-profile').empty();
    el.append($('<option></option>').val('').text('请选择独立判官连接配置'));
    try {
        const profiles = ConnectionManagerRequestService.getSupportedProfiles();
        for (const p of profiles) {
            const model = String(p.model || '').toLowerCase();
            const recommendation = model.includes('3.5') && model.includes('flash-lite') ? '★ 日常实验候选 · '
                : model.includes('3.1') && model.includes('flash-lite') ? '省钱候选 · '
                : model.includes('3.8') && model.includes('flash') ? '复杂事件候选 · ' : '';
            el.append($('<option></option>').val(p.id).text(recommendation + (p.name || p.id) + (p.model ? ' · ' + p.model : '')));
        }
        el.val(s.profileId || '');
        if (!el.val()) el.val('');
    } catch (e) {
        console.warn('[NPC R2-B] Connection Profiles 不可用', e);
        el.append($('<option disabled></option>').text('连接配置管理器不可用'));
        status('无法读取 Connection Profiles。请在酒馆配置独立模型。', 'error');
    }
}

async function judge() {
    if (state.busy) return;
    const s = settings();
    if (!s.profileId) {
        status('请先选择独立判官连接配置，不会自动使用正文模型。', 'error');
        return;
    }
    let payload;
    try { payload = readInput(); } catch (e) { status(e.message, 'error'); return; }
    disarm(true);
    state.busy = true;
    state.input = null;
    state.verdict = null;
    state.raw = '';
    refreshButtons();
    $('#npc-r2b-result').text('正在等待判官结果……');
    status('正在调用辅助模型一次。本操作不调用昂贵的正文模型。', 'working');
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), Math.max(10, Number(s.timeoutSec) || 120) * 1000);
    const requestChat = getChatKey();
    try {
        const response = await ConnectionManagerRequestService.sendRequest(
            s.profileId,
            [{ role: 'system', content: JUDGE_PROMPT }, { role: 'user', content: JSON.stringify(payload) }],
            Math.max(512, Number(s.maxTokens) || 2400),
            { stream: false, extractData: true, includePreset: false, includeInstruct: false, signal: abort.signal },
        );
        if (requestChat !== getChatKey()) {
            status('请求期间切换了聊天，此次结果不应用于当前聊天。', 'error');
            return;
        }
        const raw = typeof response === 'string' ? response
            : typeof response?.content === 'string' ? response.content
            : Array.isArray(response?.content) ? response.content.map(x => x?.text || '').join('') : '';
        if (!raw.trim()) throw new Error('辅助模型没有返回可解析文本');
        state.raw = raw;
        const verdict = parseJson(raw);
        $('#npc-r2b-result').text(JSON.stringify(verdict, null, 2));
        const errors = validate(payload, verdict);
        if (errors.length) {
            status('模型输出可解析但未通过协议：' + errors.join('；') + '。不能注入。', 'error');
            return;
        }
        state.input = payload;
        state.verdict = verdict;
        status('结构与证据编号校验通过。请先人工检查人物逻辑，再决定是否注入。', 'ok');
        showTab('result');
    } catch (e) {
        $('#npc-r2b-result').text(state.raw || '无有效结果');
        console.error('[NPC R2-B] 判官失败', e);
        status('辅助模型请求失败：' + (e?.cause?.message || e?.message || String(e)), 'error');
    } finally {
        clearTimeout(timeout);
        state.busy = false;
        refreshButtons();
    }
}

function arm() {
    if (!state.verdict || !state.input) {
        status('请先运行并检查一次独立判定。', 'error');
        return;
    }
    if (state.input.mode !== 'stance') {
        status('decision 事件已经发生，不能将其直接注入此前的1月16日节点。先测试 stance。', 'error');
        return;
    }
    const mapping = String($('#npc-r2b-mapping').val() || '').trim();
    if (!mapping) { status('请先填写本次测试人物 ID 映射。', 'error'); return; }
    state.packet = INJECTION_TEMPLATE.replace(
        '[将独立模型返回的完整 JSON 粘贴到这里；不要粘贴本说明文件中的示例性文字]',
        JSON.stringify(state.verdict, null, 2),
    ).replace('A = 萧离（玩家角色）\nB = 萧薰儿\nC = 萧炎', mapping);
    state.chatKey = getChatKey();
    state.armed = true;
    state.used = false;
    applyPacket(state.packet);
    refreshButtons();
    status('已为当前聊天准备一次性注入。下一次正常生成不再调用辅助模型。', 'ok');
}

async function copyResult() {
    const value = state.raw || $('#npc-r2b-result').text();
    if (!value || value === '尚未运行判官。') return;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
        } else {
            const t = $('<textarea></textarea>').css({ position:'fixed', opacity:0 }).val(value).appendTo('body');
            t[0].select();
            if (!document.execCommand('copy')) throw new Error('复制失败');
            t.remove();
        }
        status('判官结果已复制。', 'ok');
    } catch {
        status('浏览器未授权复制，请长按结果区域手动复制。', 'error');
    }
}


function openPanel() {
    try {
        const overlay = $('#npc-r2b-overlay');
        if (!overlay.length) {
            console.error('[NPC R2-B] 未找到弹窗节点，插件界面可能尚未初始化。');
            if (typeof toastr !== 'undefined') toastr.error('NPC 面板尚未初始化，请刷新酒馆页面。', 'NPC R2-B');
            return;
        }
        loadProfiles();
        refreshButtons();
        overlay.addClass('r2b-visible').attr('aria-hidden', 'false');
        // SillyTavern installations use different modal/backdrop layers.
        // Force the active sheet on top without changing any persistent layout.
        overlay[0].style.setProperty('display', 'flex', 'important');
        overlay[0].style.setProperty('visibility', 'visible', 'important');
        overlay[0].style.setProperty('z-index', '2147483000', 'important');
        $('#npc-r2b-close').trigger('focus');
    } catch (e) {
        console.error('[NPC R2-B] 打开人物决策界面失败', e);
        if (typeof toastr !== 'undefined') toastr.error('无法打开 NPC 面板：' + (e?.message || e), 'NPC R2-B');
    }
}

function closePanel() {
    const overlay = $('#npc-r2b-overlay');
    overlay.removeClass('r2b-visible').attr('aria-hidden', 'true');
    if (overlay.length) {
        for (const name of ['display', 'visibility', 'z-index']) overlay[0].style.removeProperty(name);
    }
}

function showTab(tab) {
    if (!['test', 'result', 'inject', 'advanced'].includes(tab)) return;
    $('.npc-r2b-tab').each(function () {
        const selected = $(this).attr('data-tab') === tab;
        $(this).toggleClass('r2b-selected', selected)
            .attr('aria-selected', String(selected)).attr('tabindex', selected ? '0' : '-1');
    });
    $('.npc-r2b-view').each(function () {
        $(this).prop('hidden', $(this).attr('data-view') !== tab);
    });
    $('#npc-r2b-scroll').scrollTop(0);
}

function addWandEntry() {
    // Same wand menu container used by SillyTavern's built-in extensions.
    const menu = $('#extensionsMenu');
    if (!menu.length) {
        console.warn('[NPC R2-B] 魔杖菜单容器暂不存在，仍可通过扩展设置打开。');
        return;
    }
    if ($('#npc-r2b-wand').length) return;
    const item = $(
        '<div id="npc-r2b-wand" class="list-group-item flex-container flexGap5 interactable" ' +
        'role="button" tabindex="0" aria-label="打开NPC人物决策实验台">' +
        '<div class="fa-solid fa-brain extensionsMenuExtensionButton npc-r2b-wand-icon"></div>' +
        '<span>NPC · 人物决策</span></div>'
    );
    item.on('click', e => {
        e.preventDefault();
        // Let SillyTavern finish its wand-menu click/close handlers first.
        setTimeout(openPanel, 0);
    });
    item.on('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setTimeout(openPanel, 0);
        }
    });
    menu.prepend(item);
}

function mountUi() {
    // Keep one panel instance. Both entries open the same mobile-first dialog,
    // avoiding duplicate IDs or loss of state between settings and the wand menu.
    // Use SillyTavern's native inline-drawer structure, not a custom card.
    // Its delegated click handler and theme control the accordion appearance.
    const entry = $(
        '<div class="npc-r2b-settings-entry">' +
        '  <div class="inline-drawer">' +
        '    <div class="inline-drawer-toggle inline-drawer-header" role="button" tabindex="0" aria-label="展开NPC人物决策设置">' +
        '      <b>NPC · 人物决策</b>' +
        '      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>' +
        '    </div>' +
        '    <div class="inline-drawer-content" style="display:none">' +
        '      <p class="npc-r2b-settings-note">R2-B 实验版 · 独立判定 / 一次性注入</p>' +
        '      <button type="button" class="menu_button npc-r2b-open-button" id="npc-r2b-open">打开实验台</button>' +
        '    </div>' +
        '  </div>' +
        '</div>'
    );
    const settingsHost = $('#extensions_settings2').length ? $('#extensions_settings2') : $('#extensions_settings');
    settingsHost.append(entry);
    entry.find('#npc-r2b-open').on('click', e => {
        e.preventDefault();
        // Prevent any ancestor click handlers from closing the newly opened dialog.
        e.stopPropagation();
        setTimeout(openPanel, 0);
    });

    const root = $( [
        '<div class="npc-r2b-overlay" id="npc-r2b-overlay" aria-hidden="true">',
        '  <div class="npc-r2b-backdrop"></div>',
        '  <section class="npc-r2b-shell" role="dialog" aria-modal="true" aria-labelledby="npc-r2b-title">',
        '    <header class="npc-r2b-header">',
        '      <div class="npc-r2b-mark"><i class="fa-solid fa-brain"></i></div>',
        '      <div class="npc-r2b-heading"><span class="npc-r2b-eyebrow">NPC SIMULATOR · R2-B</span>',
        '        <h2 id="npc-r2b-title">人物决策实验台</h2>',
        '        <div class="npc-r2b-subtitle">独立模型先判定 · 主模型只写一次正文</div></div>',
        '      <button type="button" class="npc-r2b-close" id="npc-r2b-close" aria-label="关闭面板"><i class="fa-solid fa-xmark"></i></button>',
        '    </header>',
        '    <div class="npc-r2b-info-bar"><span class="npc-r2b-chip"><i class="fa-solid fa-flask"></i> 实验版</span>',
        '      <span class="npc-r2b-mini-state" id="npc-r2b-mini-state">尚未判定</span>',
        '      <span class="npc-r2b-info-spacer"></span><span class="npc-r2b-no-auto"><i class="fa-solid fa-lock"></i> 不自动调用API</span></div>',
        '    <nav class="npc-r2b-tabs" aria-label="实验功能">',
        '      <button type="button" class="npc-r2b-tab r2b-selected" data-tab="test" aria-selected="true"><i class="fa-solid fa-play"></i><span>判定</span></button>',
        '      <button type="button" class="npc-r2b-tab" data-tab="result" aria-selected="false"><i class="fa-solid fa-list-check"></i><span>结果</span></button>',
        '      <button type="button" class="npc-r2b-tab" data-tab="inject" aria-selected="false"><i class="fa-solid fa-file-import"></i><span>注入</span></button>',
        '      <button type="button" class="npc-r2b-tab" data-tab="advanced" aria-selected="false"><i class="fa-solid fa-gear"></i><span>设置</span></button>',
        '    </nav>',
        '    <main class="npc-r2b-scroll" id="npc-r2b-scroll">',
        '      <section class="npc-r2b-view" data-view="test">',
        '        <div class="npc-r2b-section-head"><h3>开始人物判定</h3><p>先用低成本模型检查人物立场，不需要生成正文。</p></div>',
        '        <div class="npc-r2b-card"><label class="npc-r2b-label" for="npc-r2b-profile">独立判官模型</label>',
        '          <div class="npc-r2b-field-row"><select class="text_pole" id="npc-r2b-profile"></select>',
        '            <button class="menu_button npc-r2b-quiet" id="npc-r2b-refresh" type="button" title="刷新连接配置"><i class="fa-solid fa-rotate"></i></button></div>',
        '          <p class="npc-r2b-hint">使用酒馆 Connection Profiles 中的辅助模型，不会自动切换到正文模型。</p></div>',
        '        <div class="npc-r2b-card"><label class="npc-r2b-label" for="npc-r2b-mode">测试场景</label>',
        '          <div class="npc-r2b-field-row"><select class="text_pole" id="npc-r2b-mode">',
        '            <option value="stance">B · 短指令下的人物立场</option>',
        '            <option value="decision">A · 已发生事件的下一行动</option></select>',
        '            <button type="button" class="menu_button npc-r2b-quiet" id="npc-r2b-load">重载样本</button></div>',
        '          <p class="npc-r2b-hint">共用通用规则；角色数据仅用于本次《斗破苍穹》对照。</p>',
        '          <details class="npc-r2b-expand"><summary><i class="fa-solid fa-code"></i> 查看 / 编辑输入数据</summary>',
        '            <textarea id="npc-r2b-input" spellcheck="false" aria-label="人物决策输入JSON"></textarea></details></div>',
        '        <button type="button" class="menu_button npc-r2b-primary" id="npc-r2b-judge"><i class="fa-solid fa-brain"></i> 运行一次独立判官</button>',
        '        <p class="npc-r2b-caption">该按钮只调用一次选定的辅助 API；不会调用 Gemini 正文、重 Roll 或修改游戏存档。</p>',
        '      </section>',
        '      <section class="npc-r2b-view" data-view="result" hidden>',
        '        <div class="npc-r2b-section-head"><h3>人物判断结果</h3><p>检查人物的依据、未知信息和具体行动，不以拒绝率衡量成功。</p></div>',
        '        <div class="npc-r2b-card"><div class="npc-r2b-result-top"><strong>判官 JSON</strong>',
        '          <button type="button" class="menu_button npc-r2b-quiet" id="npc-r2b-copy"><i class="fa-solid fa-copy"></i> 复制</button></div>',
        '          <pre id="npc-r2b-result">尚未运行判官。</pre></div>',
        '        <p class="npc-r2b-caption">格式与证据编号通过校验，不等于人物心理判断已经经过验证。</p>',
        '        <button class="menu_button npc-r2b-secondary" type="button" id="npc-r2b-to-inject">下一步：进入注入页 <i class="fa-solid fa-arrow-right"></i></button>',
        '      </section>',
        '      <section class="npc-r2b-view" data-view="inject" hidden>',
        '        <div class="npc-r2b-section-head"><h3>下一轮正文注入</h3><p>使用已生成的判断，不再请求第二次辅助 API。</p></div>',
        '        <div class="npc-r2b-warning"><i class="fa-solid fa-triangle-exclamation"></i><span>只在原剧情的<b>测试分支</b>使用。先切到1月16日拒绝后的节点，不能继承后来候选剧情。</span></div>',
        '        <div class="npc-r2b-card"><label class="npc-r2b-label" for="npc-r2b-mapping">人物 ID 对应关系</label>',
        '          <textarea id="npc-r2b-mapping" aria-label="人物ID映射"></textarea>',
        '          <div class="npc-r2b-field-row"><button type="button" class="menu_button npc-r2b-primary npc-r2b-grow" id="npc-r2b-arm"><i class="fa-solid fa-link"></i> 注入下一轮正文</button>',
        '          <button type="button" class="menu_button npc-r2b-quiet" id="npc-r2b-cancel">取消</button></div>',
        '          <div class="npc-r2b-armed-status" id="npc-r2b-ready">未准备注入</div></div>',
        '        <p class="npc-r2b-caption">本实验版只支持 stance 样本在对应的短指令历史节点注入。它不会编辑原有预设、世界书或关系数值。</p>',
        '      </section>',
        '      <section class="npc-r2b-view" data-view="advanced" hidden>',
        '        <div class="npc-r2b-section-head"><h3>实验参数</h3><p>保持简单，实际模型仍由酒馆连接配置管理。</p></div>',
        '        <div class="npc-r2b-card"><div class="npc-r2b-settings-grid">',
        '          <label>输出 Token 上限<input type="number" min="512" max="8192" class="text_pole" id="npc-r2b-tokens"></label>',
        '          <label>超时（秒）<input type="number" min="10" max="300" class="text_pole" id="npc-r2b-timeout"></label>',
        '          </div><p class="npc-r2b-hint">模型花费取决于你实际选择的连接配置及服务商价格。</p></div>',
        '        <div class="npc-r2b-card"><details class="npc-r2b-expand"><summary><i class="fa-solid fa-scroll"></i> 查看通用判官提示词</summary>',
        '          <textarea id="npc-r2b-prompt" readonly></textarea></details></div>',
        '        <div class="npc-r2b-card"><strong>当前限制</strong><p class="npc-r2b-hint">没有自动读取世界书、自动触发、长期人物记忆和成本统计。完整 v1.0 会在本轮人物决策测试通过后逐步开发。</p></div>',
        '      </section>',
        '    </main>',
        '    <footer class="npc-r2b-footer"><div class="npc-r2b-status" id="npc-r2b-status" role="status">准备就绪。</div></footer>',
        '  </section>',
        '</div>',
    ].join(''));
    $('body').append(root);
    const s = settings();
    $('#npc-r2b-prompt').val(JUDGE_PROMPT);
    $('#npc-r2b-mapping').val('A = 萧离（玩家角色）\nB = 萧薰儿\nC = 萧炎');
    $('#npc-r2b-tokens').val(s.maxTokens).on('change', function () {
        s.maxTokens = Math.max(512, Math.min(8192, Number($(this).val()) || 2400));
        saveSettingsDebounced();
    });
    $('#npc-r2b-timeout').val(s.timeoutSec).on('change', function () {
        s.timeoutSec = Math.max(10, Math.min(300, Number($(this).val()) || 120));
        saveSettingsDebounced();
    });
    $('#npc-r2b-profile').on('change', function () {
        s.profileId = String($(this).val() || '');
        saveSettingsDebounced();
    });
    $('#npc-r2b-refresh').on('click', loadProfiles);
    $('#npc-r2b-mode').on('change', loadFixture);
    $('#npc-r2b-load').on('click', loadFixture);
    $('#npc-r2b-judge').on('click', judge);
    $('#npc-r2b-arm').on('click', arm);
    $('#npc-r2b-cancel').on('click', () => disarm());
    $('#npc-r2b-copy').on('click', copyResult);
    $('#npc-r2b-to-inject').on('click', () => showTab('inject'));
    $('#npc-r2b-close, .npc-r2b-backdrop').on('click', closePanel);
    $('.npc-r2b-tab').on('click', function () {
        showTab($(this).attr('data-tab'));
    });
    $(document).on('keydown.npcR2B', function (e) {
        if (e.key === 'Escape' && $('#npc-r2b-overlay').hasClass('r2b-visible')) closePanel();
    });
    loadProfiles();
    loadFixture();
    refreshButtons();
    showTab('test');
    addWandEntry();
    // Some SillyTavern builds create/recreate the wand menu after extensions load.
    // Retry without duplicating entries or making API requests.
    setTimeout(addWandEntry, 700);
    setTimeout(addWandEntry, 2200);
}

globalThis.npcR2BInterceptor = async function(chat, contextSize, abort, type) {
    if (!state.armed) { applyPacket(''); return; }
    if (getChatKey() !== state.chatKey) { disarm(true); return; }
    if (['quiet','impersonate','continue','swipe'].includes(type)) return;
    if (!Array.isArray(chat) || !chat.length) return;
    applyPacket(state.packet);
    state.used = true;
};

function generationEnded() {
    if (!state.armed || !state.used) return;
    disarm(true);
    status('一次性注入完成，未调用附加模型，也未更改现有好感、关系或档案。', 'ok');
}

jQuery(() => {
    try {
        mountUi();
    } catch (e) {
        console.error('[NPC R2-B] 实验台初始化失败', e);
        if (typeof toastr !== 'undefined') toastr.error('NPC 插件界面初始化失败：' + (e?.message || e), 'NPC R2-B');
    }
    eventSource.on(event_types.GENERATION_ENDED, generationEnded);
    eventSource.on(event_types.GENERATION_STOPPED, generationEnded);
    eventSource.on(event_types.CHAT_CHANGED, () => {
        addWandEntry();
        if (state.armed && getChatKey() !== state.chatKey) {
            disarm(true);
            status('切换了聊天，已取消原聊天的一次性注入。', 'error');
        }
    });
    if (event_types.APP_READY) eventSource.on(event_types.APP_READY, addWandEntry);
    console.log('[NPC R2-B] 可安装实验插件已加载，默认不触发任何 API 请求。');
});
