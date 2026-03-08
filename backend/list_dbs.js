const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

async function listAll() {
    try {
        const client = await mongoose.connect(process.env.MONGO_URI);
        const admin = client.connection.db.admin();
        const dbs = await admin.listDatabases();
        console.log('Databases:', JSON.stringify(dbs.databases, null, 2));

        for (const dbInfo of dbs.databases) {
            const db = client.connection.useDb(dbInfo.name);
            const collections = await db.db.listCollections().toArray();
            console.log(`DB: ${dbInfo.name}, Collections:`, collections.map(c => c.name));

            if (collections.some(c => c.name === 'parkingareas')) {
                const count = await db.collection('parkingareas').countDocuments();
                console.log(`  -> parkingareas count: ${count}`);
                const sample = await db.collection('parkingareas').find({}).limit(1).toArray();
                if (sample.length > 0) {
                    console.log(`  -> Sample: ${sample[0].name} (${sample[0].parkingAreaId})`);
                }
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listAll();
