const { MongoClient } = require('mongodb');
const config = require('./config');
const { seedDatabase } = require('./data/seed');

async function connectDatabase(options = config) {
    const client = new MongoClient(options.mongoUri, { serverSelectionTimeoutMS: 5000 });
    try {
        await client.connect();
        const database = client.db(options.databaseName);
        await seedDatabase(database, options.uploadsDirectory);
        await database.collection('plates').createIndex({ type: 1, order: 1, _id: 1 });
        await database.collection('ingredients').createIndex({ plateId: 1 });
        return { client, database };
    } catch (error) {
        await client.close();
        throw error;
    }
}

module.exports = { connectDatabase };
