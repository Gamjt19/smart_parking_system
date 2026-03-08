require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const fs = require('fs');

async function test() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const [ParkingArea] = [mongoose.model('ParkingArea', new mongoose.Schema({}, { strict: false }))];

        const areas = await ParkingArea.find({ name: /SGM/i }).lean();
        fs.writeFileSync('./out.json', JSON.stringify({ areas }, null, 2));

        mongoose.disconnect();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
test();
