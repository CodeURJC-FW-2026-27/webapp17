const path = require('node:path');
const express = require('express');
const mustacheExpress = require('mustache-express');
const config = require('./config');
const { connectDatabase } = require('./database');
const { createPlateRepository } = require('./repositories/plate-repository');
const { createRouter } = require('./router');
const { navigation } = require('./view-models');

function createApp(database, options = config) {
    const app = express();
    const viewsDirectory = path.join(__dirname, 'views');
    app.disable('x-powered-by');
    app.engine('html', mustacheExpress(path.join(viewsDirectory, 'partials'), '.html'));
    app.set('view engine', 'html');
    app.set('views', viewsDirectory);
    app.use(express.urlencoded({ extended: false, limit: '100kb' }));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/uploads', express.static(options.uploadsDirectory));
    app.use(createRouter(createPlateRepository(database)));

    app.use((req, res) => {
        res.status(404).render('error', {
            ...navigation(), title: 'Página no encontrada',
            message: 'No se ha encontrado la página o el plato solicitado.',
            returnUrl: '/', returnLabel: 'Volver a la carta',
        });
    });

    app.use((error, req, res, next) => {
        console.error(error);
        if (res.headersSent) return next(error);
        res.status(500).render('error', {
            ...navigation(), title: 'Error del servidor',
            message: 'No se ha podido completar la operación. Inténtalo de nuevo.',
            returnUrl: '/', returnLabel: 'Volver a la carta',
        });
    });
    return app;
}

async function start() {
    const { client, database } = await connectDatabase();
    const app = createApp(database);
    const server = app.listen(config.port, () => {
        console.log(`Sakura Buffet: http://localhost:${config.port}`);
    });
    server.on('error', async error => {
        console.error(`HTTP server failed: ${error.message}`);
        await client.close();
        process.exitCode = 1;
    });
    const shutdown = () => server.close(async () => {
        await client.close();
    });
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    return server;
}

if (require.main === module) {
    start().catch(error => {
        console.error(`Startup failed: ${error.message}`);
        console.error('Check that MongoDB is running and review MONGODB_URI / MONGODB_DATABASE in .env.');
        process.exitCode = 1;
    });
}

module.exports = { createApp, start };
