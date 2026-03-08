// OCR & Staff System Frontend Logic

let currentOcrResult = null;
let cropper = null;

// --- Plate Scanning UI (Features 1 & 4) ---

function previewScanImage(event) {
    const reader = new FileReader();
    const file = event.target.files[0];
    if (!file) return;

    reader.onload = function () {
        const preview = document.getElementById('scan-preview');
        preview.src = reader.result;
        document.getElementById('scan-preview-container').classList.remove('hidden');
        document.getElementById('scan-action-controls').classList.remove('hidden');
        document.getElementById('scan-upload-controls').classList.add('hidden');

        // Initialize Cropper (Step 9)
        if (cropper) {
            cropper.destroy();
        }
        cropper = new Cropper(preview, {
            viewMode: 1,
            autoCropArea: 0.8,
            responsive: true,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
        });

        // Run Quality Check (Step 8)
        checkImageQuality(file);
    }
    reader.readAsDataURL(file);
}

/**
 * Basic quality check for brightness (Step 8)
 */
async function checkImageQuality(file) {
    const warningDiv = document.getElementById('scan-quality-warning');
    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let brightness = 0;

        for (let i = 0; i < data.length; i += 4) {
            brightness += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }

        const avgBrightness = brightness / (data.length / 4);
        console.log('Avg Brightness:', avgBrightness);

        warningDiv.classList.add('hidden');
        warningDiv.innerHTML = "";

        if (avgBrightness < 50) {
            warningDiv.innerHTML = "⚠️ <strong>Image too dark</strong>. Capture the plate in better lighting for better results.";
            warningDiv.classList.remove('hidden');
        } else if (avgBrightness > 220) {
            warningDiv.innerHTML = "⚠️ <strong>Too much glare</strong>. Avoid direct strong light hitting the plate.";
            warningDiv.classList.remove('hidden');
        }

        URL.revokeObjectURL(img.src);
    };
}

function resetPlateScan() {
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    document.getElementById('plate-image-input').value = "";
    document.getElementById('scan-preview-container').classList.add('hidden');
    document.getElementById('scan-action-controls').classList.add('hidden');
    document.getElementById('scan-upload-controls').classList.remove('hidden');
    document.getElementById('scan-result').classList.add('hidden');
    document.getElementById('scan-loading').classList.add('hidden');
    document.getElementById('scan-quality-warning').classList.add('hidden');
    currentOcrResult = null;
}

async function submitPlateScan() {
    const loading = document.getElementById('scan-loading');
    const actions = document.getElementById('scan-action-controls');

    if (!cropper) return alert('Please select and crop an image first');

    loading.classList.remove('hidden');
    actions.classList.add('hidden');

    // Get cropped canvas and Convert to Blob (Step 9)
    cropper.getCroppedCanvas().toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('plateImage', blob, 'cropped-plate.png');

        try {
            const res = await fetch('/api/plate/scan', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            renderScanResult(data);
        } catch (err) {
            console.error(err);
            alert('High Accuracy OCR failed. Please check image quality.');
        } finally {
            loading.classList.add('hidden');
            actions.classList.remove('hidden');
        }
    }, 'image/png');
}

