'use strict';

/* ===================================================
   종족연구소 굿즈 매니저 - 데이터 / 로직
   =================================================== */

const STORAGE_KEY = 'speciesLabGoodsOrders';

const PRICES = {
    photocard: 3000,
    keyring: 6000,
    magnet: 11000,
    fullset: 19000,
};

const DEFAULT_ORDERS = [
    {
        id: '8co-001',
        name: '윤사랑(뽀)',
        phone: '010-9955-9198',
        receiveMethod: '통판',
        items: { photocard: 0, keyring: 0, magnet: 0, fullset: 1 },
        paid: true,
        memo: '',
        shipping: {
            courier: '반값택배',
            address: 'GS청천점',
            packed: true,
            shipped: true,
            tracking: '1234-1234-1234',
            shippedDate: '2026-07-03',
            memo: '',
        },
    },
];

function emptyShipping() {
    return { courier: '반값택배', address: '', packed: false, shipped: false, tracking: '', shippedDate: '', memo: '' };
}

function loadOrders() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_ORDERS));
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
    } catch (err) {
        console.warn('저장된 주문 데이터를 읽지 못해 기본값을 사용합니다.', err);
    }
    return JSON.parse(JSON.stringify(DEFAULT_ORDERS));
}

function saveOrders() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function calcPrice(items) {
    return Object.keys(PRICES).reduce((sum, key) => sum + (items[key] || 0) * PRICES[key], 0);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[ch]));
}

let orders = loadOrders();

/* ---------------- DOM 참조 ---------------- */

const navButtons = document.querySelectorAll('aside nav button');
const orderPage = document.querySelector('.orderPage');
const shippingPage = document.querySelector('.shippingPage');
const productionPage = document.querySelector('.productionPage');

const orderTableBody = document.getElementById('orderTableBody');
const shippingTableBody = document.getElementById('shippingTableBody');

const orderSearch = document.getElementById('orderSearch');
const orderReceiveFilter = document.getElementById('orderReceiveFilter');
const orderPaidFilter = document.getElementById('orderPaidFilter');

const shippingIdSearch = document.getElementById('shippingIdSearch');
const shippingNameSearch = document.getElementById('shippingNameSearch');
const unshippedOnly = document.getElementById('unshippedOnly');

const addOrderBtn = document.getElementById('addOrderBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const importFile = document.getElementById('importFile');

const orderDialog = document.getElementById('orderDialog');
const orderForm = document.getElementById('orderForm');
const orderDialogTitle = document.getElementById('orderDialogTitle');
const orderEditingId = document.getElementById('orderEditingId');
const shippingFields = document.getElementById('shippingFields');
const fieldReceiveMethod = document.getElementById('fieldReceiveMethod');
const cancelOrderBtn = document.getElementById('cancelOrderBtn');

const backupStatusText = document.getElementById('backupStatusText');
const lastBackupText = document.getElementById('lastBackupText');
const toastEl = document.getElementById('toast');

/* ---------------- 백업 상태 관리 ---------------- */

const BACKUP_STATE_KEY = 'speciesLabGoodsBackupState';

function loadBackupState() {
    const raw = localStorage.getItem(BACKUP_STATE_KEY);
    if (!raw) return { dirty: false, lastBackupAt: null };
    try {
        const parsed = JSON.parse(raw);
        return { dirty: !!parsed.dirty, lastBackupAt: parsed.lastBackupAt || null };
    } catch (err) {
        return { dirty: false, lastBackupAt: null };
    }
}

let backupState = loadBackupState();

function saveBackupState() {
    localStorage.setItem(BACKUP_STATE_KEY, JSON.stringify(backupState));
}

function formatBackupDate(isoString) {
    const d = new Date(isoString);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderBackupStatus() {
    if (backupState.dirty) {
        backupStatusText.textContent = '백업 필요';
        backupStatusText.className = 'backup-needed';
        exportJsonBtn.classList.add('urgent');
    } else {
        backupStatusText.textContent = '백업 완료';
        backupStatusText.className = 'backup-done';
        exportJsonBtn.classList.remove('urgent');
    }
    lastBackupText.textContent = backupState.lastBackupAt
        ? `마지막 백업: ${formatBackupDate(backupState.lastBackupAt)}`
        : '마지막 백업: 없음';
}

let toastTimer = null;
function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

function markDirty() {
    backupState.dirty = true;
    saveBackupState();
    renderBackupStatus();
    showToast('데이터가 변경되었습니다. 안전을 위해 JSON 백업을 권장합니다.');
}

function markBackedUp() {
    backupState.dirty = false;
    backupState.lastBackupAt = new Date().toISOString();
    saveBackupState();
    renderBackupStatus();
}

window.addEventListener('beforeunload', (e) => {
    if (backupState.dirty) {
        e.preventDefault();
        e.returnValue = '';
    }
});

/* ---------------- 페이지 전환 ---------------- */

navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        navButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const page = btn.dataset.page;
        orderPage.classList.toggle('hidden', page !== 'order');
        shippingPage.classList.toggle('hidden', page !== 'shipping');
        productionPage.classList.toggle('hidden', page !== 'production');
    });
});

/* ---------------- 렌더링 ---------------- */

function renderStats() {
    const orderCount = orders.length;
    const revenue = orders.reduce((sum, o) => sum + calcPrice(o.items), 0);
    const shippingOrders = orders.filter((o) => o.receiveMethod === '통판');
    const shippedCount = shippingOrders.filter((o) => o.shipping && o.shipping.shipped).length;
    const unshippedCount = shippingOrders.length - shippedCount;

    document.querySelector('[data-stat="orderCount"]').textContent = orderCount;
    document.querySelector('[data-stat="revenue"]').textContent = `${revenue.toLocaleString()}원`;
    document.querySelector('[data-stat="shippedCount"]').textContent = shippedCount;
    document.querySelector('[data-stat="unshippedCount"]').textContent = unshippedCount;
}

