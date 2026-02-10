import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootBasePath = path.resolve(__dirname, '../../..');
const pnpmDir = path.join(rootBasePath, 'node_modules', '.pnpm');

console.log('Checking pnpm dir:', pnpmDir);

if (fs.existsSync(pnpmDir)) {
    const entries = fs.readdirSync(pnpmDir, { withFileTypes: true });
    console.log(`Found ${entries.length} entries.`);
    for (const entry of entries) {
        if (entry.name.includes('prisma')) {
            console.log(' - ' + entry.name);
            if (entry.isDirectory()) {
                const subNode = path.join(pnpmDir, entry.name, 'node_modules');
                if (fs.existsSync(subNode)) {
                    const subEntries = fs.readdirSync(subNode);
                    console.log('   Contents of node_modules:', subEntries.join(', '));
                }
            }
        }
    }
} else {
    console.log('pnpm dir does not exist');
}