function renderScanResult(data) {
    const container = document.getElementById('scan-result');
    container.classList.remove('hidden');

    if (!data.success) {
        container.innerHTML = `<div class="card" style="border-left: 4px solid #ef4444; color: #ef4444;">❌ ${data.message || 'Error processing image'}</div>`;
        return;
    }

    currentOcrResult = data;

    // Normalize data for manual lookup vs OCR scan
    const isManual = !data.detectedPlate;
    const plate = data.vehicleNumber || data.detectedPlate;
    const owner = data.ownerName || "Unknown Owner";
    const contact = data.ownerContact || data.maskedPhone || "N/A";
    const confidence = isManual ? 1.0 : (data.confidence || 0.5);
    const vehicleFound = data.vehicleFound !== undefined ? data.vehicleFound : data.success;

    const confScore = (confidence * 100).toFixed(0);
    const lowConfidence = confidence < 0.8;

    let warningHtml = '';
    if (lowConfidence) {
        warningHtml = `
            <div style="background: #fef2f2; border: 1px solid #fee2e2; color: #991b1b; padding: 0.75rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.85rem;">
                ⚠️ <strong>Plate detection uncertain</strong> (${confScore}%). Please confirm the number manually.
            </div>
        `;
    }

    // Step 7: Debug Information
    const debugHtml = `
        <div style="margin-top: 1rem; padding: 0.5rem; background: #f1f5f9; border-radius: 0.4rem; font-family: monospace; font-size: 0.75rem; text-align: left;">
            <div><strong>Raw OCR:</strong> "${data.ocrRawText || 'N/A'}"</div>
            <div><strong>Best Detection:</strong> ${data.detectedPlate || 'N/A'}</div>
        </div>
    `;

    if (vehicleFound) {
        container.innerHTML = `
            <div class="card" style="border-left: 4px solid var(--primary); text-align: left;">
                <h3 style="color: var(--primary); margin-bottom: 0.5rem;">✅ Vehicle Found</h3>
                ${warningHtml}
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.95rem; margin-bottom: 1rem;">
                    <span><strong>Verified Plate:</strong></span> <span style="font-family: monospace; font-weight: bold; font-size: 1.1rem;">${plate}</span>
                    <span><strong>Match Rate:</strong></span> <span style="color: ${lowConfidence ? '#b91c1c' : '#059669'}; font-weight: bold;">${isManual ? '100% (Manual)' : confScore + '%'}</span>
                    <span><strong>Owner:</strong></span> <span>${owner}</span>
                    <span><strong>Contact:</strong></span> <span>${contact}</span>
                </div>
                ${!isManual ? debugHtml : ''}
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1.5rem;">
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-primary" style="flex: 1;" onclick="usePlateInStaff('${plate}')">Use for Check-In</button>
                        <button class="btn btn-outline" style="flex: 1;" onclick="notifyOwner('${plate}')">🔔 Notify Owner</button>
                    </div>
                    <button class="btn btn-outline" style="width: 100%;" onclick="resetPlateScan()">Reset Search</button>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="card" style="border-left: 4px solid #6b7280; text-align: left;">
                <h3 style="color: #6b7280; margin-bottom: 0.5rem;">ℹ️ Not Registered</h3>
                ${warningHtml}
                <div style="margin-bottom: 1rem;">
                    <p style="margin-bottom:0.2rem;"><strong>Entered Number:</strong></p>
                    <p style="font-family: monospace; font-weight: bold; font-size: 1.25rem; letter-spacing: 1px;">${plate}</p>
                </div>
                <p class="subtitle" style="margin-bottom: 1rem;">This vehicle is not in our database.</p>
                ${!isManual ? debugHtml : ''}
                <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
                    <button class="btn btn-primary" style="flex: 1;" onclick="usePlateInStaff('${plate}')">Manual Check-In</button>
                    <button class="btn btn-outline" style="flex: 1;" onclick="resetPlateScan()">Try Again</button>
                </div>
            </div>
        `;
    }
}

function usePlateInStaff(plate) {
    switchTab('staff');
    document.getElementById('staff-vehicle-input').value = plate;
    lookupVehicle();
}

/**
 * Feature 3: Notify Owner Anonymously
 */
async function notifyOwner(plate) {
    // Note: Per requirements, only authenticated users can notify owners. 
    // Assuming 'user' object is globally available from dashboard.js
    if (typeof user === 'undefined' || !user || !user._id) {
        return alert('Please login to notify owners');
    }

    if (!confirm(`Send SMS notification to owner of ${plate}?`)) return;

    try {
        const res = await fetch('/api/vehicle/notify-owner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plate })
        });
        const data = await res.json();

        if (data.success) {
            alert('Owner has been notified via SMS.');
        } else {
            alert(data.message || 'Failed to notify owner');
        }
    } catch (err) {
        console.error(err);
        alert('Error sending notification');
    }
}

// --- Staff Check-In System (Features 5, 6, 8, 9) ---

async function initStaffSystem() {
    const select = document.getElementById('staff-parking-select');
    if (!select) return;

    try {
        const res = await fetch('/api/parking-areas');
        const areas = await res.json();

        select.innerHTML = '<option value="">-- Choose Parking --</option>';
        areas.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a._id;
            opt.innerText = a.name;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to load parking areas:", err);
    }
}

