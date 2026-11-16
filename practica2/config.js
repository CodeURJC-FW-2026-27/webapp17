const path = require('node:path');

module.exports = {
    port: Number(process.env.PORT || 3000),
    mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
    databaseName: process.env.MONGODB_DATABASE || 'sakura_buffet',
    uploadsDirectory: path.join(__dirname, 'uploads'),
};
