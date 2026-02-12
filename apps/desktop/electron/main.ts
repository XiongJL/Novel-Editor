import { app, BrowserWindow, ipcMain, dialog, nativeImage, protocol, net } from 'electron'
import { initDb, db } from '@novel-editor/core'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { execSync } from 'child_process'
import fs from 'fs'
import * as searchIndex from './search/searchIndex'

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
        if (input.key === 'F11') {
            win?.setFullScreen(!win.isFullScreen());
            event.preventDefault();
        }
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
        // win.webContents.openDevTools()
    } else {
        // win.loadFile('dist/index.html')
        win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }

    // Monitor for fullscreen changes to sync renderer state
    win.on('enter-full-screen', () => {
        win?.webContents.send('app:fullscreen-change', true);
    });
    win.on('leave-full-screen', () => {
        win?.webContents.send('app:fullscreen-change', false);
    });
}

// --- IPC Handlers ---
ipcMain.handle('app:toggle-fullscreen', () => {
    if (win) {
        const isFullScreen = win.isFullScreen();
        win.setFullScreen(!isFullScreen);
        return !isFullScreen;
    }
    return false;
});

ipcMain.handle('app:get-user-data-path', () => {
    return app.getPath('userData');
});

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

// Novel Cover Upload
ipcMain.handle('db:upload-novel-cover', async (_, novelId: string) => {
    try {
        const result = await dialog.showOpenDialog(win!, {
            title: 'Select Cover Image',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) return null;

        const srcPath = result.filePaths[0];
        const ext = path.extname(srcPath);
        const coversDir = path.join(app.getPath('userData'), 'covers');
        if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

        // Remove old cover if exists
        const novel = await db.novel.findUnique({ where: { id: novelId }, select: { coverUrl: true } });
        if (novel?.coverUrl?.startsWith('covers/')) {
            const oldPath = path.join(app.getPath('userData'), novel.coverUrl);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        const fileName = `${novelId}${ext}`;
        const destPath = path.join(coversDir, fileName);
        fs.copyFileSync(srcPath, destPath);

        const relativePath = `covers/${fileName}`;
        await db.novel.update({
            where: { id: novelId },
            data: { coverUrl: relativePath }
        });

        return { path: relativePath };
    } catch (e) {
        console.error('[Main] db:upload-novel-cover failed:', e);
        throw e;
    }
});

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
        const chapter = await db.chapter.create({
            data: {
                volumeId,
                title,
                order,
                content: '',
                wordCount: 0
            },
            include: { volume: { select: { novelId: true } } }
        });

        // Update search index
        await searchIndex.indexChapter({ ...chapter, novelId: chapter.volume.novelId });

        return chapter;
    } catch (e) {
        console.error('[Main] db:create-chapter failed:', e);
        throw e;
    }
})



ipcMain.handle('db:get-chapter', async (_, id: string) => {
    try {
        return await db.chapter.findUnique({
            where: { id },
            include: { volume: { select: { novelId: true } } }
        });
    } catch (e) {
        console.error('[Main] db:get-chapter failed:', e);
        throw e;
    }
});

ipcMain.handle('db:rename-volume', async (_, { volumeId, title }: { volumeId: string, title: string }) => {
    try {
        const updated = await db.volume.update({
            where: { id: volumeId },
            data: { title }
        });

        // Trigger index update for all chapters in this volume
        const chapters = await db.chapter.findMany({
            where: { volumeId },
            include: { volume: { select: { novelId: true, title: true, order: true } } }
        });

        for (const chapter of chapters) {
            await searchIndex.indexChapter({
                ...chapter,
                novelId: chapter.volume.novelId,
                volumeTitle: chapter.volume.title,
                volumeOrder: chapter.volume.order
            });
        }

        return updated;
    } catch (e) {
        console.error('[Main] db:rename-volume failed:', e);
        throw e;
    }
})

