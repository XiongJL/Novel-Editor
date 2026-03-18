import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DraftListFilters, DraftSessionRecord } from './types';

type DraftSessionFileShape = {
    sessions: DraftSessionRecord[];
};

const EMPTY_STORE: DraftSessionFileShape = {
    sessions: [],
};

export class DraftSessionStore {
    private readonly getUserDataPath: () => string;
    private cache: DraftSessionRecord[] | null = null;

    constructor(getUserDataPath: () => string) {
        this.getUserDataPath = getUserDataPath;
    }

    private getStoreDir(): string {
        return path.join(this.getUserDataPath(), 'automation');
    }

    private getStorePath(): string {
        return path.join(this.getStoreDir(), 'draft-sessions.json');
    }

    private async ensureLoaded(): Promise<void> {
        if (this.cache) return;
        const filePath = this.getStorePath();
        try {
            const raw = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<DraftSessionFileShape>;
            this.cache = Array.isArray(parsed.sessions) ? parsed.sessions : [];
        } catch (error: any) {
            if (error?.code !== 'ENOENT') {
                throw error;
            }
            this.cache = [...EMPTY_STORE.sessions];
        }
    }

    private async flush(): Promise<void> {
        await fs.mkdir(this.getStoreDir(), { recursive: true });
        const filePath = this.getStorePath();
        const payload: DraftSessionFileShape = {
            sessions: this.cache ?? [],
        };
        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    }

    async list(filters?: DraftListFilters): Promise<DraftSessionRecord[]> {
        await this.ensureLoaded();
        const sessions = [...(this.cache ?? [])];
        return sessions
            .filter((session) => {
                if (filters?.novelId && session.novelId !== filters.novelId) return false;
                if (filters?.workspace && session.workspace !== filters.workspace) return false;
                if (filters?.type && session.type !== filters.type) return false;
                if (filters?.status && session.status !== filters.status) return false;
                if (!filters?.includeInactive && session.status !== 'draft') return false;
                return true;
            })
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }

    async getById(draftSessionId: string): Promise<DraftSessionRecord | null> {
        await this.ensureLoaded();
        return (this.cache ?? []).find((session) => session.draftSessionId === draftSessionId) ?? null;
    }

    async getLatest(filters: Omit<DraftListFilters, 'includeInactive'>): Promise<DraftSessionRecord | null> {
        const sessions = await this.list(filters);
        return sessions[0] ?? null;
    }

    async create(input: Omit<DraftSessionRecord, 'draftSessionId' | 'version' | 'createdAt' | 'updatedAt'>): Promise<DraftSessionRecord> {
        await this.ensureLoaded();
        const now = new Date().toISOString();
        const session: DraftSessionRecord = {
            ...input,
            draftSessionId: randomUUID(),
            version: 1,
            createdAt: now,
            updatedAt: now,
        };
        this.cache = [session, ...(this.cache ?? []).filter((item) => item.novelId !== session.novelId || item.workspace !== session.workspace || item.type !== session.type || item.status !== 'draft')];
        await this.flush();
        return session;
    }

    async update(
        draftSessionId: string,
        expectedVersion: number | undefined,
        updater: (current: DraftSessionRecord) => DraftSessionRecord,
    ): Promise<DraftSessionRecord> {
        await this.ensureLoaded();
        const sessions = this.cache ?? [];
        const index = sessions.findIndex((session) => session.draftSessionId === draftSessionId);
        if (index < 0) {
            throw Object.assign(new Error('Draft session not found'), { code: 'NOT_FOUND' });
        }
        const current = sessions[index];
        if (typeof expectedVersion === 'number' && current.version !== expectedVersion) {
            throw Object.assign(new Error('Draft session version conflict'), { code: 'VERSION_CONFLICT' });
        }
        const next = updater(current);
        const updated: DraftSessionRecord = {
            ...next,
            draftSessionId: current.draftSessionId,
            createdAt: current.createdAt,
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
        };
        sessions[index] = updated;
        this.cache = sessions;
        await this.flush();
        return updated;
    }
}
