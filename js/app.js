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

/* ---------------- 초기화 ---------------- */

shippingPage.classList.add('hidden');
toggleShippingFieldsVisibility();
renderAll();
renderBackupStatus();
