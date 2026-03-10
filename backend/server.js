const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Vehicle = require('./models/Vehicle');
const ParkingArea = require('./models/ParkingArea');
const Slot = require('./models/Slot');
const Booking = require('./models/Booking');
const ParkingListing = require('./models/ParkingListing');
const Notification = require('./models/Notification');
const Rating = require('./models/Rating');
const ParkingEntry = require('./models/ParkingEntry');
const multer = require('multer');
const { createWorker } = require('tesseract.js');
const sharp = require('sharp');
const stringSimilarity = require('string-similarity');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const nodemailer = require('nodemailer');

// --- Helper: Charge Calculation ---
function calculateParkingCharge(entryTime, exitTime, pricingModel = '10min', baseRate = 20) {
    const durationMs = Math.abs(exitTime - entryTime);
    const durationMinutes = durationMs / 60000;

    if (durationMinutes <= 0) return 0;

    if (pricingModel === '10min') {
        // Min charge: ₹Base for first 10 mins, then ₹Base per 10 mins
        const blocks = Math.max(1, Math.ceil(durationMinutes / 10));
        return blocks * baseRate;
    } else {
        // Hourly: Min 1 hour charge
        const hours = Math.max(1, Math.ceil(durationMinutes / 60));
        return hours * baseRate;
    }
}

