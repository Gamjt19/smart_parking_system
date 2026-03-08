const socket = io();
const user = JSON.parse(localStorage.getItem('user')) || { name: 'Guest', role: 'user' };
document.getElementById('user-name').innerText = user.name;

function applyGating() {
    const isOwner = user.role === 'parking_owner' || user.role === 'admin';
    const ownerItems = ['menu-camera-gate', 'menu-staff', 'menu-owner-bookings', 'header-owner'];
    ownerItems.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (isOwner) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });
}

async function syncUserRole() {
    if (!user || !user._id || user.name === 'Guest') return;
    try {
        const res = await fetch(`/api/user/profile/${user._id}`);
        const data = await res.json();
        if (data.success) {
            // Update local object and storage
            Object.assign(user, data.user);
            localStorage.setItem('user', JSON.stringify(user));
            applyGating(); // Re-apply gating with new role
        }
    } catch (err) {
        console.error("Role sync error:", err);
    }
}
syncUserRole(); // Initial sync
applyGating();

// --- Tab Switching ---
function switchTab(tabId) {
    // Hide all
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));

    // Show active
    const activeView = document.getElementById(`view-${tabId}`);
    if (activeView) activeView.classList.remove('hidden');

    // Highlight menu dynamically
    document.querySelectorAll('.menu-item').forEach(item => {
        if (item.getAttribute('onclick')?.includes(`'${tabId}'`)) {
            item.classList.add('active');
        }
    });

    // Load data if needed
    if (tabId === 'ev') loadEVStations();
    if (tabId === 'nearby') loadNearby();
    if (tabId === 'staff' || tabId === 'camera-gate' || tabId === 'owner-bookings') {
        verifyOwnershipAndLoad(tabId);
    }
    if (tabId === 'profile') loadProfile();
    if (tabId === 'bookings') loadUserBookings();
    if (tabId === 'list-land') loadUserListings();
}

let bookingTimerInterval = null;

