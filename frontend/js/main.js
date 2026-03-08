const socket = io();
const mapContainer = document.getElementById('parking-map');
const modal = document.getElementById('booking-modal');
const modalSlotId = document.getElementById('modal-slot-id');
const slotIdInput = document.getElementById('slot-id-input');
const bookingForm = document.getElementById('booking-form');

// State
let slots = [];

// Listen for updates
socket.on('slot_update', (updatedSlots) => {
    slots = updatedSlots;
    renderMap();
});

// Render the parking grid
function renderMap() {
    mapContainer.innerHTML = '';

    slots.forEach(slot => {
        const slotEl = document.createElement('div');
        slotEl.className = `slot ${slot.status} ${slot.type === 'ev' ? 'ev' : ''}`;

        // Add content
        slotEl.innerHTML = `
            <div class="slot-number">${slot.id}</div>
            ${slot.status === 'occupied' ? `<small style="margin-top:0.5rem; opacity:0.7">${slot.user?.plate || 'Unknown'}</small>` : ''}
            ${slot.status === 'reserved' ? `<small style="margin-top:0.5rem; opacity:0.7">Booked</small>` : ''}
        `;

        // Interaction
        if (slot.status === 'available') {
            slotEl.onclick = () => openBooking(slot.id);
        }

        mapContainer.appendChild(slotEl);
    });
}

// Modal functions
function openBooking(id) {
    modalSlotId.innerText = id;
    slotIdInput.value = id;
    modal.classList.add('active');
}

function closeModal() {
    modal.classList.remove('active');
    bookingForm.reset();
}

// Handle Booking
bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        slotId: slotIdInput.value,
        userName: document.getElementById('driver-name').value,
        plateNumber: document.getElementById('plate-number').value.toUpperCase()
    };

    try {
        const res = await fetch('/api/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (result.success) {
            alert(`Booking Confirmed for Slot #${data.slotId}`);
            closeModal();
        } else {
            alert(result.error || 'Booking failed');
        }
    } catch (err) {
        console.error(err);
        alert('Network error');
    }
});
