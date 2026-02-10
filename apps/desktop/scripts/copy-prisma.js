import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Source: packages/core/node_modules/.prisma
// Destination: apps/desktop/node_modules/.prisma

// In a pnpm monorepo, the location might vary, but since we run db:generate in packages/core,
// it should be resolvable from there or we need to find where Require resolves it.

const coreBasePath = path.resolve(__dirname, '../../../packages/core');
const desktopNodeModules = path.resolve(__dirname, '../node_modules');

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return false;

    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
    return true;
}

console.log('[Build] Checking for Prisma Client...');

// Try to find .prisma in core's node_modules
let prismaSrc = path.join(coreBasePath, 'node_modules', '.prisma');

// If not found in core, try to find it by resolving '@prisma/client' from core
// If not found in core, try to find it elsewhere
if (!fs.existsSync(prismaSrc)) {
    console.log('[Build] .prisma not found in core node_modules. Searching elsewhere...');

    // 1. Check Root node_modules (Most likely for pnpm workspace)
    const rootPrisma = path.resolve(__dirname, '../../../node_modules/.prisma');
    console.log(`[Build] Checking root: ${rootPrisma}`);
    if (fs.existsSync(rootPrisma)) {
        prismaSrc = rootPrisma;
        console.log('[Build] Found .prisma in root.');
    } else {
        // 2. Check .pnpm in core
        console.log('[Build] Searching in packages/core/.pnpm directory...');
        try {
            findInPnpm(path.join(coreBasePath, 'node_modules', '.pnpm'));
        } catch (e) {
            console.warn('[Build] Error searching core pnpm:', e);
        }

        // 3. Check .pnpm in root
        if (!fs.existsSync(prismaSrc)) {
            console.log('[Build] Searching in root .pnpm directory...');
            try {
                findInPnpm(path.join(__dirname, '../../../node_modules/.pnpm'));
            } catch (e) {
                console.warn('[Build] Error searching root pnpm:', e);
            }
        }

        function findInPnpm(pnpmDir) {
            if (fs.existsSync(pnpmDir)) {
                const entries = fs.readdirSync(pnpmDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && entry.name.includes('@prisma+client')) {
                        const candidate = path.join(pnpmDir, entry.name, 'node_modules', '.prisma');
                        if (fs.existsSync(candidate)) {
                            prismaSrc = candidate;
                            console.log('[Build] Found .prisma in pnpm:', prismaSrc);
                            break;
                        }
                    }
                }
            }
        }
    }
}

const prismaDest = path.join(desktopNodeModules, '.prisma');

if (fs.existsSync(prismaSrc)) {
    console.log(`[Build] Copying .prisma from ${prismaSrc} to ${prismaDest}`);
    copyDir(prismaSrc, prismaDest);
    console.log('[Build] Copy complete.');
} else {
    console.error('[Build] Error: Could not find .prisma directory. Make sure to run "pnpm db:generate" in packages/core first.');
    // Don't fail the build here, electron-builder might fail later if files are missing, 
    // but we warned the user.
}