// Load env vars
dotenv.config();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// SERVE FRONTEND FROM NEW LOCATION
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `plate-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only images are allowed'));
    }
});

// --- DB CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB:', process.env.MONGO_URI);
    })
    .catch(err => console.error('MongoDB connection error:', err));

// --- DATA STORE (SPS Brain) ---

let parkingSlots = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    type: i > 9 ? 'ev' : 'standard',
    status: 'available',
    user: null,
    expiry: null
}));

const vehicleRegistry = {
    'KA01AB1234': { owner: 'John Doe', model: 'Honda City', phone: '9876543210' },
    'KA05XY9876': { owner: 'Alice Smith', model: 'Tesla Model 3', phone: '9123456780' },
    'TN22BQ5555': { owner: 'Robert Brown', model: 'Hyundai Creta', phone: '9988776655' }
};

const evStations = [
    { id: 1, name: 'EcoCharge Hub', distance: '0.5 km', status: 'Available', lat: 12.97, lng: 77.59 },
    { id: 2, name: 'City Power Point', distance: '1.2 km', status: 'Busy', lat: 12.98, lng: 77.60 }
];

const nearbyLots = [
    { id: 101, name: 'MG Road', distance: '0.5 km', available: 15, price: '₹40/hr' },
    { id: 102, name: 'Marine Drive', distance: '1.2 km', available: 8, price: '₹60/hr' },
    { id: 103, name: 'Willington Island Parking Yard', distance: '3.5 km', available: 50, price: '₹20/hr' },
    { id: 104, name: 'Public Parking Area', distance: '0.9 km', available: 25, price: '₹10/hr' }
];

// Logs & Violations
let activityLogs = [];
let violations = [
    { id: 1, type: 'Overstay', slotId: 4, plate: 'KA01AB1234', time: '10:30 AM', status: 'Active' },
    { id: 2, type: 'Wrong Slot', slotId: 11, plate: 'TN22BQ5555', time: '11:15 AM', status: 'Resolved' }
];

// AI Prediction Data (Mock Hourly Occupancy %)
const predictionData = {
    hours: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
    occupancy: [30, 65, 90, 85, 50, 95, 70]
};

// --- USERS STORE (Migrated to MongoDB) ---
// See models/User.js

// --- ROUTES ---

// 0. Auth & Users
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, plate, phone, model, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }

        const newUser = new User({
            name,
            email,
            plate,
            phone,
            model,
            password, // In production, hash this!
            role: 'user'
        });

        await newUser.save();
        res.json({ success: true, user: newUser });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ success: false, message: "Server error during registration" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, password });
        if (user) {
            res.json({ success: true, user });
        } else {
            res.json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ success: false, message: "Server error during login" });
    }
});

app.put('/api/user/profile', async (req, res) => {
    try {
        const { userId, name, phone, carrier } = req.body;
        if (!userId) return res.status(400).json({ success: false, message: "User ID required" });

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { name, phone, carrier },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error("Profile update error:", error);
        res.status(500).json({ success: false, message: "Server error during profile update" });
    }
});

app.get('/api/user/profile/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, user });
    } catch (error) {
        console.error("Fetch profile error:", error);
        res.status(500).json({ success: false, message: "Server error fetching profile" });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const allUsers = await User.find({});
        res.json(allUsers);
    } catch (error) {
        console.error("Fetch users error:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// 0.5 Vehicles
app.post('/api/vehicles/add', async (req, res) => {
    try {
        const { userId, vehicleNumber, vehicleType, brand, color } = req.body;
        const newVehicle = new Vehicle({ userId, vehicleNumber, vehicleType, brand, color });
        await newVehicle.save();
        res.json({ success: true, vehicle: newVehicle });
    } catch (error) {
        console.error("Add vehicle error:", error);
        res.status(500).json({ success: false, message: "Error adding vehicle" });
    }
});

app.get('/api/vehicles/user/:userId', async (req, res) => {
    try {
        const vehicles = await Vehicle.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json({ success: true, vehicles });
    } catch (error) {
        console.error("Fetch vehicles error:", error);
        res.status(500).json({ success: false, message: "Error fetching vehicles" });
    }
});

app.delete('/api/vehicles/:vehicleId', async (req, res) => {
    try {
        await Vehicle.findByIdAndDelete(req.params.vehicleId);
        res.json({ success: true, message: "Vehicle deleted" });
    } catch (error) {
        console.error("Delete vehicle error:", error);
        res.status(500).json({ success: false, message: "Error deleting vehicle" });
    }
});

// 0.6 Parking Areas & Slots (Features 2 & 3)
app.post('/api/parking-areas/create', async (req, res) => {
    try {
        const { parkingAreaId, name, coordinates, totalSlots, pricePerHour, vehicleTypesAllowed, ownerId, isPublicOSM } = req.body;

        // 1. Create Parking Area
        const newArea = new ParkingArea({
            parkingAreaId,
            name,
            location: { type: 'Point', coordinates },
            totalSlots,
            availableSlots: totalSlots,
            pricePerHour,
            vehicleTypesAllowed,
            ownerId,
            isPublicOSM
        });
        await newArea.save();

        // 2. Auto-generate Slots
        const slotsToInsert = [];
        for (let i = 1; i <= totalSlots; i++) {
            slotsToInsert.push({
                slotId: `${parkingAreaId}-S${i}`,
                parkingAreaId: newArea._id,
                slotNumber: `S${i}`,
                vehicleType: 'any', // Default for now
                isOccupied: false
            });
        }
        await Slot.insertMany(slotsToInsert);

        res.json({ success: true, area: newArea, message: `Created area with ${totalSlots} slots` });
    } catch (error) {
        console.error("Create Parking Area error:", error);
        res.status(500).json({ success: false, message: "Error creating parking area" });
    }
});

app.get('/api/parking-areas', async (req, res) => {
    try {
        const areas = await ParkingArea.find({});
        res.json({ success: true, areas });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching areas" });
    }
});

// Geospatial Search for Nearby Parking (Internal Record Search)
app.get('/api/parking/nearby', async (req, res) => {
    try {
        const { lat, lon, radius = 5000 } = req.query; // Radius in meters
        if (!lat || !lon) return res.status(400).json({ success: false, message: "Lat and Lon required" });

        const areas = await ParkingArea.find({
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [parseFloat(lon), parseFloat(lat)] },
                    $maxDistance: parseInt(radius)
                }
            }
        });

        res.json({ success: true, areas });
    } catch (error) {
        console.error("Nearby Search Error:", error);
        res.status(500).json({ success: false, message: "Error searching nearby parking" });
    }
});

app.get('/api/slots/:areaId', async (req, res) => {
    try {
        const slots = await Slot.find({ parkingAreaId: req.params.areaId });
        res.json({ success: true, slots });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching slots" });
    }
});

// 0.7 Bookings (Feature 4) & Real Time (Feature 5 part 1)
app.post('/api/bookings/create', async (req, res) => {
    try {
        const { userId, vehicleId, parkingAreaId, startTime, endTime } = req.body;

        // 1. Find the first available NORMAL (non-emergency) slot
        const slot = await Slot.findOne({
            parkingAreaId,
            status: 'available',
            isEmergency: false
        });

        if (!slot) {
            return res.status(400).json({ success: false, message: 'No normal slots available' });
        }

        // 2. Create Booking
        const bookingId = `BKG-${Date.now()}`;
        const newBooking = new Booking({
            bookingId,
            userId,
            vehicleId,
            parkingAreaId,
            slotId: slot._id,
            startTime,
            endTime
        });
        await newBooking.save();

        // 3. Mark Slot as Reserved
        slot.status = 'reserved';
        slot.currentBookingId = newBooking._id;
        await slot.save();

        // 4. Update Area availability
        const area = await ParkingArea.findById(parkingAreaId);
        if (area) {
            area.availableSlots -= 1;
            await area.save();
        }

        // 5. Emit Real-time Socket Event
        io.emit('slotReserved', { parkingAreaId, slotId: slot._id, availableSlots: area ? area.availableSlots : 0 });
        if (area && area.availableSlots === 0) {
            io.emit('parkingFull', { parkingAreaId });
        }

        res.json({ success: true, booking: newBooking, slotNumber: slot.slotNumber });
    } catch (error) {
        console.error("Create booking error:", error);
        res.status(500).json({ success: false, message: "Error creating booking" });
    }
});

app.post('/api/bookings/extend', async (req, res) => {
    try {
        const { bookingId, durationMinutes } = req.body;
        const booking = await Booking.findById(bookingId).populate('parkingAreaId');
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const oldEndTime = new Date(booking.endTime);
        const newEndTime = new Date(oldEndTime.getTime() + durationMinutes * 60000);

        // Check if the current slot is reserved for someone else after oldEndTime
        const conflict = await Booking.findOne({
            slotId: booking.slotId,
            status: 'active',
            startTime: { $lt: newEndTime, $gte: oldEndTime }
        });

        if (conflict) {
            // Conflict exists. We allow extension because the CURRENT user is already in the spot.
            // But we must mark that reassignment will be needed for the upcoming user.
            // (The reassignment logic is already in staff/check-in)
            console.log(`[Extension] Conflict detected for slot ${booking.slotId}. Reassignment will be triggered for upcoming booking ${conflict.bookingId}`);
        }

        booking.endTime = newEndTime;
        await booking.save();

        res.json({
            success: true,
            message: conflict ? "Extended successfully. Note: Slot reassignment triggered for next user." : "Extended successfully.",
            newEndTime
        });
    } catch (error) {
        console.error("Extension Error:", error);
        res.status(500).json({ success: false, message: "Extension failed" });
    }
});

app.get('/api/bookings/user/:userId', async (req, res) => {
    try {
        const bookings = await Booking.find({ userId: req.params.userId }).populate('parkingAreaId').populate('slotId').populate('vehicleId').sort({ createdAt: -1 });
        res.json({ success: true, bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching bookings" });
    }
});

app.post('/api/bookings/cancel/:bookingId', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.bookingId);
        if (!booking || booking.status !== 'active') {
            return res.status(400).json({ success: false, message: "Invalid or inactive booking" });
        }

        booking.status = 'cancelled';
        await booking.save();

        // Free the slot
        const slot = await Slot.findById(booking.slotId);
        if (slot) {
            slot.isOccupied = false;
            slot.currentBookingId = null;
            await slot.save();

            // Update Area
            const area = await ParkingArea.findById(booking.parkingAreaId);
            if (area) {
                area.availableSlots += 1;
                await area.save();

                // Emit Socket Event
                io.emit('slotReleased', { parkingAreaId: area._id, slotId: slot._id, availableSlots: area.availableSlots });
                io.emit('parkingAvailable', { parkingAreaId: area._id });
            }
        }

        res.json({ success: true, message: "Booking cancelled" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error cancelling booking" });
    }
});

// 0.8 Parking Entry / Exit System (Feature 6 & New Time Logic)
app.post('/api/parking/enter/:bookingId', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.bookingId);
        if (!booking || booking.status !== 'active') {
            return res.status(400).json({ success: false, message: "Invalid booking or already processed" });
        }

        booking.status = 'in-progress';
        booking.entryTime = new Date(); // Accurate server timestamp
        await booking.save();

        // Mark Slot as Occupied (already done in create, but status=occupied per req 8)
        const slot = await Slot.findById(booking.slotId);
        if (slot) {
            slot.status = 'occupied';
            await slot.save();
            io.emit('slotUpdated', { parkingAreaId: booking.parkingAreaId });
        }

        // Emit real-time event
        io.emit('vehicleEntered', { userId: booking.userId, parkingAreaId: booking.parkingAreaId });

        res.json({ success: true, message: "Vehicle entered", booking });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error on entry" });
    }
});

app.post('/api/parking/exit/:bookingId', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.bookingId).populate('parkingAreaId');
        if (!booking || booking.status !== 'in-progress') {
            return res.status(400).json({ success: false, message: "Invalid booking for exit" });
        }

        const exitTime = new Date();
        const entryTime = booking.entryTime || booking.startTime; // Fallback if entry wasn't clicked

        const totalCharge = calculateParkingCharge(entryTime, exitTime);
        const durationMs = Math.abs(exitTime - entryTime);
        const durationMins = Math.floor(durationMs / 60000);

        // Overstay detection
        const isOverstay = exitTime > booking.endTime;
        const overstayMessage = isOverstay ? "You stayed longer than your booking. Additional charges applied." : "";

        booking.status = 'completed';
        booking.exitTime = exitTime;
        await booking.save();

        // Release Slot & Area (Step 8: status=available)
        const slot = await Slot.findById(booking.slotId);
        if (slot) {
            slot.isOccupied = false;
            slot.status = 'available';
            slot.currentBookingId = null;
            await slot.save();
        }

        const area = booking.parkingAreaId;
        if (area) {
            area.availableSlots += 1;
            await area.save();
            io.emit('slotReleased', { parkingAreaId: area._id, slotId: slot._id, availableSlots: area.availableSlots });
            io.emit('parkingAvailable', { parkingAreaId: area._id });
        }

        res.json({
            success: true,
            message: "Vehicle exited",
            summary: {
                entryTime: entryTime,
                exitTime: exitTime,
                duration: `${durationMins}m`,
                totalCharge: totalCharge,
                overstay: isOverstay,
                overstayMsg: overstayMessage
            }
        });
    } catch (error) {
        console.error("Exit error:", error);
        res.status(500).json({ success: false, message: "Error on exit" });
    }
});

app.post('/api/parking/extend/:bookingId', async (req, res) => {
    try {
        const { minutes } = req.body; // 10, 20, or 30
        if (![10, 20, 30].includes(minutes)) {
            return res.status(400).json({ success: false, message: "Invalid extension duration" });
        }

        const booking = await Booking.findById(req.params.bookingId);
        if (!booking || booking.status !== 'in-progress') {
            return res.status(400).json({ success: false, message: "Booking must be in-progress to extend" });
        }

        // Extend Expected Exit Time
        const currentEndTime = new Date(booking.endTime);
        booking.endTime = new Date(currentEndTime.getTime() + minutes * 60000);
        await booking.save();

        res.json({ success: true, message: `Parking extended by ${minutes} minutes`, newEndTime: booking.endTime });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error extending parking" });
    }
});

app.get('/api/listings/user/:userId', async (req, res) => {
    try {
        const listings = await ParkingListing.find({ ownerId: req.params.userId }).sort({ createdAt: -1 });
        res.json({ success: true, listings });
    } catch (error) {
        console.error("Fetch User Listings Error:", error);
        res.status(500).json({ success: false, message: "Error fetching your listings" });
    }
});

// 0.9 Land Owner Parking Listing & Seasonal (Features 7 & 8)
app.post('/api/listings/create', async (req, res) => {
    try {
        const { ownerId, title, coordinates, capacity, pricePerHour, vehicleTypesAllowed, availabilityStart, availabilityEnd, eventName, eventStartDate, eventEndDate, temporarySlots } = req.body;

        const newListing = new ParkingListing({
            ownerId, title, location: { type: 'Point', coordinates },
            capacity, pricePerHour, vehicleTypesAllowed,
            availabilityStart, availabilityEnd,
            eventName, eventStartDate, eventEndDate, temporarySlots
        });
        await newListing.save();

        res.json({ success: true, listing: newListing, message: "Listing submitted for approval" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error submitting listing" });
    }
});

app.get('/api/admin/listings/pending', async (req, res) => {
    try {
        const listings = await ParkingListing.find({ isApproved: false }).populate('ownerId', 'name email');
        res.json({ success: true, listings });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching listings" });
    }
});

// --- Owner Feature Endpoints ---

// Get all properties (ParkingAreas) owned by a user
app.get('/api/owner/properties/:userId', async (req, res) => {
    try {
        const properties = await ParkingArea.find({ ownerId: req.params.userId });
        res.json({ success: true, properties });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching owner properties" });
    }
});

// Get unified booking history for all properties of an owner
// Get analytics for an owner
app.get('/api/owner/stats/:userId', async (req, res) => {
    try {
        const ownerProperties = await ParkingArea.find({ ownerId: req.params.userId });
        const areaIds = ownerProperties.map(p => p._id);

        const bookings = await Booking.find({ parkingAreaId: { $in: areaIds } });

        // Stats calculation
        const totalBookings = bookings.length;
        const totalRevenue = bookings.reduce((sum, b) => sum + (b.totalCharge || 0), 0);

        // Peak Hours (Simple frequency map)
        const hours = bookings.map(b => new Date(b.startTime).getHours());
        const hourFreq = {};
        hours.forEach(h => hourFreq[h] = (hourFreq[h] || 0) + 1);
        const peakHour = Object.keys(hourFreq).sort((a, b) => hourFreq[b] - hourFreq[a])[0] || "N/A";

        // Slot Utilization
        const totalPossibleSlots = ownerProperties.reduce((sum, p) => sum + p.totalSlots, 0);
        const occupiedCount = await Slot.countDocuments({ parkingAreaId: { $in: areaIds }, status: 'occupied' });
        const utilization = totalPossibleSlots > 0 ? ((occupiedCount / totalPossibleSlots) * 100).toFixed(1) : 0;

        res.json({
            success: true,
            stats: {
                totalBookings,
                totalRevenue,
                peakHour: peakHour !== "N/A" ? `${peakHour}:00` : "N/A",
                utilization: `${utilization}%`
            }
        });
    } catch (error) {
        console.error("Owner Stats Error:", error);
        res.status(500).json({ success: false, message: "Error fetching owner stats" });
    }
});

// Get detailed bookings for all properties of an owner
app.get('/api/owner/bookings/:userId', async (req, res) => {
    try {
        const ownerProperties = await ParkingArea.find({ ownerId: req.params.userId }).select('_id name');
        const areaIds = ownerProperties.map(p => p._id);
        const areaNames = ownerProperties.reduce((acc, p) => ({ ...acc, [p._id.toString()]: p.name }), {});

        const bookings = await Booking.find({ parkingAreaId: { $in: areaIds } })
            .populate('userId', 'name email')
            .populate('vehicleId', 'vehicleNumber vehicleType')
            .lean();

        // Get entry details to determine check-in method
        const bookingIds = bookings.map(b => b._id);
        const entries = await ParkingEntry.find({ bookingId: { $in: bookingIds } }).lean();
        const entryMap = entries.reduce((acc, e) => {
            if (!acc[e.bookingId]) acc[e.bookingId] = [];
            acc[e.bookingId].push(e);
            return acc;
        }, {});

        const formattedBookings = bookings.map(b => {
            const bEntries = entryMap[b._id.toString()] || [];
            // Get latest entry if exists
            let latestEntry = null;
            if (bEntries.length > 0) {
                bEntries.sort((x, y) => new Date(y.entryTime) - new Date(x.entryTime));
                latestEntry = bEntries[0];
            }

            const now = new Date();
            const isOverstay = b.status === 'in-progress' && now > new Date(b.endTime);

            return {
                _id: b._id,
                userName: b.userId ? b.userId.name : 'Unknown User',
                vehicleNumber: b.vehicleId ? b.vehicleId.vehicleNumber : 'Unknown Vehicle',
                parkingAreaName: areaNames[b.parkingAreaId.toString()] || 'Unknown Area',
                status: b.status,
                startTime: b.startTime,
                endTime: b.endTime,
                entryTime: b.entryTime || (latestEntry ? latestEntry.entryTime : null),
                exitTime: b.exitTime || (latestEntry ? latestEntry.exitTime : null),
                entryMethod: latestEntry ? latestEntry.entryMethod : '-',
                isOverstay: isOverstay
            };
        });

        // Sort by newest booking first
        formattedBookings.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

        res.json({ success: true, bookings: formattedBookings });
    } catch (error) {
        console.error("Owner Bookings Error:", error);
        res.status(500).json({ success: false, message: "Error fetching owner bookings" });
    }
});

app.post('/api/admin/listings/approve/:listingId', async (req, res) => {
    try {
        const listing = await ParkingListing.findById(req.params.listingId).populate('ownerId');
        if (!listing) return res.status(404).json({ success: false, message: "Listing not found" });

        listing.isApproved = true;
        await listing.save();

        // Upgrade user to parking_owner
        if (listing.ownerId && listing.ownerId.role !== 'admin') {
            await User.findByIdAndUpdate(listing.ownerId._id, { role: 'parking_owner' });
        }

        const areaIdStr = `PRK-${listing._id.toString().slice(-4).toUpperCase()}`;
        const newArea = new ParkingArea({
            parkingAreaId: areaIdStr,
            name: listing.title,
            location: listing.location,
            totalSlots: listing.capacity,
            availableSlots: listing.capacity, // Initially all available
            pricePerHour: listing.pricePerHour,
            vehicleTypesAllowed: listing.vehicleTypesAllowed,
            ownerId: listing.ownerId._id,
            isPublicOSM: false,
            slotNumberingType: listing.slotNumberingType || 'numbers',
            pricingModel: listing.pricingModel || 'hour'
        });
        await newArea.save();

        const emergencyCount = listing.capacity >= 10 ? 3 : 2;
        const normalCount = listing.capacity - emergencyCount;
        const slotsToInsert = [];

        for (let i = 1; i <= listing.capacity; i++) {
            let label;
            if (listing.slotNumberingType === 'letters') {
                // A, B, C...
                label = String.fromCharCode(64 + i);
                if (i > 26) label = `A${String.fromCharCode(64 + i - 26)}`; // Simple overflow for up to 52 slots
            } else {
                label = `${i}`;
            }

            slotsToInsert.push({
                slotId: `${areaIdStr}-${label}`,
                parkingAreaId: newArea._id,
                slotNumber: label,
                isEmergency: i > normalCount
            });
        }
        await Slot.insertMany(slotsToInsert);

        res.json({ success: true, message: "Listing approved! Slots generated and user upgraded to Parking Owner." });
    } catch (error) {
        console.error("Approval error", error);
        res.status(500).json({ success: false, message: "Error approving listing" });
    }
});

// 1.0 Notifications (Feature 9)
app.post('/api/notifications/send', async (req, res) => {
    try {
        const { senderUserId, vehicleNumber, message } = req.body;

        // Find vehicle owner
        const vehicle = await Vehicle.findOne({ vehicleNumber });
        if (!vehicle) {
            return res.status(404).json({ success: false, message: "Vehicle not found" });
        }

        const receiverUserId = vehicle.userId;
        const notificationId = `NOT-${Date.now()}`;

        const notif = new Notification({
            notificationId,
            senderUserId,
            receiverUserId,
            vehicleId: vehicle._id,
            message
        });
        await notif.save();

        // Emitting socket event for real-time inbox UI updates
        io.emit(`notification-${receiverUserId}`, notif);

        res.json({ success: true, message: "Notification sent successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error sending notification" });
    }
});

app.get('/api/notifications/user/:userId', async (req, res) => {
    try {
        const notifications = await Notification.find({ receiverUserId: req.params.userId })
            .populate('vehicleId')
            .sort({ createdAt: -1 });
        res.json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching notifications" });
    }
});

// 1.1 Ratings (Feature 10)
app.post('/api/ratings/add', async (req, res) => {
    try {
        const { userId, parkingAreaId, safetyRating, spaceRating, lightingRating, priceRating, comment } = req.body;
        const ratingId = `RTG-${Date.now()}`;

        const rating = new Rating({
            ratingId, userId, parkingAreaId,
            safetyRating, spaceRating, lightingRating, priceRating, comment
        });
        await rating.save();
        res.json({ success: true, rating });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error submitting rating" });
    }
});

app.get('/api/ratings/area/:areaId', async (req, res) => {
    try {
        const ratings = await Rating.find({ parkingAreaId: req.params.areaId });

        if (ratings.length === 0) return res.json({ success: true, average: 0, count: 0 });

        const avgs = ratings.reduce((acc, curr) => {
            acc.safety += curr.safetyRating;
            acc.space += curr.spaceRating;
            acc.lighting += curr.lightingRating;
            acc.price += curr.priceRating;
            return acc;
        }, { safety: 0, space: 0, lighting: 0, price: 0 });

        const count = ratings.length;
        const overallAverage = ((avgs.safety + avgs.space + avgs.lighting + avgs.price) / (4 * count)).toFixed(1);

        res.json({
            success: true,
            overallAverage,
            count,
            details: {
                safety: (avgs.safety / count).toFixed(1),
                space: (avgs.space / count).toFixed(1),
                lighting: (avgs.lighting / count).toFixed(1),
                price: (avgs.price / count).toFixed(1)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching ratings" });
    }
});

// 1.2 Admin Extensions (Feature 11)
app.get('/api/admin/overview', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalBookings = await Booking.countDocuments();
        const totalParkings = await ParkingArea.countDocuments();
        const pendingListings = await ParkingListing.countDocuments({ isApproved: false });

        res.json({
            success: true,
            totalUsers, totalBookings, totalParkings, pendingListings
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching admin overview" });
    }
});

app.delete('/api/admin/listings/:listingId', async (req, res) => {
    try {
        await ParkingListing.findByIdAndDelete(req.params.listingId);
        res.json({ success: true, message: "Listing rejected/removed" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error removing listing" });
    }
});

// 1.3 Parking Analytics (Feature 12)
app.get('/api/analytics/owner/:ownerId', async (req, res) => {
    try {
        const ownerAreas = await ParkingArea.find({ ownerId: req.params.ownerId });
        const areaIds = ownerAreas.map(a => a._id);

        const bookings = await Booking.find({ parkingAreaId: { $in: areaIds }, status: 'completed' }).populate('parkingAreaId');

        let totalRevenue = 0;
        bookings.forEach(b => {
            const h = Math.abs(b.exitTime - b.entryTime) / 3600000;
            totalRevenue += Math.ceil(h) * (b.parkingAreaId.pricePerHour || 20);
        });

        // Simplified active slots
        const activeBookings = await Booking.countDocuments({ parkingAreaId: { $in: areaIds }, status: { $in: ['active', 'in-progress'] } });
        const totalSlotsCount = ownerAreas.reduce((sum, area) => sum + area.totalSlots, 0);

        res.json({
            success: true,
            totalRevenue,
            totalBookingsCompleted: bookings.length,
            currentlyOccupied: activeBookings,
            totalSlotsManaged: totalSlotsCount,
            usageRate: totalSlotsCount > 0 ? ((activeBookings / totalSlotsCount) * 100).toFixed(1) + '%' : '0%'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching analytics" });
    }
});

// 2. Core Parking (Legacy Fallbacks)
app.get('/api/slots', (req, res) => res.json(parkingSlots));

app.post('/api/book', (req, res) => {
    // Intro-reserve handled in confirm for simplicity in V3
    res.json({ success: true, message: 'Proceed to payment' });
});

app.post('/api/confirm-payment', async (req, res) => {
    try {
        let { slotIds, userId, plate, location, start, end, hours, areaId } = req.body;

        if (!slotIds) return res.json({ success: false, message: "No slots selected" });

        const isAutoAssign = slotIds === 'AUTO';
        const idsToBook = Array.isArray(slotIds) ? slotIds : (isAutoAssign ? [] : slotIds.split(','));
        const booked = [];

        // 1. Resolve User
        let dbUser = await User.findOne({ email: userId });
        if (!dbUser) {
            dbUser = await User.findOne({ name: 'User' });
            if (!dbUser) return res.json({ success: false, message: "User not found. Please re-login." });
        }

        // 2. Resolve Vehicle
        let vehicle = await Vehicle.findOne({ vehicleNumber: plate, userId: dbUser._id });
        if (!vehicle) {
            vehicle = new Vehicle({
                userId: dbUser._id,
                vehicleNumber: plate,
                vehicleType: 'car',
                brand: 'Unknown',
                color: 'Unknown'
            });
            await vehicle.save();
        }

        // 3. Resolve Parking Area
        let area;
        if (areaId && mongoose.Types.ObjectId.isValid(areaId)) {
            area = await ParkingArea.findById(areaId);
        }

        if (!area) {
            let areaName = location || "Unknown Area";
            area = await ParkingArea.findOne({ name: areaName });
        }

        if (!area) {
            area = new ParkingArea({
                parkingAreaId: `PUB-${Date.now().toString().slice(-6)}`,
                name: location || "Generated Area",
                location: { type: 'Point', coordinates: [76.2673, 9.9312] },
                totalSlots: 100,
                availableSlots: 100,
                pricePerHour: 20,
                isPublicOSM: true
            });
            await area.save();
        }

        // 4. Auto-Assign Logic OR Specific Slot Booking
        if (isAutoAssign) {
            // Find an unoccupied slot in this area
            let slot = await Slot.findOne({ parkingAreaId: area._id, isOccupied: false });

            // If no slot exists in DB but area has available slots logically, generate one
            if (!slot && area.availableSlots > 0) {
                const newSlotNumber = `S${Math.floor(Math.random() * 1000) + 1}`;
                slot = new Slot({
                    slotId: `${area.parkingAreaId}-${newSlotNumber}`,
                    parkingAreaId: area._id,
                    slotNumber: newSlotNumber,
                    isOccupied: false
                });
                await slot.save();
            }

            if (!slot) {
                return res.json({ success: false, message: "Sorry, this parking area is currently full." });
            }

            idsToBook.push(slot.slotNumber); // Add to our loop array to process creating the booking
        }

        // 5. Book Slots
        for (const slotLabel of idsToBook) {
            let slot;
            if (mongoose.Types.ObjectId.isValid(slotLabel)) {
                slot = await Slot.findById(slotLabel);
            } else {
                slot = await Slot.findOne({ parkingAreaId: area._id, slotNumber: slotLabel });
            }

            if (!slot) {
                // Generate slot if it doesn't exist (only if slotLabel is NOT an ObjectID)
                if (!mongoose.Types.ObjectId.isValid(slotLabel)) {
                    slot = new Slot({
                        slotId: `${area.parkingAreaId}-${slotLabel}`,
                        parkingAreaId: area._id,
                        slotNumber: slotLabel,
                        isOccupied: false
                    });
                    await slot.save();
                } else {
                    return res.json({ success: false, message: `Slot ${slotLabel} not found.` });
                }
            }

            if (slot.isOccupied) {
                return res.json({ success: false, message: `Slot ${slot.slotNumber || slotLabel} is already occupied by someone else.` });
            }

            // Parse actual times
            let startTime = new Date();
            if (date && start) {
                startTime = new Date(`${date}T${start}:00`);
            }
            const bookedHours = parseInt(hours) || 1;
            const endTime = new Date(startTime.getTime() + bookedHours * 3600000);

            const booking = new Booking({
                bookingId: `BKG-${Date.now()}-${slotLabel}`,
                userId: dbUser._id,
                vehicleId: vehicle._id,
                parkingAreaId: area._id,
                slotId: slot._id,
                startTime: startTime,
                endTime: endTime,
                status: 'active'
            });
            await booking.save();

            slot.isOccupied = true;
            slot.currentBookingId = booking._id;
            await slot.save();

            booked.push(slotLabel);
        }

        // Update Area
        area.availableSlots -= booked.length;
        await area.save();

        res.json({ success: true, booked, message: "Booking confirmed in database!" });
    } catch (error) {
        console.error("Payment confirmation error:", error);
        res.status(500).json({ success: false, message: "Server error during booking" });
    }
});

app.get('/api/ev-stations', (req, res) => res.json(evStations));
app.get('/api/nearby-lots', (req, res) => res.json(nearbyLots));

// 2.1 Get User Bookings
app.get('/api/bookings/user/:userId', async (req, res) => {
    try {
        const bookings = await Booking.find({ userId: req.params.userId })
            .populate('parkingAreaId')
            .populate('vehicleId')
            .sort({ createdAt: -1 });
        res.json({ success: true, bookings });
    } catch (error) {
        console.error("Fetch User Bookings Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch bookings" });
    }
});

// --- Helper Functions for High-Accuracy OCR ---

/**
 * Corrects common OCR misidentifications based on Indian plate format (AA 00 AA 0000)
 */
function correctPlateFormat(text) {
    let result = '';
    const MapToLetter = { '0': 'O', '1': 'I', '5': 'S', '6': 'G', '8': 'B', '2': 'Z' };
    const MapToNumber = { 'O': '0', 'I': '1', 'S': '5', 'G': '6', 'B': '8', 'Z': '2' };

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (i === 0 || i === 1) {
            result += MapToLetter[char] || char;
        } else if (i === 2 || i === 3) {
            result += MapToNumber[char] || char;
        } else if (i === 4 || i === 5) {
            if (isNaN(char) || MapToLetter[char]) {
                result += MapToLetter[char] || char;
            } else {
                result += char;
            }
        } else {
            result += MapToNumber[char] || char;
        }
    }
    return result;
}

/**
 * Validates plate against Indian format regex
 */
function isValidIndianPlate(plate) {
    const regex = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{3,4}$/;
    return regex.test(plate);
}

/**
 * Masks phone number for privacy (Feature 2)
 * Example: 9876543210 -> 987XXXXX
 */
function maskPhone(phone) {
    if (!phone) return 'XXXXXXXX';
    const str = phone.toString();
    return str.slice(0, 3) + 'XXXXX';
}

/**
 * Runs a single OCR pass with specific preprocessing
 */
async function runOcrPass(imagePath, options = {}) {
    let worker = null;
    try {
        const processedPath = `uploads/proc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.png`;
        let s = sharp(imagePath).resize(1000).grayscale().normalize();

        if (options.sharpen) s = s.sharpen();
        if (options.contrast) s = s.linear(1.5, -0.2);

        await s.toFile(processedPath);

        worker = await createWorker('eng');
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        });

        const { data: { text, confidence } } = await worker.recognize(processedPath);
        await worker.terminate();

        const cleanResult = text.replace(/[^A-Z0-9]/g, '').toUpperCase();
        const corrected = correctPlateFormat(cleanResult);

        return {
            text: corrected,
            rawText: cleanResult,
            confidence: confidence / 100,
            isValid: isValidIndianPlate(corrected)
        };
    } catch (err) {
        console.error("OCR Pass Error:", err);
        if (worker) await worker.terminate();
        return null;
    }
}

// Live Gate Camera OCR Proxy (PlateRecognizer Cloud Integration)
app.post('/api/scan-plate-advanced', async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) return res.status(400).json({ success: false, message: "No image provided" });

        // Convert base64 to buffer
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const tempPath = `uploads/gate-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.jpg`;
        fs.writeFileSync(tempPath, imageBuffer);

        // Send directly to PlateRecognizer Cloud API
        const form = new FormData();
        form.append('upload', fs.createReadStream(tempPath));

        try {
            const anprRes = await axios.post('https://api.platerecognizer.com/v1/plate-reader/', form, {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Token ${process.env.PLATE_RECOGNIZER_API_KEY}`
                },
                timeout: 8000
            });

            // Cleanup temp file
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

            // PlateRecognizer arrays detections under `results`
            if (anprRes.data && anprRes.data.results && anprRes.data.results.length > 0) {

                // Get the best detection
                let bestMatch = anprRes.data.results[0];

                // If it found multiple, pick the one with highest score
                for (let r of anprRes.data.results) {
                    if (r.score > bestMatch.score) bestMatch = r;
                }

                if (bestMatch.score < 0.6) {
                    return res.json({ success: false, vehicleFound: false, message: "Plate detected but confidence is too low" });
                }

                const cleanResult = bestMatch.plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                const plate = correctPlateFormat(cleanResult);

                const vehicle = await Vehicle.findOne({ vehicleNumber: plate }).populate('userId');

                if (vehicle) {
                    return res.json({
                        success: true,
                        vehicleFound: true,
                        vehicleNumber: plate,
                        confidence: bestMatch.score,
                        ownerName: vehicle.userId ? vehicle.userId.name : 'Unknown User',
                        vehicleType: vehicle.vehicleType
                    });
                } else {
                    return res.json({
                        success: true,
                        vehicleFound: true,
                        vehicleNumber: plate,
                        confidence: bestMatch.score,
                        ownerName: 'Unregistered Vehicle',
                        vehicleType: 'Unknown'
                    });
                }
            } else {
                return res.json({ success: false, vehicleFound: false, message: "No plate found by API" });
            }
        } catch (apiError) {
            console.error(`[PlateRecognizer Error]:`, apiError.response ? apiError.response.data : apiError.message);
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            return res.json({ success: false, vehicleFound: false, message: "API service error" });
        }
    } catch (err) {
        console.error("Advanced Scan Error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

// 1.4 Vehicle OCR (High Accuracy Upgrade - PlateRecognizer)
app.post('/api/plate/scan', upload.single('plateImage'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });
        const originalPath = req.file.path;

        console.log(`[OCR] Sending manual uploaded image to PlateRecognizer API...`);
        const form = new FormData();
        form.append('upload', fs.createReadStream(originalPath));

        try {
            const anprRes = await axios.post('https://api.platerecognizer.com/v1/plate-reader/', form, {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Token ${process.env.PLATE_RECOGNIZER_API_KEY}`
                },
                timeout: 8000
            });

            if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);

            if (anprRes.data && anprRes.data.results && anprRes.data.results.length > 0) {
                let bestMatch = anprRes.data.results[0];
                for (let r of anprRes.data.results) {
                    if (r.score > bestMatch.score) bestMatch = r;
                }

                if (bestMatch.score < 0.6) {
                    return res.json({ success: false, message: "Could not clearly detect the plate. Please try a closer, steadier shot." });
                }

                const cleanResult = bestMatch.plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                const plate = correctPlateFormat(cleanResult);

                // Return the raw text immediately so the user can edit it
                return res.json({
                    success: true,
                    plate: plate,
                    rawText: bestMatch.plate,
                    confidence: bestMatch.score,
                    results: anprRes.data.results
                });

            } else {
                return res.json({ success: false, message: "Could not clearly detect the plate. Please try a closer, steadier shot." });
            }

        } catch (apiError) {
            if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
            console.error(`[PlateRecognizer Error]:`, apiError.response ? apiError.response.data : apiError.message);
            return res.json({ success: false, message: "API service error, please try again." });
        }
    } catch (err) {
        console.error("Advanced Scan Error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

// 1.4.1 Plate Verification (Post-Edit DB Match Step)
app.post('/api/plate/verify', async (req, res) => {
    try {
        const { plate, confidence = 1.0, results = [] } = req.body;
        if (!plate) return res.status(400).json({ success: false, message: "No plate provided" });

        const normalizedPlate = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        let matchConfidence = confidence;

        // Try exact match with normalized number
        let vehicle = await Vehicle.findOne({ vehicleNumber: normalizedPlate }).populate('userId');

        // If exact match fails, try fuzzy match on all vehicles since letters O and 0 can sometimes confuse it
        if (!vehicle) {
            console.log(`[OCR Verify] No exact match for ${normalizedPlate}. Attempting fuzzy match...`);
            const allVehicles = await Vehicle.find({}).populate('userId');
            const vehicleNumbers = allVehicles.map(v => v.vehicleNumber.replace(/[^A-Z0-9]/g, '').toUpperCase());

            if (vehicleNumbers.length > 0) {
                const matches = stringSimilarity.findBestMatch(normalizedPlate, vehicleNumbers);
                if (matches.bestMatch.rating > 0.8) {
                    vehicle = allVehicles[matches.bestMatchIndex];
                    console.log(`[OCR Verify] Fuzzy match found: ${vehicle.vehicleNumber} (Score: ${matches.bestMatch.rating.toFixed(2)})`);
                    matchConfidence = matches.bestMatch.rating;
                }
            }
        }

        if (vehicle) {
            const phone = vehicle.userId ? (vehicle.userId.phone || '9999999999') : '9999999999';
            const maskedPhone = phone.toString().slice(0, 5) + 'XXXXX';

            return res.json({
                success: true,
                vehicleFound: true,
                vehicleNumber: vehicle.vehicleNumber,
                detectedPlate: normalizedPlate,
                ocrRawText: normalizedPlate,
                confidence: matchConfidence,
                vehicleType: vehicle.vehicleType,
                brand: vehicle.brand,
                color: vehicle.color,
                ownerName: vehicle.userId ? vehicle.userId.name : 'Unknown',
                ownerContact: maskedPhone,
                debug: { results }
            });
        } else {
            return res.json({
                success: true,
                vehicleFound: false,
                detectedPlate: normalizedPlate,
                ocrRawText: normalizedPlate,
                confidence: matchConfidence,
                isValid: true,
                debug: { results }
            });
        }
    } catch (error) {
        console.error("Verification Error:", error);
        res.status(500).json({ success: false, message: "Verification processing failed" });
    }
});

// 1.5 Staff Check-In System (Feature 5, 6, 7, 8, 9)
app.post('/api/staff/check-in', async (req, res) => {
    try {
        const { vehicleNumber, parkingAreaId } = req.body;
        const normalizedNumber = vehicleNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

        // 1. Find Vehicle
        const vehicle = await Vehicle.findOne({ vehicleNumber: normalizedNumber });

        // 2. Check for active booking (Feature 6)
        let booking = null;
        if (vehicle) {
            console.log("[DEBUG] Checking booking for:", { vehicleId: vehicle._id, parkingAreaId, status: 'active' });
            booking = await Booking.findOne({
                vehicleId: vehicle._id,
                parkingAreaId,
                status: 'active'
            });
            console.log("[DEBUG] Booking found:", booking ? booking._id : null);
        }

        // Feature Request: Strict Check-In
        // Only allow entry if a booking exists for this area
        if (!booking) {
            return res.status(403).json({
                success: false,
                message: "No active booking found for this vehicle in this parking lot. Access Denied."
            });
        }

        // 3. Create Entry Record (Feature 5)
        const entry = new ParkingEntry({
            entryId: `ENT-${Date.now()}`,
            parkingAreaId,
            vehicleNumber: normalizedNumber,
            vehicleId: vehicle ? vehicle._id : null,
            bookingId: booking ? booking._id : null,
            entryMethod: 'plate_scan',
            status: 'entered'
        });
        await entry.save();

        // 4. Update Booking and Slot (Feature 8)
        let reassignmentMessage = "";
        if (booking) {
            booking.status = 'in-progress';
            booking.entryTime = new Date();

            // CONFLICT HANDLING: Is the reserved slot already occupied?
            const currentSlot = await Slot.findById(booking.slotId);
            if (currentSlot && currentSlot.status === 'occupied') {
                // Find new available slot (Normal first, then Emergency)
                const newSlot = await Slot.findOne({ parkingAreaId, status: 'available' }).sort({ isEmergency: 1 });
                if (newSlot) {
                    booking.slotId = newSlot._id;
                    newSlot.status = 'occupied';
                    newSlot.currentBookingId = booking._id;
                    await newSlot.save();

                    reassignmentMessage = newSlot.isEmergency
                        ? "You have been assigned a temporary emergency slot."
                        : "Your slot has been reassigned.";
                } else {
                    return res.status(400).json({ success: false, message: "Parking Area is completely full (emergency slots included)." });
                }
            } else if (currentSlot) {
                currentSlot.status = 'occupied';
                await currentSlot.save();
            }

            await booking.save();
        }

        // 5. Emit Events (Feature 8)
        io.emit('vehicleEntered', {
            vehicleNumber: normalizedNumber,
            parkingAreaId,
            userId: vehicle ? vehicle.userId : null
        });
        io.emit('slotUpdated', { parkingAreaId });

        res.json({
            success: true,
            message: reassignmentMessage || "Vehicle checked in successfully",
            entryId: entry.entryId,
            reassigned: !!reassignmentMessage
        });
    } catch (error) {
        console.error("Staff Check-In Error:", error);
        res.status(500).json({ success: false, message: "Check-in failed" });
    }
});

// --- ANPR INTEGRATION & OWNER NOTIFICATION (Feature 1, 2, 3) ---

// 1.5.1 Vehicle Lookup (Feature 1 & 2 - Enhanced with Fuzzy)
app.post('/api/vehicle/lookup', async (req, res) => {
    try {
        const { plate } = req.body;
        if (!plate) return res.status(400).json({ success: false, message: "Plate number required" });

        const normalizedNumber = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

        // 1. Try Exact Match
        let vehicle = await Vehicle.findOne({ vehicleNumber: normalizedNumber }).populate('userId');

        // 2. Try Fuzzy Match if no exact match (Improve user experience for manual entries)
        if (!vehicle) {
            console.log(`[Lookup] No exact match for ${normalizedNumber}. Attempting fuzzy match...`);
            const allVehicles = await Vehicle.find({}).populate('userId');
            const vehicleNumbers = allVehicles.map(v => v.vehicleNumber);

            if (vehicleNumbers.length > 0) {
                const matches = stringSimilarity.findBestMatch(normalizedNumber, vehicleNumbers);
                if (matches.bestMatch.rating > 0.8) {
                    vehicle = allVehicles[matches.bestMatchIndex];
                    console.log(`[Lookup] Fuzzy match found: ${vehicle.vehicleNumber} (Score: ${matches.bestMatch.rating.toFixed(2)})`);
                }
            }
        }

        if (!vehicle) {
            return res.json({ success: false, message: "Vehicle not registered in system" });
        }

        res.json({
            success: true,
            vehicleNumber: vehicle.vehicleNumber,
            vehicleType: vehicle.vehicleType || "Car",
            brand: vehicle.brand || "Unknown",
            ownerName: vehicle.userId ? vehicle.userId.name : "Registered Owner",
            maskedPhone: maskPhone(vehicle.userId ? vehicle.userId.phone : "")
        });
    } catch (error) {
        console.error("Lookup Error:", error);
        res.status(500).json({ success: false, message: "Server error during lookup" });
    }
});

// 1.5.2 Contact Owner Anonymously (Feature 3 & 6)
app.post('/api/vehicle/contact-owner', async (req, res) => {
    try {
        const { plate, senderUserId } = req.body;

        // 1. Find Vehicle & Owner
        const vehicle = await Vehicle.findOne({ vehicleNumber: plate });
        if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });

        // 2. Security Rule: Limit notifications (max 3 per hour per vehicle)
        const oneHourAgo = new Date(Date.now() - 3600000);
        const recentNotifs = await Notification.countDocuments({
            vehicleNumber: plate,
            createdAt: { $gte: oneHourAgo }
        });

        if (recentNotifs >= 3) {
            return res.status(429).json({ success: false, message: "Notification limit reached. Please try again later." });
        }

        // 3. Create Notification
        const notification = new Notification({
            notificationId: `NOT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            senderUserId,
            receiverUserId: vehicle.userId,
            vehicleNumber: plate,
            vehicleId: vehicle._id,
            message: "Someone reported that your vehicle may be blocking another vehicle. Please check and move your vehicle if necessary."
        });
        await notification.save();

        // Notify client via socket if online
        io.emit(`notification-${vehicle.userId}`, notification);

        res.json({ success: true, message: "Owner notified successfully" });
    } catch (error) {
        console.error("Contact Owner Error:", error);
        res.status(500).json({ success: false, message: "Failed to notify owner" });
    }
});

