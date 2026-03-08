// File for extending Smart Parking System features

// Feature 1: Vehicle Management
async function fetchVehicles() {
    if (!user || user.name === 'Guest' || !user._id) return;

    const container = document.getElementById('vehicles-list');
    if (!container) return;

    container.innerHTML = '<p>Loading vehicles...</p>';

    try {
        const res = await fetch(`/api/vehicles/user/${user._id}`);
        const data = await res.json();

        if (data.success) {
            if (data.vehicles.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted); grid-column: 1 / -1; text-align: center; padding: 2rem;">No vehicles found. Add your first vehicle.</p>';
                return;
            }

            container.innerHTML = data.vehicles.map(v => `
                <div class="card" style="position: relative;">
                    <button onclick="deleteVehicle('${v._id}')" class="btn btn-outline" style="position: absolute; top: 1rem; right: 1rem; padding: 0.2rem 0.5rem; color: red; border-color: red;">Delete</button>
                    <h3>${v.vehicleNumber}</h3>
                    <p><strong>Type:</strong> ${v.vehicleType.charAt(0).toUpperCase() + v.vehicleType.slice(1)}</p>
                    <p><strong>Brand:</strong> ${v.brand}</p>
                    <p><strong>Color:</strong> ${v.color}</p>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p>Failed to load vehicles.</p>';
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p>Error loading vehicles.</p>';
    }
}

async function handleAddVehicle(event) {
    event.preventDefault();
    if (!user || user.name === 'Guest' || !user._id) {
        alert("Please login first to add a vehicle");
        return;
    }

    const vehicleNumber = document.getElementById('veh-number').value.toUpperCase();
    const vehicleType = document.getElementById('veh-type').value;
    const brand = document.getElementById('veh-brand').value;
    const color = document.getElementById('veh-color').value;

    try {
        const res = await fetch('/api/vehicles/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user._id,
                vehicleNumber,
                vehicleType,
                brand,
                color
            })
        });

        const data = await res.json();
        if (data.success) {
            document.getElementById('add-vehicle-form').reset();
            document.getElementById('add-vehicle-modal').classList.add('hidden');
            fetchVehicles(); // Reload list
        } else {
            alert(data.message || 'Failed to add vehicle');
        }
    } catch (err) {
        console.error(err);
        alert('Error adding vehicle');
    }
}

async function deleteVehicle(vehicleId) {
    if (!confirm('Are you sure you want to delete this vehicle?')) return;

    try {
        const res = await fetch(`/api/vehicles/${vehicleId}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
            fetchVehicles(); // Reload list
        } else {
            alert(data.message || 'Failed to delete vehicle');
        }
    } catch (err) {
        console.error(err);
        alert('Error deleting vehicle');
    }
}

// Intercept tab switching to load vehicles when My Vehicles tab is clicked
const originalSwitchTab = window.switchTab;
if (typeof originalSwitchTab === 'function') {
    window.switchTab = function (tabId) {
        originalSwitchTab(tabId);

        // Add index to map dynamically since we added Vehicles and changed Bookings position
        if (tabId === 'vehicles') {
            fetchVehicles();
        } else if (tabId === 'bookings') {
            fetchBookings();
        } else if (tabId === 'analytics') {
            loadAnalytics();
        }
    };
}

// --- Live Timer Logic ---
let activeTimerInterval = null;
function startGlobalTimer() {
    if (activeTimerInterval) clearInterval(activeTimerInterval);
    activeTimerInterval = setInterval(updateLiveTimers, 1000);
}

function updateLiveTimers() {
    const timerElements = document.querySelectorAll('.live-timer');
    timerElements.forEach(el => {
        const entryTime = new Date(el.dataset.entry);
        const now = new Date();
        const diffMs = Math.abs(now - entryTime);

        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        const seconds = Math.floor((diffMs % 60000) / 1000);

        el.innerText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // Also update estimated charge
        const chargeEl = document.getElementById(`charge-${el.dataset.id}`);
        if (chargeEl) {
            const blocks = Math.ceil((diffMs / 60000) / 10);
            chargeEl.innerText = `₹${blocks * 20}`;
        }
    });
}

