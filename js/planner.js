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

    // 날짜 박스 왼쪽 선 색 (key가 data-color로 저장됨, '' = 기본: 토 파랑 / 일 빨강 / 평일 회색)
    // 실제 색은 css/planner.css에서 지정. 박스 배경은 흰색 고정
    const BOX_COLORS = [
        { key: '', label: '기본 (요일 색)', value: '#d4ccb9' },
        { key: 'red', label: '빨강', value: '#c2453d' },
        { key: 'orange', label: '주황', value: '#d27a1f' },
        { key: 'yellow', label: '노랑', value: '#d9b200' },
        { key: 'green', label: '초록', value: '#2f7d4f' },
        { key: 'blue', label: '파랑', value: '#2f6fb3' },
        { key: 'purple', label: '보라', value: '#7a4bb0' },
        { key: 'pink', label: '분홍', value: '#d6649a' },
        { key: 'gray', label: '회색', value: '#8d887c' }
    ];
    const BOX_COLOR_KEYS = new Set(BOX_COLORS.map((c) => c.key).filter(Boolean));

    // 글씨 크기 (rem 기준이라 카드/모달에서 같은 크기, 중첩돼도 누적되지 않음). normal = 크기 지정 해제
    const FONT_SIZES = { small: '0.8125rem', normal: null, large: '1.25rem', xlarge: '1.5rem' };

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
        modalClose: $('modalCloseBtn'),
        db: $('dateboxDialog'),
        dbForm: $('dateboxForm'),
        dbTitle: $('dateboxDialogTitle'),
        dbDate: $('dateboxDate'),
        dbPreview: $('dateboxPreview'),
        dbTextField: $('dateboxTextField'),
        dbText: $('dateboxText'),
        dbColors: $('dateboxColors'),
        dbDelete: $('dateboxDeleteBtn'),
        dbCancel: $('dateboxCancelBtn'),
        dbSubmit: $('dateboxSubmitBtn')
    };
    let modalReturnFocus = null;
    let pendingFontSize = null; // 선택 없이 크기를 고른 뒤 입력하는 글자에 적용할 크기 { editor, key } // 모달을 닫은 뒤 포커스를 돌려줄 확대 버튼

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
    const ALLOWED_STYLES = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'font-size'];

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
            // 날짜 박스 머리(라벨·편집 버튼)는 화면 표시용이라 저장 데이터에 남기지 않는다
            if (node.tagName === 'DIV' && node.classList.contains('datebox-head')) { node.remove(); return; }
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
            // 날짜 박스: 정해진 클래스와 올바른 날짜(YYYY-MM-DD)만 허용
            const boxClass = node.tagName !== 'DIV' ? null
                : node.classList.contains('datebox') ? 'datebox'
                : node.classList.contains('datebox-body') ? 'datebox-body' : null;
            const boxDate = boxClass === 'datebox' ? node.getAttribute('data-date') : null;
            const boxColor = boxClass === 'datebox' ? node.getAttribute('data-color') : null;
            Array.from(node.attributes).forEach((a) => node.removeAttribute(a.name));
            if (keepStyle.length) node.setAttribute('style', keepStyle.join('; '));
            if (fontColor && /^#?[\w]+$/.test(fontColor)) node.setAttribute('color', fontColor);
            if (boxClass === 'datebox' && isValidDateStr(boxDate)) {
                node.setAttribute('class', 'datebox');
                node.setAttribute('data-date', boxDate);
                if (BOX_COLOR_KEYS.has(boxColor)) node.setAttribute('data-color', boxColor);
            } else if (boxClass === 'datebox-body') {
                node.setAttribute('class', 'datebox-body');
            }
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

        setEditorContent(node.querySelector('.editor'), entry.content);
        return node;
    }

    // 저장된 content를 에디터에 넣고 날짜 박스 머리를 붙인다 (카드/모달 공용)
    function setEditorContent(editor, html) {
        editor.innerHTML = html || '';
        decorateDateBoxes(editor);
        normalizeEmptyEditor(editor);
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
        setEditorContent(els.modalEditor, entry.content);
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

    /* ---------------- 날짜 박스 ---------------- */
    // 일정 칸 안에 다른 날짜의 일정을 작은 박스로 넣는다. 박스는 entry.content(HTML) 안에만 저장되며
    // 박스를 넣은 카드의 날짜와는 무관하다 (다른 카드로 옮기거나 새 일정을 만들지 않음).
    // 저장 형태: <div class="datebox" data-date="YYYY-MM-DD"><div class="datebox-body">...</div></div>
    // 머리(날짜 라벨 + 편집 버튼)는 화면에서만 붙이고 저장할 때 떼어낸다.
    let dateboxCtx = null; // { mode: 'add' | 'edit', editor, range, box }

    function dateBoxLabel(dateStr) {
        const d = parseDate(dateStr);
        return `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAYS[d.getDay()]}`;
    }

    function isDateBox(node) { return !!node && node.nodeType === 1 && node.classList.contains('datebox'); }

    function emptyLine() {
        const div = document.createElement('div');
        div.appendChild(document.createElement('br'));
        return div;
    }

    function createDateBoxHead() {
        const head = document.createElement('div');
        head.className = 'datebox-head';
        head.contentEditable = 'false';
        const label = document.createElement('span');
        label.className = 'datebox-date';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'datebox-edit';
        btn.title = '날짜 박스 수정·삭제';
        btn.setAttribute('aria-label', '날짜 박스 수정·삭제');
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
        head.append(label, btn);
        return head;
    }

    function unwrapDateBox(box) {
        box.querySelectorAll('.datebox-head').forEach((h) => h.remove());
        box.querySelectorAll('.datebox-body').forEach((b) => b.replaceWith(...Array.from(b.childNodes)));
        box.replaceWith(...Array.from(box.childNodes));
    }

    // 박스 구조를 점검·복구하고 머리(라벨)를 data-date 기준으로 다시 그린다
    function decorateDateBoxes(editor) {
        editor.querySelectorAll('.datebox-head').forEach((h) => { if (!h.parentElement.closest('.datebox')) h.remove(); });
        editor.querySelectorAll('.datebox').forEach((box) => {
            if (!editor.contains(box)) return;
            // 박스 안의 박스나 날짜가 잘못된 박스는 내용만 남긴다
            if (box.parentElement.closest('.datebox') || !isValidDateStr(box.dataset.date)) { unwrapDateBox(box); return; }

            const heads = Array.from(box.querySelectorAll('.datebox-head'));
            const head = heads.shift() || createDateBoxHead();
            heads.forEach((h) => h.remove());
            if (box.firstChild !== head) box.prepend(head);

            // 본문: 머리 외의 노드를 모두 첫 번째 본문으로 모은다 (Enter·삭제 등으로 본문이 쪼개진 경우 복구)
            let body = box.querySelector(':scope > .datebox-body');
            if (!body) { body = document.createElement('div'); body.className = 'datebox-body'; head.after(body); }
            const before = [];
            let passedBody = false;
            Array.from(box.childNodes).forEach((n) => {
                if (n === head) return;
                if (n === body) { passedBody = true; return; }
                const moving = n.nodeType === 1 && n.classList.contains('datebox-body') ? Array.from(n.childNodes) : [n];
                if (moving[0] !== n) n.remove();
                if (passedBody) body.append(...moving); else before.push(...moving);
            });
            if (before.length) body.prepend(...before);
            if (!body.firstChild) body.appendChild(emptyLine());

            if ('color' in box.dataset && !BOX_COLOR_KEYS.has(box.dataset.color)) delete box.dataset.color;
            const d = parseDate(box.dataset.date);
            box.dataset.dow = d.getDay();
            head.querySelector('.datebox-date').textContent = dateBoxLabel(box.dataset.date);

            // 박스가 마지막 줄이면 박스 아래에 이어서 쓸 수 있도록 빈 줄을 둔다
            if (box.parentNode === editor && !box.nextSibling) box.after(emptyLine());
        });
        editor.querySelectorAll('.datebox-body').forEach((b) => { if (!isDateBox(b.parentElement)) b.removeAttribute('class'); });
    }

    // 저장용 HTML (머리 제거). 박스가 없으면 기존과 똑같이 innerHTML 그대로 저장
    function serializeEditor(editor) {
        if (!editor.querySelector('.datebox, .datebox-head')) return editor.innerHTML;
        const clone = editor.cloneNode(true);
        clone.querySelectorAll('.datebox-head').forEach((h) => h.remove());
        clone.querySelectorAll('.datebox').forEach((b) => b.removeAttribute('data-dow'));
        return clone.innerHTML;
    }

    function placeCaretAtEnd(el) {
        let target = el;
        while (target.lastElementChild && ['DIV', 'P'].includes(target.lastElementChild.tagName)) target = target.lastElementChild;
        const editor = el.closest('.editor');
        if (editor) editor.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        if (target.lastChild && target.lastChild.nodeName === 'BR') { range.setStartBefore(target.lastChild); range.collapse(true); }
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    // 커서 위치의 줄(최상위 줄 또는 박스 본문의 줄) 바로 아래에 박스를 넣는다. 커서가 박스 안이면 그 박스 아래.
    function insertDateBox(editor, range, box) {
        let ref = null;
        let atStart = false;
        if (range && editor.contains(range.startContainer)) {
            const c = range.startContainer;
            const el = c.nodeType === 1 ? c : c.parentElement;
            const outerBox = el.closest('.datebox');
            if (c === editor) {
                ref = editor.childNodes[range.startOffset - 1] || null;
                atStart = !ref;
            } else if (outerBox && editor.contains(outerBox)) {
                ref = outerBox;
            } else {
                ref = c;
                while (ref.parentNode !== editor) ref = ref.parentNode;
            }
        }
        if (ref && ref.nodeType === 1 && !isDateBox(ref) && ref.textContent === '' && !ref.querySelector('img')) {
            ref.replaceWith(box); // 빈 줄에서 넣으면 그 줄을 박스로 대체
        } else if (ref) {
            ref.after(box);
        } else if (atStart) {
            editor.prepend(box);
        } else {
            editor.appendChild(box);
        }
    }

    function buildDateBox(dateStr, text) {
        const box = document.createElement('div');
        box.className = 'datebox';
        box.dataset.date = dateStr;
        const body = document.createElement('div');
        body.className = 'datebox-body';
        const lines = text.replace(/\r\n?/g, '\n').split('\n');
        while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
        lines.forEach((line) => {
            const div = document.createElement('div');
            if (line === '') div.appendChild(document.createElement('br'));
            else div.textContent = line;
            body.appendChild(div);
        });
        box.appendChild(body);
        return box;
    }

    function isDateboxDialogOpen() { return !els.db.hidden; }

    function updateDateboxPreview() {
        const v = els.dbDate.value;
        els.dbPreview.textContent = isValidDateStr(v) ? dateBoxLabel(v) : '';
        els.dbPreview.dataset.dow = isValidDateStr(v) ? parseDate(v).getDay() : '';
    }

    function buildBoxColorButtons() {
        BOX_COLORS.forEach((c) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'db-color';
            b.title = c.label;
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-label', `왼쪽 선 색 ${c.label}`);
            b.style.setProperty('--sw', c.value);
            b.dataset.color = c.key;
            els.dbColors.appendChild(b);
        });
    }

    function setDialogColor(key) {
        els.dbColors.querySelectorAll('.db-color').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color === key)));
    }

    function getDialogColor() {
        const on = els.dbColors.querySelector('.db-color[aria-checked="true"]');
        return on && BOX_COLOR_KEYS.has(on.dataset.color) ? on.dataset.color : '';
    }

    function openDateboxDialog(ctx) {
        dateboxCtx = ctx;
        const isAdd = ctx.mode === 'add';
        els.dbTitle.textContent = isAdd ? '날짜 박스 추가' : '날짜 박스 수정';
        els.dbSubmit.textContent = isAdd ? '추가' : '저장';
        els.dbTextField.hidden = !isAdd;
        els.dbDelete.hidden = isAdd;
        els.dbText.value = '';
        if (isAdd) {
            // 기본값: 카드 날짜의 다음 날 (토요일 칸 → 일요일 공개 일정)
            const owner = ctx.editor.closest('[data-id]');
            const entry = owner && findEntry(owner.dataset.id);
            const base = entry ? parseDate(entry.date) : parseDate(todayStr());
            base.setDate(base.getDate() + 1);
            els.dbDate.value = formatISO(base);
            setDialogColor('');
        } else {
            els.dbDate.value = ctx.box.dataset.date;
            setDialogColor(BOX_COLOR_KEYS.has(ctx.box.dataset.color) ? ctx.box.dataset.color : '');
        }
        updateDateboxPreview();
        els.db.hidden = false;
        document.body.classList.add('modal-open');
        (isAdd ? els.dbText : els.dbDate).focus({ preventScroll: true });
    }

    function closeDateboxDialog() {
        if (!isDateboxDialogOpen()) return;
        els.db.hidden = true;
        if (!isModalOpen()) document.body.classList.remove('modal-open');
        dateboxCtx = null;
    }

    function submitDateboxDialog() {
        const ctx = dateboxCtx;
        if (!ctx) return;
        const date = els.dbDate.value;
        if (!isValidDateStr(date)) { alert('날짜를 선택해 주세요.'); els.dbDate.focus(); return; }
        if (!document.contains(ctx.editor) || (ctx.box && !ctx.editor.contains(ctx.box))) { closeDateboxDialog(); return; }
        let focusBox;
        if (ctx.mode === 'add') {
            focusBox = buildDateBox(date, els.dbText.value);
            insertDateBox(ctx.editor, ctx.range, focusBox);
        } else {
            focusBox = ctx.box;
            focusBox.dataset.date = date;
        }
        const color = getDialogColor();
        if (color) focusBox.dataset.color = color;
        else delete focusBox.dataset.color;
        const editor = ctx.editor;
        closeDateboxDialog();
        decorateDateBoxes(editor);
        handleEditorInput(editor);
        placeCaretAtEnd(focusBox.querySelector('.datebox-body'));
    }

    function deleteDateboxFromDialog() {
        const ctx = dateboxCtx;
        if (!ctx || !ctx.box || !ctx.editor.contains(ctx.box)) { closeDateboxDialog(); return; }
        const body = ctx.box.querySelector('.datebox-body');
        const hasText = body && body.textContent.trim().length > 0;
        if (hasText && !confirm(`${dateBoxLabel(ctx.box.dataset.date)} 날짜 박스를 삭제할까요?\n박스 안의 내용도 함께 삭제됩니다.`)) return;
        const editor = ctx.editor;
        ctx.box.remove();
        closeDateboxDialog();
        handleEditorInput(editor);
        editor.focus({ preventScroll: true });
    }

    // 커서가 container의 맨 앞/맨 뒤인지 (빈 줄의 <br>, 다음 줄 등을 고려)
    function caretAtStart(container) {
        const sel = window.getSelection();
        const r = document.createRange();
        r.selectNodeContents(container);
        r.setEnd(sel.anchorNode, sel.anchorOffset);
        const f = r.cloneContents();
        return f.textContent === '' && !f.querySelector('br, img');
    }

    function caretAtEnd(container) {
        const sel = window.getSelection();
        const r = document.createRange();
        r.selectNodeContents(container);
        r.setStart(sel.anchorNode, sel.anchorOffset);
        const f = r.cloneContents();
        return f.textContent === '' && !f.querySelector('div, p, img');
    }

    function lineOf(node, container) {
        if (!node || node === container || !container.contains(node)) return null;
        while (node.parentNode !== container) node = node.parentNode;
        return node;
    }

    function siblingOf(node, dir) {
        let n = dir < 0 ? node.previousSibling : node.nextSibling;
        while (n && n.nodeType === 3 && n.textContent === '') n = dir < 0 ? n.previousSibling : n.nextSibling;
        return n;
    }

    // 박스 경계에서 Backspace/Delete/Enter가 박스 구조를 깨뜨리지 않도록 처리. 처리했으면 true
    function handleDateBoxKey(e, editor) {
        if (!['Backspace', 'Delete', 'Enter'].includes(e.key) || e.isComposing || e.keyCode === 229) return false;
        if (!editor.querySelector('.datebox')) return false;
        const sel = window.getSelection();
        if (!sel.rangeCount || !sel.isCollapsed) return false;
        const node = sel.anchorNode;
        const el = node.nodeType === 1 ? node : node.parentElement;
        const body = el.closest('.datebox-body');

        if (body && editor.contains(body)) {
            const box = body.parentElement;
            if (e.key === 'Backspace' && caretAtStart(body)) { e.preventDefault(); return true; }
            if (e.key === 'Delete' && caretAtEnd(body)) { e.preventDefault(); return true; }
            if (e.key === 'Enter' && !e.shiftKey) {
                // 박스 본문의 마지막 빈 줄에서 Enter → 박스 밖으로 나가기
                const line = lineOf(node, body) || (node === body ? body.childNodes[sel.anchorOffset] : null);
                if (line && line === body.lastChild && body.childNodes.length > 1 && line.textContent === '') {
                    e.preventDefault();
                    line.remove();
                    let next = box.nextSibling;
                    if (!(next && next.nodeType === 1 && !isDateBox(next) && next.textContent === '')) {
                        next = emptyLine();
                        box.after(next);
                    }
                    handleEditorInput(editor);
                    placeCaretAtEnd(next);
                    return true;
                }
            }
            return false;
        }

        const line = lineOf(node, editor);
        if (!line || isDateBox(line)) return false;
        if (e.key === 'Backspace') {
            const prev = siblingOf(line, -1);
            if (isDateBox(prev) && caretAtStart(line)) {
                // 박스 바로 아래 줄의 맨 앞: 줄을 박스에 합치지 않고, 빈 줄이면 지운 뒤 박스 끝으로 이동
                e.preventDefault();
                if (line.textContent === '' && !(line.querySelector && line.querySelector('img'))) line.remove();
                handleEditorInput(editor);
                placeCaretAtEnd(prev.querySelector('.datebox-body'));
                return true;
            }
        } else if (e.key === 'Delete') {
            if (isDateBox(siblingOf(line, 1)) && caretAtEnd(line)) { e.preventDefault(); return true; }
        }
        return false;
    }

    /* ---------------- 이동 ---------------- */
    function goToMonth(key) {
        closeDateboxDialog();
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
        if (cmd === 'fontSize') {
            // 브라우저 기본 fontSize(1~7단계)를 임시 표식(7)으로 적용한 뒤 실제 크기로 바꿔 끼운다
            pendingFontSize = { editor, key: value };
            document.execCommand('fontSize', false, '7');
            convertSizeMarkers(editor, value);
        } else if (cmd === 'hiliteColor') {
            // 일부 브라우저는 hiliteColor 미지원 → backColor로 대체
            if (!document.execCommand('hiliteColor', false, value)) document.execCommand('backColor', false, value);
        } else {
            document.execCommand(cmd, false, value || null);
        }
        handleEditorInput(editor);
        updateToolbarState();
    }

    // execCommand('fontSize', 7)가 만든 표식을 실제 크기로 교체 (DOM 구조를 바꾸지 않아 선택 영역 유지)
    function convertSizeMarkers(editor, key) {
        const size = FONT_SIZES[key] || null;
        editor.querySelectorAll('font[size="7"], [style*="xxx-large"]').forEach((el) => {
            el.removeAttribute('size');
            if (size) el.style.fontSize = size;
            else el.style.removeProperty('font-size');
            if (!el.getAttribute('style')) el.removeAttribute('style');
        });
    }

    // 카드 에디터와 모달 에디터 모두 이 함수로 entry.content(단일 원본)를 갱신한다
    function handleEditorInput(editor) {
        const owner = editor.closest('[data-id]');
        const entry = owner && findEntry(owner.dataset.id);
        if (!entry) return;
        if (editor.querySelector('font[size="7"], [style*="xxx-large"]')) {
            convertSizeMarkers(editor, pendingFontSize && pendingFontSize.editor === editor ? pendingFontSize.key : 'normal');
        }
        if (editor.querySelector('.datebox, .datebox-head, .datebox-body')) decorateDateBoxes(editor);
        normalizeEmptyEditor(editor);
        entry.content = serializeEditor(editor);
        entry.updatedAt = nowIso();
        if (editor === els.modalEditor) {
            const cardEditor = cardEditorOf(entry.id);
            if (cardEditor) setEditorContent(cardEditor, entry.content);
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
            if (e.target.closest('.fmt-btn, .swatch, .datebox-edit')) e.preventDefault();
        });

        document.addEventListener('click', (e) => {
            const fmt = e.target.closest('.fmt-btn[data-cmd], .swatch');
            const owner = fmt && fmt.closest('[data-id]');
            if (owner) { runCommand(owner, fmt.dataset.cmd, fmt.dataset.value); return; }

            // + 날짜 박스: 현재 커서 위치를 기억해 두고 대화상자 열기
            const addBox = e.target.closest('[data-action="add-datebox"]');
            const addOwner = addBox && addBox.closest('[data-id]');
            if (addOwner) {
                const editor = addOwner.querySelector('.editor');
                const sel = window.getSelection();
                const range = sel.rangeCount && editor.contains(sel.getRangeAt(0).startContainer) ? sel.getRangeAt(0).cloneRange() : null;
                openDateboxDialog({ mode: 'add', editor, range });
                return;
            }

            const editBtn = e.target.closest('.datebox-edit');
            const box = editBtn && editBtn.closest('.datebox');
            const boxEditor = box && box.closest('.editor');
            if (boxEditor) { e.preventDefault(); openDateboxDialog({ mode: 'edit', editor: boxEditor, box }); }
        });

        // 날짜 박스 대화상자
        els.dbForm.addEventListener('submit', (e) => { e.preventDefault(); submitDateboxDialog(); });
        els.dbDate.addEventListener('input', updateDateboxPreview);
        els.dbDate.addEventListener('change', updateDateboxPreview);
        els.dbCancel.addEventListener('click', closeDateboxDialog);
        els.dbColors.addEventListener('click', (e) => {
            const b = e.target.closest('.db-color');
            if (b) setDialogColor(b.dataset.color);
        });
        els.dbDelete.addEventListener('click', deleteDateboxFromDialog);
        els.dbText.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitDateboxDialog(); }
        });
        let dbOverlayPressed = false;
        els.db.addEventListener('mousedown', (e) => { dbOverlayPressed = e.target === els.db; });
        els.db.addEventListener('click', (e) => {
            if (e.target === els.db && dbOverlayPressed) closeDateboxDialog();
            dbOverlayPressed = false;
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
            // ESC: 날짜 박스 대화상자 → 확대 모달 순으로 닫기
            if (e.key === 'Escape' && isDateboxDialogOpen()) { e.preventDefault(); closeDateboxDialog(); return; }
            if (e.key === 'Escape' && isModalOpen()) { e.preventDefault(); closeModal(); return; }
            const keyEditor = e.target.closest && e.target.closest('.editor');
            if (keyEditor && handleDateBoxKey(e, keyEditor)) return;
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
                closeDateboxDialog();
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
        buildBoxColorButtons();

        state = loadState();
        currentMonth = state.meta.lastViewedMonth || monthKeyOf(todayStr());
        Object.values(state.months).forEach(sortEntries);
        bindEvents();
        renderMonth();
        if (!storageBlocked) setStatus('saved', '저장됨');
    }

    init();
})();
