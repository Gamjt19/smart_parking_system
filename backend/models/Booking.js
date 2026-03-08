const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    bookingId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    parkingAreaId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingArea', required: true },
    slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    entryTime: { type: Date },
    exitTime: { type: Date },
    status: { type: String, enum: ['active', 'in-progress', 'completed', 'cancelled'], default: 'active' }
}, {
    timestamps: true
});

module.exports = mongoose.model('Booking', bookingSchema);