// Feature 4: Bookings
async function fetchBookings() {
    if (!user || user.name === 'Guest' || !user._id) return;

    const container = document.getElementById('bookings-list');
    if (!container) return;

    container.innerHTML = '<p>Loading bookings...</p>';

    try {
        const res = await fetch(`/api/bookings/user/${user._id}`);
        const data = await res.json();

        if (data.success) {
            if (data.bookings.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted); text-align: center; padding: 2rem;">No active or past bookings found.</p>';
                return;
            }

            container.innerHTML = data.bookings.map(b => {
                const areaName = b.parkingAreaId ? b.parkingAreaId.name : 'Unknown Area';
                const slotNum = b.slotId ? b.slotId.slotNumber : 'N/A';
                const vNum = b.vehicleId ? b.vehicleId.vehicleNumber : 'Unknown';
                const start = new Date(b.startTime).toLocaleString();
                const end = new Date(b.endTime).toLocaleString();

                let actionBtn = '';
                let statusDetails = '';

                if (b.status === 'active') {
                    actionBtn = `
                        <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                            <button onclick="cancelBooking('${b._id}')" class="btn btn-outline" style="color: red; border-color: red; flex: 1; padding: 0.4rem;">Cancel Booking</button>
                            <button onclick="enterParking('${b._id}')" class="btn btn-primary" style="flex: 1; padding: 0.4rem;">Enter Parking</button>
                        </div>
                    `;
                } else if (b.status === 'in-progress') {
                    const entryT = b.entryTime || b.startTime;
                    statusDetails = `
                        <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-body); border-radius: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <small style="color: var(--text-muted); display: block;">Duration</small>
                                <strong class="live-timer" data-entry="${entryT}" data-id="${b._id}" style="font-family: monospace; font-size: 1.2rem; color: var(--primary-dark);">00:00:00</strong>
                            </div>
                            <div style="text-align: right;">
                                <small style="color: var(--text-muted); display: block;">Current Charge</small>
                                <strong id="charge-${b._id}" style="font-size: 1.2rem; color: var(--primary);">₹20</strong>
                            </div>
                        </div>
                        <div style="margin-top: 0.8rem; display: flex; gap: 0.5rem; align-items: center;">
                            <small style="color: var(--text-muted);">Extend By:</small>
                            <button onclick="extendParking('${b._id}', 10)" class="btn btn-outline" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;">+10m</button>
                            <button onclick="extendParking('${b._id}', 20)" class="btn btn-outline" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;">+20m</button>
                            <button onclick="extendParking('${b._id}', 30)" class="btn btn-outline" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;">+30m</button>
                        </div>
                    `;
                    actionBtn = `
                        <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                            <button onclick="exitParking('${b._id}')" class="btn btn-primary" style="background-color: #F59E0B; flex: 1; padding: 0.8rem; font-weight: 700;">Exit Parking & Pay</button>
                        </div>
                    `;
                }

                return `
                <div class="card" style="margin-bottom: 1rem; border-left: 4px solid ${b.status === 'in-progress' ? '#F59E0B' : '#10B981'};">
                    <div style="display: flex; justify-content: space-between;">
                        <h3>${areaName}</h3>
                        <span style="font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 0.3rem; background: ${b.status === 'active' ? '#10B981' : (b.status === 'completed' ? '#3B82F6' : (b.status === 'in-progress' ? '#F59E0B' : '#EF4444'))}; color: white; height: fit-content;">
                            ${b.status.toUpperCase()}
                        </span>
                    </div>
                    <p><strong>Slot:</strong> ${slotNum} &nbsp;|&nbsp; <strong>Vehicle:</strong> ${vNum}</p>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">
                        <strong>From:</strong> ${start}<br>
                        <strong>To:</strong> ${end}
                    </p>
                    ${statusDetails}
                    ${actionBtn}
                </div>
                `;
            }).join('');
            startGlobalTimer();
        } else {
            container.innerHTML = '<p>Failed to load bookings.</p>';
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p>Error loading bookings.</p>';
    }
}

async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    try {
        const res = await fetch(`/api/bookings/cancel/${bookingId}`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            alert('Booking cancelled successfully');
            fetchBookings(); // Reload list
        } else {
            alert(data.message || 'Failed to cancel booking');
        }
    } catch (err) {
        console.error(err);
        alert('Error cancelling booking');
    }
}

async function enterParking(bookingId) {
    if (!confirm('Simulate entry to parking location?')) return;

    try {
        const res = await fetch(`/api/parking/enter/${bookingId}`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            alert('Welcome! Parking entry logged.');
            fetchBookings(); // Reload list
        } else {
            alert(data.message || 'Entry failed');
        }
    } catch (err) {
        console.error(err);
        alert('Error simulating entry');
    }
}

