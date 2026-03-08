const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const ParkingArea = require('./models/ParkingArea');

async function checkTimestamps() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const area = await ParkingArea.findOne({ name: 'MG Road Private Parking' });
        if (area) {
            console.log(`Name: ${area.name}`);
            console.log(`Created: ${area.createdAt}`);
            console.log(`isPublic: ${area.isPublicOSM}`);
        } else {
            console.log('Not found');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkTimestamps();
