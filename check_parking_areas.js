const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'backend/.env') });

const ParkingArea = require('./backend/models/ParkingArea');

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const areas = await ParkingArea.find({});
        console.log(`Total Parking Areas: ${areas.length}`);

        areas.forEach(a => {
            console.log(`- ${a.name} (${a.parkingAreaId}): coords: ${JSON.stringify(a.location.coordinates)}, available: ${a.availableSlots}`);
        });

        const indexes = await ParkingArea.collection.indexes();
        console.log('Indexes:', JSON.stringify(indexes, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
