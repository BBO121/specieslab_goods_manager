/* =========================================================
   종족연구소 업데이트 플래너 (개인용, localStorage 전용)
   - 기존 굿즈 매니저(js/app.js)와 localStorage 키가 겹치지 않도록
     별도 키(PLANNER_KEY)를 사용한다.
   ========================================================= */
(function () {
    'use strict';

    const PLANNER_KEY = 'specieslabUpdatePlanner';
    const PRE_IMPORT_KEY = 'specieslabUpdatePlanner.preImportBackup';
    const CORRUPT_KEY = 'specieslabUpdatePlanner.corruptRaw';
    const DATA_VERSION = 1;
    const APP_ID = 'specieslab-update-planner';
    const SAVE_DELAY = 600;

    const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

    const FORE_COLORS = [
        { value: '#2a2925', label: '기본' },
        { value: '#c2453d', label: '빨강' },
        { value: '#d27a1f', label: '주황' },
        { value: '#2f6fb3', label: '파랑' },
        { value: '#2f7d4f', label: '초록' },
        { value: '#7a4bb0', label: '보라' },
        { value: '#8d887c', label: '회색' }
    ];
    const HILITE_COLORS = [
        { value: 'transparent', label: '형광펜 없음', none: true },
        { value: '#fff1a8', label: '노랑' },
        { value: '#cdeccf', label: '연두' },
        { value: '#cfe4fb', label: '하늘' },
        { value: '#fad4d4', label: '분홍' },
        { value: '#e6dcf6', label: '연보라' }
    ];

    /* ---------------- 상태 ---------------- */
    let state = null;          // { version, months: { 'YYYY-MM': { title, entries: [...] } }, meta: {...} }
    let currentMonth = '';     // 'YYYY-MM'
    let saveTimer = null;
    let storageBlocked = false; // 손상된 데이터를 감지하면 덮어쓰지 않도록 차단

    const $ = (id) => document.getElementById(id);
    const els = {
        monthTitle: $('monthTitle'),
        prev: $('prevMonthBtn'),
        next: $('nextMonthBtn'),
        today: $('todayMonthBtn'),
        status: $('saveStatus'),
        exportBtn: $('exportBtn'),
        importBtn: $('importBtn'),
        importFile: $('importFile'),
        addForm: $('addForm'),
        addDate: $('addDateInput'),
        entries: $('entries'),
        empty: $('emptyState'),
        count: $('entryCount'),
        template: $('entryTemplate'),
        modal: $('entryModal'),
        modalPanel: document.querySelector('#entryModal .modal-panel'),
        modalEditor: document.querySelector('#entryModal .modal-editor'),
        modalClose: $('modalCloseBtn')
    };
    let modalReturnFocus = null; // 모달을 닫은 뒤 포커스를 돌려줄 확대 버튼

    /* ---------------- 유틸 ---------------- */
    function pad(n) { return String(n).padStart(2, '0'); }

    function todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function monthKeyOf(dateStr) { return dateStr.slice(0, 7); }

    function parseDate(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function isValidDateStr(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const d = parseDate(s);
        return !isNaN(d) && formatISO(d) === s;
    }

    function isValidMonthKey(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }

    function formatISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

    function shiftMonth(key, delta) {
        const [y, m] = key.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    }

    function defaultTitle(key) {
        const [y, m] = key.split('-').map(Number);
        return `${y}년 ${m}월 업데이트`;
    }

    function newId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    }

    function nowIso() { return new Date().toISOString(); }

    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ---------------- 서식 HTML 정리 (불러온 데이터 안전 처리) ---------------- */
    const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SPAN', 'FONT', 'DIV', 'P', 'BR']);
    const ALLOWED_STYLES = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line'];

    function sanitizeHtml(html) {
        const tpl = document.createElement('template');
        tpl.innerHTML = typeof html === 'string' ? html : '';
        cleanNode(tpl.content);
        return tpl.innerHTML;
    }

    function cleanNode(parent) {
        Array.from(parent.childNodes).forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) return;
            if (node.nodeType !== Node.ELEMENT_NODE) { node.remove(); return; }
            if (!ALLOWED_TAGS.has(node.tagName)) {
                if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(node.tagName)) {
                    node.remove();
                } else {
                    // 허용되지 않은 태그는 내용만 남긴다
                    cleanNode(node);
                    node.replaceWith(...Array.from(node.childNodes));
                }
                return;
            }
            const keepStyle = [];
            ALLOWED_STYLES.forEach((prop) => {
                const v = node.style && node.style.getPropertyValue(prop);
                if (v) keepStyle.push(`${prop}: ${v}`);
            });
            const fontColor = node.tagName === 'FONT' ? node.getAttribute('color') : null;
            Array.from(node.attributes).forEach((a) => node.removeAttribute(a.name));
            if (keepStyle.length) node.setAttribute('style', keepStyle.join('; '));
            if (fontColor && /^#?[\w]+$/.test(fontColor)) node.setAttribute('color', fontColor);
            cleanNode(node);
        });
    }

    /* ---------------- 저장/불러오기 ---------------- */
    function createEmptyState() {
        return { version: DATA_VERSION, months: {}, meta: { lastViewedMonth: null } };
    }

    function linesToHtml(lines) {
        return lines.map((line) => {
            if (line === '') return '<div><br></div>';
            if (line.startsWith('**') && line.endsWith('**')) return `<div><b>${escapeHtml(line.slice(2, -2))}</b></div>`;
            return `<div>${escapeHtml(line)}</div>`;
        }).join('');
    }

    function createSampleState() {
        const s = createEmptyState();
        const mk = (date, lines) => ({ id: newId(), date, content: linesToHtml(lines), createdAt: nowIso(), updatedAt: nowIso() });
        s.months['2026-10'] = {
            title: '2026년 10월 업데이트',
            entries: [
                mk('2026-10-10', ['ㅇㅇㅇ']),
                mk('2026-10-17', ['상점 - 묘부니 프레임 스티커']),
                mk('2026-10-24', ['ㅇㅇㅇ']),
                mk('2026-10-31', ['ㅇㅇㅇ']),
                mk('2026-11-01', [
                    '**11월 LABBER 업데이트 — 신규 특성**',
                    '',
                    '특성명: 액체 조형',
                    '파일명: trait_cartridge_liquid_sculpt.png',
                    '등급: 특이',
                    '설명: 포드의 액체를 일정한 형태로 조형하여 신체에 연결된 구조로 표현할 수 있습니다. 꼬리 등 신체에서 크게 돌출되는 형태로 조형할 수 있습니다.',
                    '',
                    '특성 아이템: 조형 카트리지',
                    '파일명: item_cartridge_liquid_sculpt.png',
                    '등급: 특이',
                    '획득처: 조합소',
                    '조합법: 빈 카트리지 ×1 + 폐기된 회로기판 ×5 + 오래된 퓨즈 ×3',
                    '설명: 포드의 액체를 특정한 형태로 조형하여 신체에 연결하는 카트리지. LABBER에게 액체 조형 특성을 적용할 수 있다.'
                ])
            ]
        };
        s.meta.lastViewedMonth = '2026-10';
        return s;
    }

    // 외부(JSON 파일 / localStorage)에서 들어온 데이터를 현재 구조로 정규화
    function normalizeState(raw) {
        if (!raw || typeof raw !== 'object') throw new Error('데이터 형식이 올바르지 않습니다.');
        // 백업 파일 래퍼 { app, version, data: {...} } 지원
        if (raw.data && typeof raw.data === 'object' && raw.data.months) raw = raw.data;
        // version 없이 월 맵만 있는 형태도 허용
        const monthsSrc = raw.months && typeof raw.months === 'object' ? raw.months : raw;

        const out = createEmptyState();
        Object.keys(monthsSrc).forEach((key) => {
            if (!isValidMonthKey(key)) return;
            const m = monthsSrc[key];
            if (!m || !Array.isArray(m.entries)) return;
            const entries = m.entries
                .filter((e) => e && isValidDateStr(e.date))
                .map((e) => ({
                    id: typeof e.id === 'string' && e.id ? e.id : newId(),
                    date: e.date,
                    content: sanitizeHtml(e.content || ''),
                    createdAt: e.createdAt || nowIso(),
                    updatedAt: e.updatedAt || nowIso()
                }));
            out.months[key] = { title: typeof m.title === 'string' && m.title ? m.title : defaultTitle(key), entries };
        });
        if (raw.meta && isValidMonthKey(raw.meta.lastViewedMonth)) out.meta.lastViewedMonth = raw.meta.lastViewedMonth;
        return out;
    }

    function loadState() {
        let raw = null;
        try {
            raw = localStorage.getItem(PLANNER_KEY);
        } catch (err) {
            storageBlocked = true;
            setStatus('error', '저장소 접근 불가');
            return createEmptyState();
        }
        if (raw === null) {
            // 최초 실행: 데이터가 전혀 없을 때만 샘플 생성
            const sample = createSampleState();
            writeStorage(sample);
            return sample;
        }
        try {
            return normalizeState(JSON.parse(raw));
        } catch (err) {
            // 손상된 데이터는 덮어쓰지 않고 따로 보관한 뒤 자동 저장을 멈춘다
            try { localStorage.setItem(CORRUPT_KEY, raw); } catch (e) { /* noop */ }
            storageBlocked = true;
            alert('저장된 플래너 데이터를 읽을 수 없습니다.\n원본은 "' + CORRUPT_KEY + '" 키에 보관했고, 데이터 보호를 위해 자동 저장을 중지합니다.\n백업 불러오기로 복원해 주세요.');
            setStatus('error', '자동 저장 중지됨');
            return createEmptyState();
        }
    }

    function writeStorage(data) {
        localStorage.setItem(PLANNER_KEY, JSON.stringify(data));
    }

    function setStatus(stateName, text) {
        els.status.dataset.state = stateName;
        els.status.textContent = text;
    }

    function scheduleSave() {
        if (storageBlocked) return;
        setStatus('saving', '저장 중...');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, SAVE_DELAY);
    }

    function saveNow() {
        clearTimeout(saveTimer);
        saveTimer = null;
        if (storageBlocked) return;
        try {
            writeStorage(state);
            const d = new Date();
            setStatus('saved', `저장됨 ${pad(d.getHours())}:${pad(d.getMinutes())}`);
        } catch (err) {
            setStatus('error', '저장 실패! 백업을 내보내 주세요');
            console.error(err);
        }
    }

    function flushSave() {
        if (saveTimer) saveNow();
    }

    /* ---------------- 월 데이터 접근 ---------------- */
    function getMonth(key, create) {
        if (!state.months[key] && create) {
            state.months[key] = { title: defaultTitle(key), entries: [] };
        }
        return state.months[key] || null;
    }

    function sortEntries(month) {
        month.entries.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
        });
    }

    function findEntry(id) {
        const month = getMonth(currentMonth, false);
        return month ? month.entries.find((e) => e.id === id) : null;
    }

    /* ---------------- 렌더링 ---------------- */
    function suggestDate() {
        const month = getMonth(currentMonth, false);
        if (month && month.entries.length) {
            const last = parseDate(month.entries[month.entries.length - 1].date);
            last.setDate(last.getDate() + 7);
            return formatISO(last);
        }
        const today = todayStr();
        return monthKeyOf(today) === currentMonth ? today : `${currentMonth}-01`;
    }

    function renderMonth() {
        const month = getMonth(currentMonth, false);
        els.monthTitle.textContent = month ? month.title : defaultTitle(currentMonth);
        document.title = `${defaultTitle(currentMonth)} · 종족연구소 업데이트 플래너`;

        const entries = month ? month.entries : [];
        els.entries.innerHTML = '';
        entries.forEach((entry) => els.entries.appendChild(buildEntry(entry)));

        els.empty.hidden = entries.length > 0;
        els.count.textContent = `${entries.length}개의 일정`;
        els.addDate.value = suggestDate();
    }

    function buildEntry(entry) {
        const node = els.template.content.firstElementChild.cloneNode(true);
        node.dataset.id = entry.id;
        applyDateToCard(node, entry.date);
        buildSwatches(node);

        const editor = node.querySelector('.editor');
        editor.innerHTML = entry.content || '';
        normalizeEmptyEditor(editor);
        return node;
    }

    // 서식 스와치 (카드/모달 공용)
    function buildSwatches(root) {
        root.querySelectorAll('.swatches').forEach((box) => {
            const list = box.dataset.kind === 'fore' ? FORE_COLORS : HILITE_COLORS;
            list.forEach((c) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'swatch' + (c.none ? ' none' : '');
                b.title = c.label;
                b.style.background = c.none ? '#fff' : c.value;
                b.dataset.cmd = box.dataset.kind === 'fore' ? 'foreColor' : 'hiliteColor';
                b.dataset.value = c.value;
                box.appendChild(b);
            });
        });
    }

    // 카드/모달 공용 날짜 표시 (모달에는 날짜 input이 없음)
    function applyDateToCard(card, dateStr) {
        const d = parseDate(dateStr);
        const [cy] = currentMonth.split('-').map(Number);
        card.dataset.dow = d.getDay();
        card.querySelector('.entry-year').textContent = d.getFullYear() !== cy ? `${d.getFullYear()}년` : '';
        card.querySelector('.entry-day').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일`;
        card.querySelector('.entry-weekday').textContent = WEEKDAYS[d.getDay()];
        const input = card.querySelector('.entry-date-input');
        if (input) input.value = dateStr;
    }

    function cardEditorOf(id) {
        const card = els.entries.querySelector(`.entry[data-id="${CSS.escape(id)}"]`);
        return card ? card.querySelector('.editor') : null;
    }

    /* ---------------- 확대 편집 모달 ---------------- */
    // 모달은 entry.content를 직접 읽고 쓰며, 수정 시 원래 카드 에디터에도 즉시 반영한다.
    function isModalOpen() { return !els.modal.hidden; }

    function openModal(id, returnFocusEl) {
        const entry = findEntry(id);
        if (!entry) return;
        flushSave();
        els.modalPanel.dataset.id = entry.id;
        applyDateToCard(els.modalPanel, entry.date);
        els.modalEditor.innerHTML = entry.content || '';
        normalizeEmptyEditor(els.modalEditor);
        modalReturnFocus = returnFocusEl || null;
        els.modal.hidden = false;
        document.body.classList.add('modal-open');
        els.modalPanel.querySelector('.modal-body').scrollTop = 0;
        els.modalEditor.focus({ preventScroll: true });
    }

    function closeModal(skipFlush) {
        if (!isModalOpen()) return;
        if (!skipFlush) flushSave();
        els.modal.hidden = true;
        document.body.classList.remove('modal-open');
        delete els.modalPanel.dataset.id;
        els.modalEditor.innerHTML = '';
        if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus({ preventScroll: true });
        modalReturnFocus = null;
        updateToolbarState();
    }

    // 내용을 모두 지웠을 때 남는 <br> 등을 비워 placeholder가 보이도록
    function normalizeEmptyEditor(editor) {
        if (editor.textContent.trim() === '' && !editor.querySelector('img')) {
            const onlyBreaks = editor.innerHTML.replace(/<br\s*\/?>|<div>|<\/div>|\s/gi, '') === '';
            if (onlyBreaks) editor.innerHTML = '';
        }
    }

    function flashCard(id) {
        const card = els.entries.querySelector(`.entry[data-id="${CSS.escape(id)}"]`);
        if (!card) return null;
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.remove('flash');
        void card.offsetWidth;
        card.classList.add('flash');
        return card;
    }

    /* ---------------- 이동 ---------------- */
    function goToMonth(key) {
        closeModal();
        flushSave();
        currentMonth = key;
        state.meta.lastViewedMonth = key;
        renderMonth();
        scheduleSave();
        window.scrollTo({ top: 0 });
    }

    /* ---------------- 에디터 명령 ---------------- */
    function ensureSelectionIn(editor) {
        const sel = window.getSelection();
        if (sel.rangeCount && editor.contains(sel.anchorNode)) return;
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function runCommand(card, cmd, value) {
        const editor = card.querySelector('.editor');
        ensureSelectionIn(editor);
        document.execCommand('styleWithCSS', false, true);
        if (cmd === 'hiliteColor') {
            // 일부 브라우저는 hiliteColor 미지원 → backColor로 대체
            if (!document.execCommand('hiliteColor', false, value)) document.execCommand('backColor', false, value);
        } else {
            document.execCommand(cmd, false, value || null);
        }
        handleEditorInput(editor);
        updateToolbarState();
    }

    // 카드 에디터와 모달 에디터 모두 이 함수로 entry.content(단일 원본)를 갱신한다
    function handleEditorInput(editor) {
        const owner = editor.closest('[data-id]');
        const entry = owner && findEntry(owner.dataset.id);
        if (!entry) return;
        normalizeEmptyEditor(editor);
        entry.content = editor.innerHTML;
        entry.updatedAt = nowIso();
        if (editor === els.modalEditor) {
            const cardEditor = cardEditorOf(entry.id);
            if (cardEditor) cardEditor.innerHTML = entry.content;
        }
        scheduleSave();
    }

    function updateToolbarState() {
        const sel = window.getSelection();
        const anchor = sel.rangeCount ? sel.anchorNode : null;
        const editor = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement)?.closest('.editor');
        document.querySelectorAll('.fmt-btn[data-cmd]').forEach((b) => b.classList.remove('active'));
        if (!editor) return;
        const owner = editor.closest('[data-id]');
        if (!owner) return;
        ['bold', 'italic', 'underline', 'strikeThrough'].forEach((cmd) => {
            let on = false;
            try { on = document.queryCommandState(cmd); } catch (e) { /* noop */ }
            const btn = owner.querySelector(`.fmt-btn[data-cmd="${cmd}"]`);
            if (btn) btn.classList.toggle('active', on);
        });
    }

    /* ---------------- 이벤트 ---------------- */
    function bindEvents() {
        els.prev.addEventListener('click', () => goToMonth(shiftMonth(currentMonth, -1)));
        els.next.addEventListener('click', () => goToMonth(shiftMonth(currentMonth, 1)));
        els.today.addEventListener('click', () => goToMonth(monthKeyOf(todayStr())));

        els.addForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const date = els.addDate.value;
            if (!isValidDateStr(date)) { alert('날짜를 선택해 주세요.'); return; }
            const month = getMonth(currentMonth, true);
            const entry = { id: newId(), date, content: '', createdAt: nowIso(), updatedAt: nowIso() };
            month.entries.push(entry);
            sortEntries(month);
            renderMonth();
            saveNow();
            const card = flashCard(entry.id);
            if (card) card.querySelector('.editor').focus({ preventScroll: true });
        });

        // 툴바 버튼: mousedown에서 기본동작을 막아 에디터 선택 영역을 유지 (카드/모달 공용)
        document.addEventListener('mousedown', (e) => {
            if (e.target.closest('.fmt-btn, .swatch')) e.preventDefault();
        });

        document.addEventListener('click', (e) => {
            const fmt = e.target.closest('.fmt-btn, .swatch');
            const owner = fmt && fmt.closest('[data-id]');
            if (owner) runCommand(owner, fmt.dataset.cmd, fmt.dataset.value);
        });

        els.entries.addEventListener('click', (e) => {
            const card = e.target.closest('.entry');
            if (!card) return;

            const expand = e.target.closest('[data-action="expand"]');
            if (expand) { openModal(card.dataset.id, expand); return; }

            if (e.target.closest('[data-action="delete"]')) {
                const entry = findEntry(card.dataset.id);
                if (!entry) return;
                const label = card.querySelector('.entry-day').textContent + ' (' + card.querySelector('.entry-weekday').textContent + ')';
                const hasText = card.querySelector('.editor').textContent.trim().length > 0;
                const msg = `${label} 카드를 삭제할까요?` + (hasText ? '\n작성한 내용도 함께 삭제되며 되돌릴 수 없습니다.' : '');
                if (!confirm(msg)) return;
                const month = getMonth(currentMonth, false);
                month.entries = month.entries.filter((x) => x.id !== entry.id);
                renderMonth();
                saveNow();
            }
        });

        els.entries.addEventListener('change', (e) => {
            if (!e.target.classList.contains('entry-date-input')) return;
            const card = e.target.closest('.entry');
            const entry = findEntry(card.dataset.id);
            if (!entry) return;
            const date = e.target.value;
            if (!isValidDateStr(date)) { e.target.value = entry.date; return; }
            entry.date = date;
            entry.updatedAt = nowIso();
            sortEntries(getMonth(currentMonth, false));
            renderMonth();
            saveNow();
            flashCard(entry.id);
        });

        // 에디터 입력/붙여넣기/Tab 처리 (카드/모달 공용)
        document.addEventListener('input', (e) => {
            if (e.target.classList && e.target.classList.contains('editor')) handleEditorInput(e.target);
        });

        // 붙여넣기는 일반 텍스트로 (외부 서식/스크립트 유입 방지)
        document.addEventListener('paste', (e) => {
            if (!e.target.closest || !e.target.closest('.editor')) return;
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            document.execCommand('insertText', false, text);
        });

        document.addEventListener('keydown', (e) => {
            // ESC로 모달 닫기
            if (e.key === 'Escape' && isModalOpen()) { e.preventDefault(); closeModal(); return; }
            // Tab 키로 들여쓰기 대신 공백 입력 (포커스 이탈 방지)
            if (e.key === 'Tab' && e.target.closest && e.target.closest('.editor') && !e.shiftKey) {
                e.preventDefault();
                document.execCommand('insertText', false, '    ');
            }
        });

        // 모달 닫기: X 버튼 / 바깥 overlay 클릭
        // (모달 안에서 드래그를 시작해 바깥에서 놓은 경우는 닫지 않도록 mousedown 위치도 확인)
        els.modalClose.addEventListener('click', () => closeModal());
        let overlayPressed = false;
        els.modal.addEventListener('mousedown', (e) => { overlayPressed = e.target === els.modal; });
        els.modal.addEventListener('click', (e) => {
            if (e.target === els.modal && overlayPressed) closeModal();
            overlayPressed = false;
        });

        document.addEventListener('selectionchange', updateToolbarState);

        // 페이지를 닫거나 탭을 숨길 때 대기 중인 저장을 즉시 실행
        window.addEventListener('beforeunload', flushSave);
        window.addEventListener('pagehide', flushSave);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

        // 다른 탭에서 수정한 경우 반영
        window.addEventListener('storage', (e) => {
            if (e.key !== PLANNER_KEY || e.newValue === null) return;
            try {
                const next = normalizeState(JSON.parse(e.newValue));
                closeModal(true); // 다른 탭의 최신 데이터를 덮어쓰지 않도록 저장 없이 닫기
                state = next;
                renderMonth();
                setStatus('saved', '다른 탭의 변경 반영됨');
            } catch (err) { /* noop */ }
        });

        els.exportBtn.addEventListener('click', exportBackup);
        els.importBtn.addEventListener('click', () => { els.importFile.value = ''; els.importFile.click(); });
        els.importFile.addEventListener('change', importBackup);
    }

    /* ---------------- 백업 ---------------- */
    function exportBackup() {
        flushSave();
        const d = new Date();
        const payload = {
            app: APP_ID,
            version: DATA_VERSION,
            exportedAt: d.toISOString(),
            data: state
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `specieslab-update-planner_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function importBackup() {
        const file = els.importFile.files && els.importFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            let next;
            try {
                const parsed = JSON.parse(reader.result);
                if (parsed && parsed.version && parsed.version > DATA_VERSION) {
                    throw new Error(`이 백업은 더 새로운 버전(v${parsed.version})으로 만들어졌습니다.`);
                }
                next = normalizeState(parsed);
            } catch (err) {
                alert('백업 파일을 읽을 수 없습니다.\n' + err.message);
                return;
            }
            const monthCount = Object.keys(next.months).length;
            const entryCount = Object.values(next.months).reduce((n, m) => n + m.entries.length, 0);
            const ok = confirm(
                `백업 파일: ${file.name}\n${monthCount}개월 / ${entryCount}개의 날짜 카드\n\n` +
                '불러오면 현재 브라우저에 저장된 플래너 데이터가 모두 이 백업으로 덮어써집니다.\n계속할까요?'
            );
            if (!ok) return;

            // 덮어쓰기 직전 데이터를 한 번 더 보관 (실수 복구용)
            try {
                const prev = localStorage.getItem(PLANNER_KEY);
                if (prev !== null) localStorage.setItem(PRE_IMPORT_KEY, prev);
            } catch (e) { /* noop */ }

            state = next;
            storageBlocked = false;
            const keys = Object.keys(state.months).sort();
            if (!state.months[currentMonth] && keys.length) currentMonth = state.meta.lastViewedMonth && state.months[state.meta.lastViewedMonth] ? state.meta.lastViewedMonth : keys[keys.length - 1];
            state.meta.lastViewedMonth = currentMonth;
            renderMonth();
            saveNow();
            alert('백업을 불러왔습니다.');
        };
        reader.onerror = () => alert('파일을 읽는 중 오류가 발생했습니다.');
        reader.readAsText(file, 'utf-8');
    }

    /* ---------------- 시작 ---------------- */
    function init() {
        // 모달 툴바는 카드 템플릿의 툴바를 그대로 복제해서 사용
        const modalToolbar = els.template.content.querySelector('.toolbar').cloneNode(true);
        els.modalPanel.querySelector('.modal-toolbar-slot').replaceWith(modalToolbar);
        buildSwatches(modalToolbar);

        state = loadState();
        currentMonth = state.meta.lastViewedMonth || monthKeyOf(todayStr());
        Object.values(state.months).forEach(sortEntries);
        bindEvents();
        renderMonth();
        if (!storageBlocked) setStatus('saved', '저장됨');
    }

    init();
})();