function renderOrderTable() {
    const keyword = orderSearch.value.trim().toLowerCase();
    const receiveFilter = orderReceiveFilter.value;
    const paidFilter = orderPaidFilter.value;

    const filtered = orders.filter((o) => {
        const matchesKeyword = !keyword
            || o.id.toLowerCase().includes(keyword)
            || o.name.toLowerCase().includes(keyword);
        const matchesReceive = receiveFilter === 'all' || o.receiveMethod === receiveFilter;
        const matchesPaid = paidFilter === 'all' || (paidFilter === 'paid' ? o.paid : !o.paid);
        return matchesKeyword && matchesReceive && matchesPaid;
    });

    if (!filtered.length) {
        orderTableBody.innerHTML = '<tr class="empty-row"><td colspan="12">표시할 주문이 없습니다.</td></tr>';
        return;
    }

    orderTableBody.innerHTML = filtered.map((order) => {
        const price = calcPrice(order.items);
        return `
            <tr>
                <td>${escapeHtml(order.id)}</td>
                <td class="name-cell">${escapeHtml(order.name)}</td>
                <td>${escapeHtml(order.phone)}</td>
                <td>${escapeHtml(order.receiveMethod)}</td>
                <td>${order.items.photocard || 0}</td>
                <td>${order.items.keyring || 0}</td>
                <td>${order.items.magnet || 0}</td>
                <td>${order.items.fullset || 0}</td>
                <td>${price.toLocaleString()}원</td>
                <td>${order.paid ? '<span class="paid-mark">✔</span>' : '<span class="unpaid-mark">-</span>'}</td>
                <td>${escapeHtml(order.memo)}</td>
                <td>
                    <div class="row-actions">
                        <button type="button" class="edit-btn" data-id="${escapeHtml(order.id)}">수정</button>
                        <button type="button" class="delete-btn" data-id="${escapeHtml(order.id)}">삭제</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderShippingTable() {
    const idKeyword = shippingIdSearch.value.trim().toLowerCase();
    const nameKeyword = shippingNameSearch.value.trim().toLowerCase();
    const onlyUnshipped = unshippedOnly.checked;

    const filtered = orders.filter((o) => {
        if (o.receiveMethod !== '통판') return false;
        const s = o.shipping || emptyShipping();
        const matchesId = !idKeyword || o.id.toLowerCase().includes(idKeyword);
        const matchesName = !nameKeyword || o.name.toLowerCase().includes(nameKeyword);
        const matchesUnshipped = !onlyUnshipped || !s.shipped;
        return matchesId && matchesName && matchesUnshipped;
    });

    if (!filtered.length) {
        shippingTableBody.innerHTML = '<tr class="empty-row"><td colspan="11">표시할 통판 주문이 없습니다.</td></tr>';
        return;
    }

    shippingTableBody.innerHTML = filtered.map((order) => {
        const s = order.shipping || emptyShipping();
        return `
            <tr>
                <td>${escapeHtml(order.id)}</td>
                <td class="name-cell">${escapeHtml(order.name)}</td>
                <td>${escapeHtml(s.courier)}</td>
                <td>${escapeHtml(order.phone)}</td>
                <td class="address-cell">${escapeHtml(s.address)}</td>
                <td><button type="button" class="status-btn ${s.packed ? 'on' : 'off'}" data-id="${escapeHtml(order.id)}" data-field="packed">${s.packed ? '포장완료' : '미포장'}</button></td>
                <td><button type="button" class="status-btn ${s.shipped ? 'on' : 'off'}" data-id="${escapeHtml(order.id)}" data-field="shipped">${s.shipped ? '발송완료' : '미발송'}</button></td>
                <td>${escapeHtml(s.tracking)}</td>
                <td>${escapeHtml(s.shippedDate)}</td>
                <td>${escapeHtml(s.memo)}</td>
                <td>
                    <div class="row-actions">
                        <button type="button" class="edit-btn" data-id="${escapeHtml(order.id)}">수정</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderAll() {
    renderOrderTable();
    renderShippingTable();
    renderStats();
    renderProduction();
}

/* ---------------- 검색 / 필터 ---------------- */

[orderSearch, orderReceiveFilter, orderPaidFilter].forEach((el) => {
    el.addEventListener('input', renderOrderTable);
});

[shippingIdSearch, shippingNameSearch, unshippedOnly].forEach((el) => {
    el.addEventListener('input', renderShippingTable);
});

/* ---------------- 주문 테이블 액션 (수정/삭제) ---------------- */

orderTableBody.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-btn');
    if (editBtn) {
        openEditDialog(editBtn.dataset.id);
        return;
    }
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        if (confirm(`주문번호 ${id} 주문을 삭제할까요?`)) {
            orders = orders.filter((o) => o.id !== id);
            saveOrders();
            renderAll();
            markDirty();
        }
    }
});

/* ---------------- 통판 테이블 액션 (포장/발송 토글, 수정) ---------------- */

shippingTableBody.addEventListener('click', (e) => {
    const statusBtn = e.target.closest('.status-btn');
    if (statusBtn) {
        const order = orders.find((o) => o.id === statusBtn.dataset.id);
        const field = statusBtn.dataset.field;
        if (order && order.shipping) {
            order.shipping[field] = !order.shipping[field];
            if (field === 'shipped' && order.shipping.shipped && !order.shipping.shippedDate) {
                const today = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                order.shipping.shippedDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
            }
            saveOrders();
            renderAll();
            markDirty();
        }
        return;
    }
    const editBtn = e.target.closest('.edit-btn');
    if (editBtn) openEditDialog(editBtn.dataset.id);
});

/* ---------------- 주문 추가 / 수정 다이얼로그 ---------------- */

function toggleShippingFieldsVisibility() {
    shippingFields.classList.toggle('hidden', fieldReceiveMethod.value !== '통판');
}
fieldReceiveMethod.addEventListener('change', toggleShippingFieldsVisibility);

function openAddDialog() {
    orderForm.reset();
    orderEditingId.value = '';
    orderDialogTitle.textContent = '주문 추가';
    fieldReceiveMethod.value = '현장수령';
    toggleShippingFieldsVisibility();
    orderDialog.showModal();
}

function openEditDialog(id) {
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    const s = order.shipping || emptyShipping();

    orderEditingId.value = order.id;
    orderDialogTitle.textContent = '주문 수정';
    document.getElementById('fieldOrderId').value = order.id;
    document.getElementById('fieldName').value = order.name;
    document.getElementById('fieldPhone').value = order.phone || '';
    fieldReceiveMethod.value = order.receiveMethod;
    document.getElementById('fieldPhotocard').value = order.items.photocard || 0;
    document.getElementById('fieldKeyring').value = order.items.keyring || 0;
    document.getElementById('fieldMagnet').value = order.items.magnet || 0;
    document.getElementById('fieldFullset').value = order.items.fullset || 0;
    document.getElementById('fieldPaid').checked = !!order.paid;
    document.getElementById('fieldMemo').value = order.memo || '';

    document.getElementById('fieldCourier').value = s.courier || '반값택배';
    document.getElementById('fieldAddress').value = s.address || '';
    document.getElementById('fieldPacked').checked = !!s.packed;
    document.getElementById('fieldShipped').checked = !!s.shipped;
    document.getElementById('fieldTracking').value = s.tracking || '';
    document.getElementById('fieldShippedDate').value = s.shippedDate || '';
    document.getElementById('fieldShippingMemo').value = s.memo || '';

    toggleShippingFieldsVisibility();
    orderDialog.showModal();
}

addOrderBtn.addEventListener('click', openAddDialog);
cancelOrderBtn.addEventListener('click', () => orderDialog.close());

orderForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('fieldOrderId').value.trim();
    if (!id) {
        alert('주문번호를 입력해주세요.');
        return;
    }

    const editingId = orderEditingId.value;
    const isDuplicate = orders.some((o) => o.id === id && o.id !== editingId);
    if (isDuplicate) {
        alert('이미 존재하는 주문번호입니다.');
        return;
    }

    const receiveMethod = fieldReceiveMethod.value;
    const newOrder = {
        id,
        name: document.getElementById('fieldName').value.trim(),
        phone: document.getElementById('fieldPhone').value.trim(),
        receiveMethod,
        items: {
            photocard: Number(document.getElementById('fieldPhotocard').value) || 0,
            keyring: Number(document.getElementById('fieldKeyring').value) || 0,
            magnet: Number(document.getElementById('fieldMagnet').value) || 0,
            fullset: Number(document.getElementById('fieldFullset').value) || 0,
        },
        paid: document.getElementById('fieldPaid').checked,
        memo: document.getElementById('fieldMemo').value.trim(),
        shipping: receiveMethod === '통판' ? {
            courier: document.getElementById('fieldCourier').value,
            address: document.getElementById('fieldAddress').value.trim(),
            packed: document.getElementById('fieldPacked').checked,
            shipped: document.getElementById('fieldShipped').checked,
            tracking: document.getElementById('fieldTracking').value.trim(),
            shippedDate: document.getElementById('fieldShippedDate').value,
            memo: document.getElementById('fieldShippingMemo').value.trim(),
        } : emptyShipping(),
    };

    if (editingId) {
        const idx = orders.findIndex((o) => o.id === editingId);
        orders[idx] = newOrder;
    } else {
        orders.push(newOrder);
    }

    saveOrders();
    renderAll();
    markDirty();
    orderDialog.close();
});

/* ---------------- JSON / CSV 내보내기 ---------------- */

function todayStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function csvEscape(value) {
    const str = String(value ?? '');
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const CSV_HEADERS = [
    '주문번호', '성함(닉네임)', '연락처', '수령방법',
    '포카세트', '키링', '자석세트', '올세트', '가격', '입금여부', '비고',
    '택배종류', '주소', '포장여부', '발송여부', '송장번호', '발송일', '통판비고',
];

function exportJson() {
    const blob = new Blob([JSON.stringify(orders, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `orders_${todayStamp()}.json`);
    markBackedUp();
}

function exportCsv() {
    const rows = orders.map((o) => {
        const s = o.shipping || emptyShipping();
        return [
            o.id, o.name, o.phone, o.receiveMethod,
            o.items.photocard || 0, o.items.keyring || 0, o.items.magnet || 0, o.items.fullset || 0,
            calcPrice(o.items), o.paid ? '입금완료' : '미입금', o.memo || '',
            s.courier || '', s.address || '', s.packed ? '완료' : '미완료', s.shipped ? '완료' : '미완료',
            s.tracking || '', s.shippedDate || '', s.memo || '',
        ];
    });
    const csv = [CSV_HEADERS, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `orders_${todayStamp()}.csv`);
}

exportJsonBtn.addEventListener('click', exportJson);
exportCsvBtn.addEventListener('click', exportCsv);

/* ---------------- JSON / CSV 불러오기 ---------------- */

function parseCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    cur += '"';
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                cur += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            result.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    result.push(cur);
    return result;
}

function parseCsv(text) {
    const lines = text.replace(/^﻿/, '').split(/\r\n|\n/).filter((l) => l.length);
    const [, ...body] = lines.map(parseCsvLine);
    return body.map((cols) => {
        const get = (i) => cols[i] ?? '';
        const receiveMethod = get(3) === '통판' ? '통판' : '현장수령';
        return {
            id: get(0),
            name: get(1),
            phone: get(2),
            receiveMethod,
            items: {
                photocard: Number(get(4)) || 0,
                keyring: Number(get(5)) || 0,
                magnet: Number(get(6)) || 0,
                fullset: Number(get(7)) || 0,
            },
            paid: get(9) === '입금완료',
            memo: get(10) || '',
            shipping: receiveMethod === '통판' ? {
                courier: get(11) || '반값택배',
                address: get(12) || '',
                packed: get(13) === '완료',
                shipped: get(14) === '완료',
                tracking: get(15) || '',
                shippedDate: get(16) || '',
                memo: get(17) || '',
            } : emptyShipping(),
        };
    });
}

importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            let imported;
            if (file.name.toLowerCase().endsWith('.json')) {
                imported = JSON.parse(reader.result);
                if (!Array.isArray(imported)) throw new Error('invalid json shape');
            } else {
                imported = parseCsv(reader.result);
            }
            orders = imported;
            saveOrders();
            renderAll();
            alert('불러오기가 완료되었습니다.');
        } catch (err) {
            console.error(err);
            alert('파일을 불러오는 중 오류가 발생했습니다. 형식을 확인해주세요.');
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file, 'utf-8');
});

/* ---------------- 엑셀/CSV 주문 가져오기 ---------------- */

const excelImportBtn = document.getElementById('excelImportBtn');
const excelImportFileInput = document.getElementById('excelImportFileInput');
const excelImportDialog = document.getElementById('excelImportDialog');
const excelImportFileName = document.getElementById('excelImportFileName');
const excelMappingGrid = document.getElementById('excelMappingGrid');
const excelImportSummary = document.getElementById('excelImportSummary');
const excelPreviewBody = document.getElementById('excelPreviewBody');
const excelImportCancelBtn = document.getElementById('excelImportCancelBtn');
const excelImportConfirmBtn = document.getElementById('excelImportConfirmBtn');

const EXCEL_TARGET_FIELDS = [
    { key: 'orderId', label: '주문번호', patterns: ['주문번호'] },
    { key: 'buyerName', label: '주문자명', patterns: ['주문자명', '성함(닉네임)', '성함', '이름'] },
    { key: 'nickname', label: '닉네임', patterns: ['닉네임'] },
    { key: 'phone', label: '연락처', patterns: ['주문자연락처', '수령자연락처', '연락처'] },
    { key: 'receiveMethod', label: '배송방법', patterns: ['배송방법', '수령방법'] },
    { key: 'paidStatus', label: '입금/진행상태', patterns: ['진행상태', '입금여부', '결제상태'] },
    { key: 'zipcode', label: '우편번호', patterns: ['우편번호'] },
    { key: 'address1', label: '주소', patterns: ['주소'] },
    { key: 'address2', label: '상세주소', patterns: ['상세주소'] },
    { key: 'shippingMemo', label: '배송메모', patterns: ['배송메모'] },
    { key: 'memo', label: '메모', patterns: ['메모'] },
    { key: 'courierCompany', label: '택배사', patterns: ['택배사'] },
    { key: 'tracking', label: '운송장번호', patterns: ['운송장번호', '송장번호'] },
    { key: 'item1', label: '포카세트 수량', patterns: ['[상품1]', '상품1'] },
    { key: 'item2', label: '키링 수량', patterns: ['[상품2]', '상품2'] },
    { key: 'item3', label: '자석세트 수량', patterns: ['[상품3]', '상품3'] },
    { key: 'item4', label: '올세트 수량', patterns: ['[상품4]', '상품4'] },
];

const EXCEL_STATUS_LABEL = { new: '신규', overwrite: '덮어쓰기', skip: '건너뜀', error: '오류' };

let excelHeaders = [];
let excelDataRows = [];
let excelMapping = {};
let excelImportResult = [];

function findHeaderIndex(headers, patterns) {
    for (const p of patterns) {
        const idx = headers.findIndex((h) => h === p);
        if (idx !== -1) return idx;
    }
    for (const p of patterns) {
        const idx = headers.findIndex((h) => h.includes(p));
        if (idx !== -1) return idx;
    }
    return -1;
}

function getExcelCell(row, idx) {
    if (idx === undefined || idx === null || idx < 0) return '';
    const v = row[idx];
    return v === undefined || v === null ? '' : String(v).trim();
}