async function exitParking(bookingId) {
    if (!confirm('Simulate exit from parking location?')) return;

    try {
        const res = await fetch(`/api/parking/exit/${bookingId}`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            // Show Summary Modal
            const s = data.summary;
            document.getElementById('summary-entry').innerText = new Date(s.entryTime).toLocaleTimeString();
            document.getElementById('summary-exit').innerText = new Date(s.exitTime).toLocaleTimeString();
            document.getElementById('summary-duration').innerText = s.duration;
            document.getElementById('summary-charge').innerText = `₹${s.totalCharge}`;

            if (s.overstay) {
                document.getElementById('exit-overstay-alert').classList.remove('hidden');
                document.getElementById('exit-overstay-msg').innerText = s.overstayMsg;
            } else {
                document.getElementById('exit-overstay-alert').classList.add('hidden');
            }

            document.getElementById('exit-modal').classList.remove('hidden');

            if (activeTimerInterval) clearInterval(activeTimerInterval);
        } else {
            alert(data.message || 'Exit failed');
        }
    } catch (err) {
        console.error(err);
        alert('Error simulating exit');
    }
}

async function extendParking(bookingId, minutes) {
    try {
        const res = await fetch(`/api/parking/extend/${bookingId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minutes })
        });
        const data = await res.json();

        if (data.success) {
            alert(`Parking extended! New exit time: ${new Date(data.newEndTime).toLocaleTimeString()}`);
            fetchBookings();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Error extending parking');
    }
}

// Feature 5: Real Time Slot Updates (Socket.io)
if (typeof socket !== 'undefined') {
    socket.on('slotBooked', (data) => {
        console.log('Real-time: Slot Booked', data);
        // Refresh grid if user is on the affected location (simplified implementation)
        const activeLoc = document.querySelector('.loc-card.active h4')?.innerText || "";
        // If we had a mechanism to link front-end locations to DB area IDs, we'd check here.
        // For now, if they are in the app, we can just optionally show a toast or re-render if we know the area matches.
    });

    socket.on('slotReleased', (data) => {
        console.log('Real-time: Slot Released', data);
    });

    socket.on('parkingFull', (data) => {
        console.log('Real-time: Parking Area Full', data);
    });

    socket.on('parkingAvailable', (data) => {
        console.log('Real-time: Parking Area Now Available', data);
    });

    socket.on('vehicleEntered', (data) => {
        console.log('Real-time: Vehicle Entered', data);
        if (typeof user !== 'undefined' && user && user._id && data.userId === user._id) {
            if (typeof fetchBookings === 'function') {
                fetchBookings();
            }
        }
    });

    socket.on('vehicleExited', (data) => {
        console.log('Real-time: Vehicle Exited', data);
        if (typeof user !== 'undefined' && user && user._id && data.userId === user._id) {
            if (typeof fetchBookings === 'function') {
                fetchBookings();
            }
        }
    });
}

// Feature 12: Parking Analytics
async function loadAnalytics() {
    if (!user || user.name === 'Guest' || !user._id) return;
    const container = document.getElementById('analytics-content');
    if (!container) return;

    try {
        const res = await fetch(`/api/analytics/owner/${user._id}`);
        const data = await res.json();

        if (data.success) {
            container.innerHTML = `
                <div class="card" style="text-align: center; border-bottom: 4px solid var(--primary);">
                    <small>Total Revenue</small>
                    <h2 style="color: var(--primary);">₹${data.totalRevenue}</h2>
                </div>
                <div class="card" style="text-align: center; border-bottom: 4px solid #F59E0B;">
                    <small>Occupied Slots</small>
                    <h2 style="color: #F59E0B;">${data.currentlyOccupied} / ${data.totalSlotsManaged}</h2>
                </div>
                <div class="card" style="text-align: center; border-bottom: 4px solid #10B981;">
                    <small>Usage Rate</small>
                    <h2 style="color: #10B981;">${data.usageRate}</h2>
                </div>
                <div class="card" style="text-align: center; border-bottom: 4px solid #8B5CF6;">
                    <small>Total Completed Bookings</small>
                    <h2 style="color: #8B5CF6;">${data.totalBookingsCompleted}</h2>
                </div>
            `;
        } else {
            container.innerHTML = `<p>Not an owner or failed to load data.</p>`;
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = `<p>Error fetching analytics.</p>`;
    }
}
