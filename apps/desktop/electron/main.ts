import { app, BrowserWindow, ipcMain } from 'electron'
import { initDb, db } from '@novel-editor/core'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { execSync } from 'child_process'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// Global error handling - ensure process exits on uncaught errors
process.on('uncaughtException', (error) => {
    console.error('[Main] Uncaught Exception:', error);
    app.quit();
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason);
    app.quit();
    process.exit(1);
});

let win: BrowserWindow | null

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
        },
        // Win11 style & White Screen Fix
        frame: true,
        titleBarStyle: 'default',
        backgroundColor: '#0a0a0f', // Match App Theme
        show: false, // Wait for ready-to-show
        autoHideMenuBar: true // Hide default menu bar
    })

    win.once('ready-to-show', () => {
        win?.show()
    })

    // Test active push message to Renderer-process.
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    // Register DevTools toggle shortcuts (F12 or Ctrl+Shift+I)
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
            if (win?.webContents.isDevToolsOpened()) {
                win.webContents.closeDevTools()
            } else {
                win?.webContents.openDevTools()
            }
            event.preventDefault()
        }
    })

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
        // Open DevTools in development mode
        win.webContents.openDevTools()
    } else {
        // win.loadFile('dist/index.html')
        win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }
}

// --- IPC Handlers ---
ipcMain.handle('db:get-novels', async () => {
    console.log('[Main] Received db:get-novels');
    try {
        const novels = await db.novel.findMany({
            include: {
                volumes: {
                    select: {
                        chapters: { select: { wordCount: true } }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        // Calculate real word count from chapters dynamically
        return novels.map(n => {
            const totalWords = n.volumes.reduce((acc, v) =>
                acc + v.chapters.reduce((cAcc, c) => cAcc + c.wordCount, 0), 0
            );
            // Remove volumes from result to keep payload clean, but return correct wordCount
            const { volumes, ...rest } = n;
            return {
                ...rest,
                wordCount: totalWords
            };
        });
    } catch (e) {
        console.error('[Main] db:get-novels failed:', e);
        throw e;
    }
})

ipcMain.handle('db:update-novel', async (_, { id, data }: { id: string, data: { title?: string, coverUrl?: string, formatting?: string } }) => {
    console.log('[Main] Updating novel:', id, data);
    try {
        return await db.novel.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date()
            }
        });
    } catch (e) {
        console.error('[Main] db:update-novel failed:', e);
        throw e;
    }
})

// ... (existing update-novel handler) ...

ipcMain.handle('db:get-volumes', async (_, novelId: string) => {
    try {
        return await db.volume.findMany({
            where: { novelId },
            include: {
                chapters: { orderBy: { order: 'asc' } }
            },
            orderBy: { order: 'asc' }
        });
    } catch (e) {
        console.error('[Main] db:get-volumes failed:', e);
        throw e;
    }
})

ipcMain.handle('db:create-volume', async (_, { novelId, title }: { novelId: string, title: string }) => {
    try {
        const lastVol = await db.volume.findFirst({
            where: { novelId },
            orderBy: { order: 'desc' }
        });
        const order = (lastVol?.order || 0) + 1;
        return await db.volume.create({
            data: { novelId, title, order }
        });
    } catch (e) {
        console.error('[Main] db:create-volume failed:', e);
        throw e;
    }
})

ipcMain.handle('db:create-chapter', async (_, { volumeId, title, order }: { volumeId: string, title: string, order: number }) => {
    try {
        return await db.chapter.create({
            data: {
                volumeId,
                title,
                order,
                content: '',
                wordCount: 0
            }
        });
    } catch (e) {
        console.error('[Main] db:create-chapter failed:', e);
        throw e;
    }
})

ipcMain.handle('db:get-chapter', async (_, chapterId: string) => {
    try {
        return await db.chapter.findUnique({ where: { id: chapterId } });
    } catch (e) {
        console.error('[Main] db:get-chapter failed:', e);
        throw e;
    }
})

ipcMain.handle('db:rename-volume', async (_, { volumeId, title }: { volumeId: string, title: string }) => {
    try {
        return await db.volume.update({
            where: { id: volumeId },
            data: { title }
        });
    } catch (e) {
        console.error('[Main] db:rename-volume failed:', e);
        throw e;
    }
})

ipcMain.handle('db:rename-chapter', async (_, { chapterId, title }: { chapterId: string, title: string }) => {
    try {
        return await db.chapter.update({
            where: { id: chapterId },
            data: { title }
        });
    } catch (e) {
        console.error('[Main] db:rename-chapter failed:', e);
        throw e;
    }
})


ipcMain.handle('db:create-novel', async (_, title: string) => {
    console.log('[Main] Received db:create-novel:', title);
    try {
        const novel = await db.novel.create({
            data: {
                title,
                wordCount: 0,
                volumes: {
                    create: {
                        title: '', // Default empty
                        order: 1,
                        chapters: {
                            create: {
                                title: '', // Default empty
                                content: '',
                                order: 1,
                                wordCount: 0
                            }
                        }
                    }
                }
            }
        });
        return novel;
    } catch (e) {
        console.error('[Main] db:create-novel failed:', e);
        throw e;
    }
})


// ...

ipcMain.handle('db:save-chapter', async (_, { chapterId, content }: { chapterId: string, content: string }) => {
    try {
        console.log('[Main] Saving chapter:', chapterId);
        const chapter = await db.chapter.findUnique({
            where: { id: chapterId },
            select: {
                wordCount: true,
                volume: { select: { novelId: true } }
            }
        });
        if (!chapter || !chapter.volume) throw new Error('Chapter or Volume not found');

        const novelId = chapter.volume.novelId;
        const newWordCount = content.length;
        const delta = newWordCount - chapter.wordCount;

        // Transaction to ensure consistency
        const [, updatedChapter] = await db.$transaction([
            // 1. Update Novel WordCount
            db.novel.update({
                where: { id: novelId },
                data: {
                    wordCount: { increment: delta },
                    updatedAt: new Date()
                }
            }),
            // 2. Update Chapter
            db.chapter.update({
                where: { id: chapterId },
                data: {
                    content,
                    wordCount: newWordCount,
                    updatedAt: new Date()
                }
            })
        ]);

        return updatedChapter;
    } catch (e) {
        console.error('[Main] db:save-chapter failed:', e);
        throw e;
    }
});

// --- Idea IPC ---
ipcMain.handle('db:create-idea', async (_, data: any) => {
    try {
        const { timestamp, tags, ...prismaData } = data;
        const novelId = prismaData.novelId;

        const result = await db.idea.create({
            data: {
                ...prismaData,
                tags: {
                    connectOrCreate: (tags || []).map((tag: string) => ({
                        where: { name_novelId: { name: tag, novelId } },
                        create: { name: tag, novelId }
                    }))
                }
            },
            include: { tags: true }
        }) as any;

        // Map back for frontend
        return {
            ...result,
            tags: result.tags.map((t: any) => t.name),
            timestamp: result.createdAt.getTime()
        };
    } catch (e) {
        console.error('[Main] db:create-idea failed:', e);
        throw e;
    }
});

ipcMain.handle('db:get-ideas', async (_, novelId: string) => {
    try {
        const ideas = await db.idea.findMany({
            where: { novelId },
            include: { tags: true },
            orderBy: [
                { isStarred: 'desc' },
                { updatedAt: 'desc' }
            ]
        }) as any[];

        return ideas.map((idea: any) => ({
            ...idea,
            tags: idea.tags.map((t: any) => t.name),
            timestamp: idea.createdAt.getTime()
        }));
    } catch (e) {
        console.error('[Main] db:get-ideas failed:', e);
        throw e;
    }
});

ipcMain.handle('db:update-idea', async (_, id: string, data: any) => {
    try {
        const { timestamp, tags, ...updateData } = data;

        // Handle tags update if present
        const finalData = { ...updateData };
        if (tags !== undefined) {
            // We need to know the novelId to scope the tags.
            // Ideally we pass it from frontend, but let's fetch it to be safe.
            const currentIdea = await db.idea.findUnique({ where: { id }, select: { novelId: true } });
            if (currentIdea) {
                const novelId = currentIdea.novelId;
                finalData.tags = {
                    set: [], // Disconnect all existing
                    connectOrCreate: (tags || []).map((tag: string) => ({
                        where: { name_novelId: { name: tag, novelId } },
                        create: { name: tag, novelId }
                    }))
                };
            }
        }

        const result = await db.idea.update({
            where: { id },
            data: {
                ...finalData,
                updatedAt: new Date()
            },
            include: { tags: true }
        }) as any;

        return {
            ...result,
            tags: result.tags.map((t: any) => t.name),
            timestamp: result.createdAt.getTime()
        };
    } catch (e) {
        console.error('[Main] db:update-idea failed:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-idea', async (_, id: string) => {
    try {
        return await db.idea.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:delete-idea failed:', e);
        throw e;
    }
});


// --- Sync IPC ---
import { SyncManager } from './sync/SyncManager';
const syncManager = new SyncManager();

ipcMain.handle('sync:pull', async () => {
    try {
        return await syncManager.pull();
    } catch (e) {
        console.error('[Main] sync:pull failed:', e);
        throw e;
    }
});

ipcMain.handle('sync:push', async () => {
    try {
        return await syncManager.push();
    } catch (e) {
        console.error('[Main] sync:push failed:', e);
        throw e;
    }
});

ipcMain.handle('db:get-all-tags', async (_, novelId?: string) => {
    try {
        if (!novelId) return [];
        // @ts-ignore
        const tags = await db.tag.findMany({
            where: { novelId },
            orderBy: { name: 'asc' },
            select: { name: true }
        });
        return tags.map((t: any) => t.name);
    } catch (e) {
        console.error('[Main] db:get-all-tags failed:', e);
        throw e;
    }
});

// --- App Lifecycle ---

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
        win = null
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(async () => {
    console.log('[Main] App Ready. Starting DB Setup...');

    // 1. Setup Data Paths
    // In production: use exe directory (portable mode)
    // In development: use userData (AppData)
    let dataPath: string;

    if (app.isPackaged) {
        // Production: database alongside the executable
        const exePath = path.dirname(app.getPath('exe'));
        dataPath = path.join(exePath, 'data');
    } else {
        // Development: use userData for isolation
        dataPath = app.getPath('userData');
    }

    const dbPath = path.join(dataPath, 'novel_editor.db');
    const dbUrl = `file:${dbPath}`;

    console.log('[Main] Database Path:', dbPath);

    if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true });
    }

    // 2. Initialize Core Database (Moved after migration)

    // 3. Auto-migrate in Dev (Synchronous)
    if (!app.isPackaged) {
        const schemaPath = path.resolve(__dirname, '../../../packages/core/prisma/schema.prisma');
        console.log('[Main] Development mode detected (unpackaged). Checking schema at:', schemaPath);

        if (fs.existsSync(schemaPath)) {
            console.log('[Main] Schema found. Attempting synchronous DB push to:', dbPath);
            try {
                const prismaPath = path.resolve(__dirname, '../../../packages/core/node_modules/.bin/prisma.cmd');
                // Ensure db folder exists
                const dbFolder = path.dirname(dbPath);
                if (!fs.existsSync(dbFolder)) {
                    fs.mkdirSync(dbFolder, { recursive: true });
                }

                // Add --skip-generate to speed it up, assuming we generated client separately or don't need it specifically for main process right now (renderer uses pre-generated)
                // Actually we might need generate if main process imports types. But usually db push generates.
                const command = `"${prismaPath}" db push --schema="${schemaPath}" --accept-data-loss`;

                console.log('[Main] Executing migration command...');
                execSync(command, {
                    env: { ...process.env, DATABASE_URL: dbUrl },
                    cwd: path.resolve(__dirname, '../../../packages/core'),
                    stdio: 'inherit', // Show output in console!
                    windowsHide: true
                });
                console.log('[Main] DB Push completed successfully.');
            } catch (error) {
                console.error('[Main] DB Push failed. Details:', error);
            }
        } else {
            console.warn('[Main] Schema file NOT found at:', schemaPath);
        }
    }

    // 4. Initialize Core Database
    initDb(dbUrl);

    // 5. Create Window
    createWindow();
})
