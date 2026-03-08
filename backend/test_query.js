require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');

async function test() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const [Booking, Vehicle, ParkingArea] = [mongoose.model('Booking', new mongoose.Schema({}, { strict: false })), mongoose.model('Vehicle', new mongoose.Schema({}, { strict: false })), mongoose.model('ParkingArea', new mongoose.Schema({}, { strict: false }))];

        const plate = "KL28C5110";
        const vehicle = await Vehicle.findOne({ vehicleNumber: plate }).lean();

        if (vehicle) {
            const allActive = await Booking.find({}).lean();
            const results = allActive.map(b => ({
                b_id: b._id,
                status: b.status,
                b_vehicleId: b.vehicleId ? b.vehicleId.toString() : null,
                b_parkingAreaId: b.parkingAreaId ? b.parkingAreaId.toString() : null
            }));
            require('fs').writeFileSync('./out.json', JSON.stringify(results, null, 2));
        }

        mongoose.disconnect();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
test();
