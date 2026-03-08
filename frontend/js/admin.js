const socket = io();
const mapContainer = document.getElementById('admin-map');
const statTotal = document.getElementById('stat-total');
const statOccupied = document.getElementById('stat-occupied');
const statRevenue = document.getElementById('stat-revenue');

let slots = [];

socket.on('slot_update', (updatedSlots) => {
    slots = updatedSlots;
    updateStats();
    renderAdminMap();
});

function updateStats() {
    statTotal.innerText = slots.length;
    statOccupied.innerText = slots.filter(s => s.status === 'occupied').length;
    // Mock revenue calc: $10 per booking
    const reservedCount = slots.filter(s => s.status === 'reserved' || s.status === 'occupied').length;
    statRevenue.innerText = reservedCount * 10;
}

function renderAdminMap() {
    mapContainer.innerHTML = '';

    slots.forEach(slot => {
        const slotEl = document.createElement('div');
        slotEl.className = `slot ${slot.status} ${slot.type === 'ev' ? 'ev' : ''}`;

        let actionBtn = '';
        if (slot.status === 'occupied' || slot.status === 'reserved') {
            actionBtn = `<button class="btn" style="margin-top:0.5rem; font-size:0.8rem; background:rgba(255,255,255,0.2); color:white" onclick="resetSlot(event, ${slot.id})">Force Reset</button>`;
        }

        slotEl.innerHTML = `
            <div class="slot-number">${slot.id}</div>
            <div style="font-size:0.8rem; opacity:0.8">${slot.status.toUpperCase()}</div>
            ${actionBtn}
        `;

        mapContainer.appendChild(slotEl);
    });
}

async function resetSlot(e, id) {
    e.stopPropagation(); // prevent card click
    if (!confirm(`Force reset Slot #${id}? This will clear the booking.`)) return;

    try {
        await fetch('/api/admin/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slotId: id })
        });
    } catch (err) {
        alert('Error resetting slot');
    }
}

// User Management
async function fetchUsers() {
    try {
        const res = await fetch('/api/admin/users');
        const users = await res.json();
        const tbody = document.getElementById('user-table-body');
        tbody.innerHTML = '';

        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">${user.id}</td>
                <td style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">${user.name}</td>
                <td style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">${user.email}</td>
                <td style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">${user.plate || '-'}</td>
                <td style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">${user.phone || '-'}</td>
                <td style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">${user.model || '-'}</td>
                <td style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">${user.role}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Error fetching users:", err);
    }
}

// Initial Load
fetchUsers();
