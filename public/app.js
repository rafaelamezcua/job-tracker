const token = localStorage.getItem('token');
const userName = localStorage.getItem('userName');
document.getElementById('userGreeting').textContent = userName || 'there';

// Safely escape HTML to prevent XSS when inserting user data into innerHTML
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Validate URL is safe (http/https only, no javascript: URIs)
function safeUrl(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? url : null;
    } catch {
        return null;
    }
}

if (!token) window.location.href = '/login';

// ── Theme toggle ──────────────────────────────────────────────────
function initTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    document.getElementById('themeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
}
initTheme();

let allApplications = [];
let lastAddedId = null;
let pendingDeleteId = null;
let pendingDeleteRow = null;

// ── Page fade-in + navigation fade-out ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && href.startsWith('/') && !href.includes('#')) {
            a.addEventListener('click', e => {
                e.preventDefault();
                window.location.href = href;
            });
        }
    });

    // Shake on invalid required field
    ['company', 'role', 'date'].forEach(id => {
        document.getElementById(id).addEventListener('invalid', e => {
            e.preventDefault();
            e.target.style.borderColor = '#c46a6a';
            anime({ targets: e.target, translateX: [0, -6, 6, -4, 4, 0], duration: 380, easing: 'easeInOutSine' });
            setTimeout(() => { e.target.style.borderColor = ''; }, 1200);
        });
    });
});

// ── Load ──────────────────────────────────────────────────────────
async function loadApplications() {
    const res = await fetch('/applications', { headers: { 'authorization': token } });
    const data = await res.json();
    allApplications = Array.isArray(data) ? data : [];
    lastKnownCount = allApplications.length;
    try { updateStats(); } catch (e) { console.warn('stats update failed', e); }
    renderTable(allApplications);
}

// ── Weekly goal ───────────────────────────────────────────────────
let weeklyGoal = parseInt(localStorage.getItem('weeklyGoal') || '5');

function updateWeeklyGoal() {
    const now = new Date(), day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);
    const count = allApplications.filter(a => new Date(a.date + 'T00:00:00') >= monday).length;
    const pct = Math.min((count / weeklyGoal) * 100, 100);
    document.getElementById('weeklyCount').textContent = count;
    document.getElementById('weeklyGoalBtn').textContent = `Goal: ${weeklyGoal}`;
    const fill = document.getElementById('weeklyFill');
    fill.style.background = pct >= 100 ? '#5aad6a' : pct >= 60 ? '#d4a847' : '#7f77dd';
    if (typeof anime !== 'undefined') anime({ targets: fill, width: pct + '%', duration: 900, easing: 'easeOutQuart' });
    else fill.style.width = pct + '%';
}

function editWeeklyGoal() {
    const val = prompt('Set your weekly application goal:', weeklyGoal);
    const parsed = parseInt(val);
    if (!isNaN(parsed) && parsed > 0) {
        weeklyGoal = parsed;
        localStorage.setItem('weeklyGoal', weeklyGoal);
        updateWeeklyGoal();
    }
}

// ── Stats count-up ────────────────────────────────────────────────
function updateStats() {
    const counts = {
        statTotal:     allApplications.length,
        statApplied:   allApplications.filter(a => a.status === 'Applied').length,
        statInterview: allApplications.filter(a => a.status === 'Interview').length,
        statOffer:     allApplications.filter(a => a.status === 'Offer').length,
        statRejected:  allApplications.filter(a => a.status === 'Rejected').length,
    };
    Object.entries(counts).forEach(([id, target]) => {
        const el = document.getElementById(id);
        const from = parseInt(el.textContent) || 0;
        if (from === target) return;
        if (typeof anime !== 'undefined') {
            const obj = { n: from };
            anime({ targets: obj, n: target, round: 1, duration: 500, easing: 'easeOutQuad', update() { el.textContent = obj.n; } });
        } else {
            el.textContent = target;
        }
    });
    updateWeeklyGoal();
    const streak = calculateStreak();
    const streakEl = document.getElementById('statStreak');
    if (streakEl) {
        const from = parseInt(streakEl.textContent) || 0;
        if (from !== streak) {
            if (typeof anime !== 'undefined') {
                const obj = { n: from };
                anime({ targets: obj, n: streak, round: 1, duration: 500, easing: 'easeOutQuad', update() { streakEl.textContent = obj.n; } });
            } else {
                streakEl.textContent = streak;
            }
        }
    }
}

