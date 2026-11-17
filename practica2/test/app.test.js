const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { mkdir, mkdtemp, rm, readFile } = require('node:fs/promises');
const { createApp } = require('../app');
const { seedDatabase } = require('../data/seed');
const { navigation } = require('../view-models');
const { connectDatabase } = require('../database');

let client;
let database;
let server;
let uploadsDirectory;
let baseUrl;

before(async () => {
    await mkdir(path.join(__dirname, '..', '.local'), { recursive: true });
    uploadsDirectory = await mkdtemp(path.join(__dirname, '..', '.local', 'test-uploads-'));
    ({ client, database } = await connectDatabase({
        mongoUri: process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017',
        databaseName: `sakura_test_${randomUUID().replaceAll('-', '')}`, uploadsDirectory,
    }));
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

const validPlate = {
    name: 'Plato de prueba', type: 'sushi', description: 'Descripción válida para comprobar el guardado.',
    price: '15.25', preparation_time: '12', allergens: 'fish',
};
const validIngredient = { name: 'Arroz de prueba', description: 'Arroz preparado para acompañar el plato.' };

async function submit(route, values, image = false) {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) {
        for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
    }
    if (image) {
        const bytes = image === true ? await readFile(path.join(__dirname, '..', 'data/images/plates/salmon-nigiri.png')) : image;
        form.append('image', new Blob([bytes], { type: 'image/png' }), 'image.png');
    }
    const response = await fetch(baseUrl + route, { method: 'POST', body: form });
    return { status: response.status, html: decodeAttributes(await response.text()) };
}

function decodeAttributes(html) {
    return html.replaceAll('&#x2F;', '/').replaceAll('&#x3D;', '=');
}

function assertConfirmation(result, title, destination) {
    assert.equal(result.status, 200);
    assert.match(result.html, new RegExp(title));
    assert.ok(result.html.includes(`href="${destination}"`), destination);
    assert.match(result.html, /class="site-footer"/);
}

test('creates, prefills, edits and deletes a plate with persistent images and confirmations', async () => {
    const created = await submit('/plates', validPlate, true);
    const plate = await database.collection('plates').findOne({ name: validPlate.name });
    assert.ok(plate);
    assertConfirmation(created, 'Plato creado', `/plates/${plate._id}`);
    assert.equal(plate.price, 15.25);
    assert.deepEqual(plate.allergens, ['fish']);
    assert.equal((await fetch(baseUrl + plate.image)).status, 200);
    const editPage = await (await fetch(`${baseUrl}/plates/${plate._id}/edit`)).text();
    assert.match(editPage, /value="Plato de prueba"/);
    assert.match(editPage, /value="sushi" selected/);
    assert.match(editPage, /value="fish" checked/);
    assert.match(editPage, /value="15.25"/);
    assert.match(editPage, /value="12"/);
    assert.match(editPage, /Descripción válida/);
    assert.match(editPage, /Imagen actual/);
    const updated = await submit(`/plates/${plate._id}/edit`, { ...validPlate, name: 'Plato actualizado', price: '18.50' });
    assertConfirmation(updated, 'Plato actualizado', `/plates/${plate._id}`);
    let stored = await database.collection('plates').findOne({ _id: plate._id });
    assert.equal(stored.image, plate.image);
    assert.equal(stored.price, 18.5);
    const replacement = await submit(`/plates/${plate._id}/edit`, { ...validPlate, name: 'Plato actualizado' }, true);
    assertConfirmation(replacement, 'Plato actualizado', `/plates/${plate._id}`);
    stored = await database.collection('plates').findOne({ _id: plate._id });
    assert.notEqual(stored.image, plate.image);
    assert.equal((await fetch(baseUrl + plate.image)).status, 404);
    assert.equal((await fetch(baseUrl + stored.image)).status, 200);
    const detail = await (await fetch(`${baseUrl}/plates/${plate._id}`)).text();
    assert.match(detail, /Plato actualizado/);
    assert.match(detail, /Descripción válida/);
    assert.ok(decodeAttributes(detail).includes(stored.image));
    assertConfirmation(await submit(`/plates/${plate._id}/delete`, {}), 'Plato eliminado', '/');
    assert.equal(await database.collection('plates').findOne({ _id: plate._id }), null);
    assert.equal((await fetch(baseUrl + stored.image)).status, 404);
});

test('validates every plate field on the server without relying on HTML', async () => {
    const invalidCases = [
        [{ name: '' }, /nombre es obligatorio/], [{ name: 'minúscula' }, /mayúscula/],
        [{ name: 'A'.repeat(101) }, /100 caracteres/], [{ name: 'Tempura Uramaki' }, /Ya existe/],
        [{ name: 'tempura uramaki' }, /Ya existe/], [{ description: 'Corta' }, /entre 10 y 1000/],
        [{ description: 'A'.repeat(1001) }, /entre 10 y 1000/], [{ description: '   ' }, /entre 10 y 1000/],
        [{ type: '' }, /tipo de plato válido/], [{ type: 'invalid' }, /tipo de plato válido/],
        [{ price: '' }, /precio debe/], [{ price: '-1' }, /precio debe/], [{ price: '1001' }, /precio debe/],
        [{ price: '1.001' }, /precio debe/], [{ price: 'NaN' }, /precio debe/], [{ price: 'Infinity' }, /precio debe/],
        [{ preparation_time: '' }, /tiempo de preparación/], [{ preparation_time: '-1' }, /tiempo de preparación/],
        [{ preparation_time: '1.5' }, /tiempo de preparación/], [{ preparation_time: '1441' }, /tiempo de preparación/],
        [{ allergens: 'unknown' }, /alérgenos no es válida/], [{ name: ['Uno', 'Dos'] }, /nombre es obligatorio/],
    ];
    const count = await database.collection('plates').countDocuments();
    for (const [changes, expected] of invalidCases) {
        const result = await submit('/plates', { ...validPlate, ...changes }, true);
        assert.equal(result.status, 400, JSON.stringify(changes));
        assert.match(result.html, expected);
        assert.match(result.html, /href="\/plates\/new"/);
        assert.match(result.html, /class="site-footer"/);
    }
    const missingImage = await submit('/plates', validPlate);
    assert.equal(missingImage.status, 400);
    assert.match(missingImage.html, /Selecciona una imagen/);
    assert.equal(await database.collection('plates').countDocuments(), count);
    const invalidEdit = await submit('/plates/tempura-uramaki/edit', { ...validPlate, name: 'Sopa de Wan-Tun' });
    assert.equal(invalidEdit.status, 400);
    assert.match(invalidEdit.html, /href="\/plates\/tempura-uramaki\/edit"/);
    assert.equal((await database.collection('plates').findOne({ _id: 'tempura-uramaki' })).name, 'Tempura Uramaki');
});

test('rejects invalid images and upload limits without persisting files or records', async () => {
    const { readdir } = require('node:fs/promises');
    const beforeFiles = await readdir(path.join(uploadsDirectory, 'plates'));
    const fake = await submit('/plates', validPlate, Buffer.from('<script>fake image</script>'));
    assert.equal(fake.status, 400);
    assert.match(fake.html, /archivo JPEG/);
    const oversized = await submit('/plates', validPlate, Buffer.alloc(5 * 1024 * 1024 + 1));
    assert.equal(oversized.status, 400);
    assert.match(oversized.html, /5 MB/);
    assert.deepEqual(await readdir(path.join(uploadsDirectory, 'plates')), beforeFiles);
    assert.equal(await database.collection('plates').findOne({ name: validPlate.name }), null);
});

test('creates, validates, edits and deletes ingredients scoped to their plate', async () => {
    const parent = '/plates/tempura-uramaki';
    const created = await submit(`${parent}/ingredients`, validIngredient, true);
    const ingredient = await database.collection('ingredients').findOne({ name: validIngredient.name, plateId: 'tempura-uramaki' });
    assert.ok(ingredient);
    assertConfirmation(created, 'Ingrediente creado', parent);
    const route = `${parent}/ingredients/${ingredient._id}`;
    const editHtml = await (await fetch(baseUrl + route + '/edit')).text();
    assert.match(editHtml, /value="Arroz de prueba"/);
    assert.match(editHtml, /Arroz preparado/);
    assert.ok(decodeAttributes(editHtml).includes(ingredient.image));
    assertConfirmation(await submit(route + '/edit', { ...validIngredient, description: 'Nueva descripción del arroz.' }), 'Ingrediente actualizado', parent);
    assert.equal((await database.collection('ingredients').findOne({ _id: ingredient._id })).image, ingredient.image);
    const duplicate = await submit(`${parent}/ingredients`, { ...validIngredient, name: 'ARROZ DE PRUEBA' }, true);
    assert.equal(duplicate.status, 400);
    assert.match(duplicate.html, /Ya existe un ingrediente/);
    for (const changes of [{ name: '' }, { name: 'a'.repeat(101) }, { description: '' }, { description: 'Corto' }, { description: 'a'.repeat(1001) }]) {
        const invalid = await submit(route + '/edit', { ...validIngredient, ...changes });
        assert.equal(invalid.status, 400);
        assert.ok(invalid.html.includes(`href="${route}/edit"`));
    }
    assert.equal((await submit(`${parent}/ingredients`, { ...validIngredient, name: 'Imagen falsa' }, Buffer.from('fake'))).status, 400);
    const wrongParent = `/plates/salmon-nigiri/ingredients/${ingredient._id}`;
    assert.equal((await fetch(baseUrl + wrongParent + '/edit')).status, 404);
    assert.equal((await submit(wrongParent + '/edit', validIngredient)).status, 404);
    assert.equal((await submit(wrongParent + '/delete', {})).status, 404);
    assertConfirmation(await submit(route + '/edit', validIngredient, true), 'Ingrediente actualizado', parent);
    const stored = await database.collection('ingredients').findOne({ _id: ingredient._id });
    assert.notEqual(stored.image, ingredient.image);
    assert.equal((await fetch(baseUrl + ingredient.image)).status, 404);
    assert.equal((await fetch(baseUrl + stored.image)).status, 200);
    const duplicateEdit = await submit(route + '/edit', { ...validIngredient, name: 'Gambas en tempura' });
    assert.equal(duplicateEdit.status, 400);
    assert.match(duplicateEdit.html, /Ya existe/);
    assertConfirmation(await submit(route + '/delete', {}), 'Ingrediente eliminado', parent);
    assert.equal(await database.collection('ingredients').findOne({ _id: ingredient._id }), null);
    assert.equal((await fetch(baseUrl + stored.image)).status, 404);
});

test('creates and edits ingredients without an image and allows adding one later', async () => {
    const parent = '/plates/tempura-uramaki';
    const values = { ...validIngredient, name: 'Ingrediente sin imagen' };
    assertConfirmation(await submit(`${parent}/ingredients`, values), 'Ingrediente creado', parent);
    const ingredient = await database.collection('ingredients').findOne({ name: values.name, plateId: 'tempura-uramaki' });
    assert.ok(ingredient);
    assert.equal(ingredient.image, '');
    const route = `${parent}/ingredients/${ingredient._id}`;
    const detail = await (await fetch(baseUrl + parent)).text();
    assert.match(detail, /Ingrediente sin imagen/);
    assert.doesNotMatch(detail, /<img[^>]*src=""/);
    assert.match(detail, /class="ingredient-image default-image" src="\/images\/platodef.jpg"/);
    const defaultImage = await fetch(baseUrl + '/images/platodef.jpg');
    assert.equal(defaultImage.status, 200);
    assert.deepEqual(Buffer.from(await defaultImage.arrayBuffer()), await readFile(path.join(__dirname, '..', 'public/images/platodef.jpg')));
    for (const page of [detail, await (await fetch(baseUrl + route + '/edit')).text()]) {
        const input = page.match(/<input[^>]*id="ingredient-image"[^>]*>/)?.[0];
        assert.ok(input);
        assert.doesNotMatch(input, /\brequired\b/);
    }
    assertConfirmation(await submit(route + '/edit', { ...values, description: 'Descripción actualizada sin necesidad de imagen.' }), 'Ingrediente actualizado', parent);
    assert.equal((await database.collection('ingredients').findOne({ _id: ingredient._id })).image, '');
    assertConfirmation(await submit(route + '/edit', values, true), 'Ingrediente actualizado', parent);
    const withImage = await database.collection('ingredients').findOne({ _id: ingredient._id });
    assert.ok(withImage.image);
    assert.equal((await fetch(baseUrl + withImage.image)).status, 200);
    assertConfirmation(await submit(route + '/edit', values), 'Ingrediente actualizado', parent);
    assert.equal((await database.collection('ingredients').findOne({ _id: ingredient._id })).image, withImage.image);
    assertConfirmation(await submit(route + '/delete', {}), 'Ingrediente eliminado', parent);
});

test('removes dependent ingredients and their uploads when deleting a plate', async () => {
    await submit('/plates', { ...validPlate, name: 'Plato con ingredientes' }, true);
    const plate = await database.collection('plates').findOne({ name: 'Plato con ingredientes' });
    await submit(`/plates/${plate._id}/ingredients`, validIngredient, true);
    const ingredient = await database.collection('ingredients').findOne({ plateId: plate._id });
    assert.ok(ingredient);
    assertConfirmation(await submit(`/plates/${plate._id}/delete`, {}), 'Plato eliminado', '/');
    assert.equal(await database.collection('ingredients').countDocuments({ plateId: plate._id }), 0);
    assert.equal((await fetch(baseUrl + ingredient.image)).status, 404);
    assert.equal((await fetch(`${baseUrl}/plates/${plate._id}`)).status, 404);
    assert.equal((await submit(`/plates/${plate._id}/ingredients`, validIngredient, true)).status, 404);
});

test('enforces uniqueness for simultaneous submissions and permits numeric boundary values', async () => {
    const values = { ...validPlate, name: 'Plato simultáneo', price: '0', preparation_time: '0' };
    const results = await Promise.all([submit('/plates', values, true), submit('/plates', values, true)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
    assert.equal(await database.collection('plates').countDocuments({ name: values.name }), 1);
    const plate = await database.collection('plates').findOne({ name: values.name });
    assertConfirmation(await submit(`/plates/${plate._id}/edit`, { ...values, price: '1000', preparation_time: '1440' }), 'Plato actualizado', `/plates/${plate._id}`);
    await submit(`/plates/${plate._id}/delete`, {});
});

test('returns styled 404 pages for missing edit and delete targets', async () => {
    assert.equal((await fetch(baseUrl + '/plates/missing/edit')).status, 404);
    assert.equal((await submit('/plates/missing/edit', validPlate, true)).status, 404);
    assert.equal((await submit('/plates/missing/delete', {})).status, 404);
    assert.equal((await submit('/plates/tempura-uramaki/ingredients/missing/delete', {})).status, 404);
});
