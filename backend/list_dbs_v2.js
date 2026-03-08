const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

async function listAll() {
    let output = "";
    try {
        const client = await mongoose.connect(process.env.MONGO_URI);
        const admin = client.connection.db.admin();
        const dbs = await admin.listDatabases();
        output += 'Databases: ' + JSON.stringify(dbs.databases, null, 2) + "\n";

        for (const dbInfo of dbs.databases) {
            const db = client.connection.useDb(dbInfo.name);
            const collections = await db.db.listCollections().toArray();
            output += `DB: ${dbInfo.name}, Collections: ${JSON.stringify(collections.map(c => c.name))}\n`;

            if (collections.some(c => c.name === 'parkingareas')) {
                const count = await db.collection('parkingareas').countDocuments();
                output += `  -> parkingareas count: ${count}\n`;
                const sample = await db.collection('parkingareas').find({}).limit(5).toArray();
                output += `  -> Samples: ${JSON.stringify(sample.map(s => ({ name: s.name, id: s.parkingAreaId, isPublic: s.isPublicOSM })), null, 2)}\n`;
            }
        }

        fs.writeFileSync('db_list.txt', output);
        console.log('Done. See db_list.txt');
        process.exit(0);
    } catch (err) {
        fs.writeFileSync('db_list_error.txt', err.stack);
        process.exit(1);
    }
}

listAll();