async function lookupVehicle() {
    const plate = document.getElementById('staff-vehicle-input').value;
    const parkingAreaId = document.getElementById('staff-parking-select').value;

    if (!plate) return alert('Please enter a vehicle number');
    if (!parkingAreaId) return alert('Please select a parking area first');

    const resultDiv = document.getElementById('staff-lookup-result');
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = '<div class="card">Searching database...</div>';

    try {
        const res = await fetch(`/api/vehicle/lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plate })
        });
        const data = await res.json();
        renderStaffLookup(data, parkingAreaId);
    } catch (err) {
        console.error(err);
        resultDiv.innerHTML = '<div class="card" style="color:red;">Error searching vehicle.</div>';
    }
}

function renderStaffLookup(data, parkingAreaId) {
    const resultDiv = document.getElementById('staff-lookup-result');

    if (!data.success && data.message !== "Vehicle not registered") {
        resultDiv.innerHTML = `<div class="card" style="color:red;">${data.message || 'Lookup failed'}</div>`;
        return;
    }

    if (data.success) {
        resultDiv.innerHTML = `
            <div class="card" style="border-left: 4px solid var(--primary);">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                    <div>
                        <h3 style="color: var(--primary);">Vehicle Info</h3>
                        <p><strong>${data.vehicleNumber}</strong> (${data.brand} - ${data.vehicleType})</p>
                    </div>
                    <div style="text-align: right;">
                        <p style="font-weight: bold;">Owner: ${data.ownerName}</p>
                        <p style="font-size: 0.85rem; color: var(--text-muted);">Contact: ${data.maskedPhone}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-primary" style="flex: 2;" onclick="staffAction('check-in', '${data.vehicleNumber}', '${parkingAreaId}')">Confirm Check-In</button>
                    <button class="btn btn-outline" style="flex: 1;" onclick="notifyOwner('${data.vehicleNumber}')">Notify Owner</button>
                </div>
            </div>
        `;
    } else {
        resultDiv.innerHTML = `
            <div class="card" style="border-left: 4px solid #f59e0b;">
                <h3 style="color: #f59e0b; margin-bottom: 0.5rem;">Unregistered Vehicle</h3>
                <p><strong>${data.vehicleNumber}</strong> is not in the system.</p>
                <p class="subtitle" style="margin-bottom: 1rem;">You can still perform a manual entry check-in.</p>
                <button class="btn btn-primary" style="width: 100%;" onclick="staffAction('check-in', '${data.vehicleNumber}', '${parkingAreaId}')">Assign Manual Entry</button>
            </div>
        `;
    }
}

async function staffAction(type, vehicleNumber, parkingAreaId) {
    const endpoint = type === 'check-in' ? '/api/staff/check-in' : '/api/staff/check-out';

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleNumber, parkingAreaId })
        });
        const data = await res.json();

        if (data.success) {
            alert(data.message);
            document.getElementById('staff-lookup-result').classList.add('hidden');
            document.getElementById('staff-vehicle-input').value = "";
            loadRecentEntries(parkingAreaId);
        } else {
            alert('Action failed: ' + data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Request failed');
    }
}

async function loadRecentEntries(parkingAreaId) {
    if (!parkingAreaId) return;
    const list = document.getElementById('staff-entries-list');

    try {
        const res = await fetch(`/api/staff/entries?parkingAreaId=${parkingAreaId}`);
        const data = await res.json();

        if (data.success && data.entries.length > 0) {
            list.innerHTML = data.entries.map(e => `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 1rem;"><strong>${e.vehicleNumber}</strong></td>
                    <td style="padding: 1rem;">${new Date(e.entryTime).toLocaleTimeString()}</td>
                    <td style="padding: 1rem;"><span style="font-size: 0.8rem; background: var(--border); padding: 0.2rem 0.5rem; border-radius: 1rem;">${e.entryMethod}</span></td>
                    <td style="padding: 1rem;"><span style="color: ${e.status === 'entered' ? '#10b981' : '#6b7280'}; font-weight: bold;">${e.status.toUpperCase()}</span></td>
                    <td style="padding: 1rem;">
                        ${e.status === 'entered' ? `
                            <button class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" 
                                onclick="staffAction('check-out', '${e.vehicleNumber}', '${parkingAreaId}')">Check-Out</button>
                        ` : `---`}
                    </td>
                </tr>
            `).join('');
        } else {
            list.innerHTML = '<tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">No recent entries found.</td></tr>';
        }
    } catch (err) {
        console.error(err);
    }
}

// Add event listener for auto-refresh list on area change
document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('staff-parking-select');
    if (select) {
        select.addEventListener('change', (e) => {
            loadRecentEntries(e.target.value);
        });
    }
});

// Socket.io listeners for real-time updates (Feature 8)
socket.on('vehicleEntered', (data) => {
    console.log('[STAFF] Vehicle entered:', data);
    // If we're on the staff tab, we could refresh the list here
});

socket.on('slotUpdated', (data) => {
    // dashboards will refresh via existing dashboard.js logic if they listen to this
    if (typeof renderLocations === 'function') renderLocations();
});
