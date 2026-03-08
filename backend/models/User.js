const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    plate: { type: String, required: true },
    phone: { type: String, required: true },
    model: { type: String, required: true },
    password: { type: String, required: true },
    carrier: { type: String }, // e.g. Airtel, BSNL, Vodafone
    telegramChatId: { type: String },
    telegramToken: { type: String },
    role: { type: String, enum: ['user', 'admin', 'parking_owner'], default: 'user' }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
