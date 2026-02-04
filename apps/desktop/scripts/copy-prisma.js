const fs = require('fs');
const path = require('path');

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
if (!fs.existsSync(prismaSrc)) {
    try {
        const clientPath = require.resolve('@prisma/client', { paths: [coreBasePath] });
        // clientPath is usually .../.prisma/client/index.js or .../@prisma/client/index.js
        // If it's @prisma/client, we need to look for .prisma sibling or in .pnpm
        console.log('[Build] Resolved @prisma/client to:', clientPath);

        // Pnpm Structure: node_modules/.pnpm/@prisma+client@x.x.x/node_modules/@prisma/client
        // We need the generated client which is usually in .prisma/client

        // Let's look for .prisma in the root node_modules if hoisting happened
        const rootPrisma = path.resolve(__dirname, '../../../node_modules/.prisma');
        if (fs.existsSync(rootPrisma)) {
            prismaSrc = rootPrisma;
        }
    } catch (e) {
        console.warn('[Build] Could not resolve @prisma/client from core');
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
