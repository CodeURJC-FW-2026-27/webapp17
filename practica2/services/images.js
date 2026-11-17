const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { mkdir, writeFile, unlink } = require('node:fs/promises');
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 25, fieldSize: 10000 },
}).single('image');

function imageExtension(file) {
    const buffer = file?.buffer;
    if (!buffer) return null;
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
    if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return '.jpg';
    if (['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) return '.gif';
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return '.webp';
    return null;
}

async function saveImage(file, uploadsDirectory, collection) {
    const filename = `${randomUUID()}${imageExtension(file)}`;
    await mkdir(path.join(uploadsDirectory, collection), { recursive: true });
    await writeFile(path.join(uploadsDirectory, collection, filename), file.buffer, { flag: 'wx' });
    return `/uploads/${collection}/${filename}`;
}

async function removeImage(image, uploadsDirectory) {
    // Only remove generated uploads; example files are restored at startup.
    if (!/^\/uploads\/(plates|ingredients)\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/.test(image || '')) return;
    try {
        await unlink(path.join(uploadsDirectory, image.slice('/uploads/'.length)));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

module.exports = { upload, imageExtension, saveImage, removeImage };