function toExcelQty(v) {
    const n = Number(String(v).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function inferReceiveMethod(rawValue, hasAddress) {
    if (rawValue) return rawValue.includes('현장') ? '현장수령' : '통판';
    return hasAddress ? '통판' : '현장수령';
}

function inferCourier(rawValue) {
    return rawValue.includes('반값') ? '반값택배' : '일반택배';
}

function inferPaid(rawValue) {
    if (!rawValue) return false;
    if (/취소|환불|대기|미입금|미결제/.test(rawValue)) return false;
    if (/완료|입금확인|결제확인/.test(rawValue)) return true;
    return false;
}

function buildExcelMappingUI() {
    excelMappingGrid.innerHTML = '';
    excelMapping = {};
    EXCEL_TARGET_FIELDS.forEach((field) => {
        const guessedIdx = findHeaderIndex(excelHeaders, field.patterns);
        excelMapping[field.key] = guessedIdx;

        const row = document.createElement('div');
        row.className = 'excelMappingRow';

        const label = document.createElement('label');
        label.textContent = field.label;

        const select = document.createElement('select');
        const noneOpt = document.createElement('option');
        noneOpt.value = '-1';
        noneOpt.textContent = '(사용 안 함)';
        select.appendChild(noneOpt);
        excelHeaders.forEach((h, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx);
            opt.textContent = h || `(빈 헤더 ${idx + 1}열)`;
            select.appendChild(opt);
        });
        select.value = String(guessedIdx);
        select.addEventListener('change', () => {
            excelMapping[field.key] = Number(select.value);
            updateExcelPreview();
        });

        row.appendChild(label);
        row.appendChild(select);
        excelMappingGrid.appendChild(row);
    });
}

function renderExcelPreviewTable() {
    excelPreviewBody.innerHTML = excelImportResult.map((r) => {
        const o = r.order;
        const qtySummary = `${o.items.photocard}/${o.items.keyring}/${o.items.magnet}/${o.items.fullset}`;
        return `
            <tr class="excel-row-${r.status}">
                <td>${r.rowNum}</td>
                <td><span class="excel-status-badge ${r.status}">${EXCEL_STATUS_LABEL[r.status]}</span></td>
                <td>${escapeHtml(o.id)}</td>
                <td class="name-cell">${escapeHtml(o.name)}</td>
                <td>${escapeHtml(o.phone)}</td>
                <td>${escapeHtml(o.receiveMethod)}</td>
                <td>${qtySummary}</td>
                <td>${o.paid ? '입금완료' : '미입금'}</td>
                <td>${r.errors.length ? escapeHtml(r.errors.join(', ')) : ''}</td>
            </tr>
        `;
    }).join('');
}

function updateExcelPreview() {
    const mode = document.querySelector('input[name="excelImportMode"]:checked').value;
    const seenIdsInBatch = new Set();
    let newCount = 0;
    let overwriteCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    excelImportResult = excelDataRows.map((row, i) => {
        const rowNum = i + 2;
        const buyerName = getExcelCell(row, excelMapping.buyerName);
        const nickname = getExcelCell(row, excelMapping.nickname);
        let orderId = getExcelCell(row, excelMapping.orderId);
        const phone = getExcelCell(row, excelMapping.phone);
        const receiveRaw = getExcelCell(row, excelMapping.receiveMethod);
        const paidRaw = getExcelCell(row, excelMapping.paidStatus);
        const zipcode = getExcelCell(row, excelMapping.zipcode);
        const address1 = getExcelCell(row, excelMapping.address1);
        const address2 = getExcelCell(row, excelMapping.address2);
        const shippingMemo = getExcelCell(row, excelMapping.shippingMemo);
        const memo = getExcelCell(row, excelMapping.memo);
        const tracking = getExcelCell(row, excelMapping.tracking);

        const items = {
            photocard: toExcelQty(getExcelCell(row, excelMapping.item1)),
            keyring: toExcelQty(getExcelCell(row, excelMapping.item2)),
            magnet: toExcelQty(getExcelCell(row, excelMapping.item3)),
            fullset: toExcelQty(getExcelCell(row, excelMapping.item4)),
        };

        const errors = [];
        if (!buyerName) errors.push('이름 없음');
        const totalQty = Object.values(items).reduce((a, b) => a + b, 0);
        if (totalQty === 0) errors.push('상품 수량 없음');

        if (!orderId) {
            orderId = `IMPORT-${rowNum}-${Date.now().toString(36).slice(-5)}`;
        }
        if (seenIdsInBatch.has(orderId)) {
            errors.push('파일 내 주문번호 중복');
        }
        seenIdsInBatch.add(orderId);

        const address = [zipcode, address1, address2].filter(Boolean).join(' ');
        const receiveMethod = inferReceiveMethod(receiveRaw, !!address);

        const order = {
            id: orderId,
            name: nickname ? `${buyerName}(${nickname})` : buyerName,
            phone,
            receiveMethod,
            items,
            paid: inferPaid(paidRaw),
            memo,
            shipping: receiveMethod === '통판' ? {
                courier: inferCourier(receiveRaw),
                address,
                packed: false,
                shipped: !!tracking,
                tracking,
                shippedDate: '',
                memo: shippingMemo,
            } : emptyShipping(),
        };

        let status;
        if (errors.length) {
            status = 'error';
            errorCount += 1;
        } else {
            const existingIdx = orders.findIndex((o) => o.id === orderId);
            if (existingIdx === -1) {
                status = 'new';
                newCount += 1;
            } else if (mode === 'overwrite') {
                status = 'overwrite';
                overwriteCount += 1;
            } else {
                status = 'skip';
                skipCount += 1;
            }
        }

        return { rowNum, order, status, errors };
    });

    excelImportSummary.textContent = `총 ${excelDataRows.length}행 · 신규 ${newCount}건 · 덮어쓰기 ${overwriteCount}건 · 건너뜀(중복) ${skipCount}건 · 오류 ${errorCount}건`;
    renderExcelPreviewTable();
    excelImportConfirmBtn.disabled = (newCount + overwriteCount) === 0;
}

excelImportBtn.addEventListener('click', () => excelImportFileInput.click());

document.querySelectorAll('input[name="excelImportMode"]').forEach((radio) => {
    radio.addEventListener('change', updateExcelPreview);
});

excelImportFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = new Uint8Array(reader.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

            if (!rows.length) {
                alert('파일에서 데이터를 찾지 못했습니다.');
                return;
            }

            excelHeaders = rows[0].map((h) => String(h ?? '').trim());
            excelDataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell ?? '').trim() !== ''));

            if (!excelDataRows.length) {
                alert('가져올 주문 데이터가 없습니다.');
                return;
            }

            excelImportFileName.textContent = `파일: ${file.name} (${excelDataRows.length}건 인식)`;
            buildExcelMappingUI();
            updateExcelPreview();
            excelImportDialog.showModal();
        } catch (err) {
            console.error(err);
            alert('파일을 읽는 중 오류가 발생했습니다. xlsx / xls / csv 형식인지 확인해주세요.');
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
});

excelImportCancelBtn.addEventListener('click', () => excelImportDialog.close());

excelImportConfirmBtn.addEventListener('click', () => {
    let added = 0;
    let overwritten = 0;

    excelImportResult.forEach((r) => {
        if (r.status === 'new') {
            orders.push(r.order);
            added += 1;
        } else if (r.status === 'overwrite') {
            const idx = orders.findIndex((o) => o.id === r.order.id);
            if (idx !== -1) orders[idx] = r.order;
            overwritten += 1;
        }
    });

    if (added || overwritten) {
        saveOrders();
        renderAll();
        markDirty();
    }

    showToast(`엑셀 가져오기 완료: 신규 ${added}건, 덮어쓰기 ${overwritten}건`);
    excelImportDialog.close();
});

/* ===================================================
   발주 관리 / 손익 계산 대시보드
   =================================================== */

const PRODUCTION_STORAGE_KEY = 'speciesLabGoodsProduction';

function defaultProduction() {
    return {
        photocard: {
            stock: 4,
            prepaid: 8,
            tiers: [
                { id: 't1', label: '10매 묶음', sheets: 10, price: 3400 },
                { id: 't2', label: '17매 묶음', sheets: 17, price: 5100 },
            ],
            selectedTierId: 't2',
            bundleCount: 2,
        },
        keyring: { stock: 0, orderQty: 25, prepaid: 9, unitCost: 3230 },
        magnet: {
            stock: 0,
            orderQty: 15,
            prepaid: 6,
            costParts: { ticket: 2830, record: 2630, gongo: 3730 },
        },
        sellPrices: { photocard: 3000, keyring: 6000, magnet: 11000, fullset: 19000 },
        investment: { sampleCost: 25210, includeSample: true },
        salesAnalysis: { snapshots: [] },
        manualAdjustment: { photocard: 0, keyring: 0, magnet: 0 },
        orderHistory: [],
        operatingCosts: {
            items: [
                { id: 'backing', label: '뒷대지', amount: 0, includeInInvestment: true, memo: '' },
                { id: 'opp', label: 'OPP', amount: 0, includeInInvestment: true, memo: '' },
                { id: 'shipping', label: '배송비', amount: 0, includeInInvestment: false, memo: '' },
                { id: 'booth', label: '부스비', amount: 0, includeInInvestment: true, memo: '' },
                { id: 'transport', label: '교통비', amount: 0, includeInInvestment: true, memo: '' },
                { id: 'etc', label: '기타', amount: 0, includeInInvestment: true, memo: '' },
            ],
        },
        operationalStock: {
            items: [
                { id: 'backing', label: '뒷대지', stock: 13, orderUnit: 20, bundlePrice: 2990, bundleCount: 3, manualAdjustment: 0 },
                { id: 'opp', label: 'OPP 봉투', stock: 96, orderUnit: 100, bundlePrice: 2400, bundleCount: 0, manualAdjustment: 0 },
            ],
        },
        operationalStockHistory: [],
    };
}

function loadProduction() {
    const raw = localStorage.getItem(PRODUCTION_STORAGE_KEY);
    if (!raw) return defaultProduction();
    try {
        const parsed = JSON.parse(raw);
        return { ...defaultProduction(), ...parsed };
    } catch (err) {
        console.warn('저장된 발주 관리 데이터를 읽지 못해 기본값을 사용합니다.', err);
        return defaultProduction();
    }
}

let production = loadProduction();

function saveProduction() {
    localStorage.setItem(PRODUCTION_STORAGE_KEY, JSON.stringify(production));
}

function won(n) {
    return `${Math.round(n || 0).toLocaleString()}원`;
}

