const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const ParkingArea = require('./models/ParkingArea');

async function testQuery() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const lat = 9.9312;
        const lon = 76.2673;
        const radius = 5000;

        const areas = await ParkingArea.find({
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [parseFloat(lon), parseFloat(lat)] },
                    $maxDistance: parseInt(radius)
                }
            }
        });

        console.log(`Found ${areas.length} areas nearby:`);
        areas.forEach(a => {
            console.log(`- ${a.name} (${a.parkingAreaId}), coords: ${JSON.stringify(a.location.coordinates)}, isPublic: ${a.isPublicOSM}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testQuery();
