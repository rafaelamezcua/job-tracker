const token = localStorage.getItem('token');
const userName = localStorage.getItem('userName');
if (!token) window.location.href = '/login';
document.getElementById('userGreeting').textContent = userName || 'there';

let currentDate = new Date();
let allApplications = [];

async function loadApplications() {
    const res = await fetch('/applications', { headers: { 'authorization': token } });
    const data = await res.json();
    allApplications = Array.isArray(data) ? data : [];
    renderPrompts();
    renderCalendar();
}

function renderPrompts() {
    const needsDate = allApplications.filter(a => a.status === 'Interview' && !a.interview_date);
    const section = document.getElementById('promptsSection');
    const list = document.getElementById('promptsList');

    if (needsDate.length === 0) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    list.innerHTML = '';
    needsDate.forEach(app => {
        const card = document.createElement('div');
        card.className = 'prompt-card';
        card.innerHTML = `
            <div class="prompt-info">
                <span>${app.company}</span> — ${app.role}
            </div>
            <div class="prompt-controls">
                <input type="date" id="prompt-date-${app.id}" style="color-scheme:dark;" />
                <button class="btn-set-date" onclick="setInterviewDate(${app.id})">Set date</button>
            </div>
        `;
        list.appendChild(card);
    });
}

async function setInterviewDate(id) {
    const dateInput = document.getElementById(`prompt-date-${id}`);
    const interview_date = dateInput.value;
    if (!interview_date) { dateInput.style.borderColor = '#c46a6a'; return; }

    const app = allApplications.find(a => a.id === id);
    await fetch(`/applications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'authorization': token },
        body: JSON.stringify({
            company: app.company,
            role: app.role,
            status: app.status,
            date: app.date,
            url: app.url || '',
            notes: app.notes || '',
            interview_date
        })
    });
    loadApplications();
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    document.getElementById('calTitle').textContent =
        new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    // Build event map: dateStr -> array of events
    const eventMap = {};
    allApplications.forEach(app => {
        if (app.date) {
            if (!eventMap[app.date]) eventMap[app.date] = [];
            eventMap[app.date].push({ type: 'applied', company: app.company, role: app.role });
        }
        if (app.interview_date) {
            if (!eventMap[app.interview_date]) eventMap[app.interview_date] = [];
            eventMap[app.interview_date].push({ type: 'interview', company: app.company, role: app.role });
        }
    });

    const grid = document.getElementById('calDays');
    grid.innerHTML = '';

    // Prev month padding days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = document.createElement('div');
        day.className = 'cal-day other-month';
        day.innerHTML = `<div class="day-num">${daysInPrevMonth - i}</div>`;
        grid.appendChild(day);
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
        const events = eventMap[dateStr] || [];

        const day = document.createElement('div');
        day.className = `cal-day${isToday ? ' today' : ''}`;
        day.innerHTML = `
            <div class="day-num">${d}</div>
            <div class="day-events">
                ${events.map(e => `<div class="day-event ${e.type}" title="${e.company} — ${e.role}">${e.company}</div>`).join('')}
            </div>
        `;
        if (events.length > 0) {
            day.style.cursor = 'pointer';
            day.addEventListener('click', () => openDayDetail(dateStr, events));
        }
        grid.appendChild(day);
    }

    // Next month padding days
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    for (let d = 1; d <= totalCells - firstDay - daysInMonth; d++) {
        const day = document.createElement('div');
        day.className = 'cal-day other-month';
        day.innerHTML = `<div class="day-num">${d}</div>`;
        grid.appendChild(day);
    }
}

function openDayDetail(dateStr, events) {
    const date = new Date(dateStr + 'T00:00:00');
    document.getElementById('dayOverlayTitle').textContent =
        date.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    document.getElementById('dayOverlayEvents').innerHTML = events.map(e => `
        <div class="popup-event">
            <div class="popup-event-type ${e.type}">${e.type === 'interview' ? '🗓 Interview' : '📋 Applied'}</div>
            <div class="popup-event-company">${e.company}</div>
            <div class="popup-event-role">${e.role}</div>
        </div>
    `).join('');

    document.getElementById('dayOverlay').classList.add('show');
}

function prevMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login';
}

loadApplications();
