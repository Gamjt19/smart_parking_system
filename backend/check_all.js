const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const ParkingListing = require('./models/ParkingListing');
const ParkingArea = require('./models/ParkingArea');

async function checkListing() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const listings = await ParkingListing.find({ isApproved: true });
        console.log(`Approved Listings: ${listings.length}`);
        listings.forEach(l => {
            console.log(`- Title: ${l.title}, ID: ${l._id}, Owner: ${l.ownerId}`);
        });

        const areas = await ParkingArea.find({});
        console.log(`Total Areas: ${areas.length}`);
        areas.forEach(a => {
            console.log(`- Name: ${a.name}, ID: ${a.parkingAreaId}, mongoid: ${a._id}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkListing();