function formatDateTime(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PRODUCT_LABELS = { photocard: '포토카드', keyring: '키링', magnet: '자석세트', fullset: '올세트' };

/* ---------------- 계산 로직 ---------------- */

function getPhotocardTier() {
    return production.photocard.tiers.find((t) => t.id === production.photocard.selectedTierId)
        || production.photocard.tiers[0];
}

function photocardCalc() {
    const tier = getPhotocardTier();
    const bundleCount = production.photocard.bundleCount || 0;
    if (!tier) return { totalSheets: 0, completeSets: 0, leftoverSheets: 0, totalCost: 0, unitCost: 0 };
    const totalSheets = (tier.sheets || 0) * bundleCount;
    const completeSets = Math.floor(totalSheets / 2);
    const leftoverSheets = totalSheets % 2;
    const totalCost = (tier.price || 0) * bundleCount;
    const unitCost = completeSets ? totalCost / completeSets : 0;
    return { totalSheets, completeSets, leftoverSheets, totalCost, unitCost };
}

function magnetUnitCost() {
    const p = production.magnet.costParts;
    return (p.ticket || 0) + (p.record || 0) + (p.gongo || 0);
}

// 포토카드 세트당 단가: 선택된 발주 옵션(가격 ÷ 완성 세트 수) 기준 고정 단가.
// 발주 묶음 수(bundleCount)에 좌우되지 않는 안정적인 값으로,
// 재고 가치 평가와 마진 계산에 사용된다.
function photocardUnitCost() {
    const tier = getPhotocardTier();
    if (!tier) return 0;
    const setsPerBundle = Math.floor((tier.sheets || 0) / 2);
    return setsPerBundle ? (tier.price || 0) / setsPerBundle : 0;
}

function productUnitCost(key) {
    if (key === 'photocard') return photocardUnitCost();
    if (key === 'keyring') return production.keyring.unitCost || 0;
    if (key === 'magnet') return magnetUnitCost();
    if (key === 'fullset') return productUnitCost('photocard') + productUnitCost('keyring') + productUnitCost('magnet');
    return 0;
}

function productTotals(key) {
    if (key === 'photocard') {
        const calc = photocardCalc();
        const totalHeld = (production.photocard.stock || 0) + calc.completeSets;
        const availableOnsite = totalHeld - (production.photocard.prepaid || 0);
        return { totalHeld, availableOnsite };
    }
    if (key === 'keyring' || key === 'magnet') {
        const state = production[key];
        const totalHeld = (state.stock || 0) + (state.orderQty || 0);
        const availableOnsite = totalHeld - (state.prepaid || 0);
        return { totalHeld, availableOnsite };
    }
    return { totalHeld: 0, availableOnsite: 0 };
}

function getActualSoldQty(key) {
    return orders.reduce((sum, o) => sum + (o.items[key] || 0), 0);
}

function getEffectiveSoldQty(key) {
    if (key === 'fullset') return getActualSoldQty('fullset');
    const manual = (production.manualAdjustment && production.manualAdjustment[key]) || 0;
    return getActualSoldQty(key) + getActualSoldQty('fullset') + manual;
}

// 올세트 판매분(실제 주문 수량 기준, 재고 한도 내)을 먼저 차감하고
// 남은 재고만 단품으로 판매된다고 가정 — 단품/올세트 예상매출 중복 집계 방지
function salesPlan() {
    const heldPhotocard = productTotals('photocard').totalHeld;
    const heldKeyring = productTotals('keyring').totalHeld;
    const heldMagnet = productTotals('magnet').totalHeld;
    const fullsetActual = getActualSoldQty('fullset');
    const fullsetQty = Math.max(0, Math.min(fullsetActual, heldPhotocard, heldKeyring, heldMagnet));
    return {
        fullsetQty,
        photocardQty: heldPhotocard - fullsetQty,
        keyringQty: heldKeyring - fullsetQty,
        magnetQty: heldMagnet - fullsetQty,
    };
}

function profitRow(key) {
    const unitCost = productUnitCost(key);
    const sellPrice = production.sellPrices[key] || 0;
    const margin = sellPrice - unitCost;
    const plan = salesPlan();
    if (key === 'fullset') {
        const revenue = sellPrice * plan.fullsetQty;
        return { unitCost, sellPrice, margin, productionCost: 0, revenue, profit: revenue };
    }
    const productionCost = stockProductionCost(key);
    const qty = plan[`${key}Qty`];
    const revenue = sellPrice * qty;
    const profit = revenue - productionCost;
    return { unitCost, sellPrice, margin, productionCost, revenue, profit };
}

// 본품 제작비는 현재 보유 중인 재고(현재재고) 기준으로 계산한다.
// 발주 수량(아직 재고에 반영되지 않은 예정분)은 포함하지 않으며,
// 발주 완료 처리로 재고가 늘어나야 비로소 제작비/투자금에 반영된다.
// 재고는 판매(주문 등록)로 자동 차감되지 않으므로, 판매 여부와 무관하게 유지된다.
function stockProductionCost(key) {
    return (production[key].stock || 0) * productUnitCost(key);
}

function totalProductionCost() {
    return ['photocard', 'keyring', 'magnet'].reduce((sum, key) => sum + stockProductionCost(key), 0);
}

function operatingCostsTotal() {
    return production.operatingCosts.items.reduce(
        (sum, item) => sum + (item.includeInInvestment ? (item.amount || 0) : 0),
        0
    );
}

function totalInvestment() {
    const sample = production.investment.includeSample ? (production.investment.sampleCost || 0) : 0;
    return sample + totalProductionCost() + operatingCostsTotal();
}

// 운영 재고(뒷대지/OPP 등) 계산: 상품 1개당 자재 1개 소모 기준
function totalProductUnitsHeld() {
    return productTotals('photocard').totalHeld + productTotals('keyring').totalHeld + productTotals('magnet').totalHeld;
}

function operationalStockCalc(item) {
    const expectedUsage = totalProductUnitsHeld() * (item.usagePerProductUnit ?? 1);
    const finalUsage = expectedUsage + (item.manualAdjustment || 0);
    const incoming = (item.orderUnit || 0) * (item.bundleCount || 0);
    const remainingAfterUse = (item.stock || 0) + incoming - finalUsage;
    const shortage = Math.max(0, finalUsage - (item.stock || 0));
    const recommendedBundles = (item.orderUnit || 0) > 0 ? Math.ceil(shortage / item.orderUnit) : 0;
    const totalOrderCost = (item.bundlePrice || 0) * (item.bundleCount || 0);
    return { expectedUsage, finalUsage, incoming, remainingAfterUse, shortage, recommendedBundles, totalOrderCost };
}

// 현재 현황: 실제 등록된 주문 내역 기준
function getCurrentRevenue() {
    return orders.reduce((sum, o) => sum + calcPrice(o.items), 0);
}

function currentProfit() {
    return getCurrentRevenue() - totalInvestment();
}

// 예상 현황: 발주 시뮬레이션(총보유 수량 전량 판매 가정) 기준
function expectedRevenue() {
    return ['photocard', 'keyring', 'magnet', 'fullset'].reduce((sum, key) => sum + profitRow(key).revenue, 0);
}

function expectedProfit() {
    return expectedRevenue() - totalInvestment();
}

/* ---------------- DOM 참조 ---------------- */

const sampleCostInput = document.getElementById('sampleCostInput');
const includeSampleCheckbox = document.getElementById('includeSampleCheckbox');
const productionCostDisplay = document.getElementById('productionCostDisplay');
const totalInvestmentDisplay = document.getElementById('totalInvestmentDisplay');

const photocardTierBody = document.getElementById('photocardTierBody');
const addPhotocardTierBtn = document.getElementById('addPhotocardTierBtn');
const photocardTierSelect = document.getElementById('photocardTierSelect');
const photocardBundleCount = document.getElementById('photocardBundleCount');
const pcTotalSheets = document.getElementById('pcTotalSheets');
const pcCompleteSets = document.getElementById('pcCompleteSets');
const pcLeftover = document.getElementById('pcLeftover');
const pcTotalCost = document.getElementById('pcTotalCost');

const keyringUnitCostInput = document.getElementById('keyringUnitCostInput');
const magnetTicketInput = document.getElementById('magnetTicketInput');
const magnetRecordInput = document.getElementById('magnetRecordInput');
const magnetGongoInput = document.getElementById('magnetGongoInput');
const magnetUnitCostDisplay = document.getElementById('magnetUnitCostDisplay');

const operatingCostsDisplay = document.getElementById('operatingCostsDisplay');
const sampleCostSummaryDisplay = document.getElementById('sampleCostSummaryDisplay');

const opCostBody = document.getElementById('opCostBody');
const addOpCostBtn = document.getElementById('addOpCostBtn');
const opCostTotalDisplay = document.getElementById('opCostTotalDisplay');

const opStockBody = document.getElementById('opStockBody');
const addOpStockBtn = document.getElementById('addOpStockBtn');
const processOpStockBtn = document.getElementById('processOpStockBtn');
const lastOpStockProcessedText = document.getElementById('lastOpStockProcessedText');

const sellPricePhotocard = document.getElementById('sellPricePhotocard');
const sellPriceKeyring = document.getElementById('sellPriceKeyring');
const sellPriceMagnet = document.getElementById('sellPriceMagnet');
const sellPriceFullset = document.getElementById('sellPriceFullset');

const profitTableBody = document.getElementById('profitTableBody');
const profitTotalCost = document.getElementById('profitTotalCost');
const profitTotalRevenue = document.getElementById('profitTotalRevenue');
const profitTotalProfit = document.getElementById('profitTotalProfit');

const saveSnapshotBtn = document.getElementById('saveSnapshotBtn');
const snapshotList = document.getElementById('snapshotList');

const processOrderBtn = document.getElementById('processOrderBtn');
const lastOrderProcessedText = document.getElementById('lastOrderProcessedText');

/* ---------------- 렌더링 ---------------- */

function renderProductionInputs() {
    sampleCostInput.value = production.investment.sampleCost;
    includeSampleCheckbox.checked = production.investment.includeSample;

    keyringUnitCostInput.value = production.keyring.unitCost;
    magnetTicketInput.value = production.magnet.costParts.ticket;
    magnetRecordInput.value = production.magnet.costParts.record;
    magnetGongoInput.value = production.magnet.costParts.gongo;

    sellPricePhotocard.value = production.sellPrices.photocard;
    sellPriceKeyring.value = production.sellPrices.keyring;
    sellPriceMagnet.value = production.sellPrices.magnet;
    sellPriceFullset.value = production.sellPrices.fullset;

    document.querySelectorAll('[data-prod-key]').forEach((el) => {
        const key = el.dataset.prodKey;
        const field = el.dataset.prodField;
        el.value = production[key][field];
    });

    document.querySelectorAll('[data-manual-key]').forEach((el) => {
        const key = el.dataset.manualKey;
        el.value = (production.manualAdjustment && production.manualAdjustment[key]) || 0;
    });

    photocardBundleCount.value = production.photocard.bundleCount;
}

function renderPhotocardTiers() {
    photocardTierBody.innerHTML = production.photocard.tiers.map((tier) => `
        <tr>
            <td><input type="text" class="tierLabelInput" data-tier-id="${escapeHtml(tier.id)}" value="${escapeHtml(tier.label)}"></td>
            <td><input type="number" min="1" class="tierSheetsInput" data-tier-id="${escapeHtml(tier.id)}" value="${tier.sheets}"></td>
            <td><input type="number" min="0" class="tierPriceInput" data-tier-id="${escapeHtml(tier.id)}" value="${tier.price}"></td>
            <td><button type="button" class="tierDeleteBtn" data-tier-id="${escapeHtml(tier.id)}">삭제</button></td>
        </tr>
    `).join('');

    photocardTierSelect.innerHTML = production.photocard.tiers.map((tier) =>
        `<option value="${escapeHtml(tier.id)}">${escapeHtml(tier.label)}</option>`
    ).join('');
    photocardTierSelect.value = production.photocard.selectedTierId;
}

function renderProductionCalc() {
    const calc = photocardCalc();
    pcTotalSheets.textContent = calc.totalSheets;
    pcCompleteSets.textContent = calc.completeSets;
    pcLeftover.textContent = calc.leftoverSheets;
    pcTotalCost.textContent = won(calc.totalCost);

    magnetUnitCostDisplay.textContent = won(magnetUnitCost());

    const pcTotals = productTotals('photocard');
    document.querySelector('[data-prod-calc="photocard-order"]').textContent = calc.completeSets;
    document.querySelector('[data-prod-calc="photocard-held"]').textContent = pcTotals.totalHeld;
    document.querySelector('[data-prod-calc="photocard-onsite"]').textContent = pcTotals.availableOnsite;

    ['keyring', 'magnet'].forEach((key) => {
        const totals = productTotals(key);
        document.querySelector(`[data-prod-calc="${key}-held"]`).textContent = totals.totalHeld;
        document.querySelector(`[data-prod-calc="${key}-onsite"]`).textContent = totals.availableOnsite;
    });

    productionCostDisplay.textContent = won(totalProductionCost());
    operatingCostsDisplay.textContent = won(operatingCostsTotal());
    sampleCostSummaryDisplay.textContent = won(production.investment.includeSample ? (production.investment.sampleCost || 0) : 0);
    totalInvestmentDisplay.textContent = won(totalInvestment());

    document.querySelector('[data-prod-stat="totalInvestment"]').textContent = won(totalInvestment());
    document.querySelector('[data-prod-stat="currentRevenue"]').textContent = won(getCurrentRevenue());
    document.querySelector('[data-prod-stat="currentProfit"]').textContent = won(currentProfit());
    document.querySelector('[data-prod-stat="expectedRevenue"]').textContent = won(expectedRevenue());
    document.querySelector('[data-prod-stat="expectedProfit"]').textContent = won(expectedProfit());
}

function renderProfitTable() {
    profitTableBody.innerHTML = ['photocard', 'keyring', 'magnet', 'fullset'].map((key) => {
        const row = profitRow(key);
        return `
            <tr>
                <td class="name-cell">${PRODUCT_LABELS[key]}</td>
                <td>${won(row.unitCost)}</td>
                <td>${won(row.sellPrice)}</td>
                <td>${won(row.margin)}</td>
                <td>${key === 'fullset' ? '-' : won(row.productionCost)}</td>
                <td>${won(row.revenue)}</td>
                <td>${won(row.profit)}</td>
            </tr>
        `;
    }).join('');

    profitTotalCost.textContent = won(totalProductionCost());
    profitTotalRevenue.textContent = won(expectedRevenue());
    profitTotalProfit.textContent = won(expectedProfit());
}

function renderSalesAnalysis() {
    ['photocard', 'keyring', 'magnet'].forEach((key) => {
        const produced = productTotals(key).totalHeld;
        const sold = getEffectiveSoldQty(key);
        const remaining = produced - sold;
        const rate = produced ? `${((sold / produced) * 100).toFixed(1)}%` : '-';
        document.querySelector(`[data-sales-calc="${key}-produced"]`).textContent = produced;
        document.querySelector(`[data-sales-calc="${key}-sold"]`).textContent = sold;
        document.querySelector(`[data-sales-calc="${key}-remaining"]`).textContent = remaining;
        document.querySelector(`[data-sales-calc="${key}-rate"]`).textContent = rate;
    });
    document.querySelector('[data-sales-calc="fullset-sold"]').textContent = getActualSoldQty('fullset');
}

function buildSalesAnalysisRows() {
    return ['photocard', 'keyring', 'magnet', 'fullset'].map((key) => {
        const sold = getEffectiveSoldQty(key);
        const produced = key === 'fullset' ? null : productTotals(key).totalHeld;
        const remaining = produced === null ? null : produced - sold;
        const rate = produced ? `${((sold / produced) * 100).toFixed(1)}%` : '-';
        return { key, produced, sold, remaining, rate };
    });
}

function renderOrderHistoryStatus() {
    const history = production.orderHistory;
    const last = history[history.length - 1];
    lastOrderProcessedText.textContent = last
        ? `마지막 발주 완료 처리: ${formatDateTime(last.processedAt)}`
        : '발주 완료 처리 이력이 없습니다.';
}

function renderOpCostRows() {
    opCostBody.innerHTML = production.operatingCosts.items.map((item) => `
        <tr>
            <td><input type="text" class="opCostLabelInput" data-op-cost-id="${escapeHtml(item.id)}" value="${escapeHtml(item.label)}"></td>
            <td><input type="number" min="0" class="opCostAmountInput" data-op-cost-id="${escapeHtml(item.id)}" value="${item.amount}"></td>
            <td><input type="checkbox" class="opCostIncludeInput" data-op-cost-id="${escapeHtml(item.id)}" ${item.includeInInvestment ? 'checked' : ''}></td>
            <td><input type="text" class="opCostMemoInput" data-op-cost-id="${escapeHtml(item.id)}" value="${escapeHtml(item.memo || '')}"></td>
            <td><button type="button" class="opCostDeleteBtn" data-op-cost-id="${escapeHtml(item.id)}">삭제</button></td>
        </tr>
    `).join('');
}

function renderOpCostCalc() {
    opCostTotalDisplay.textContent = won(operatingCostsTotal());
}

function renderOpStockRows() {
    opStockBody.innerHTML = production.operationalStock.items.map((item) => `
        <tr>
            <td><input type="text" class="opStockLabelInput" data-op-stock-id="${escapeHtml(item.id)}" value="${escapeHtml(item.label)}"></td>
            <td><input type="number" min="0" class="opStockStockInput" data-op-stock-id="${escapeHtml(item.id)}" value="${item.stock}"></td>
            <td><input type="number" min="1" class="opStockUnitInput" data-op-stock-id="${escapeHtml(item.id)}" value="${item.orderUnit}"></td>
            <td><input type="number" min="0" class="opStockBundleCountInput" data-op-stock-id="${escapeHtml(item.id)}" value="${item.bundleCount}"></td>
            <td class="prodAutoCell" data-op-calc="${escapeHtml(item.id)}-incoming">0</td>
            <td><input type="number" min="0" class="opStockPriceInput" data-op-stock-id="${escapeHtml(item.id)}" value="${item.bundlePrice}"></td>
            <td class="prodAutoCell" data-op-calc="${escapeHtml(item.id)}-expectedUsage">0</td>
            <td><input type="number" class="opStockManualInput" data-op-stock-id="${escapeHtml(item.id)}" value="${item.manualAdjustment}"></td>
            <td class="prodAutoCell" data-op-calc="${escapeHtml(item.id)}-remainingAfterUse">0</td>
            <td class="prodAutoCell" data-op-calc="${escapeHtml(item.id)}-shortage">0</td>
            <td class="prodAutoCell" data-op-calc="${escapeHtml(item.id)}-recommendedBundles">0</td>
            <td class="prodAutoCell" data-op-calc="${escapeHtml(item.id)}-totalOrderCost">0원</td>
            <td><button type="button" class="opStockDeleteBtn" data-op-stock-id="${escapeHtml(item.id)}">삭제</button></td>
        </tr>
    `).join('');
}

function renderOpStockCalc() {
    production.operationalStock.items.forEach((item) => {
        const calc = operationalStockCalc(item);
        const setText = (field, val) => {
            const el = document.querySelector(`[data-op-calc="${item.id}-${field}"]`);
            if (el) el.textContent = val;
        };
        setText('incoming', calc.incoming);
        setText('expectedUsage', calc.expectedUsage);
        setText('remainingAfterUse', calc.remainingAfterUse);
        setText('shortage', calc.shortage);
        setText('recommendedBundles', calc.recommendedBundles);
        setText('totalOrderCost', won(calc.totalOrderCost));
    });
}

function renderOpStockHistoryStatus() {
    const history = production.operationalStockHistory;
    const last = history[history.length - 1];
    lastOpStockProcessedText.textContent = last
        ? `마지막 입고 완료 처리: ${formatDateTime(last.processedAt)}`
        : '입고 완료 처리 이력이 없습니다.';
}

function renderSnapshotList() {
    const snapshots = production.salesAnalysis.snapshots;
    if (!snapshots.length) {
        snapshotList.innerHTML = '<li>저장된 스냅샷이 없습니다.</li>';
        return;
    }
    snapshotList.innerHTML = snapshots.slice().reverse().map((snap) => {
        const dateStr = formatDateTime(snap.savedAt);
        const rateSummary = snap.rows.filter((r) => r.rate !== '-').map((r) => `${PRODUCT_LABELS[r.key]} ${r.rate}`).join(' · ');
        const s = snap.summary;
        const profitSummary = s ? ` / 현재순손익 ${won(s.currentProfit)} · 예상순이익 ${won(s.expectedProfit)}` : '';
        return `<li>${escapeHtml(dateStr)} — ${escapeHtml(rateSummary)}${escapeHtml(profitSummary)}</li>`;
    }).join('');
}

function renderProduction() {
    renderPhotocardTiers();
    renderProductionInputs();
    renderOpCostRows();
    renderOpCostCalc();
    renderOpStockRows();
    renderOpStockCalc();
    renderProductionCalc();
    renderProfitTable();
    renderSalesAnalysis();
    renderSnapshotList();
    renderOrderHistoryStatus();
    renderOpStockHistoryStatus();
}

/* ---------------- 이벤트 리스너 ---------------- */

document.querySelectorAll('[data-prod-key]').forEach((el) => {
    el.addEventListener('input', () => {
        const key = el.dataset.prodKey;
        const field = el.dataset.prodField;
        production[key][field] = Number(el.value) || 0;
        saveProduction();
        renderProduction();
    });
});

sampleCostInput.addEventListener('input', () => {
    production.investment.sampleCost = Number(sampleCostInput.value) || 0;
    saveProduction();
    renderProduction();
});

includeSampleCheckbox.addEventListener('change', () => {
    production.investment.includeSample = includeSampleCheckbox.checked;
    saveProduction();
    renderProduction();
});

keyringUnitCostInput.addEventListener('input', () => {
    production.keyring.unitCost = Number(keyringUnitCostInput.value) || 0;
    saveProduction();
    renderProduction();
});

[
    [magnetTicketInput, 'ticket'],
    [magnetRecordInput, 'record'],
    [magnetGongoInput, 'gongo'],
].forEach(([el, part]) => {
    el.addEventListener('input', () => {
        production.magnet.costParts[part] = Number(el.value) || 0;
        saveProduction();
        renderProduction();
    });
});

[
    [sellPricePhotocard, 'photocard'],
    [sellPriceKeyring, 'keyring'],
    [sellPriceMagnet, 'magnet'],
    [sellPriceFullset, 'fullset'],
].forEach(([el, key]) => {
    el.addEventListener('input', () => {
        production.sellPrices[key] = Number(el.value) || 0;
        saveProduction();
        renderProduction();
    });
});

photocardTierSelect.addEventListener('change', () => {
    production.photocard.selectedTierId = photocardTierSelect.value;
    saveProduction();
    renderProduction();
});

photocardBundleCount.addEventListener('input', () => {
    production.photocard.bundleCount = Number(photocardBundleCount.value) || 0;
    saveProduction();
    renderProduction();
});

addPhotocardTierBtn.addEventListener('click', () => {
    const newId = `t${Date.now()}`;
    production.photocard.tiers.push({ id: newId, label: '새 옵션', sheets: 1, price: 0 });
    saveProduction();
    renderProduction();
});

photocardTierBody.addEventListener('input', (e) => {
    const id = e.target.dataset.tierId;
    if (!id) return;
    const tier = production.photocard.tiers.find((t) => t.id === id);
    if (!tier) return;
    if (e.target.classList.contains('tierLabelInput')) tier.label = e.target.value;
    if (e.target.classList.contains('tierSheetsInput')) tier.sheets = Number(e.target.value) || 0;
    if (e.target.classList.contains('tierPriceInput')) tier.price = Number(e.target.value) || 0;
    saveProduction();
    renderProductionCalc();
    renderProfitTable();
    renderSalesAnalysis();
});

photocardTierBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.tierDeleteBtn');
    if (!btn) return;
    if (production.photocard.tiers.length <= 1) {
        alert('최소 1개의 발주 옵션은 남아있어야 합니다.');
        return;
    }
    const id = btn.dataset.tierId;
    production.photocard.tiers = production.photocard.tiers.filter((t) => t.id !== id);
    if (production.photocard.selectedTierId === id) {
        production.photocard.selectedTierId = production.photocard.tiers[0].id;
    }
    saveProduction();
    renderProduction();
});

