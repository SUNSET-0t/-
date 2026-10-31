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

function mountUi() {
    const root = $('<div class="npc-r2b"></div>');
    root.html([
        '<div class="inline-drawer">',
        '<div class="inline-drawer-toggle inline-drawer-header"><b>NPC R2-B · 决策实验台</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>',
        '<div class="inline-drawer-content npc-r2b-body">',
        '<p class="npc-r2b-muted">实验版：独立模型判定一次，再按需注入正文一次。不自动调用、不修改存档、不重 Roll。</p>',
        '<label>独立判官模型</label>',
        '<div class="npc-r2b-row"><select class="text_pole" id="npc-r2b-profile"></select><button class="menu_button" id="npc-r2b-refresh">刷新</button></div>',
        '<div class="npc-r2b-row"><label>输出 Token <input class="text_pole" type="number" min="512" max="8192" id="npc-r2b-tokens"></label>',
        '<label>超时秒数 <input class="text_pole" type="number" min="10" max="300" id="npc-r2b-timeout"></label></div>',
        '<label>测试模式</label>',
        '<div class="npc-r2b-row"><select class="text_pole" id="npc-r2b-mode"><option value="stance">B · 短指令立场（先测试）</option><option value="decision">A · 具体事件行动（独立单元测试）</option></select><button class="menu_button" id="npc-r2b-load">载入样本</button></div>',
        '<label>判官输入 JSON（可编辑）</label><textarea id="npc-r2b-input" spellcheck="false"></textarea>',
        '<details><summary>通用判官提示词（只读）</summary><textarea id="npc-r2b-prompt" readonly></textarea></details>',
        '<button class="menu_button npc-r2b-primary" id="npc-r2b-judge">运行独立判官（只调用辅助模型）</button>',
        '<div id="npc-r2b-status" role="status">请选择模型并载入样本。</div>',
        '<label>判定结果</label><pre id="npc-r2b-result">尚未运行判官。</pre>',
        '<button class="menu_button" id="npc-r2b-copy">复制判官结果</button>',
        '<details><summary>正文注入（仅在测试分支使用）</summary>',
        '<p class="npc-r2b-muted">先在独立测试聊天运行判官并检查 JSON；切换到原剧情的测试分支后，再打开这里注入。不要在正式游戏存档直接测试。</p>',
        '<label>人物 ID 映射</label><textarea id="npc-r2b-mapping"></textarea>',
        '<div class="npc-r2b-row"><button class="menu_button" id="npc-r2b-arm">注入下一轮正文</button><button class="menu_button" id="npc-r2b-cancel">取消注入</button></div>',
        '<div class="npc-r2b-muted" id="npc-r2b-ready">未准备注入</div></details>',
        '<p class="npc-r2b-muted">本版本没有自动提取全世界书、长期人物档案、关系存储或自动双 API 调度。</p>',
        '</div></div>',
    ].join(''));
    $('#extensions_settings2').append(root);
    const s = settings();
    $('#npc-r2b-prompt').val(JUDGE_PROMPT);
    $('#npc-r2b-mapping').val('A = 萧离（玩家角色）\nB = 萧薰儿\nC = 萧炎');
    $('#npc-r2b-tokens').val(s.maxTokens).on('change', function() {
        s.maxTokens = Math.max(512, Math.min(8192, Number($(this).val()) || 2400));
        saveSettingsDebounced();
    });
    $('#npc-r2b-timeout').val(s.timeoutSec).on('change', function() {
        s.timeoutSec = Math.max(10, Math.min(300, Number($(this).val()) || 120));
        saveSettingsDebounced();
    });
    $('#npc-r2b-profile').on('change', function() {
        s.profileId = String($(this).val() || ''); saveSettingsDebounced();
    });
    $('#npc-r2b-refresh').on('click', loadProfiles);
    $('#npc-r2b-mode').on('change', loadFixture);
    $('#npc-r2b-load').on('click', loadFixture);
    $('#npc-r2b-judge').on('click', judge);
    $('#npc-r2b-arm').on('click', arm);
    $('#npc-r2b-cancel').on('click', () => disarm());
    $('#npc-r2b-copy').on('click', copyResult);
    loadProfiles();
    loadFixture();
    refreshButtons();
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
    mountUi();
    eventSource.on(event_types.GENERATION_ENDED, generationEnded);
    eventSource.on(event_types.GENERATION_STOPPED, generationEnded);
    eventSource.on(event_types.CHAT_CHANGED, () => {
        if (state.armed && getChatKey() !== state.chatKey) {
            disarm(true);
            status('切换了聊天，已取消原聊天的一次性注入。', 'error');
        }
    });
    console.log('[NPC R2-B] 可安装实验插件已加载，默认不触发任何 API 请求。');
});
