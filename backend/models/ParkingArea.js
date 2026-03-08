const mongoose = require('mongoose');

const parkingAreaSchema = new mongoose.Schema({
    parkingAreaId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    totalSlots: { type: Number, required: true },
    availableSlots: { type: Number, required: true },
    pricePerHour: { type: Number, required: true },
    vehicleTypesAllowed: [{ type: String, enum: ['car', 'bike', 'heavy'] }],
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional for public/OSM
    isPublicOSM: { type: Boolean, default: false },
    slotNumberingType: { type: String, enum: ['numbers', 'letters'], default: 'numbers' },
    pricingModel: { type: String, enum: ['hour', '10min'], default: 'hour' }
}, {
    timestamps: true
});

// Index for geospatial queries
parkingAreaSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('ParkingArea', parkingAreaSchema);