app.post('/api/staff/check-out', async (req, res) => {
    try {
        const { vehicleNumber, parkingAreaId } = req.body;
        const normalizedNumber = vehicleNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

        // 1. Find active entry (Feature 9)
        const entry = await ParkingEntry.findOne({
            vehicleNumber: normalizedNumber,
            parkingAreaId,
            status: 'entered'
        });

        if (!entry) return res.status(404).json({ success: false, message: "Active entry not found" });

        // 2. Update Entry
        entry.exitTime = new Date();
        entry.status = 'exited';
        await entry.save();

        // 3. Free Slot and Booking
        let summary = { duration: 0, charge: 0 };
        if (entry.bookingId) {
            const booking = await Booking.findById(entry.bookingId).populate('parkingAreaId');
            if (booking) {
                booking.status = 'completed';
                booking.exitTime = new Date();

                // Calculate Charge
                const area = booking.parkingAreaId;
                const charge = calculateParkingCharge(booking.entryTime || booking.startTime, booking.exitTime, area.pricingModel, area.pricePerHour);
                booking.totalCharge = charge; // Assuming we add this field or just return it
                await booking.save();

                summary.duration = Math.ceil((booking.exitTime - (booking.entryTime || booking.startTime)) / 60000);
                summary.charge = charge;

                const slot = await Slot.findById(booking.slotId);
                if (slot) {
                    slot.status = 'available';
                    slot.currentBookingId = null;
                    await slot.save();
                }
            }
        } else {
            // Manual entry slot release
            const area = await ParkingArea.findById(parkingAreaId);
            const slot = await Slot.findOne({ parkingAreaId, status: 'occupied' });
            if (slot) {
                slot.status = 'available';
                slot.currentBookingId = null;
                await slot.save();

                const charge = calculateParkingCharge(entry.createdAt, entry.exitTime, area ? area.pricingModel : '10min', area ? area.pricePerHour : 20);
                summary.duration = Math.ceil((entry.exitTime - entry.createdAt) / 60000);
                summary.charge = charge;
            }
        }

        // Update Area
        await ParkingArea.findByIdAndUpdate(parkingAreaId, { $inc: { availableSlots: 1 } });

        // 4. Emit Events
        let userId = null;
        if (entry.vehicleId) {
            const vehicle = await Vehicle.findById(entry.vehicleId);
            if (vehicle) userId = vehicle.userId;
        }

        io.emit('vehicleExited', {
            vehicleNumber: normalizedNumber,
            parkingAreaId,
            userId
        });
        io.emit('slotUpdated', { parkingAreaId });

        res.json({
            success: true,
            message: "Vehicle checked out successfully",
            summary
        });
    } catch (error) {
        console.error("Staff Check-Out Error:", error);
        res.status(500).json({ success: false, message: "Check-out failed" });
    }
});

