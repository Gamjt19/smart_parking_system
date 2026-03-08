const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const ParkingListing = require('./models/ParkingListing');
const ParkingArea = require('./models/ParkingArea');

async function checkAll() {
    let output = "";
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const listings = await ParkingListing.find({});
        output += `All Listings (${listings.length}):\n`;
        listings.forEach(l => {
            output += `- ${l.title} [${l._id}] Approved: ${l.isApproved}, Owner: ${l.ownerId}\n`;
        });

        const areas = await ParkingArea.find({});
        output += `\nAll Areas (${areas.length}):\n`;
        areas.forEach(a => {
            output += `- ${a.name} [${a.parkingAreaId}] mongoid: ${a._id}, isPublic: ${a.isPublicOSM}, coords: ${JSON.stringify(a.location.coordinates)}\n`;
        });

        fs.writeFileSync('report.txt', output);
        console.log('Done');
        process.exit(0);
    } catch (err) {
        fs.writeFileSync('report_error.txt', err.stack);
        process.exit(1);
    }
}

checkAll();
