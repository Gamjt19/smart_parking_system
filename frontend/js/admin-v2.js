const socket = io();

// --- Navigation ---
function showSection(id) {
    document.querySelectorAll('.section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`sec-${id}`).classList.remove('hidden');

    // Refresh Logic
    if (id === 'ai') loadAIChart();
    if (id === 'violations') loadViolations();
}

// --- Init Data ---
fetch('/api/admin/stats').then(res => res.json()).then(data => {
    document.getElementById('rev-val').innerText = data.revenue;
    document.getElementById('viol-val').innerText = data.violations;
    document.getElementById('v-count').innerText = data.violations;
});

fetch('/api/admin/logs').then(res => res.json()).then(logs => {
    const tbody = document.getElementById('logs-body');
    logs.forEach(log => prependLog(log, tbody));
});

// --- Live Map ---
const adminGrid = document.getElementById('admin-grid');
socket.on('slot_update', (slots) => {
    adminGrid.innerHTML = '';
    slots.forEach(slot => {
        const div = document.createElement('div');
        div.className = `slot ${slot.status}`;
        div.innerHTML = `<strong>${slot.id}</strong>`;

        if (slot.status !== 'available') {
            const btn = document.createElement('button');
            btn.className = 'btn btn-danger';
            btn.style.marginTop = '0.5rem';
            btn.style.fontSize = '0.7rem';
            btn.innerText = 'Reset';
            btn.onclick = () => resetSlot(slot.id);
            div.appendChild(btn);
        }
        adminGrid.appendChild(div);
    });
});

function resetSlot(id) {
    if (confirm('Force release slot?')) {
        fetch('/api/admin/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slotId: id })
        });
    }
}

// --- AI Chart ---
function loadAIChart() {
    fetch('/api/ai/predictions').then(res => res.json()).then(data => {
        const container = document.getElementById('ai-chart');
        container.innerHTML = '';

        data.hours.forEach((hour, i) => {
            const occ = data.occupancy[i];
            const color = occ > 80 ? '#EF4444' : (occ > 50 ? '#F59E0B' : '#10B981');

            const group = document.createElement('div');
            group.className = 'bar-group';
            group.innerHTML = `
                <div class="bar" style="height: ${occ}%; background: ${color};"></div>
                <small style="margin-top: 0.5rem;">${hour}</small>
            `;
            container.appendChild(group);
        });
    });
}

// --- Violations ---
function loadViolations() {
    fetch('/api/admin/violations').then(res => res.json()).then(list => {
        const container = document.getElementById('violation-list');
        container.innerHTML = '';
        list.forEach(v => {
            const div = document.createElement('div');
            div.className = 'violation-alert';
            div.innerHTML = `
                <div>
                    <strong>${v.type}</strong> at Slot #${v.slotId}<br>
                    <small>Plate: ${v.plate} • Time: ${v.time}</small>
                </div>
                <button class="btn btn-outline" style="border-color: #991B1B; color: #991B1B;">Resolve</button>
            `;
            container.appendChild(div);
        });
    });
}

// --- Realtime Logs ---
function prependLog(log, container) {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${log.time}</td><td>${log.action}</td><td>#${log.slotId}</td><td>User: ${log.user || 'Admin'}</td>`;
    container.insertBefore(row, container.firstChild);
}

socket.on('log_update', (log) => {
    const tbody = document.getElementById('logs-body');
    if (tbody) prependLog(log, tbody);
});
