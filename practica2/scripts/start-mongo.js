const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

function findMongoExecutable() {
    if (process.env.MONGOD_PATH) return process.env.MONGOD_PATH;
    if (process.platform === 'win32') {
        const serverDirectory = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'MongoDB', 'Server');
        if (fs.existsSync(serverDirectory)) {
            const versions = fs.readdirSync(serverDirectory).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
            for (const version of versions) {
                const executable = path.join(serverDirectory, version, 'bin', 'mongod.exe');
                if (fs.existsSync(executable)) return executable;
            }
        }
    }
    return 'mongod';
}

const databaseDirectory = path.join(__dirname, '..', '.local', 'mongodb');
fs.mkdirSync(databaseDirectory, { recursive: true });
const child = spawn(findMongoExecutable(), [
    '--dbpath', databaseDirectory,
    '--bind_ip', '127.0.0.1',
    '--port', '27017',
], { stdio: 'inherit', windowsHide: true });
child.on('error', error => {
    console.error(`MongoDB could not start: ${error.message}`);
    console.error('Install MongoDB Community Server or set MONGOD_PATH to the mongod executable.');
    process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });
process.once('SIGINT', () => child.kill('SIGINT'));
process.once('SIGTERM', () => child.kill('SIGTERM'));