document.querySelectorAll('[data-manual-key]').forEach((el) => {
    el.addEventListener('input', () => {
        const key = el.dataset.manualKey;
        production.manualAdjustment[key] = Number(el.value) || 0;
        saveProduction();
        renderProduction();
    });
});

processOrderBtn.addEventListener('click', () => {
    if (!confirm('현재 입력된 발주 수량을 재고에 반영하시겠습니까?')) return;

    // 1. 처리 시점의 상품별 발주 수량과 제작비를 계산
    const tier = getPhotocardTier();
    const pcCalc = photocardCalc();
    const keyringOrderQty = production.keyring.orderQty || 0;
    const keyringUnitCostVal = production.keyring.unitCost || 0;
    const keyringCost = keyringOrderQty * keyringUnitCostVal;
    const magnetOrderQty = production.magnet.orderQty || 0;
    const magnetUnitCostVal = magnetUnitCost();
    const magnetCost = magnetOrderQty * magnetUnitCostVal;
    const totalConfirmedCost = pcCalc.totalCost + keyringCost + magnetCost;

    const photocardBundleCountUsed = production.photocard.bundleCount || 0;
    const stockBefore = {
        photocard: production.photocard.stock || 0,
        keyring: production.keyring.stock || 0,
        magnet: production.magnet.stock || 0,
    };

    // 3. 발주 수량을 현재 재고에 추가 · 4. 발주 수량을 0으로 초기화
    production.photocard.stock = stockBefore.photocard + pcCalc.completeSets;
    production.photocard.bundleCount = 0;

    production.keyring.stock = stockBefore.keyring + keyringOrderQty;
    production.keyring.orderQty = 0;

    production.magnet.stock = stockBefore.magnet + magnetOrderQty;
    production.magnet.orderQty = 0;

    // 2. + 5. 이번 발주의 제작비를 이력에 누적 저장(이 값이 누적 확정 제작비의 근거가 됨)
    production.orderHistory.push({
        id: Date.now(),
        processedAt: new Date().toISOString(),
        photocardTierId: tier ? tier.id : null,
        photocardTierLabel: tier ? tier.label : '',
        photocardBundleCount: photocardBundleCountUsed,
        products: {
            photocard: { orderQty: pcCalc.completeSets, unitCost: pcCalc.unitCost, cost: pcCalc.totalCost },
            keyring: { orderQty: keyringOrderQty, unitCost: keyringUnitCostVal, cost: keyringCost },
            magnet: { orderQty: magnetOrderQty, unitCost: magnetUnitCostVal, cost: magnetCost },
        },
        totalConfirmedCost,
        stockBefore,
        stockAfter: {
            photocard: production.photocard.stock,
            keyring: production.keyring.stock,
            magnet: production.magnet.stock,
        },
    });

    saveProduction();
    renderProduction();
    showToast('발주 수량이 현재 재고에 반영되었습니다.');
});