// ── View toggle (Table / Kanban) ──────────────────────────────────
let currentView = localStorage.getItem('view') || 'table';

function setView(view) {
    currentView = view;
    localStorage.setItem('view', view);
    const isKanban = view === 'kanban';
    document.getElementById('tableView').style.display = isKanban ? 'none' : 'block';
    document.getElementById('kanbanView').style.display = isKanban ? 'block' : 'none';
    document.getElementById('btnTableView').classList.toggle('active', !isKanban);
    document.getElementById('btnKanbanView').classList.toggle('active', isKanban);
    if (isKanban) renderKanban(); else filterTable();
}

// ── Kanban ────────────────────────────────────────────────────────
const KANBAN_COLS = [
    { status: 'Saved',      color: '#7f77dd' },
    { status: 'Applied',    color: '#d4a847' },
    { status: 'Interview',  color: '#6a9fd8' },
    { status: 'Offer',      color: '#5aad6a' },
    { status: 'Rejected',   color: '#c46a6a' },
    { status: 'Withdrawn',  color: '#888888' },
];

function renderKanban() {
    const board = document.getElementById('kanbanBoard');
    board.innerHTML = '';

    KANBAN_COLS.forEach(({ status, color }) => {
        const apps = allApplications.filter(a => a.status === status);

        const col = document.createElement('div');
        col.className = 'kanban-col';

        const header = document.createElement('div');
        header.className = 'kanban-col-header';
        header.style.borderTopColor = color;
        header.style.color = color;
        header.innerHTML = `${status} <span class="kanban-col-count">${apps.length}</span>`;
        col.appendChild(header);

        const cardsEl = document.createElement('div');
        cardsEl.className = 'kanban-cards';
        cardsEl.id = `kanban-${status}`;

        cardsEl.addEventListener('dragover', e => { e.preventDefault(); cardsEl.classList.add('drag-over'); });
        cardsEl.addEventListener('dragleave', () => cardsEl.classList.remove('drag-over'));
        cardsEl.addEventListener('drop', async e => {
            e.preventDefault();
            cardsEl.classList.remove('drag-over');
            const id = parseInt(e.dataTransfer.getData('appId'));
            const oldStatus = e.dataTransfer.getData('oldStatus');
            if (oldStatus === status) return;
            const app = allApplications.find(a => a.id === id);
            if (!app) return;
            await fetch(`/applications/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'authorization': token },
                body: JSON.stringify({ ...app, status })
            });
            if (status === 'Offer') fireConfetti();
            loadApplications();
        });

        if (apps.length === 0) {
            cardsEl.innerHTML = `<div class="kanban-empty">Drop here</div>`;
        } else {
            apps.forEach(app => cardsEl.appendChild(createKanbanCard(app)));
        }

        col.appendChild(cardsEl);
        board.appendChild(col);
    });

    anime({ targets: '.kanban-col', opacity: [0, 1], translateY: [12, 0], delay: anime.stagger(60), duration: 300, easing: 'easeOutQuad' });
}

function createKanbanCard(app) {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.draggable = true;

    const avatarColors = ['#7f77dd','#5aad6a','#d4a847','#6a9fd8','#c46a6a','#f0a070','#a06ad8','#5ab8c4'];
    const avatarColor = avatarColors[app.company.charCodeAt(0) % avatarColors.length];
    const initials = app.company.trim().split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const tagChips = app.tags
        ? app.tags.split(',').map(t => t.trim()).filter(Boolean)
            .map(t => `<span class="tag-chip" style="font-size:10px;padding:2px 7px;">${escapeHtml(t)}</span>`).join('')
        : '';

    card.innerHTML = `
        <div class="kanban-card-top">
            <div class="company-avatar" style="background:${avatarColor};width:20px;height:20px;font-size:8px;border-radius:4px;flex-shrink:0;">${initials}</div>
            <span class="kanban-card-name">${escapeHtml(app.company)}</span>
        </div>
        <div class="kanban-card-role">${escapeHtml(app.role)}</div>
        <div class="kanban-card-footer">
            <span class="kanban-card-date">${escapeHtml(formatDate(app.date))}</span>
            ${app.salary ? `<span class="kanban-card-salary">${escapeHtml(app.salary)}</span>` : ''}
        </div>
        ${tagChips ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:4px;">${tagChips}</div>` : ''}
        <div class="kanban-card-actions">
            <button class="btn-edit" style="padding:3px 10px;font-size:11px;margin:0;flex:1;">Edit</button>
            <button class="btn-details" style="padding:3px 10px;font-size:11px;margin:0;flex:1;">Details</button>
        </div>
    `;

    card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('appId', app.id);
        e.dataTransfer.setData('oldStatus', app.status);
        setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.querySelector('.btn-edit').addEventListener('click', () => openEditModal(app));
    card.querySelector('.btn-details').addEventListener('click', () => openDetailsModal(app));

    // Try Clearbit logo
    const validUrl = safeUrl(app.url);
    const domain = validUrl ? (() => { try { return new URL(validUrl).hostname.replace(/^www\./, ''); } catch { return null; } })() : null;
    if (domain) {
        const avatar = card.querySelector('.company-avatar');
        const img = new Image();
        img.className = 'company-logo';
        img.style.cssText = 'width:22px;height:22px;border-radius:5px;';
        img.loading = 'lazy';
        img.onload = () => { if (avatar && avatar.parentNode) avatar.replaceWith(img); };
        img.src = `https://logo.clearbit.com/${domain}`;
    }

    return card;
}

// ── Streak counter ────────────────────────────────────────────────
function calculateStreak() {
    if (!allApplications.length) return 0;
    const dateSet = new Set(allApplications.map(a => a.date));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    let checkDate = new Date(today);
    if (!dateSet.has(todayStr)) checkDate.setDate(checkDate.getDate() - 1);
    let streak = 0;
    while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (dateSet.has(dateStr)) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
        else break;
    }
    return streak;
}

// ── Confetti ──────────────────────────────────────────────────────
function fireConfetti() {
    if (typeof confetti === 'undefined') return;
    confetti({ particleCount: 140, spread: 70, origin: { y: 0.6 }, colors: ['#7f77dd', '#5aad6a', '#d4a847', '#6a9fd8', '#f0a070'] });
}

// ── Export CSV ────────────────────────────────────────────────────
function exportCSV() {
    if (!allApplications.length) return alert('No applications to export.');
    const headers = ['Company', 'Role', 'Status', 'Date', 'URL', 'Notes', 'Tags', 'Interview Date', 'Salary'];
    const rows = allApplications.map(a =>
        [a.company, a.role, a.status, a.date, a.url || '', a.notes || '', a.tags || '', a.interview_date || '', a.salary || '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'job-applications.csv'; a.click();
    URL.revokeObjectURL(url);
}

// ── Date filter ───────────────────────────────────────────────────
let activeDatePreset = 'all';
let customDateFrom = null;
let customDateTo = null;
let customRangeActive = false;

function setPreset(preset) {
    activeDatePreset = preset;
    customRangeActive = false;
    customDateFrom = null;
    customDateTo = null;
    document.querySelectorAll('.filter-pill').forEach(p => {
        p.classList.remove('active');
        if (p.getAttribute('onclick') === `setPreset('${preset}')`) {
            p.classList.add('active');
            anime({ targets: p, scale: [1, 1.15, 1], duration: 380, easing: 'easeOutElastic(1, 0.5)' });
        }
    });
    document.getElementById('customRangeWrap').classList.remove('show');
    document.getElementById('customRangeToggle').classList.remove('active');
    filterTable();
}

function toggleCustomRange() {
    document.getElementById('customRangeWrap').classList.toggle('show');
    document.getElementById('customRangeToggle').classList.toggle('active');
}

function applyCustomRange() {
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;
    if (!from && !to) return;
    customDateFrom = from || null;
    customDateTo = to || null;
    customRangeActive = true;
    activeDatePreset = null;
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    document.getElementById('customRangeToggle').classList.add('active');
    filterTable();
}

function clearCustomRange() {
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    customDateFrom = null;
    customDateTo = null;
    customRangeActive = false;
    setPreset('all');
}

function getDateRange(preset) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (preset === 'today') return { from: today, to: today };
    if (preset === 'week') {
        const day = now.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        return { from: monday, to: today };
    }
    if (preset === '7days') {
        const from = new Date(today); from.setDate(today.getDate() - 6);
        return { from, to: today };
    }
    if (preset === '30days') {
        const from = new Date(today); from.setDate(today.getDate() - 29);
        return { from, to: today };
    }
    if (preset === 'month') {
        return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: today };
    }
    return null;
}

function filterTable() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    updateActiveFilterBanner(query);
    let filtered = allApplications.filter(app =>
        app.company.toLowerCase().includes(query) ||
        app.role.toLowerCase().includes(query) ||
        app.status.toLowerCase().includes(query) ||
        app.date.toLowerCase().includes(query) ||
        (app.tags && app.tags.toLowerCase().includes(query))
    );

    if (customRangeActive) {
        filtered = filtered.filter(app => {
            const d = new Date(app.date + 'T00:00:00');
            if (customDateFrom && d < new Date(customDateFrom + 'T00:00:00')) return false;
            if (customDateTo && d > new Date(customDateTo + 'T00:00:00')) return false;
            return true;
        });
    } else if (activeDatePreset && activeDatePreset !== 'all') {
        const range = getDateRange(activeDatePreset);
        if (range) {
            filtered = filtered.filter(app => {
                const d = new Date(app.date + 'T00:00:00');
                return d >= range.from && d <= range.to;
            });
        }
    }
    renderTable(filtered);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Render table ──────────────────────────────────────────────────
function renderTable(applications) {
    const list = document.getElementById('applicationsList');
    list.innerHTML = '';

    const countEl = document.getElementById('resultCount');
    const total = allApplications.length;
    if (countEl) {
        countEl.textContent = applications.length === total
            ? `${total} application${total !== 1 ? 's' : ''}`
            : `Showing ${applications.length} of ${total} applications`;
    }

    if (applications.length === 0) {
        const isFiltered = allApplications.length > 0;
        list.innerHTML = `<tr><td colspan="6" class="empty">${
            isFiltered
                ? 'No applications match your filters — <a onclick="clearAllFilters()">clear filters</a>'
                : 'No applications yet — add your first one above'
        }</td></tr>`;
        return;
    }

    const rows = [];
    applications.forEach(app => {
        const tagChipEls = app.tags
            ? app.tags.split(',').map(t => t.trim()).filter(Boolean)
                .map(t => `<span class="tag-chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')
            : '<span style="color:#2a2a2a; font-size:11px;">—</span>';

        const validUrl = safeUrl(app.url);
        const domain = validUrl ? (() => { try { return new URL(validUrl).hostname.replace(/^www\./, ''); } catch { return null; } })() : null;
        const avatarColors = ['#7f77dd','#5aad6a','#d4a847','#6a9fd8','#c46a6a','#f0a070','#a06ad8','#5ab8c4'];
        const avatarColor = avatarColors[app.company.charCodeAt(0) % avatarColors.length];
        const initials = app.company.trim().split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
        // Always render initials avatar — replace with Clearbit logo via DOM after row is created
        const logoHtml = `<div class="company-avatar" style="background:${avatarColor}">${initials}</div>`;
        const row = document.createElement('tr');
        if (typeof anime !== 'undefined') { row.style.opacity = '0'; row.style.transform = 'translateY(6px)'; }
        row.innerHTML = `
            <td class="company-name">${logoHtml}${validUrl ? `<a href="${escapeHtml(validUrl)}" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:none;">${escapeHtml(app.company)}</a>` : escapeHtml(app.company)}</td>
            <td>${escapeHtml(app.role)}</td>
            <td><div class="tag-chips">${tagChipEls}</div></td>
            <td><span class="badge badge-${escapeHtml(app.status)}">${escapeHtml(app.status.toLowerCase())}</span></td>
            <td>${escapeHtml(formatDate(app.date))}</td>
            <td>
                <div style="display:flex; gap:6px; justify-content:flex-end;">
                    <button class="btn-details">Details</button>
                    <button class="btn-edit">Edit</button>
                    <button class="btn-delete">Delete</button>
                </div>
            </td>
        `;
        row.querySelectorAll('.tag-chip').forEach(chip => {
            chip.addEventListener('click', () => filterByTag(chip.dataset.tag));
        });
        row.querySelector('.btn-details').addEventListener('click', () => openDetailsModal(app));
        row.querySelector('.btn-delete').addEventListener('click', () => deleteApplication(app.id, row));
        row.querySelector('.btn-edit').addEventListener('click', () => openEditModal(app));
        list.appendChild(row);

        // Try to load Clearbit logo and swap out the initials avatar if it loads
        if (domain) {
            const avatar = row.querySelector('.company-avatar');
            const img = new Image();
            img.className = 'company-logo';
            img.loading = 'lazy';
            img.onload = () => { if (avatar && avatar.parentNode) avatar.replaceWith(img); };
            img.src = `https://logo.clearbit.com/${domain}`;
        }
        rows.push(row);
    });

    // Stagger rows in
    if (typeof anime !== 'undefined') {
        anime({ targets: rows, opacity: [0, 1], translateY: [6, 0], delay: anime.stagger(35), duration: 280, easing: 'easeOutQuad' });
    }

    // Flash newly added row
    if (lastAddedId !== null) {
        const matchIdx = applications.findIndex(a => a.id === lastAddedId);
        if (matchIdx !== -1) {
            setTimeout(() => {
                rows[matchIdx].style.animation = 'flashGreen 1s ease forwards';
            }, matchIdx * 35 + 320);
        }
        lastAddedId = null;
    }

    // Tag chip pop-in
    const chips = list.querySelectorAll('.tag-chip');
    if (chips.length && typeof anime !== 'undefined') {
        chips.forEach(c => { c.style.opacity = '0'; c.style.transform = 'scale(0.65)'; });
        anime({ targets: chips, opacity: [0, 1], scale: [0.65, 1], delay: anime.stagger(25, { start: 120 }), duration: 240, easing: 'easeOutBack' });
    }
}

function filterByTag(tag) {
    document.getElementById('searchInput').value = tag;
    setPreset('all');
}

function clearAllFilters() {
    document.getElementById('searchInput').value = '';
    updateActiveFilterBanner('');
    setPreset('all');
}

function updateActiveFilterBanner(query) {
    const bar = document.getElementById('activeFilterBar');
    const text = document.getElementById('activeFilterText');
    if (!bar || !text) return;
    if (query) {
        text.textContent = `"${query}"`;
        bar.classList.add('show');
    } else {
        bar.classList.remove('show');
    }
}

// ── Delete ────────────────────────────────────────────────────────
function deleteApplication(id, rowEl) {
    pendingDeleteId = id;
    pendingDeleteRow = rowEl;
    document.getElementById('deleteOverlay').classList.add('show');
}

function closePopup() {
    pendingDeleteId = null;
    pendingDeleteRow = null;
    document.getElementById('deleteOverlay').classList.remove('show');
}

document.getElementById('confirmDelete').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    document.getElementById('deleteOverlay').classList.remove('show');
    const rowToDelete = pendingDeleteRow;
    const idToDelete = pendingDeleteId;
    pendingDeleteId = null;
    pendingDeleteRow = null;

    if (rowToDelete) {
        await anime({
            targets: rowToDelete,
            opacity: [1, 0],
            translateX: [0, -24],
            duration: 260,
            easing: 'easeInQuad'
        }).finished;
    }

    await fetch(`/applications/${idToDelete}`, {
        method: 'DELETE',
        headers: { 'authorization': token }
    });
    loadApplications();
});

// ── Add form ──────────────────────────────────────────────────────
document.getElementById('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('status').value;
    const res = await fetch('/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'authorization': token },
        body: JSON.stringify({
            company: document.getElementById('company').value,
            role: document.getElementById('role').value,
            status,
            date: document.getElementById('date').value,
            url: document.getElementById('url').value,
            notes: document.getElementById('notes').value,
            tags: document.getElementById('tags').value,
            salary: document.getElementById('salary').value
        })
    });
    const data = await res.json();
    lastAddedId = data.id || null;
    if (status === 'Offer') fireConfetti();
    e.target.reset();
    loadApplications();
});

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login';
}