ipcMain.handle('db:rename-chapter', async (_, { chapterId, title }: { chapterId: string, title: string }) => {
    try {
        const updated = await db.chapter.update({
            where: { id: chapterId },
            data: { title }
        });

        // Update search index
        const chapterData = await db.chapter.findUnique({
            where: { id: chapterId },
            select: { id: true, title: true, content: true, volumeId: true, order: true, volume: { select: { novelId: true } } }
        });
        if (chapterData && chapterData.volume) {
            await searchIndex.indexChapter({ ...chapterData, novelId: chapterData.volume.novelId });
        }

        return updated;
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

        // 3. Update Search Index
        const chapterData = await db.chapter.findUnique({
            where: { id: chapterId },
            select: { id: true, title: true, content: true, volumeId: true, order: true }
        });
        if (chapterData) {
            await searchIndex.indexChapter({ ...chapterData, novelId });
        }

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
        const mappedResult = {
            ...result,
            tags: result.tags.map((t: any) => t.name),
            timestamp: result.createdAt.getTime()
        };

        // Update search index
        await searchIndex.indexIdea({
            id: result.id,
            content: result.content,
            quote: result.quote,
            novelId: result.novelId,
            chapterId: result.chapterId
        });

        return mappedResult;
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

        const mappedResult = {
            ...result,
            tags: result.tags.map((t: any) => t.name),
            timestamp: result.createdAt.getTime()
        };

        // Update search index
        await searchIndex.indexIdea({
            id: result.id,
            content: result.content,
            quote: result.quote,
            novelId: result.novelId,
            chapterId: result.chapterId
        });

        return mappedResult;
    } catch (e) {
        console.error('[Main] db:update-idea failed:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-idea', async (_, id: string) => {
    try {
        const result = await db.idea.delete({ where: { id } });
        // Remove from search index
        await searchIndex.removeFromIndex('idea', id);
        return result;
    } catch (e) {
        console.error('[Main] db:delete-idea failed:', e);
        throw e;
    }
});


// Check index status
ipcMain.handle('db:check-index-status', async (_, novelId: string) => {
    try {
        const stats = await searchIndex.getIndexStats(novelId);

        // Get actual counts
        const chapterCount = await db.chapter.count({
            where: { volume: { novelId } }
        });
        const ideaCount = await db.idea.count({
            where: { novelId }
        });

        return {
            indexedChapters: stats.chapters,
            totalChapters: chapterCount,
            indexedIdeas: stats.ideas,
            totalIdeas: ideaCount
        };
    } catch (e) {
        console.error('[Main] db:check-index-status failed:', e);
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

// --- Backup IPC ---
import { backupService } from './services/BackupService';

ipcMain.handle('backup:export', async (_, password?: string) => {
    try {
        return await backupService.exportData(undefined, password);
    } catch (e) {
        console.error('[Main] backup:export failed:', e);
        throw e;
    }
});

ipcMain.handle('backup:import', async (_, { filePath, password }: { filePath?: string, password?: string }) => {
    try {
        if (!filePath) {
            const result = await dialog.showOpenDialog({
                title: 'Import Backup',
                filters: [{ name: 'Novel Editor Backup', extensions: ['nebak'] }],
                properties: ['openFile']
            });
            if (result.canceled || result.filePaths.length === 0) return { success: false, code: 'CANCELLED' };
            filePath = result.filePaths[0];
        }
        await backupService.importData(filePath, password);
        return { success: true };
    } catch (e: any) {
        console.error('[Main] backup:import failed:', e);
        // Extract error code if possible.
        // BackupService throws "PASSWORD_REQUIRED" or "PASSWORD_INVALID"
        const msg = e.message || e.toString();

        if (msg.includes('PASSWORD_REQUIRED')) {
            return { success: false, code: 'PASSWORD_REQUIRED', filePath };
        }
        if (msg.includes('PASSWORD_INVALID')) {
            return { success: false, code: 'PASSWORD_INVALID', filePath };
        }

        return { success: false, message: msg };
    }
});

ipcMain.handle('backup:get-auto', async () => {
    try {
        return await backupService.getAutoBackups();
    } catch (e) {
        console.error('[Main] backup:get-auto failed:', e);
        throw e;
    }
});

ipcMain.handle('backup:restore-auto', async (_, filename: string) => {
    try {
        await backupService.restoreAutoBackup(filename);
        return true;
    } catch (e) {
        console.error('[Main] backup:restore-auto failed:', e);
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

// --- Search IPC ---
ipcMain.handle('db:search', async (_, { novelId, keyword, limit = 20, offset = 0 }) => {
    try {
        return await searchIndex.search(novelId, keyword, limit, offset);
    } catch (e) {
        console.error('[Main] db:search failed:', e);
        throw e;
    }
});

ipcMain.handle('db:rebuild-search-index', async (_, novelId: string) => {
    try {
        return await searchIndex.rebuildIndex(novelId);
    } catch (e) {
        console.error('[Main] db:rebuild-search-index failed:', e);
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

// --- Story Structure System IPC ---

// PlotLine
ipcMain.handle('db:get-plot-lines', async (_, novelId: string) => {
    try {
        return await (db as any).plotLine.findMany({
            where: { novelId },
            include: {
                points: {
                    include: { anchors: true },
                    orderBy: { order: 'asc' }
                }
            },
            orderBy: { sortOrder: 'asc' }
        });
    } catch (e) {
        console.error('[Main] db:get-plot-lines failed:', e);
        throw e;
    }
});

ipcMain.handle('db:create-plot-line', async (_, data: { novelId: string; name: string; color: string }) => {
    try {
        const maxOrder = await (db as any).plotLine.aggregate({
            where: { novelId: data.novelId },
            _max: { sortOrder: true }
        });
        const order = (maxOrder._max.sortOrder || 0) + 1;

        return await (db as any).plotLine.create({
            data: { ...data, sortOrder: order }
        });
    } catch (e) {
        console.error('[Main] db:create-plot-line failed. Data:', data, 'Error:', e);
        throw e;
    }
});

ipcMain.handle('db:update-plot-line', async (_, data: { id: string; data: any }) => {
    try {
        return await (db as any).plotLine.update({
            where: { id: data.id },
            data: data.data
        });
    } catch (e) {
        console.error('[Main] db:update-plot-line failed. ID:', data.id, 'Error:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-plot-line', async (_, id: string) => {
    try {
        return await (db as any).plotLine.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:delete-plot-line failed. ID:', id, 'Error:', e);
        throw e;
    }
});

// PlotPoint
ipcMain.handle('db:create-plot-point', async (_, data: any) => {
    try {
        const { plotLineId } = data;
        const maxOrder = await (db as any).plotPoint.aggregate({
            where: { plotLineId },
            _max: { order: true }
        });
        const order = (maxOrder._max.order || 0) + 1;

        return await (db as any).plotPoint.create({
            data: { ...data, order }
        });
    } catch (e) {
        console.error('[Main] db:create-plot-point failed. Data:', data, 'Error:', e);
        throw e;
    }
});

ipcMain.handle('db:update-plot-point', async (_, data: { id: string; data: any }) => {
    try {
        return await (db as any).plotPoint.update({
            where: { id: data.id },
            data: data.data
        });
    } catch (e) {
        console.error('[Main] db:update-plot-point failed. ID:', data.id, 'Error:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-plot-point', async (_, id: string) => {
    try {
        return await (db as any).plotPoint.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:delete-plot-point failed. ID:', id, 'Error:', e);
        throw e;
    }
});

// PlotPointAnchor
ipcMain.handle('db:create-plot-point-anchor', async (_, data: any) => {
    try {
        return await (db as any).plotPointAnchor.create({ data });
    } catch (e) {
        console.error('[Main] db:create-plot-point-anchor failed. Data:', data, 'Error:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-plot-point-anchor', async (_, id: string) => {
    try {
        return await (db as any).plotPointAnchor.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:delete-plot-point-anchor failed. ID:', id, 'Error:', e);
        throw e;
    }
});

ipcMain.handle('db:reorder-plot-lines', async (_, { lineIds }: { lineIds: string[] }) => {
    try {
        const updates = lineIds.map((id, index) =>
            (db as any).plotLine.update({
                where: { id },
                data: { sortOrder: index }
            })
        );
        await (db as any).$transaction(updates);
        return { success: true };
    } catch (e) {
        console.error('[Main] db:reorder-plot-lines failed:', e);
        throw e;
    }
});

ipcMain.handle('db:reorder-plot-points', async (_, { plotLineId, pointIds }: { plotLineId: string; pointIds: string[] }) => {
    try {
        const updates = pointIds.map((id, index) =>
            (db as any).plotPoint.update({
                where: { id },
                data: { order: index, plotLineId }
            })
        );
        await (db as any).$transaction(updates);
        return { success: true };
    } catch (e) {
        console.error('[Main] db:reorder-plot-points failed:', e);
        throw e;
    }
});

// --- Character & Item System IPC ---

// --- Character Image Upload ---
ipcMain.handle('db:upload-character-image', async (_, { characterId, type }: { characterId: string; type: 'avatar' | 'fullBody' }) => {
    try {
        const result = await dialog.showOpenDialog(win!, {
            title: type === 'avatar' ? 'Select Avatar Image' : 'Select Full Body Image',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) return null;

        const srcPath = result.filePaths[0];
        const ext = path.extname(srcPath);
        const charDir = path.join(app.getPath('userData'), 'characters', characterId);
        if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });

        if (type === 'avatar') {
            const fileName = `avatar${ext}`;
            const destPath = path.join(charDir, fileName);
            // Remove old avatar files
            const existingFiles = fs.readdirSync(charDir).filter(f => f.startsWith('avatar.'));
            existingFiles.forEach(f => { try { fs.unlinkSync(path.join(charDir, f)); } catch { } });
            fs.copyFileSync(srcPath, destPath);

            const relativePath = `characters/${characterId}/${fileName}`;
            await (db as any).character.update({
                where: { id: characterId },
                data: { avatar: relativePath }
            });
            return { path: relativePath };
        } else {
            // Full body image - append to list
            const timestamp = Date.now();
            const fileName = `fullbody_${timestamp}${ext}`;
            const destPath = path.join(charDir, fileName);
            fs.copyFileSync(srcPath, destPath);

            const relativePath = `characters/${characterId}/${fileName}`;

            // Get current list
            const char = await (db as any).character.findUnique({ where: { id: characterId }, select: { fullBodyImages: true } });
            let images: string[] = [];
            try { images = JSON.parse(char?.fullBodyImages || '[]'); } catch { }
            images.push(relativePath);

            await (db as any).character.update({
                where: { id: characterId },
                data: { fullBodyImages: JSON.stringify(images) }
            });
            return { path: relativePath, images };
        }
    } catch (e) {
        console.error('[Main] db:upload-character-image failed:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-character-image', async (_, { characterId, imagePath, type }: { characterId: string; imagePath: string; type: 'avatar' | 'fullBody' }) => {
    try {
        const fullPath = path.join(app.getPath('userData'), imagePath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

        if (type === 'avatar') {
            await (db as any).character.update({
                where: { id: characterId },
                data: { avatar: null }
            });
        } else {
            const char = await (db as any).character.findUnique({ where: { id: characterId }, select: { fullBodyImages: true } });
            let images: string[] = [];
            try { images = JSON.parse(char?.fullBodyImages || '[]'); } catch { }
            images = images.filter(p => p !== imagePath);
            await (db as any).character.update({
                where: { id: characterId },
                data: { fullBodyImages: JSON.stringify(images) }
            });
        }
    } catch (e) {
        console.error('[Main] db:delete-character-image failed:', e);
        throw e;
    }
});

// Get maps where a character has markers
ipcMain.handle('db:get-character-map-locations', async (_, characterId: string) => {
    try {
        const markers = await (db as any).characterMapMarker.findMany({
            where: { characterId },
            include: {
                map: { select: { id: true, name: true, type: true } }
            }
        });
        return markers.map((m: any) => ({
            mapId: m.map.id,
            mapName: m.map.name,
            mapType: m.map.type
        }));
    } catch (e) {
        console.error('[Main] db:get-character-map-locations failed:', e);
        return [];
    }
});

ipcMain.handle('db:get-characters', async (_, novelId: string) => {
    try {
        return await (db as any).character.findMany({
            where: { novelId },
            include: {
                items: {
                    include: { item: true }
                }
            },
            orderBy: [
                { isStarred: 'desc' },
                { sortOrder: 'asc' }
            ]
        });
    } catch (e) {
        console.error('[Main] db:get-characters failed:', e);
        throw e;
    }
});

ipcMain.handle('db:get-character', async (_, id: string) => {
    try {
        return await (db as any).character.findUnique({
            where: { id },
            include: {
                items: {
                    include: { item: true }
                }
            }
        });
    } catch (e) {
        console.error('[Main] db:get-character failed:', e);
        throw e;
    }
});

ipcMain.handle('db:create-character', async (_, data: any) => {
    try {
        // Ensure profile is stringified if it's an object
        const profileData = typeof data.profile === 'object' ? JSON.stringify(data.profile) : data.profile;
        return await (db as any).character.create({
            data: { ...data, profile: profileData }
        });
    } catch (e) {
        console.error('[Main] db:create-character failed:', e);
        throw e;
    }
});

ipcMain.handle('db:update-character', async (_, { id, data }: { id: string, data: any }) => {
    try {
        const profileData = typeof data.profile === 'object' ? JSON.stringify(data.profile) : data.profile;
        return await (db as any).character.update({
            where: { id },
            data: { ...data, profile: profileData }
        });
    } catch (e) {
        console.error('[Main] db:update-character failed:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-character', async (_, id: string) => {
    try {
        await (db as any).character.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:delete-character failed:', e);
        throw e;
    }
});

ipcMain.handle('db:get-items', async (_, novelId: string) => {
    try {
        return await (db as any).item.findMany({
            where: { novelId },
            orderBy: { sortOrder: 'asc' }
        });
    } catch (e) {
        console.error('[Main] db:get-items failed:', e);
        throw e;
    }
});

ipcMain.handle('db:get-item', async (_, id: string) => {
    try {
        return await (db as any).item.findUnique({ where: { id } });
    } catch (e) {
        console.error('[Main] db:get-item failed:', e);
        throw e;
    }
});

ipcMain.handle('db:create-item', async (_, data: any) => {
    try {
        const maxOrder = await (db as any).item.aggregate({
            where: { novelId: data.novelId },
            _max: { sortOrder: true }
        });
        const sortOrder = (maxOrder._max.sortOrder || 0) + 1;

        return await (db as any).item.create({
            data: { ...data, sortOrder }
        });
    } catch (e) {
        console.error('[Main] db:create-item failed:', e);
        throw e;
    }
});

ipcMain.handle('db:update-item', async (_, { id, data }: { id: string; data: any }) => {
    try {
        return await (db as any).item.update({
            where: { id },
            data: { ...data, updatedAt: new Date() }
        });
    } catch (e) {
        console.error('[Main] db:update-item failed:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-item', async (_, id: string) => {
    try {
        return await (db as any).item.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:delete-item failed:', e);
        throw e;
    }
});

ipcMain.handle('db:get-mentionables', async (_, novelId: string) => {
    try {
        const [characters, items, worldSettings, maps] = await Promise.all([
            (db as any).character.findMany({
                where: { novelId },
                select: { id: true, name: true, avatar: true, role: true, isStarred: true },
                orderBy: [
                    { isStarred: 'desc' },
                    { name: 'asc' }
                ]
            }),
            (db as any).item.findMany({
                where: { novelId },
                select: { id: true, name: true, icon: true },
                orderBy: { name: 'asc' }
            }),
            (db as any).worldSetting.findMany({
                where: { novelId },
                select: { id: true, name: true, icon: true, type: true },
                orderBy: { name: 'asc' }
            }),
            (db as any).mapCanvas.findMany({
                where: { novelId },
                select: { id: true, name: true, type: true },
                orderBy: { name: 'asc' }
            }),
        ]);

        return [
            ...characters.map((c: any) => ({ ...c, type: 'character' })),
            ...items.map((i: any) => ({ ...i, type: 'item' })),
            ...worldSettings.map((ws: any) => ({ id: ws.id, name: ws.name, icon: ws.icon, type: 'world', role: ws.type })),
            ...maps.map((m: any) => ({ id: m.id, name: m.name, type: 'map', role: m.type })),
        ];
    } catch (e) {
        console.error('[Main] db:get-mentionables failed:', e);
        throw e;
    }
});

// --- World Settings IPC ---
ipcMain.handle('db:get-world-settings', async (_, novelId: string) => {
    try {
        return await (db as any).worldSetting.findMany({
            where: { novelId },
            orderBy: { sortOrder: 'asc' }
        });
    } catch (e) {
        console.error('[Main] db:get-world-settings failed:', e);
        throw e;
    }
});

ipcMain.handle('db:create-world-setting', async (_, data: { novelId: string; name: string; type?: string }) => {
    try {
        const last = await (db as any).worldSetting.findFirst({
            where: { novelId: data.novelId },
            orderBy: { sortOrder: 'desc' }
        });
        return await (db as any).worldSetting.create({
            data: {
                novelId: data.novelId,
                name: data.name,
                type: data.type || 'other',
                sortOrder: (last?.sortOrder || 0) + 1
            }
        });
    } catch (e) {
        console.error('[Main] db:create-world-setting failed:', e);
        throw e;
    }
});

ipcMain.handle('db:update-world-setting', async (_, id: string, data: any) => {
    try {
        return await (db as any).worldSetting.update({
            where: { id },
            data
        });
    } catch (e) {
        console.error('[Main] db:update-world-setting failed:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-world-setting', async (_, id: string) => {
    try {
        return await (db as any).worldSetting.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:delete-world-setting failed:', e);
        throw e;
    }
});

// --- Map System IPC ---
ipcMain.handle('db:get-maps', async (_, novelId: string) => {
    try {
        return await (db as any).mapCanvas.findMany({
            where: { novelId },
            orderBy: { sortOrder: 'asc' }
        });
    } catch (e) {
        console.error('[Main] db:get-maps failed:', e);
        throw e;
    }
});

ipcMain.handle('db:get-map', async (_, id: string) => {
    try {
        return await (db as any).mapCanvas.findUnique({
            where: { id },
            include: {
                markers: { include: { character: { select: { id: true, name: true, avatar: true, role: true } } } },
                elements: { orderBy: { z: 'asc' } }
            }
        });
    } catch (e) {
        console.error('[Main] db:get-map failed:', e);
        throw e;
    }
});

ipcMain.handle('db:create-map', async (_, data: { novelId: string; name: string; type?: string }) => {
    try {
        return await (db as any).mapCanvas.create({ data });
    } catch (e) {
        console.error('[Main] db:create-map failed:', e);
        throw e;
    }
});

ipcMain.handle('db:update-map', async (_, { id, data }: { id: string; data: any }) => {
    try {
        const { markers, elements, createdAt, updatedAt, ...updateData } = data;
        return await (db as any).mapCanvas.update({ where: { id }, data: updateData });
    } catch (e) {
        console.error('[Main] db:update-map failed:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-map', async (_, id: string) => {
    try {
        // Also clean up background file
        const map = await (db as any).mapCanvas.findUnique({ where: { id }, select: { background: true, novelId: true } });
        if (map?.background) {
            const bgPath = path.join(app.getPath('userData'), map.background);
            if (fs.existsSync(bgPath)) fs.unlinkSync(bgPath);
        }
        return await (db as any).mapCanvas.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:delete-map failed:', e);
        throw e;
    }
});

ipcMain.handle('db:upload-map-bg', async (_, mapId: string) => {
    try {
        const map = await (db as any).mapCanvas.findUnique({ where: { id: mapId }, select: { novelId: true, background: true } });
        if (!map) return null;

        const result = await dialog.showOpenDialog(win!, {
            title: 'Select Map Image',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) return null;

        const srcPath = result.filePaths[0];
        const ext = path.extname(srcPath);
        const mapsDir = path.join(app.getPath('userData'), 'maps', map.novelId);
        if (!fs.existsSync(mapsDir)) fs.mkdirSync(mapsDir, { recursive: true });

        // Remove old background if exists
        if (map.background) {
            const oldPath = path.join(app.getPath('userData'), map.background);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        const fileName = `${mapId}${ext}`;
        const destPath = path.join(mapsDir, fileName);
        fs.copyFileSync(srcPath, destPath);

        const relativePath = `maps/${map.novelId}/${fileName}`;

        // Get image dimensions using Electron's nativeImage
        const img = nativeImage.createFromPath(destPath);
        const imgSize = img.getSize();
        const width = imgSize.width || 1200;
        const height = imgSize.height || 800;

        await (db as any).mapCanvas.update({
            where: { id: mapId },
            data: { background: relativePath, width, height }
        });

        return { path: relativePath, width, height };
    } catch (e) {
        console.error('[Main] db:upload-map-bg failed:', e);
        throw e;
    }
});

// --- Map Marker IPC ---
ipcMain.handle('db:get-map-markers', async (_, mapId: string) => {
    try {
        return await (db as any).characterMapMarker.findMany({
            where: { mapId },
            include: { character: { select: { id: true, name: true, avatar: true, role: true } } }
        });
    } catch (e) {
        console.error('[Main] db:get-map-markers failed:', e);
        throw e;
    }
});

ipcMain.handle('db:create-map-marker', async (_, data: { characterId: string; mapId: string; x: number; y: number; label?: string }) => {
    try {
        return await (db as any).characterMapMarker.create({
            data,
            include: { character: { select: { id: true, name: true, avatar: true, role: true } } }
        });
    } catch (e) {
        console.error('[Main] db:create-map-marker failed:', e);
        throw e;
    }
});

ipcMain.handle('db:update-map-marker', async (_, { id, data }: { id: string; data: { x?: number; y?: number; label?: string } }) => {
    try {
        return await (db as any).characterMapMarker.update({
            where: { id },
            data,
            include: { character: { select: { id: true, name: true, avatar: true, role: true } } }
        });
    } catch (e) {
        console.error('[Main] db:update-map-marker failed:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-map-marker', async (_, id: string) => {
    try {
        return await (db as any).characterMapMarker.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:delete-map-marker failed:', e);
        throw e;
    }
});

// --- Map Element IPC ---
ipcMain.handle('db:get-map-elements', async (_, mapId: string) => {
    try {
        return await (db as any).mapElement.findMany({
            where: { mapId },
            orderBy: { z: 'asc' }
        });
    } catch (e) {
        console.error('[Main] db:get-map-elements failed:', e);
        throw e;
    }
});

ipcMain.handle('db:create-map-element', async (_, data: { mapId: string; type: string; x: number; y: number; text?: string; iconKey?: string }) => {
    try {
        return await (db as any).mapElement.create({ data });
    } catch (e) {
        console.error('[Main] db:create-map-element failed:', e);
        throw e;
    }
});

ipcMain.handle('db:update-map-element', async (_, { id, data }: { id: string; data: any }) => {
    try {
        const { createdAt, updatedAt, map, ...updateData } = data;
        return await (db as any).mapElement.update({ where: { id }, data: updateData });
    } catch (e) {
        console.error('[Main] db:update-map-element failed:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-map-element', async (_, id: string) => {
    try {
        return await (db as any).mapElement.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:delete-map-element failed:', e);
        throw e;
    }
});


ipcMain.handle('db:get-relationships', async (_, characterId: string) => {
    try {
        const [asSource, asTarget] = await Promise.all([
            (db as any).relationship.findMany({
                where: { sourceId: characterId },
                include: { target: { select: { id: true, name: true, avatar: true, role: true } } }
            }),
            (db as any).relationship.findMany({
                where: { targetId: characterId },
                include: { source: { select: { id: true, name: true, avatar: true, role: true } } }
            })
        ]);
        return [...asSource, ...asTarget];
    } catch (e) {
        console.error('[Main] db:get-relationships failed:', e);
        throw e;
    }
});

ipcMain.handle('db:create-relationship', async (_, data: { sourceId: string; targetId: string; relation: string; description?: string }) => {
    try {
        return await (db as any).relationship.create({
            data,
            include: {
                source: { select: { id: true, name: true, avatar: true, role: true } },
                target: { select: { id: true, name: true, avatar: true, role: true } }
            }
        });
    } catch (e) {
        console.error('[Main] db:create-relationship failed:', e);
        throw e;
    }
});

ipcMain.handle('db:delete-relationship', async (_, id: string) => {
    try {
        return await (db as any).relationship.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:delete-relationship failed:', e);
        throw e;
    }
});

// --- Item Ownership IPC ---
ipcMain.handle('db:get-character-items', async (_, characterId: string) => {
    try {
        return await (db as any).itemOwnership.findMany({
            where: { characterId },
            include: { item: true }
        });
    } catch (e) {
        console.error('[Main] db:get-character-items failed:', e);
        throw e;
    }
});

ipcMain.handle('db:add-item-to-character', async (_, data: { characterId: string; itemId: string; note?: string }) => {
    try {
        return await (db as any).itemOwnership.create({
            data,
            include: { item: true }
        });
    } catch (e) {
        console.error('[Main] db:add-item-to-character failed:', e);
        throw e;
    }
});

ipcMain.handle('db:remove-item-from-character', async (_, id: string) => {
    try {
        return await (db as any).itemOwnership.delete({ where: { id } });
    } catch (e) {
        console.error('[Main] db:remove-item-from-character failed:', e);
        throw e;
    }
});

ipcMain.handle('db:update-item-ownership', async (_, id: string, data: { note?: string }) => {
    try {
        return await (db as any).itemOwnership.update({
            where: { id },
            data,
            include: { item: true }
        });
    } catch (e) {
        console.error('[Main] db:update-item-ownership failed:', e);
        throw e;
    }
});

// --- Data Aggregation IPC ---

// Character Timeline (Story Mentions from PlotPoints via Anchors)
ipcMain.handle('db:get-character-timeline', async (_, characterId: string) => {
    try {
        const character = await (db as any).character.findUnique({ where: { id: characterId }, select: { name: true, novelId: true } });
        if (!character) return [];

        // PlotPoint → PlotPointAnchor → Chapter
        const anchors = await (db as any).plotPointAnchor.findMany({
            where: {
                plotPoint: {
                    novelId: character.novelId,
                    description: { contains: `@${character.name}` }
                }
            },
            include: {
                plotPoint: { select: { title: true, description: true, plotLine: { select: { name: true } } } },
                chapter: { select: { id: true, title: true, order: true, volume: { select: { title: true, order: true } } } }
            },
            orderBy: [{ chapter: { volume: { order: 'asc' } } }, { chapter: { order: 'asc' } }]
        });

        // Deduplicate by chapterId
        const seen = new Set<string>();
        return anchors
            .filter((a: any) => a.chapter && !seen.has(a.chapter.id) && seen.add(a.chapter.id))
            .map((a: any) => ({
                chapterId: a.chapter.id,
                chapterTitle: a.chapter.title,
                volumeTitle: a.chapter.volume.title,
                order: a.chapter.order,
                volumeOrder: a.chapter.volume.order,
                snippet: a.plotPoint.description?.substring(0, 100) || a.plotPoint.title
            }));
    } catch (e) {
        console.error('[Main] db:get-character-timeline failed:', e);
        throw e;
    }
});

// Helper to extract plain text from Lexical JSON
function extractTextFromLexical(jsonString: string): string {
    if (!jsonString) return '';
    try {
        const content = JSON.parse(jsonString);
        if (!content.root) return jsonString; // Fallback if not Lexical JSON

        const texts: string[] = [];
        const traverse = (node: any) => {
            if (node.text) {
                texts.push(node.text);
            }
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach(traverse);
            }
            // Add space for block elements to prevent words merging
            if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'quote') {
                texts.push(' ');
            }
        };
        traverse(content.root);
        return texts.join('').replace(/\s+/g, ' ').trim();
    } catch (e) {
        return jsonString; // Return raw if parsing fails
    }
}

// Character Chapter Appearances (Name search in chapter content)
ipcMain.handle('db:get-character-chapter-appearances', async (_, characterId: string) => {
    try {
        const character = await (db as any).character.findUnique({ where: { id: characterId }, select: { name: true, novelId: true } });
        if (!character) return [];

        const chapters = await (db as any).chapter.findMany({
            where: {
                volume: { novelId: character.novelId },
                // Use LIKE for rough match on JSON string (imperfect but fast first filter)
                content: { contains: character.name }
            },
            select: {
                id: true, title: true, order: true, content: true,
                volume: { select: { title: true, order: true } }
            },
            orderBy: [{ volume: { order: 'asc' } }, { order: 'asc' }]
        });

        return chapters.map((ch: any) => {
            const plainText = extractTextFromLexical(ch.content || '');
            let snippet = '';

            // Search in plain text
            const idx = plainText.indexOf(character.name);
            if (idx >= 0) {
                const start = Math.max(0, idx - 30);
                const end = Math.min(plainText.length, idx + character.name.length + 50);
                snippet = (start > 0 ? '...' : '') + plainText.substring(start, end) + (end < plainText.length ? '...' : '');
            } else {
                // Fallback: mostly shouldn't reach here if database filter worked and text extraction is correct
                // But JSON structure might contain name in keys or other non-text parts
                // We only want actual text occurrences. If not found in plain text, skip or return empty snippet.
                // Let's try to return a generic snippet from start if specific name not found in text (e.g. name was in formatting)
                // snippet = plainText.substring(0, 80) + '...';
                // Actually, better to filter this out if not found in text? 
                // The requirement is "if appearance". If name is only in attributes not text, it's not appearance.
                // We will return empty snippet or maybe filter these entries out in frontend? 
                // Backend filter is already applied. Let's return snippet if found, else empty.
            }

            return {
                chapterId: ch.id,
                chapterTitle: ch.title,
                volumeTitle: ch.volume.title,
                order: ch.order,
                volumeOrder: ch.volume.order,
                snippet
            };
        }).filter((item: any) => item.snippet !== ''); // Filter out items where name wasn't found in plain text
    } catch (e) {
        console.error('[Main] db:get-character-chapter-appearances failed:', e);
        throw e;
    }
});

ipcMain.handle('db:get-recent-chapters', async (_, characterName: string, novelId: string, limit: number = 5) => {
    try {
        return await (db as any).chapter.findMany({
            where: {
                volume: { novelId },
                content: { contains: `@${characterName}` }
            },
            select: {
                id: true, title: true, order: true, wordCount: true, updatedAt: true
            },
            orderBy: { updatedAt: 'desc' },
            take: limit
        });
    } catch (e) {
        console.error('[Main] db:get-recent-chapters failed:', e);
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

    // Register custom protocol for serving local files (map backgrounds etc.)
    protocol.handle('local-resource', (request) => {
        const relativePath = decodeURIComponent(request.url.replace('local-resource://', ''));
        const fullPath = path.join(app.getPath('userData'), relativePath);
        return net.fetch('file:///' + fullPath.replace(/\\/g, '/'));
    });

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
            const dbFolder = path.dirname(dbPath);
            if (!fs.existsSync(dbFolder)) {
                fs.mkdirSync(dbFolder, { recursive: true });
            }

            console.log('[Main] Schema found.');

            // FIX: Drop FTS table before migration to prevent Prisma "no such table" errors on shadow tables
            console.log('[Main] Cleaning up FTS tables before migration...');
            initDb(dbUrl); // Initialize client
            try {
                // Use unsafe raw query to drop the virtual table. This also drops shadow tables like search_index_config.
                await db.$executeRawUnsafe('DROP TABLE IF EXISTS search_index;');
                console.log('[Main] FTS tables dropped successfully.');
            } catch (e) {
                console.warn('[Main] Failed to drop FTS table (non-critical):', e);
            }
            // CRITICAL: Disconnect to release SQLite lock before running Prisma CLI
            await (db as any).$disconnect();

            console.log('[Main] Attempting synchronous DB push to:', dbPath);

            // Resolve Prisma Binary
            const prismaPath = path.resolve(__dirname, '../../../packages/core/node_modules/.bin/prisma.cmd');
            console.log('[Main] Using Prisma binary at:', prismaPath);

            if (!fs.existsSync(prismaPath)) {
                console.error('[Main] Prisma binary NOT found at:', prismaPath);
            } else {
                try {
                    const command = `"${prismaPath}" db push --schema="${schemaPath}" --accept-data-loss`;
                    console.log('[Main] Executing command:', command);

                    const output = execSync(command, {
                        env: { ...process.env, DATABASE_URL: dbUrl },
                        cwd: path.resolve(__dirname, '../../../packages/core'),
                        stdio: 'pipe', // Avoid inherit to prevent encoding issues
                        windowsHide: true
                    });
                    console.log('[Main] DB Push output:', output.toString());
                    console.log('[Main] DB Push completed successfully.');
                } catch (error: any) {
                    console.error('[Main] DB Push failed.');
                    if (error.stdout) console.log('[Main] stdout:', error.stdout.toString());
                    if (error.stderr) console.error('[Main] stderr:', error.stderr.toString());
                }
            }
        } else {
            console.warn('[Main] Schema file NOT found at:', schemaPath);
        }
    }

    // 4. Initialize Core Database (Re-connect/Use instance)
    initDb(dbUrl);

    // 5. Initialize Search Index
    await searchIndex.initSearchIndex();
    console.log('[Main] Search index initialized');

    // 6. Create Window
    createWindow();
})