opCostBody.addEventListener('input', (e) => {
    const id = e.target.dataset.opCostId;
    if (!id) return;
    const item = production.operatingCosts.items.find((i) => i.id === id);
    if (!item) return;
    if (e.target.classList.contains('opCostLabelInput')) item.label = e.target.value;
    if (e.target.classList.contains('opCostAmountInput')) item.amount = Number(e.target.value) || 0;
    if (e.target.classList.contains('opCostMemoInput')) item.memo = e.target.value;
    saveProduction();
    renderOpCostCalc();
    renderProductionCalc();
    renderProfitTable();
});

opCostBody.addEventListener('change', (e) => {
    if (!e.target.classList.contains('opCostIncludeInput')) return;
    const id = e.target.dataset.opCostId;
    const item = production.operatingCosts.items.find((i) => i.id === id);
    if (!item) return;
    item.includeInInvestment = e.target.checked;
    saveProduction();
    renderOpCostCalc();
    renderProductionCalc();
    renderProfitTable();
});

opCostBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.opCostDeleteBtn');
    if (!btn) return;
    const id = btn.dataset.opCostId;
    production.operatingCosts.items = production.operatingCosts.items.filter((i) => i.id !== id);
    saveProduction();
    renderOpCostRows();
    renderOpCostCalc();
    renderProductionCalc();
    renderProfitTable();
});