async function loadUserBookings() {
    const list = document.getElementById('bookings-list');
    if (!list) return;

    list.innerHTML = '<div style="padding:2rem; text-align:center;"><div class="loader"></div><p>Fetching your bookings...</p></div>';

    try {
        const res = await fetch(`/api/bookings/user/${user._id}`);
        const data = await res.json();

        if (data.success && data.bookings.length > 0) {
            list.innerHTML = data.bookings.map(b => {
                const start = new Date(b.startTime);
                const end = new Date(b.endTime);
                const isEntering = b.status === 'in-progress';

                return `
                    <div class="card booking-card" data-id="${b._id}" data-entry="${b.entryTime || ''}" data-status="${b.status}" style="margin-bottom: 1.5rem; border-left: 4px solid ${b.status === 'in-progress' ? '#10b981' : (b.status === 'active' ? '#3b82f6' : '#94a3b8')}">
                        <div style="display:flex; justify-content:space-between; align-items:start;">
                            <div>
                                <h3 style="margin-bottom:0.2rem;">${b.parkingAreaId ? b.parkingAreaId.name : 'Unknown Area'}</h3>
                                <span class="badge" style="background:${getStatusColor(b.status)}20; color:${getStatusColor(b.status)}">${b.status.toUpperCase()}</span>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-weight:700; color:var(--primary);">₹${b.totalCharge || 'Prepaid'}</div>
                                <small style="color:var(--text-muted);">${b.vehicleId ? b.vehicleId.vehicleNumber : 'Vehicle'}</small>
                            </div>
                        </div>

                        <div style="margin-top:1.5rem; display:grid; grid-template-columns: 1fr 1fr; gap:1rem; background:#f8fafc; padding:1rem; border-radius:0.5rem;">
                            <div>
                                <small style="color:var(--text-muted); display:block;">Scheduled</small>
                                <div style="font-weight:600; font-size:0.9rem;">${start.toLocaleDateString()}</div>
                                <div style="font-size:0.8rem;">${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            ${isEntering ? `
                                <div>
                                    <small style="color:#10b981; display:block; font-weight:700;">⏱ Live Timer</small>
                                    <div class="live-timer" style="font-size:1.1rem; font-weight:700; color:#059669;">00:00:00</div>
                                    <small style="font-size:0.7rem; color:var(--text-muted);">Entered at ${new Date(b.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                                </div>
                            ` : `
                                <div>
                                    <small style="color:var(--text-muted); display:block;">Slot Number</small>
                                    <div style="font-weight:600;">Slot #${b.slotId ? 'Assigned' : 'Auto'}</div>
                                </div>
                            `}
                        </div>
                    </div>
                `;
            }).join('');

            startBookingTimers();
        } else {
            list.innerHTML = '<div style="padding:3rem; text-align:center; color:var(--text-muted);"><p>No bookings found.</p></div>';
        }
    } catch (err) {
        console.error("Error loading bookings:", err);
        list.innerHTML = '<p style="color:red; text-align:center;">Failed to load bookings.</p>';
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'active': return '#3b82f6';
        case 'in-progress': return '#10b981';
        case 'completed': return '#94a3b8';
        case 'cancelled': return '#ef4444';
        default: return '#64748b';
    }
}

function startBookingTimers() {
    if (bookingTimerInterval) clearInterval(bookingTimerInterval);

    const updateTimers = () => {
        document.querySelectorAll('.booking-card[data-status="in-progress"]').forEach(card => {
            const entryTimeStr = card.getAttribute('data-entry');
            if (!entryTimeStr) return;

            const entryTime = new Date(entryTimeStr);
            const now = new Date();
            const diff = now - entryTime;

            if (diff < 0) return;

            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);

            const timerEl = card.querySelector('.live-timer');
            if (timerEl) {
                timerEl.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
        });
    };

    updateTimers(); // Immediate run
    bookingTimerInterval = setInterval(updateTimers, 1000);
}

async function verifyOwnershipAndLoad(tabId) {
    if (!user || user.name === 'Guest') {
        alert('Please login to access owner features');
        return switchTab('parking');
    }

    if (user.role !== 'parking_owner' && user.role !== 'admin') {
        alert('You do not have a parking owner account.');
        return switchTab('list-land');
    }

    try {
        const res = await fetch(`/api/owner/properties/${user._id}`);
        const data = await res.json();

        if (data.success && data.properties.length > 0) {
            if (tabId === 'staff') initStaffSystem();
            if (tabId === 'camera-gate') initGateCamera();
            if (tabId === 'owner-bookings') {
                loadOwnerBookings();
                loadOwnerAnalytics();
            }
        } else {
            alert('Your property listings are pending approval. Features will unlock once approved.');
            switchTab('parking');
        }
    } catch (err) {
        console.error('Ownership verify error:', err);
        switchTab('parking');
    }
}

// --- Owner Bookings ---
async function loadOwnerBookings() {
    const list = document.getElementById('owner-bookings-list');
    if (!list) return;

    list.innerHTML = '<tr><td colspan="5" style="padding: 2rem; text-align: center;"><div class="loader"></div><p>Fetching bookings...</p></td></tr>';

    try {
        const res = await fetch(`/api/owner/bookings/${user._id}`);
        const data = await res.json();

        if (data.success && data.bookings.length > 0) {
            list.innerHTML = data.bookings.map(b => {
                const start = new Date(b.startTime);
                const end = new Date(b.endTime);

                const overstayAlert = b.isOverstay ? `<span style="color:#B91C1C; background:#FEF2F2; padding:0.2rem 0.5rem; border-radius:0.3rem; font-size:0.8rem; font-weight:600; display:inline-block; margin-top:0.4rem;">⚠️ OVERSTAY</span>` : '';

                return `
                    <tr style="border-bottom: 2px solid var(--border); transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                        <td style="padding: 1rem;">
                            <div style="font-weight: 600; color: var(--primary-dark);">${b.userName}</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted);">${b.vehicleNumber}</div>
                        </td>
                        <td style="padding: 1rem; font-weight: 500;">${b.parkingAreaName}</td>
                        <td style="padding: 1rem;">
                            <span class="badge" style="background:${getStatusColor(b.status)}20; color:${getStatusColor(b.status)}; font-size:0.75rem;">${b.status.toUpperCase()}</span>
                            ${overstayAlert}
                        </td>
                        <td style="padding: 1rem; font-size: 0.85rem;">
                            <div style="color: var(--text-muted);">Booked: ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            ${b.entryTime ? `<div style="color: #059669; margin-top:0.2rem;">In: ${new Date(b.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>` : ''}
                            ${b.exitTime ? `<div style="color: #64748b;">Out: ${new Date(b.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>` : ''}
                        </td>
                        <td style="padding: 1rem;">
                            ${b.entryMethod === 'staff_scan' ? '<span style="background:#E0F2FE; color:#0369A1; padding:0.3rem 0.6rem; border-radius:1rem; font-size:0.8rem;">👨‍💼 Staff Entry</span>' :
                        b.entryMethod === 'anpr_camera' ? '<span style="background:#DCFCE7; color:#15803D; padding:0.3rem 0.6rem; border-radius:1rem; font-size:0.8rem;">📷 Gate Camera</span>' :
                            '<span style="color:var(--text-muted);">N/A</span>'}
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            list.innerHTML = '<tr><td colspan="5" style="padding: 3rem; text-align: center; color: var(--text-muted);">No bookings found for your properties.</td></tr>';
        }
    } catch (err) {
        console.error("Owner bookings error:", err);
        list.innerHTML = '<tr><td colspan="5" style="padding: 2rem; text-align: center; color: red;">Failed to load bookings.</td></tr>';
    }
}

// --- Nearby Parking (Leaflet + OSM) ---
let nearbyMap;
let nearbyMarkers = [];

function initNearbyMap() {
    if (nearbyMap) return;
    nearbyMap = L.map('nearby-map').setView([9.9312, 76.2673], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(nearbyMap);

    fetchNearbyParking(9.9312, 76.2673);
}

async function searchNearbyCity() {
    const query = document.getElementById('nearby-city-search').value;
    if (!query) return alert('Please enter a city or area');

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json`);
        const data = await res.json();

        if (data.length > 0) {
            const { lat, lon } = data[0];
            nearbyMap.setView([lat, lon], 14); // Zoom in slightly more for areas
            fetchNearbyParking(lat, lon, 2000);
        } else {
            alert('Location not found!');
        }
    } catch (err) {
        console.error(err);
        alert('Error searching location');
    }
}

function getDirections(destLat, destLon) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            window.open(`https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${destLat},${destLon}`, '_blank');
        }, () => {
            // Fallback if location denied: just open destination
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}`, '_blank');
        });
    } else {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}`, '_blank');
    }
}

async function fetchNearbyParking(lat, lon, radius = 2000) {
    const list = document.getElementById('nearby-list');
    list.innerHTML = 'Finding nearest slots...';

    // Clear markers
    nearbyMarkers.forEach(m => nearbyMap.removeLayer(m));
    nearbyMarkers = [];

    // const radius = 5000; // 5km - now using parameter
    const overpassQuery = `
        [out:json];
        (
          node["amenity"="parking"](around:${radius}, ${lat}, ${lon});
          way["amenity"="parking"](around:${radius}, ${lat}, ${lon});
        );
        out center;
    `;

    try {
        let osmData = { elements: [] };
        let internalData = { success: false, areas: [] };

        try {
            const osmRes = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`);
            osmData = await osmRes.json();
        } catch (e) { console.error("OSM Fetch Error:", e); }

        try {
            const internalRes = await fetch(`/api/parking/nearby?lat=${lat}&lon=${lon}&radius=${radius}`);
            internalData = await internalRes.json();
        } catch (e) { console.error("Internal Nearby Fetch Error:", e); }

        list.innerHTML = '';

        // 1. Process Internal Data (Priority)
        if (internalData.success) {
            internalData.areas.forEach(area => {
                const distKm = getDistance(lat, lon, area.location.coordinates[1], area.location.coordinates[0]).toFixed(1);
                addParkingCard(list, {
                    name: area.name,
                    lat: area.location.coordinates[1],
                    lon: area.location.coordinates[0],
                    distance: `${distKm} km`,
                    availability: area.availableSlots,
                    totalSlots: area.totalSlots,
                    rate: area.pricePerHour,
                    type: area.isPublicOSM ? 'Public' : 'P4 Verified',
                    isInternal: true
                });
            });
        }

        // 2. Process OSM Data
        osmData.elements.forEach(lot => {
            const lLat = lot.lat || lot.center.lat;
            const lLon = lot.lon || lot.center.lon;
            const distKm = getDistance(lat, lon, lLat, lLon).toFixed(1);

            addParkingCard(list, {
                name: lot.tags.name || 'Public Parking',
                lat: lLat,
                lon: lLon,
                distance: `${distKm} km`,
                availability: '?',
                totalSlots: lot.tags.capacity || '?',
                rate: lot.tags.fee === 'yes' ? 'Paid' : 'Free/Unknown',
                type: 'OSM Public',
                isInternal: false
            });
        });

        if (list.innerHTML === '') {
            list.innerHTML = '<p>No parking found nearby.</p>';
        }

    } catch (err) {
        console.error(err);
        list.innerText = 'Error fetching parking data';
    }
}

// Helper: Haversine distance
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function addParkingCard(container, p) {
    const marker = L.marker([p.lat, p.lon]).addTo(nearbyMap)
        .bindPopup(`
            <b>${p.name}</b><br>${p.type}<br>Dist: ${p.distance}
            <br><button onclick="getDirections(${p.lat}, ${p.lon})" style="margin-top:5px; padding:2px 8px; cursor:pointer;">Navigate ↗</button>
        `);
    nearbyMarkers.push(marker);

    const card = document.createElement('div');
    card.className = 'card';
    card.style = "border-left: 4px solid " + (p.isInternal ? "var(--primary)" : "#94a3b8");
    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:start;">
            <div>
                <h3 style="margin-bottom:0.2rem;">${p.name}</h3>
                <span style="font-size:0.8rem; color:var(--text-muted);">${p.type} • ${p.distance}</span>
            </div>
            <span style="color:var(--primary); font-weight:bold;">${typeof p.rate === 'number' ? '₹' + p.rate + '/hr' : p.rate}</span>
        </div>
        <div style="margin-top:1rem; display:flex; gap:1rem;">
            <div style="flex:1;">
                <small style="color:var(--text-muted);">Availability</small>
                <div style="font-weight:600; color:${p.availability === 0 ? 'var(--danger)' : 'var(--success)'}">${p.availability} / ${p.totalSlots}</div>
            </div>
        </div>
        <div style="display:flex; gap:0.5rem; margin-top:1rem;">
            <button class="btn btn-primary" onclick="nearbyMap.setView([${p.lat}, ${p.lon}], 16)" style="flex:1;">View Map</button>
            <button class="btn btn-outline" onclick="getDirections(${p.lat}, ${p.lon})" style="flex:1;">Navigate ↗</button>
        </div>
    `;
    container.appendChild(card);
}

// Init when tab switched
async function loadNearby() {
    setTimeout(initNearbyMap, 200);
}

// --- High Fidelity Booking Logic ---

let locationsData = [];

let selectedSlots = new Set();
let currentRate = 20;

async function loadAllParkingAreas() {
    const container = document.getElementById('location-scroll');
    if (!container) return;

    container.innerHTML = '<div style="padding:2rem; text-align:center;"><div class="loader"></div><p>Fetching active parking lots...</p></div>';

    try {
        const res = await fetch('/api/parking-areas');
        const data = await res.json();

        if (data.success) {
            locationsData = data.areas.map(area => ({
                name: area.name,
                dist: area.isPublicOSM ? "Public Space" : "P4 Verified",
                rate: area.pricePerHour,
                avail: area.availableSlots,
                totalSlots: area.totalSlots,
                img: `https://placehold.co/600x400/3B82F6/ffffff?text=${encodeURIComponent(area.name)}`,
                lat: area.location.coordinates[1],
                lon: area.location.coordinates[0],
                id: area._id,
                _id: area._id // Keep both for safety
            }));

            renderLocations();
            populateSearchSuggestions();
        }
    } catch (err) {
        console.error("Error loading areas:", err);
        container.innerHTML = '<p style="padding:1rem; color:red">Failed to load parking areas.</p>';
    }
}

function initDashboard() {
    loadAllParkingAreas();
    renderMockGrid();
    loadDashboardVehicles();

    // Set default Filters
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');

    // End time 1 hour from now
    const later = new Date(now.getTime() + 60 * 60 * 1000);
    const laterHours = String(later.getHours()).padStart(2, '0');
    const laterMinutes = String(later.getMinutes()).padStart(2, '0');

    if (document.getElementById('booking-date')) {
        document.getElementById('booking-date').value = today;
        document.getElementById('booking-date').min = today; // Prevent past bookings
    }
    if (document.getElementById('start-time')) document.getElementById('start-time').value = `${currentHours}:${currentMinutes}`;
    if (document.getElementById('end-time')) document.getElementById('end-time').value = `${laterHours}:${laterMinutes}`;

    // Auto-open tab from URL if present
    const urlParams = new URLSearchParams(window.location.search);
    const tabToOpen = urlParams.get('tab');
    if (tabToOpen) {
        setTimeout(() => switchTab(tabToOpen), 300);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

async function loadDashboardVehicles() {
    const select = document.getElementById('dashboard-vehicle-select');
    if (!select || !user || !user._id || user.name === 'Guest') {
        if (select) select.innerHTML = '<option value="">Login to see vehicles</option>';
        return;
    }

    try {
        const res = await fetch(`/api/vehicles/user/${user._id}`);
        const data = await res.json();

        if (data.success && data.vehicles.length > 0) {
            select.innerHTML = data.vehicles.map(v =>
                `<option value="${v.vehicleNumber}">${v.vehicleNumber} (${v.brand})</option>`
            ).join('');
            updateTopVehicleInfo(); // Initial sync
        } else {
            select.innerHTML = '<option value="">No vehicles found</option>';
        }
    } catch (err) {
        console.error("Error loading dashboard vehicles:", err);
        select.innerHTML = '<option value="">Error loading vehicles</option>';
    }
}

function updateTopVehicleInfo() {
    const select = document.getElementById('dashboard-vehicle-select');
    const info = document.getElementById('selected-vehicle-info');
    if (select && info) {
        const selectedOption = select.options[select.selectedIndex];
        if (selectedOption && selectedOption.value) {
            info.innerHTML = `Ready for booking with: <strong style="color: var(--primary-dark);">${selectedOption.text}</strong>`;
        } else {
            info.innerText = "Please select a vehicle to proceed";
        }
    }
}

function populateSearchSuggestions() {
    const datalist = document.getElementById('location-suggestions');
    if (!datalist) return;

    datalist.innerHTML = locationsData.map(loc => `<option value="${loc.name}">`).join('');
}

function renderLocations(filterText = '') {
    const container = document.getElementById('location-scroll');
    if (!container) return;

    const filtered = locationsData.filter(loc =>
        loc.name.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filtered.length === 0) {
        container.innerHTML = '<p style="padding:1rem; color:#666">No locations found.</p>';
        return;
    }

    container.innerHTML = filtered.map((loc, index) => `
        <div class="loc-card" onclick="selectLocation(this, '${loc.name}', ${loc.rate}, '${loc.dist}')">
            <img src="${loc.img}" alt="${loc.name}">
            <h4>${loc.name}</h4>
            <div class="meta">
                <span>📍 ${loc.dist}</span>
                <span class="rate">₹${loc.rate}/hr</span>
            </div>
            <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                <div class="status-badge" style="background: ${loc.avail > 10 ? '#10B981' : (loc.avail > 0 ? '#F59E0B' : '#EF4444')}; flex:1; margin:0;">
                    ${loc.avail > 0 ? `${loc.avail} Slots` : 'Full'}
                </div>
                <button class="status-badge" style="background:#3B82F6; color:white; border:none; cursor:pointer;" onclick="event.stopPropagation(); openDirections('${loc.name}')">
                    Navigate ↗
                </button>
            </div>
        </div>
    `).join('');

    // Select first by default if filtering
    if (filterText && filtered.length > 0) {
        currentRate = filtered[0].rate;
        updateFooter();
    }
}

let searchTimeout;

function filterLocations() {
    const query = document.getElementById('location-global-search').value;

    // Clear timeout for debouncing
    clearTimeout(searchTimeout);

    // 1. Local Filter (Predefined)
    renderLocations(query);

    // 2. Map-based suggestions (Real-world Kerala)
    if (query.length > 2) {
        searchTimeout = setTimeout(() => searchKeralaPlaces(query), 500);
    } else {
        hideSuggestions();
    }
}

async function searchKeralaPlaces(query) {
    const datalist = document.getElementById('location-suggestions');
    if (!datalist) return;

    try {
        // Query limited to Kerala, India
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}+Kerala+India&format=json&limit=5`);
        const data = await res.json();

        datalist.innerHTML = '';
        if (data.length > 0) {
            data.forEach(place => {
                const opt = document.createElement('option');
                opt.value = place.display_name;
                // Store coords in data attributes for the oninput/onchange handling
                opt.dataset.lat = place.lat;
                opt.dataset.lon = place.lon;
                datalist.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Geocoding error:", err);
    }
}

function handleSearchChange(e) {
    const val = e.target.value;
    const opts = document.getElementById('location-suggestions').childNodes;

    for (let i = 0; i < opts.length; i++) {
        if (opts[i].value === val) {
            // User selected an API suggestion
            const lat = opts[i].dataset.lat;
            const lon = opts[i].dataset.lon;
            const name = val.split(',')[0]; // Short name

            // Fetch dynamic parking for the selected city with 2km radius
            fetchRealParking(lat, lon, 2000, name);
            break;
        }
    }
}

async function findParkingNearMe() {
    if ("geolocation" in navigator) {
        document.getElementById('location-global-search').value = "Detecting & Fetching Lots...";

        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            try {
                // 1. Get City Name
                const reverseRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                const reverseData = await reverseRes.json();

                let areaName = 'My Location';
                if (reverseData && reverseData.address) {
                    areaName = reverseData.address.city || reverseData.address.town || reverseData.address.village || reverseData.address.suburb || reverseData.address.county || 'My Area';
                }
                document.getElementById('location-global-search').value = areaName;

                // 2. Fetch Real Parking (2km radius for exact location)
                fetchRealParking(lat, lon, 2000, "My Current Location");

            } catch (err) {
                console.error("Reverse geocoding failed", err);
                document.getElementById('location-global-search').value = "Location found (Offline Mode)";
                addDynamicLocation("Offline Area", lat, lon);
            }
        }, (error) => {
            console.error("Geolocation error:", error);
            document.getElementById('location-global-search').value = "";
            renderLocations(); // Restore default list
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    alert("Location access denied. Please enable location permissions.");
                    break;
                case error.POSITION_UNAVAILABLE:
                    alert("Location information unavailable.");
                    break;
                case error.TIMEOUT:
                    alert("Request timed out.");
                    break;
                default:
                    alert("Unknown error getting location.");
            }
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}

/**
 * fetchRealParking merges Internal DB areas with OSM Overpass data
 */
async function fetchRealParking(lat, lon, radius = 2000, locationName = "") {
    const container = document.getElementById('location-scroll');
    if (!container) return;

    // Show loading in both list and map
    container.innerHTML = '<div style="padding:2rem; text-align:center;"><div class="loader"></div><p>Searching for Verified & Public slots...</p></div>';

    // Also trigger the "Nearby" tab's map view
    fetchNearbyParking(lat, lon, radius);

    try {
        // Clear locationsData for fresh search, but we will repopulate with internal + OSM
        locationsData.length = 0;

        // 1. Fetch from Internal API first (Priority)
        const intRes = await fetch(`/api/parking/nearby?lat=${lat}&lon=${lon}&radius=${radius}`);
        const intData = await intRes.json();
        if (intData.success) {
            intData.areas.forEach(area => {
                locationsData.push({
                    name: area.name,
                    dist: "Verified Area",
                    rate: area.pricePerHour,
                    avail: area.availableSlots,
                    totalSlots: area.totalSlots,
                    img: `https://placehold.co/600x400/10B981/ffffff?text=${encodeURIComponent(area.name)}`,
                    lat: area.location.coordinates[1],
                    lon: area.location.coordinates[0],
                    _id: area._id,
                    isInternal: true
                });
            });
        }

        // 2. Fetch from OSM Overpass for additional public data
        const query = `
            [out:json][timeout:25];
            (
              node["amenity"="parking"](around:${radius}, ${lat}, ${lon});
              way["amenity"="parking"](around:${radius}, ${lat}, ${lon});
              relation["amenity"="parking"](around:${radius}, ${lat}, ${lon});
              
              // Also fetch named major POIs that might own a parking lot
              node["name"]["shop"="mall"](around:${radius}, ${lat}, ${lon});
              way["name"]["shop"="mall"](around:${radius}, ${lat}, ${lon});
              node["name"]["shop"="supermarket"](around:${radius}, ${lat}, ${lon});
              way["name"]["shop"="supermarket"](around:${radius}, ${lat}, ${lon});
              node["name"]["amenity"="hospital"](around:${radius}, ${lat}, ${lon});
              way["name"]["amenity"="hospital"](around:${radius}, ${lat}, ${lon});
            );
            out center;
        `;

        const overpassRes = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const overpassData = await overpassRes.json();

        // We separate the parking elements from the named buildings
        const parkingLots = overpassData.elements.filter(e => e.tags && e.tags.amenity === 'parking');
        const namedPlaces = overpassData.elements.filter(e => e.tags && e.tags.name && e.tags.amenity !== 'parking');

        if (parkingLots.length > 0) {
            parkingLots.forEach((lot, i) => {
                const lLat = lot.lat || lot.center.lat;
                const lLon = lot.lon || lot.center.lon;

                // 1. Try direct tags
                let lotName = lot.tags.name ||
                    lot.tags['name:en'] ||
                    lot.tags.operator ||
                    lot.tags.description;

                // 2. Fallback: Find the closest named place (like a mall) within ~100 meters
                if (!lotName && namedPlaces.length > 0) {
                    let closestPlace = null;
                    let minDist = 0.001; // Roughly 100 meters in raw lat/lon degrees

                    namedPlaces.forEach(place => {
                        const pLat = place.lat || place.center.lat;
                        const pLon = place.lon || place.center.lon;
                        // Simple euclidean distance for approximation
                        const dist = Math.sqrt(Math.pow(pLat - lLat, 2) + Math.pow(pLon - lLon, 2));
                        if (dist < minDist) {
                            minDist = dist;
                            closestPlace = place;
                        }
                    });

                    if (closestPlace) {
                        lotName = `${closestPlace.tags.name} Parking`;
                    }
                }

                // 3. Fallback to building/parking type strings
                if (!lotName && lot.tags.building) {
                    lotName = `${lot.tags.building.charAt(0).toUpperCase() + lot.tags.building.slice(1)} Parking`;
                } else if (!lotName && lot.tags.parking) {
                    lotName = `${lot.tags.parking.charAt(0).toUpperCase() + lot.tags.parking.slice(1)} Parking`;
                }

                lotName = lotName || `Public Parking Lot ${i + 1}`;

                const isPaid = lot.tags.fee === 'yes';
                const capacity = parseInt(lot.tags.capacity) || (Math.floor(Math.random() * 50) + 10);

                locationsData.push({
                    name: lotName,
                    dist: "Fetched", // Would need turf.js or Haversine for real distance calculation
                    rate: isPaid ? 40 : 20,
                    avail: Math.floor(Math.random() * capacity), // Mocking availability for real locations
                    img: `https://placehold.co/600x400/3B82F6/ffffff?text=${encodeURIComponent(lotName)}`,
                    lat: lLat,
                    lon: lLon,
                    isDynamic: true
                });
            });

            renderLocations();
        } else {
            container.innerHTML = '<p style="padding:1rem; color:#666">No nearby parking locations found on OpenStreetMap.</p>';
            // Fallback to our dummy data so it's not totally empty
            addDynamicLocation(locationName ? locationName : "Selected Area", lat, lon);
        }
    } catch (err) {
        console.error("Overpass Failed", err);
        container.innerHTML = '<p style="padding:1rem; color:red">Error fetching parking locations.</p>';
        addDynamicLocation(locationName ? locationName + " (Offline)" : "Offline Area", lat, lon);
    }
}

function addDynamicLocation(name, lat, lon) {
    // Check if already exists in locationsData
    const exists = locationsData.find(l => l.name === name);
    if (!exists) {
        const newLoc = {
            name: name,
            dist: "Nearby Area",
            rate: 20, // Default dynamic rate
            avail: Math.floor(Math.random() * 50) + 10,
            img: `https://placehold.co/600x400/3B82F6/ffffff?text=${encodeURIComponent(name)}+Parking`,
            lat: lat,
            lon: lon,
            isDynamic: true
        };
        locationsData.unshift(newLoc); // Add to top
    }
    renderLocations();
}

function selectLocation(card, name, rate, dist) {
    document.querySelectorAll('.loc-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    currentRate = rate;
    selectedSlots.clear();

    // Update Detail View Headers
    document.getElementById('detail-area-name').innerText = name;
    document.getElementById('detail-area-dist').innerText = dist;
    document.getElementById('detail-area-rate').innerText = `₹${rate}`;

    // Switch Views
    document.getElementById('parking-list-section').classList.add('hidden');
    document.getElementById('parking-detail-section').classList.remove('hidden');

    // If we have real area data, we should fetch actual slots instead of mock grid
    const area = locationsData.find(l => l.name === name);
    if (area && area._id) {
        loadAreaSlots(area._id);
    } else {
        renderMockGrid();
    }
    updateFooter();
}

async function loadAreaSlots(areaId) {
    const grid = document.getElementById('slots-grid');
    if (!grid) return;

    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:2rem;">Loading slots...</div>';

    try {
        const res = await fetch(`/api/slots/${areaId}`);
        const data = await res.json();

        if (data.success) {
            grid.innerHTML = data.slots.map(slot => `
                <div class="slot ${slot.status}" onclick="toggleSlotSelect('${slot._id}', this, ${slot.status === 'available'})">
                    ${slot.slotNumber}
                    <small style="display:block; font-size:0.6rem;">${slot.vehicleType}</small>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error("Error loading slots:", err);
        grid.innerHTML = '<div style="grid-column: 1/-1; color:red; padding:1rem;">Error loading slots</div>';
    }
}

function toggleSlotSelect(slotId, element, isAvailable) {
    if (!isAvailable) return;

    if (selectedSlots.has(slotId)) {
        selectedSlots.delete(slotId);
        element.classList.remove('selected');
    } else {
        selectedSlots.add(slotId);
        element.classList.add('selected');
    }
    updateFooter();
}

function goBackToResults() {
    document.getElementById('parking-list-section').classList.remove('hidden');
    document.getElementById('parking-detail-section').classList.add('hidden');
    document.getElementById('booking-footer').classList.add('hidden');
    selectedSlots.clear();
}

function openDirections(locationName) {
    const loc = locationsData.find(l => l.name === locationName);
    let url;
    if (loc && loc.lat && loc.lon) {
        url = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lon}`;
    } else {
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationName)}+Kerala`;
    }
    window.open(url, '_blank');
}

function hideSuggestions() {
    const datalist = document.getElementById('location-suggestions');
    if (datalist) datalist.innerHTML = '';
}

function renderMockGrid() {
    // Grid removed as per user request to use Auto-Assignment only.
    const container = document.getElementById('parking-grid');
    if (container) container.innerHTML = "";
}

function toggleSlot(id) {
    if (selectedSlots.has(id)) {
        selectedSlots.delete(id);
    } else {
        selectedSlots.add(id);
    }
    renderMockGrid();
    updateFooter();
}

function getDuration() {
    const start = document.getElementById('start-time')?.value || "10:00";
    const end = document.getElementById('end-time')?.value || "12:00";

    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);

    let duration = (eh + em / 60) - (sh + sm / 60);
    if (duration <= 0) duration += 24; // Handle Next Day crossing roughly

    return Math.max(1, Math.ceil(duration)); // Min 1 hour
}

function updateFooter() {
    updateFooterForAutoAssign();
}

// Show the footer immediately for the active card, even without explicit selection,
// to enable "Auto-Assign" flow.
function updateFooterForAutoAssign() {
    const footer = document.getElementById('booking-footer');
    footer.classList.remove('hidden');

    const duration = getDuration();
    const price = currentRate * duration; // Default 1 slot

    document.getElementById('selected-slot-display').innerHTML = `<i>Auto-Assign (1 Slot)</i>`;
    document.getElementById('price-display').innerHTML = `₹${price} <small style="font-size:0.8rem; font-weight:normal;">(${duration}h x ₹${currentRate})</small>`;

    const btn = footer.querySelector('button');
    btn.innerText = `Book & Pay ₹${price}`;
}

function updateTimeDisplay() {
    // Legacy function, replaced by dynamic updateFooter() on input change
    updateFooter();
}

function proceedToPayment() {
    let priceText = document.getElementById('price-display').innerText;
    let priceMatch = priceText.match(/₹(\d+)/);
    let amount = priceMatch ? priceMatch[1] : 0;

    let slots = Array.from(selectedSlots).join(',');
    const duration = getDuration();

    if (!slots) {
        // Auto-assign logic
        // Count how many we are booking. For this UI, default to 1 vehicle (1 slot)
        slots = 'AUTO';
        amount = currentRate * duration;
    }

    const location = document.querySelector('.loc-card.active h4')?.innerText || "Unknown";
    const area = locationsData.find(l => l.name === location);
    const areaId = area ? (area._id || area.id) : "";

    const start = document.getElementById('start-time').value;
    const end = document.getElementById('end-time').value;
    const bookingDate = document.getElementById('booking-date')?.value || new Date().toISOString().split('T')[0];
    const plate = document.getElementById('dashboard-vehicle-select')?.value || "";

    // Past Date Validation
    if (bookingDate && start) {
        const selectedTime = new Date(`${bookingDate}T${start}:00`);
        const currentTime = new Date();
        // Allow a small 5 minute grace period backwards for user hesitations
        if (selectedTime < new Date(currentTime.getTime() - 5 * 60000)) {
            return alert("You cannot book a parking slot in the past. Please select a valid future time.");
        }
    }

    window.location.href = `payment-gateway.html?slot=${slots}&location=${encodeURIComponent(location)}&areaId=${areaId}&date=${bookingDate}&start=${start}&end=${end}&amount=${amount}&hours=${duration}&plate=${plate}`;
}

// Init
setTimeout(initDashboard, 100);

// --- EV Stations (Leaflet + OSM) ---
let map;
let markers = [];

function initMap() {
    if (map) return;
    // Default to Kochi, India
    map = L.map('ev-map').setView([9.9312, 76.2673], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Load initial stations near default
    fetchStations(9.9312, 76.2673);
}

async function searchCity() {
    const city = document.getElementById('ev-city-search').value;
    if (!city) return alert('Please enter a city name');

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?city=${city}&format=json`);
        const data = await res.json();

        if (data.length > 0) {
            const { lat, lon } = data[0];
            map.setView([lat, lon], 13);
            fetchStations(lat, lon);
        } else {
            alert('City not found!');
        }
    } catch (err) {
        console.error(err);
        alert('Error searching city');
    }
}

function findNearMe() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            map.setView([latitude, longitude], 13);
            fetchStations(latitude, longitude);
        }, () => alert('Location access denied'));
    } else {
        alert('Geolocation not supported');
    }
}