// 3. Admin & AI
app.get('/api/admin/stats', (req, res) => {
    res.json({
        total: parkingSlots.length,
        occupied: parkingSlots.filter(s => s.status !== 'available').length,
        revenue: activityLogs.length * 50, // Mock revenue (₹50 avg)
        violations: violations.length
    });
});

app.get('/api/admin/logs', (req, res) => res.json(activityLogs));
app.get('/api/admin/violations', (req, res) => res.json(violations));
app.get('/api/ai/predictions', (req, res) => res.json(predictionData));

app.post('/api/admin/reset', (req, res) => {
    const slot = parkingSlots.find(s => s.id === req.body.slotId);
    if (slot) {
        slot.status = 'available';
        slot.user = null;

        // Log Exit
        const log = {
            id: Date.now(),
            action: 'EXIT',
            slotId: slot.id,
            time: new Date().toLocaleTimeString()
        };
        activityLogs.unshift(log);

        io.emit('slot_update', parkingSlots);
        io.emit('log_update', log);
        res.json({ success: true });
    }
});

// Socket
io.on('connection', (socket) => {
    socket.emit('slot_update', parkingSlots);
});

// --- SMS NOTIFICATION SYSTEM (Email-to-SMS) ---

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASS
    }
});

const CARRIER_GATEWAYS = {
    'Airtel': 'airtelmail.com',
    'BSNL': 'sms.bsnl.in',
    'Vodafone': 'vodafone-sms.com',
    'Jio': 'jio.com' // Typical Indian carriers
};

