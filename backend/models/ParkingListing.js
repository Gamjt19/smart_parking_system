const mongoose = require('mongoose');

const parkingListingSchema = new mongoose.Schema({
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    capacity: { type: Number, required: true },
    pricePerHour: { type: Number, required: true },
    vehicleTypesAllowed: [{ type: String, enum: ['car', 'bike', 'heavy'] }],
    availabilityStart: { type: String }, // e.g. "08:00"
    availabilityEnd: { type: String },   // e.g. "20:00"
    isApproved: { type: Boolean, default: false },
    slotNumberingType: { type: String, enum: ['numbers', 'letters'], default: 'numbers' },
    pricingModel: { type: String, enum: ['hour', '10min'], default: 'hour' },

    // Feature 8: Seasonal Parking Mode
    eventName: { type: String },
    eventStartDate: { type: Date },
    eventEndDate: { type: Date },
    temporarySlots: { type: Number }
}, {
    timestamps: true
});

parkingListingSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('ParkingListing', parkingListingSchema);
