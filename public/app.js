const token = localStorage.getItem('token');
const userName = localStorage.getItem('userName');
document.getElementById('userGreeting').textContent = userName || 'there';

if (!token) window.location.href = '/login';

let allApplications = [];

async function loadApplications() {
    const res = await fetch('/applications', {
        headers: { 'authorization': token }
    });
    const data = await res.json();
    allApplications = Array.isArray(data) ? data : [];
    updateStats();
    renderTable(allApplications);
}

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
    fill.style.width = pct + '%';
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

function updateStats() {
    document.getElementById('statTotal').textContent = allApplications.length;
    document.getElementById('statApplied').textContent = allApplications.filter(a => a.status === 'Applied').length;
    document.getElementById('statInterview').textContent = allApplications.filter(a => a.status === 'Interview').length;
    document.getElementById('statOffer').textContent = allApplications.filter(a => a.status === 'Offer').length;
    updateWeeklyGoal();
}

function filterTable() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allApplications.filter(app =>
        app.company.toLowerCase().includes(query) ||
        app.role.toLowerCase().includes(query) ||
        app.status.toLowerCase().includes(query) ||
        app.date.toLowerCase().includes(query)
    );
    renderTable(filtered);
}

function renderTable(applications) {
    const list = document.getElementById('applicationsList');
    list.innerHTML = '';

    if (applications.length === 0) {
        list.innerHTML = '<tr><td colspan="5" class="empty">No applications found</td></tr>';
        return;
    }

    applications.forEach(app => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="company-name">${app.url ? `<a href="${app.url}" target="_blank" style="color:inherit; text-decoration:none;">${app.company}</a>` : app.company}</td>
            <td>${app.role}</td>
            <td><span class="badge badge-${app.status}">${app.status.toLowerCase()}</span></td>
            <td>${app.date}</td>
            <td>
                <button class="btn-details">Details</button>
                <button class="btn-edit">Edit</button>
                <button class="btn-delete">Delete</button>
            </td>
        `;
        row.querySelector('.btn-details').addEventListener('click', () => openDetailsModal(app));
        row.querySelector('.btn-delete').addEventListener('click', () => deleteApplication(app.id));
        row.querySelector('.btn-edit').addEventListener('click', () => openEditModal(app ));
        list.appendChild(row);
    });
}

async function updateStatus(id, newStatus) {
    await fetch(`/applications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'authorization': token },
        body: JSON.stringify({ status: newStatus })
    });
    loadApplications();
}

let pendingDeleteId = null;

function deleteApplication(id) {
    pendingDeleteId = id;
    document.getElementById('deleteOverlay').classList.add('show');
}

function closePopup() {
    pendingDeleteId = null;
    document.getElementById('deleteOverlay').classList.remove('show');
}

document.getElementById('confirmDelete').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    await fetch(`/applications/${pendingDeleteId}`, {
        method: 'DELETE',
        headers: { 'authorization': token }
    });
    closePopup();
    loadApplications();
});

document.getElementById('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await fetch('/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'authorization': token },
        body: JSON.stringify({
            company: document.getElementById('company').value,
            role: document.getElementById('role').value,
            status: document.getElementById('status').value,
            date: document.getElementById('date').value,
            url: document.getElementById('url').value,
            notes: document.getElementById('notes').value
        })
    });
    e.target.reset();
    loadApplications();
});

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login';
}

let editing, Id = null;

function openEditModal(app) {
    editingId = app.id;
    document.getElementById('editCompany').value = app.company;
    document.getElementById('editRole').value = app.role;
    document.getElementById('editStatus').value = app.status;
    document.getElementById('editDate').value = app.date;
    document.getElementById('editUrl').value = app.url || '';
    document.getElementById('editNotes').value = app.notes || '';
    document.getElementById('editInterviewDate').value = app.interview_date || '';
    document.getElementById('interviewDateWrap').style.display = app.status === 'Interview' ? 'block' : 'none';
    document.getElementById('editOverlay').classList.add('show');
}

document.getElementById('editStatus').addEventListener('change', function() {
    document.getElementById('interviewDateWrap').style.display = this.value === 'Interview' ? 'block' : 'none';
});

function closeEditPopup() {
    editingId = null;
    document.getElementById('editOverlay').classList.remove('show');
}

async function saveEdit() {
    const status = document.getElementById('editStatus').value;
    await fetch(`/applications/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'authorization': token },
        body: JSON.stringify({
            company: document.getElementById('editCompany').value,
            role: document.getElementById('editRole').value,
            status,
            date: document.getElementById('editDate').value,
            url: document.getElementById('editUrl').value,
            notes: document.getElementById('editNotes').value,
            interview_date: status === 'Interview' ? document.getElementById('editInterviewDate').value : null,
        })
    });
    closeEditPopup();
    loadApplications();
}

function openDetailsModal(app) {
    const urlEl = document.getElementById('detailsUrl');
    urlEl.href = app.url || '#';
    urlEl.textContent = app.url || 'No URL provided';
    document.getElementById('detailsNotes').textContent = app.notes || 'No notes added';
    document.getElementById('detailsOverlay').classList.add('show');
}

function closeDetailsModal() {
    document.getElementById('detailsOverlay').classList.remove('show');
}

loadApplications();