function maskPhone(phone) {
    if (!phone) return 'XXXXXXXXXX';
    return phone.substring(0, 3) + 'XXXXXXX';
}

async function sendSMS(phone, carrier, message) {
    const domain = CARRIER_GATEWAYS[carrier];
    if (!domain) {
        console.error(`[SMS] Unknown carrier: ${carrier}`);
        return false;
    }

    const gatewayEmail = `${phone}@${domain}`;
    console.log(`[SMS] Sending to ${gatewayEmail}...`);

    try {
        await transporter.sendMail({
            from: process.env.SMTP_EMAIL,
            to: gatewayEmail,
            subject: 'Smart Parking Alert',
            text: message
        });
        return true;
    } catch (err) {
        console.error(`[SMS] Error:`, err);
        return false;
    }
}

async function sendFast2SMS(phone, message) {
    if (!process.env.FAST2SMS_API_KEY || process.env.FAST2SMS_API_KEY.includes('your-api-key')) {
        console.warn("[Fast2SMS] API Key not set. Skipping SMS.");
        return false;
    }

    const options = {
        method: 'POST',
        url: 'https://www.fast2sms.com/dev/bulkV2',
        headers: {
            "authorization": process.env.FAST2SMS_API_KEY,
            "Content-Type": "application/json"
        },
        data: {
            "route": "q",
            "message": message,
            "language": "english",
            "flash": 0,
            "numbers": phone
        }
    };

    try {
        const response = await axios(options);
        if (response.data && response.data.return) {
            console.log(`[Fast2SMS] SMS sent successfully to ${phone}`);
            return true;
        } else {
            console.error(`[Fast2SMS] Error:`, response.data);
            return false;
        }
    } catch (err) {
        console.error(`[Fast2SMS] Request Failed:`, err.response ? err.response.data : err.message);
        return false;
    }
}

