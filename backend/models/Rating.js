const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
    ratingId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    parkingAreaId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingArea', required: true },
    safetyRating: { type: Number, required: true, min: 1, max: 5 },
    spaceRating: { type: Number, required: true, min: 1, max: 5 },
    lightingRating: { type: Number, required: true, min: 1, max: 5 },
    priceRating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String }
}, {
    timestamps: true
});

module.exports = mongoose.model('Rating', ratingSchema);