async function fetchStations(lat, lon) {
    const list = document.getElementById('ev-list');
    list.innerHTML = 'Loading nearby stations...';

    // Clear existing markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    // Overpass API Query for charging stations
    const query = `
        [out:json];
        node["amenity"="charging_station"](around:5000, ${lat}, ${lon});
        out;
    `;

    try {
        const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const data = await res.json();
        const stations = data.elements;

        list.innerHTML = '';

        if (stations.length === 0) {
            list.innerHTML = '<p>No charging stations found nearby.</p>';
            return;
        }

        stations.forEach(st => {
            // Add Marker
            const marker = L.marker([st.lat, st.lon]).addTo(map)
                .bindPopup(`<b>${st.tags.name || 'EV Station'}</b><br>${st.tags.operator || 'Unknown Operator'}`);
            markers.push(marker);

            // Add Card
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h3>${st.tags.name || 'Charging Point'}</h3>
                <p style="color:var(--text-muted)">${st.tags.operator || 'Public Station'}</p>
                <p style="font-size:0.8rem; margin-top:0.5rem">Lat: ${st.lat.toFixed(4)}, Lng: ${st.lon.toFixed(4)}</p>
                <button class="btn btn-primary" style="margin-top:0.5rem; width:100%" 
                    onclick="map.setView([${st.lat}, ${st.lon}], 16)">View on Map</button>
            `;
            list.appendChild(card);
        });

    } catch (err) {
        console.error(err);
        list.innerText = 'Failed to load stations from OpenStreetMap.';
    }
}

async function loadEVStations() {
    // Just ensure map is init
    setTimeout(initMap, 200); // Small delay to ensure container is visible
}

// --- Number Plate Scanner ---
async function scanPlate() {
    const plate = document.getElementById('plate-input').value;
    if (!plate) return alert('Enter a plate number');

    try {
        const res = await fetch('/api/vehicle/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plate })
        });
        const result = await res.json();

        // Use unified renderer from ocr-system.js
        if (typeof renderScanResult === 'function') {
            renderScanResult(result);
        } else {
            console.error('renderScanResult not found. OCR System JS likely not loaded.');
            alert(result.success ? `Found owner: ${result.ownerName}` : result.message);
        }
    } catch (err) {
        console.error(err);
        alert('Error lookup up vehicle');
    }
}

// --- Notifications ---
const notifPanel = document.getElementById('notif-panel');
const notifList = document.getElementById('notif-list');
const notifBadge = document.getElementById('notif-badge');
let notifCount = 0;

function toggleNotif() {
    notifPanel.classList.toggle('hidden');
    // Reset count
    notifCount = 0;
    notifBadge.style.display = 'none';
}

socket.on('notification', (data) => {
    // 1. Toast Alert
    // alert(data.message); // Simple alert, or we could make a custom toast

    // 2. Add to list
    if (notifList.children[0]?.innerText === 'No new notifications') {
        notifList.innerHTML = '';
    }

    const item = document.createElement('div');
    item.style.padding = '1rem';
    item.style.borderBottom = '1px solid #f3f4f6';
    item.style.fontSize = '0.9rem';
    item.style.background = data.type === 'alert' ? '#FEF2F2' : 'white';
    item.innerHTML = `${data.message} <br><small style="color:#aaa">${new Date().toLocaleTimeString()}</small>`;

    notifList.prepend(item);

    // 3. Update Badge
    notifCount++;
    notifBadge.innerText = notifCount;
    notifBadge.style.display = 'block';
});

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// --- Profile Management ---
function loadProfile() {
    if (!user || user.name === 'Guest') {
        alert('Please login to manage your profile');
        return switchTab('parking');
    }

    document.getElementById('profile-name').value = user.name || '';
    document.getElementById('profile-email').value = user.email || '';
    document.getElementById('profile-phone').value = user.phone || '';
    document.getElementById('profile-carrier').value = user.carrier || 'Airtel';
}

async function handleUpdateProfile(e) {
    e.preventDefault();
    const updatedData = {
        userId: user._id,
        name: document.getElementById('profile-name').value,
        phone: document.getElementById('profile-phone').value,
        carrier: document.getElementById('profile-carrier').value
    };

    try {
        const res = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        const data = await res.json();

        if (data.success) {
            alert('Profile updated successfully!');
            // Update local user object and localStorage
            Object.assign(user, data.user);
            localStorage.setItem('user', JSON.stringify(user));
            // Update UI elements
            document.getElementById('user-name').innerText = user.name;
        } else {
            alert(data.message || 'Failed to update profile');
        }
    } catch (err) {
        console.error(err);
        alert('Error updating profile');
    }
}

// --- Owner Feature Logic ---

function getCurrentCoords() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            document.getElementById('list-coords').value = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
        }, () => alert("Could not get location. Please enter manually."));
    } else {
        alert("Geolocation not supported.");
    }
}

async function handleListLand(e) {
    e.preventDefault();
    const types = Array.from(document.querySelectorAll('input[name="type"]:checked')).map(cb => cb.value);
    const coordsRaw = document.getElementById('list-coords').value.split(',').map(s => parseFloat(s.trim()));

    const listingData = {
        ownerId: user._id,
        title: document.getElementById('list-title').value,
        coordinates: [coordsRaw[1], coordsRaw[0]], // [Lon, Lat] for GeoJSON
        capacity: parseInt(document.getElementById('list-capacity').value),
        pricePerHour: parseInt(document.getElementById('list-price').value),
        vehicleTypesAllowed: types,
        slotNumberingType: document.getElementById('list-numbering-type').value,
        pricingModel: document.getElementById('list-pricing-model').value
    };

    try {
        const res = await fetch('/api/listings/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(listingData)
        });
        const data = await res.json();
        if (data.success) {
            alert("Property submitted successfully! It will appear in your dashboard once approved by the admin.");
            loadUserListings(); // Refresh the status list
            e.target.reset(); // Clear form
        } else {
            alert(data.message || "Failed to submit listing.");
        }
    } catch (err) {
        console.error(err);
        alert("Error submitting listing.");
    }
}

async function loadUserListings() {
    const list = document.getElementById('user-listings-list');
    if (!list || !user || !user._id || user.name === 'Guest') return;

    try {
        const res = await fetch(`/api/listings/user/${user._id}`);
        const data = await res.json();

        if (data.success) {
            if (data.listings.length === 0) {
                list.innerHTML = '<tr><td colspan="3" style="padding: 2rem; text-align: center; color: var(--text-muted);">You have no property listings yet.</td></tr>';
                return;
            }

            list.innerHTML = data.listings.map(l => `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 1rem; font-weight: 500;">${l.title}</td>
                    <td style="padding: 1rem;">${new Date(l.createdAt).toLocaleDateString()}</td>
                    <td style="padding: 1rem;">
                        <span style="padding: 0.3rem 0.8rem; border-radius: 1rem; font-size: 0.8rem; font-weight: 600; 
                            background: ${l.isApproved ? '#DEF7EC' : '#FDE8E8'}; 
                            color: ${l.isApproved ? '#03543F' : '#9B1C1C'};">
                            ${l.isApproved ? '✅ Approved' : '⏳ Pending'}
                        </span>
                    </td>
                </tr>
            `).join('');
        } else {
            list.innerHTML = '<tr><td colspan="3" style="padding: 2rem; text-align: center; color: var(--danger);">Error loading listings.</td></tr>';
        }
    } catch (err) {
        console.error("Load Listings Error:", err);
        list.innerHTML = '<tr><td colspan="3" style="padding: 2rem; text-align: center; color: var(--danger);">Error connecting to server.</td></tr>';
    }
}

// Placeholder for missing analytics function referenced above
// --- Live Gate Camera System ---

let gateStream = null;
let isGateScanning = false;

async function initGateCamera() {
    const video = document.getElementById('gate-video');
    const log = document.getElementById('gate-activity-log');

    try {
        if (!gateStream) {
            gateStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = gateStream;
        }

        isGateScanning = true;
        document.getElementById('gate-status-pill').innerText = '🟢 SCANNING';
        document.getElementById('scan-line').classList.remove('hidden');

        gateScanLoop();

        log.innerHTML = `<div style="color: #64748b;">[${new Date().toLocaleTimeString()}] Camera feed active. Scanning for plates...</div>` + log.innerHTML;
    } catch (err) {
        console.error("Camera Error:", err);
        alert("Camera access denied or not available.");
        switchTab('parking');
    }
}

async function gateScanLoop() {
    if (!isGateScanning || document.getElementById('view-camera-gate').classList.contains('hidden')) {
        stopGateCamera();
        return;
    }

    const video = document.getElementById('gate-video');
    const canvas = document.getElementById('gate-canvas');
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = canvas.toDataURL('image/jpeg', 0.8);

        try {
            const res = await fetch('/api/scan-plate-advanced', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData })
            });
            const data = await res.json();

            if (data.success && data.vehicleFound) {
                handleGateDetection(data);
                // Pause scanning briefly after match
                isGateScanning = false;
                setTimeout(() => { if (!document.getElementById('view-camera-gate').classList.contains('hidden')) isGateScanning = true; gateScanLoop(); }, 5000);
                return;
            }
        } catch (err) {
            console.error("Scan loop error:", err);
        }
    }

    setTimeout(gateScanLoop, 2000); // Scan every 2 seconds
}

function stopGateCamera() {
    isGateScanning = false;
    if (gateStream) {
        gateStream.getTracks().forEach(track => track.stop());
        gateStream = null;
    }
    document.getElementById('gate-status-pill').innerText = '🟡 SYSTEM READY';
    document.getElementById('scan-line').classList.add('hidden');
}

async function handleGateDetection(data) {
    const resultDiv = document.getElementById('gate-detect-result');
    const log = document.getElementById('gate-activity-log');
    const plate = data.vehicleNumber;

    resultDiv.innerHTML = `
        <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary); margin-bottom: 0.5rem;">${plate}</div>
        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">${data.ownerName} (${data.vehicleType})</div>
        <div style="display: flex; gap: 0.5rem; justify-content: center;">
            <button class="btn btn-primary" onclick="processGateAction('${plate}', 'check-in')">CHECK-IN</button>
            <button class="btn btn-outline" onclick="processGateAction('${plate}', 'check-out')">CHECK-OUT</button>
        </div>
    `;

    log.innerHTML = `<div style="color: #059669; font-weight: 600;">[${new Date().toLocaleTimeString()}] DETECTED: ${plate}</div>` + log.innerHTML;
}

async function processGateAction(plate, action) {
    try {
        const propRes = await fetch(`/api/owner/properties/${user._id}`);
        const propData = await propRes.json();

        if (!propData.success || propData.properties.length === 0) {
            return alert("No property found to manage.");
        }

        const parkingAreaId = propData.properties[0]._id;

        const res = await fetch(`/api/staff/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleNumber: plate, parkingAreaId })
        });
        const data = await res.json();

        if (data.success) {
            alert(`${plate} ${action === 'check-in' ? 'Entered' : 'Exited'} successfully!`);
            document.getElementById('gate-detect-result').innerHTML = `<div style="color: #059669;">Action Completed: ${plate}</div>`;
            isGateScanning = true;
            gateScanLoop();
        } else {
            alert(data.message || "Action failed.");
        }
    } catch (err) {
        console.error(err);
        alert("Error processing gate action.");
    }
}

async function manualGateCheck() {
    const plate = document.getElementById('manual-gate-plate').value.trim().toUpperCase();
    if (!plate) return alert("Enter plate number");

    handleGateDetection({ vehicleNumber: plate, ownerName: "Manual Entry", vehicleType: "Vehicle" });
}

async function loadOwnerAnalytics() {
    try {
        const res = await fetch(`/api/owner/stats/${user._id}`);
        const data = await res.json();
        if (data.success) {
            document.getElementById('owner-stat-bookings').innerText = data.stats.totalBookings;
            document.getElementById('owner-stat-revenue').innerText = `₹${data.stats.totalRevenue}`;
            document.getElementById('owner-stat-peak').innerText = data.stats.peakHour;
            document.getElementById('owner-stat-util').innerText = data.stats.utilization;
        }
    } catch (err) {
        console.error("Error loading analytics:", err);
    }
}

// Start Dashboard
initDashboard();
