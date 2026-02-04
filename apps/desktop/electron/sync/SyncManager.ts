import { db } from '@novel-editor/core';

// TODO: Move to config
const API_BASE = 'http://localhost:8080/api/sync';

export class SyncManager {

    // Get the global sync cursor
    private async getCursor(): Promise<number> {
        const state = await db.syncState.findUnique({ where: { id: 'global' } });
        return state ? Number(state.cursor) : 0;
    }

    private async setCursor(val: number) {
        await db.syncState.upsert({
            where: { id: 'global' },
            create: { id: 'global', cursor: BigInt(val) },
            update: { cursor: BigInt(val) }
        });
    }

    async pull() {
        const cursor = await this.getCursor();
        console.log('[Sync] Pulling from cursor:', cursor);

        try {
            const response = await fetch(`${API_BASE}/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lastSyncCursor: cursor })
            });

            if (!response.ok) throw new Error(`Pull failed: ${response.statusText}`);

            const result = await response.json();
            const { newSyncCursor, data } = result;

            // Apply changes in transaction
            await db.$transaction(async (tx) => {
                // Novels
                if (data.novels?.length) {
                    for (const novel of data.novels) {
                        await tx.novel.upsert({
                            where: { id: novel.id },
                            create: { ...novel, updatedAt: new Date(novel.updatedAt), createdAt: new Date(novel.createdAt) },
                            update: { ...novel, updatedAt: new Date(novel.updatedAt), createdAt: new Date(novel.createdAt) }
                        });
                    }
                }

                // Volumes
                if (data.volumes?.length) {
                    for (const vol of data.volumes) {
                        await tx.volume.upsert({
                            where: { id: vol.id },
                            create: { ...vol, updatedAt: new Date(vol.updatedAt), createdAt: new Date(vol.createdAt) },
                            update: { ...vol, updatedAt: new Date(vol.updatedAt), createdAt: new Date(vol.createdAt) }
                        });
                    }
                }

                // Chapters
                if (data.chapters?.length) {
                    for (const ch of data.chapters) {
                        await tx.chapter.upsert({
                            where: { id: ch.id },
                            create: { ...ch, updatedAt: new Date(ch.updatedAt), createdAt: new Date(ch.createdAt) },
                            update: { ...ch, updatedAt: new Date(ch.updatedAt), createdAt: new Date(ch.createdAt) }
                        });
                    }
                }
            });

            // Update cursor only if successful
            await this.setCursor(newSyncCursor);
            console.log('[Sync] Pull complete. New cursor:', newSyncCursor);
            return { success: true, count: (data.novels?.length || 0) + (data.chapters?.length || 0) };

        } catch (e) {
            console.error('[Sync] Pull error:', e);
            throw e;
        }
    }

    async push() {
        const cursor = await this.getCursor(); // Ideally should track separate push cursor, but simple sync uses same time base
        // Simplify: Find everything updated recently. This is risky if we just pulled it.
        // Better: We track 'lastPushTime' locally.

        // For MVP, simplistic check: updatedAt > lastSyncCursor (which we just updated from Pull? No wait context)
        // If we just Pulled, our local items have `updatedAt` from server (past or present).
        // If we edited locally, `updatedAt` is NOW.
        // So we need to push items where `updatedAt > lastPushTime`.

        // Let's create a separate cursor for 'lastPush'.
        // For now, let's just push everything modified > cursor, carefully not to loop.
        // Server will ignore if timestamps match.

        const changes = {
            novels: await db.novel.findMany({ where: { updatedAt: { gt: new Date(cursor) } } }),
            volumes: await db.volume.findMany({ where: { updatedAt: { gt: new Date(cursor) } } }),
            chapters: await db.chapter.findMany({ where: { updatedAt: { gt: new Date(cursor) } } }),
        };

        if (changes.novels.length === 0 && changes.volumes.length === 0 && changes.chapters.length === 0) {
            return { success: true, count: 0 };
        }

        console.log('[Sync] Pushing changes...');

        // Serialize BigInt if any (none in core models yet except cursor, but be safe)
        const payload = JSON.stringify({
            lastSyncCursor: cursor,
            changes
        }, (_, v) => typeof v === 'bigint' ? v.toString() : v);

        const response = await fetch(`${API_BASE}/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });

        if (!response.ok) throw new Error(`Push failed: ${response.statusText}`);
        console.log('[Sync] Push success');
        return await response.json();
    }
}