// ── Edit modal ────────────────────────────────────────────────────
let editingId = null;

function openEditModal(app) {
    editingId = app.id;
    document.getElementById('editCompany').value = app.company;
    document.getElementById('editRole').value = app.role;
    document.getElementById('editStatus').value = app.status;
    document.getElementById('editDate').value = app.date;
    document.getElementById('editUrl').value = app.url || '';
    document.getElementById('editNotes').value = app.notes || '';
    document.getElementById('editTags').value = app.tags || '';
    document.getElementById('editSalary').value = app.salary || '';
    document.getElementById('editInterviewDate').value = app.interview_date || '';
    document.getElementById('interviewDateWrap').style.display = app.status === 'Interview' ? 'block' : 'none';
    document.getElementById('editOverlay').classList.add('show');
}

document.getElementById('editStatus').addEventListener('change', function () {
    document.getElementById('interviewDateWrap').style.display = this.value === 'Interview' ? 'block' : 'none';
});

function closeEditPopup() {
    editingId = null;
    document.getElementById('editOverlay').classList.remove('show');
}

async function saveEdit() {
    const status = document.getElementById('editStatus').value;
    const payload = {
        company: document.getElementById('editCompany').value,
        role: document.getElementById('editRole').value,
        status,
        date: document.getElementById('editDate').value,
        url: document.getElementById('editUrl').value,
        notes: document.getElementById('editNotes').value,
        tags: document.getElementById('editTags').value,
        salary: document.getElementById('editSalary').value,
        interview_date: status === 'Interview' ? document.getElementById('editInterviewDate').value : null,
    };
    await fetch(`/applications/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'authorization': token },
        body: JSON.stringify(payload)
    });
    if (status === 'Offer') fireConfetti();
    closeEditPopup();
    loadApplications();
}

// ── Details modal ─────────────────────────────────────────────────
function openDetailsModal(app) {
    const urlEl = document.getElementById('detailsUrl');
    const validUrl = safeUrl(app.url);
    urlEl.href = validUrl || '#';
    urlEl.textContent = app.url || 'No URL provided';

    const salaryEl = document.getElementById('detailsSalary');
    salaryEl.textContent = app.salary ? `Salary: ${app.salary}` : '';
    salaryEl.style.display = app.salary ? 'block' : 'none';

    const notesEl = document.getElementById('detailsNotes');
    if (app.notes) {
        notesEl.innerHTML = typeof marked !== 'undefined' ? marked.parse(app.notes) : escapeHtml(app.notes);
    } else {
        notesEl.innerHTML = '<span style="color:var(--text-dimmer)">No notes added</span>';
    }
    document.getElementById('detailsOverlay').classList.add('show');
}

function closeDetailsModal() {
    document.getElementById('detailsOverlay').classList.remove('show');
}

loadApplications();

// ── Auto-refresh when bookmarklet saves a job ─────────────────────
// localStorage event (cross-tab, fires when another window saves)
window.addEventListener('storage', (e) => {
    if (e.key === 'nymbus-last-saved') loadApplications();
});

// Polling fallback — silently checks every 15s for new applications
let lastKnownCount = 0;
setInterval(async () => {
    if (document.hidden) return;
    try {
        const res = await fetch('/applications', { headers: { 'authorization': token } });
        if (!res.ok) return;
        const data = await res.json();
        if (data.length !== lastKnownCount) {
            lastKnownCount = data.length;
            loadApplications();
        }
    } catch {}
}, 15000);

// ── PWA Service Worker ────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}
