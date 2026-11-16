const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { mkdir, mkdtemp, rm, readFile } = require('node:fs/promises');
const { MongoClient } = require('mongodb');
const { createApp } = require('../app');
const { seedDatabase } = require('../data/seed');
const { navigation } = require('../view-models');

let client;
let database;
let server;
let uploadsDirectory;
let baseUrl;

before(async () => {
    client = new MongoClient(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017', {
        serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    database = client.db(`sakura_test_${randomUUID().replaceAll('-', '')}`);
    await mkdir(path.join(__dirname, '..', '.local'), { recursive: true });
    uploadsDirectory = await mkdtemp(path.join(__dirname, '..', '.local', 'test-uploads-'));
    await seedDatabase(database, uploadsDirectory);
    const app = createApp(database, { uploadsDirectory });
    server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (database) await database.dropDatabase();
    if (client) await client.close();
    if (uploadsDirectory) await rm(uploadsDirectory, { recursive: true, force: true });
});

test('seeds the original entities once and preserves database edits on restart', async () => {
    assert.equal(await database.collection('plates').countDocuments(), 12);
    assert.equal(await database.collection('ingredients').countDocuments(), 4);
    await database.collection('plates').updateOne({ _id: 'salmon-nigiri' }, { $set: { price: 12.95 } });
    await seedDatabase(database, uploadsDirectory);
    assert.equal(await database.collection('plates').countDocuments(), 12);
    assert.equal((await database.collection('plates').findOne({ _id: 'salmon-nigiri' })).price, 12.95);
});

test('renders six database plates per page and preserves navigation', async () => {
    const response = await fetch(baseUrl);
    const firstPage = await response.text();
    assert.equal(response.status, 200);
    assert.equal((firstPage.match(/class="plate-card h-100"/g) || []).length, 6);
    assert.match(firstPage, /12,95 €/);
    assert.match(firstPage, /Siguiente/);
    assert.match(firstPage, /aria-current="page">1/);
    const secondPage = await (await fetch(`${baseUrl}/?page=2`)).text();
    assert.equal((secondPage.match(/class="plate-card h-100"/g) || []).length, 6);
    assert.match(secondPage, /Bola de helado/);
    assert.match(secondPage, /Servicio inmediato/);
    assert.match(secondPage, /Anterior/);
    assert.match(secondPage, /aria-current="page">2/);
});

test('searches and categorizes in MongoDB, treating regex characters literally', async () => {
    const sushi = await (await fetch(`${baseUrl}/?type=sushi&search=Tempura&page=99`)).text();
    assert.equal((sushi.match(/class="plate-card h-100"/g) || []).length, 1);
    assert.match(sushi, /Tempura Uramaki/);
    const empty = await (await fetch(`${baseUrl}/?search=.%2A`)).text();
    assert.match(empty, /No hay platos que coincidan/);
    const starters = await (await fetch(`${baseUrl}/?type=starter&page=-1`)).text();
    assert.equal((starters.match(/class="plate-card h-100"/g) || []).length, 2);
    const injection = await (await fetch(`${baseUrl}/?search=%3Cscript%3E`)).text();
    assert.doesNotMatch(injection, /<script>/);
});

test('renders the selected plate with only its related ingredients', async () => {
    const detail = await (await fetch(`${baseUrl}/plates/tempura-uramaki`)).text();
    assert.equal((detail.match(/class="ingredient-card h-100"/g) || []).length, 4);
    assert.match(detail, /Gambas en tempura/);
    assert.match(detail, /14,75 €/);
    const otherPlate = await (await fetch(`${baseUrl}/plates/salmon-nigiri`)).text();
    assert.match(otherPlate, /Nigiri de salmón flambeado/);
    assert.doesNotMatch(otherPlate, /class="ingredient-card h-100"/);
});

test('serves the migrated form, shared layouts, legacy URLs and styled errors', async () => {
    for (const route of ['/plates/new', '/plate-form.html', '/index.html', '/plate-detail.html']) {
        const response = await fetch(baseUrl + route);
        assert.equal(response.status, 200);
        assert.match(await response.text(), /class="site-footer"/);
    }
    for (const route of ['/missing', '/plates/missing']) {
        const response = await fetch(baseUrl + route);
        assert.equal(response.status, 404);
        const html = await response.text();
        assert.match(html, /No se ha encontrado/);
        assert.match(html, /class="site-footer"/);
    }
    const confirmation = await new Promise((resolve, reject) => {
        createApp(database, { uploadsDirectory }).render('confirmation', {
            ...navigation(), title: 'Plato creado', message: 'Operación completada.',
            returnUrl: '/', returnLabel: 'Volver a la carta',
        }, (error, html) => error ? reject(error) : resolve(html));
    });
    assert.match(confirmation, /Operación completada/);
});

test('serves every original image and local stylesheet from its new location', async () => {
    const seed = require('../data/seed.json');
    for (const item of [...seed.plates, ...seed.ingredients]) {
        const response = await fetch(baseUrl + item.image);
        assert.equal(response.status, 200, item.image);
        assert.match(response.headers.get('content-type'), /^image\//);
        const source = await readFile(path.join(__dirname, '..', 'data', 'images', item.image.slice('/uploads/'.length)));
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), source);
    }
    for (const asset of ['/css/menu.css', '/vendor/bootstrap/bootstrap.css']) {
        assert.equal((await fetch(baseUrl + asset)).status, 200);
    }
});