addOpCostBtn.addEventListener('click', () => {
    production.operatingCosts.items.push({ id: `oc${Date.now()}`, label: '새 항목', amount: 0, includeInInvestment: true, memo: '' });
    saveProduction();
    renderOpCostRows();
    renderOpCostCalc();
});

opStockBody.addEventListener('input', (e) => {
    const id = e.target.dataset.opStockId;
    if (!id) return;
    const item = production.operationalStock.items.find((i) => i.id === id);
    if (!item) return;
    if (e.target.classList.contains('opStockLabelInput')) item.label = e.target.value;
    if (e.target.classList.contains('opStockStockInput')) item.stock = Number(e.target.value) || 0;
    if (e.target.classList.contains('opStockUnitInput')) item.orderUnit = Number(e.target.value) || 0;
    if (e.target.classList.contains('opStockBundleCountInput')) item.bundleCount = Number(e.target.value) || 0;
    if (e.target.classList.contains('opStockPriceInput')) item.bundlePrice = Number(e.target.value) || 0;
    if (e.target.classList.contains('opStockManualInput')) item.manualAdjustment = Number(e.target.value) || 0;
    saveProduction();
    renderOpStockCalc();
});

opStockBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.opStockDeleteBtn');
    if (!btn) return;
    if (production.operationalStock.items.length <= 1) {
        alert('최소 1개의 운영 재고 항목은 남아있어야 합니다.');
        return;
    }
    const id = btn.dataset.opStockId;
    production.operationalStock.items = production.operationalStock.items.filter((i) => i.id !== id);
    saveProduction();
    renderOpStockRows();
    renderOpStockCalc();
});

addOpStockBtn.addEventListener('click', () => {
    production.operationalStock.items.push({
        id: `os${Date.now()}`, label: '새 자재', stock: 0, orderUnit: 1, bundlePrice: 0, bundleCount: 0, manualAdjustment: 0,
    });
    saveProduction();
    renderOpStockRows();
    renderOpStockCalc();
});

processOpStockBtn.addEventListener('click', () => {
    if (!confirm('현재 입력된 발주 묶음 수를 재고에 반영하시겠습니까?')) return;

    const itemsHistory = production.operationalStock.items.map((item) => {
        const calc = operationalStockCalc(item);
        const before = { stock: item.stock, bundleCount: item.bundleCount };
        item.stock = (item.stock || 0) + calc.incoming;
        item.bundleCount = 0;
        const after = { stock: item.stock, bundleCount: item.bundleCount };
        return { id: item.id, label: item.label, before, after };
    });

    production.operationalStockHistory.push({ id: Date.now(), processedAt: new Date().toISOString(), items: itemsHistory });

    saveProduction();
    renderOpStockRows();
    renderOpStockCalc();
    renderOpStockHistoryStatus();
    showToast('운영 재고 입고 수량이 현재 재고에 반영되었습니다.');
});

saveSnapshotBtn.addEventListener('click', () => {
    production.salesAnalysis.snapshots.push({
        id: Date.now(),
        savedAt: new Date().toISOString(),
        summary: {
            currentRevenue: getCurrentRevenue(),
            totalInvestment: totalInvestment(),
            currentProfit: currentProfit(),
            expectedRevenue: expectedRevenue(),
            expectedProfit: expectedProfit(),
        },
        rows: buildSalesAnalysisRows(),
    });
    saveProduction();
    renderSnapshotList();
    showToast('판매 분석 스냅샷을 저장했습니다.');
});

/* ---------------- 섹션 접기/펼치기 ---------------- */

const COLLAPSE_STORAGE_KEY = 'speciesLabGoodsProductionCollapse';
const DEFAULT_COLLAPSE_STATE = { salesAnalysis: true, operationalStock: false, operatingCosts: true };

function loadCollapseState() {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLLAPSE_STATE };
    try {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_COLLAPSE_STATE, ...parsed };
    } catch (err) {
        return { ...DEFAULT_COLLAPSE_STATE };
    }
}

let collapseState = loadCollapseState();

function saveCollapseState() {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(collapseState));
}

function applyCollapseState() {
    document.querySelectorAll('[data-collapse-key]').forEach((panel) => {
        const key = panel.dataset.collapseKey;
        panel.classList.toggle('collapsed', !!collapseState[key]);
    });
}

document.querySelectorAll('[data-collapse-toggle]').forEach((toggle) => {
    toggle.addEventListener('click', () => {
        const key = toggle.dataset.collapseToggle;
        collapseState[key] = !collapseState[key];
        saveCollapseState();
        applyCollapseState();
    });
});

applyCollapseState();

/* ---------------- 초기화 ---------------- */

shippingPage.classList.add('hidden');
productionPage.classList.add('hidden');
toggleShippingFieldsVisibility();
renderAll();
renderBackupStatus();
