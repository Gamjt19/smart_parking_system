const mongoose = require('mongoose');

const parkingEntrySchema = new mongoose.Schema({
    entryId: { type: String, required: true, unique: true },
    parkingAreaId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingArea', required: true },
    vehicleNumber: { type: String, required: true },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    entryTime: { type: Date, default: Date.now },
    exitTime: { type: Date },
    entryMethod: { type: String, default: 'staff_scan' },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    status: { type: String, enum: ['entered', 'exited'], default: 'entered' }
}, { timestamps: true });

module.exports = mongoose.model('ParkingEntry', parkingEntrySchema);