app.post('/api/vehicle/notify-owner', async (req, res) => {
    try {
        const { plate } = req.body;
        if (!plate) return res.status(400).json({ success: false, message: "Plate number required" });

        // 1. Find vehicle
        const vehicle = await Vehicle.findOne({
            vehicleNumber: plate.replace(/[^A-Z0-9]/g, '').toUpperCase()
        }).populate('userId');

        if (!vehicle || !vehicle.userId) {
            return res.status(404).json({ success: false, message: "Vehicle or owner not found" });
        }

        const owner = vehicle.userId;

        // 2. Validate plate format
        const plateRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/;
        // Simple validation, not strictly enforced if lookup worked, but per requirement
        console.log(`[Notify] Notifying owner of ${plate}...`);

        // 3. Rate Limit: Max 3 per hour per vehicle
        const oneHourAgo = new Date(Date.now() - 3600000);
        const recentNotifs = await Notification.countDocuments({
            vehicleNumber: vehicle.vehicleNumber,
            createdAt: { $gte: oneHourAgo }
        });

        if (recentNotifs >= 3) {
            return res.status(429).json({ success: false, message: "Notification limit reached (3 per hour). Please try later." });
        }

        // 4. Send "SMS" via Gateway/API AND Direct Email Fallback
        const message = `Smart Parking Alert:\n\nYour vehicle ${vehicle.vehicleNumber} may be blocking another vehicle.\nPlease move your vehicle if possible.`;

        // 4.1 Try Fast2SMS (Reliable)
        const fastSuccess = await sendFast2SMS(owner.phone, message);

        // 4.1.2 Try SMS Gateway (Free but unreliable in India - fallback)
        let gatewaySuccess = false;
        if (!fastSuccess) {
            gatewaySuccess = await sendSMS(owner.phone, owner.carrier || 'Airtel', message);
        }

        // 4.2 Direct Email Fallback (Free and 100% Reliable)
        let emailSuccess = false;
        try {
            await transporter.sendMail({
                from: process.env.SMTP_EMAIL,
                to: owner.email,
                subject: `Smart Parking Alert: ${vehicle.vehicleNumber}`,
                text: message
            });
            emailSuccess = true;
            console.log(`[Notify] Direct email sent to ${owner.email}`);
        } catch (err) {
            console.error(`[Notify] Email fallback error:`, err);
        }

        // 5. Log in DB
        await Notification.create({
            vehicleNumber: vehicle.vehicleNumber,
            receiverUserId: owner._id,
            message: message
        });

        res.json({
            success: true,
            message: fastSuccess ? "Owner notified via SMS API & Email" : (emailSuccess ? "Owner notified via Email" : "Notification logged and sent")
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error notifying owner" });
    }
});

http.listen(3000, () => {
    console.log('SPS V3 Brain Active on Port 3000');
});
