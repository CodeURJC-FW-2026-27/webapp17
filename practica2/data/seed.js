const path = require('node:path');
const { mkdir, copyFile } = require('node:fs/promises');
const { constants } = require('node:fs');
const seed = require('./seed.json');

async function restoreExampleImages(uploadsDirectory) {
    for (const item of [...seed.plates, ...seed.ingredients]) {
        const relativePath = item.image.slice('/uploads/'.length);
        const destination = path.join(uploadsDirectory, relativePath);
        await mkdir(path.dirname(destination), { recursive: true });
        try {
            await copyFile(path.join(__dirname, 'images', relativePath), destination, constants.COPYFILE_EXCL);
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
    }
}

async function seedDatabase(database, uploadsDirectory) {
    await restoreExampleImages(uploadsDirectory);
    const plates = database.collection('plates');
    const ingredients = database.collection('ingredients');
    if (await plates.countDocuments({}) === 0 && await ingredients.countDocuments({}) === 0) {
        await plates.insertMany(seed.plates.map(plate => ({ ...plate })));
        await ingredients.insertMany(seed.ingredients.map(ingredient => ({ ...ingredient })));
    }
}

module.exports = { seedDatabase };
