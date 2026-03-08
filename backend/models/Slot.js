const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
    slotId: { type: String, required: true },
    parkingAreaId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingArea', required: true },
    slotNumber: { type: String, required: true },
    vehicleType: { type: String, enum: ['car', 'bike', 'heavy', 'any'], default: 'any' },
    status: { type: String, enum: ['available', 'reserved', 'occupied'], default: 'available' },
    isEmergency: { type: Boolean, default: false },
    currentBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null }
}, {
    timestamps: true
});

// Ensure a slotNumber is unique within a parkingArea
slotSchema.index({ parkingAreaId: 1, slotNumber: 1 }, { unique: true });

module.exports = mongoose.model('Slot', slotSchema);
