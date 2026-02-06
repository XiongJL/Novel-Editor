/// <reference types="vite/client" />



interface DBAPI {
    getNovels: () => Promise<Novel[]>
    createNovel: (title: string) => Promise<Novel>
    getVolumes: (novelId: string) => Promise<Volume[]>
    createVolume: (data: { novelId: string; title: string }) => Promise<Volume>
    createChapter: (data: { volumeId: string; title: string; order: number }) => Promise<Chapter>
    getChapter: (chapterId: string) => Promise<Chapter | null>
    saveChapter: (data: { chapterId: string; content: string }) => Promise<Chapter>
    renameVolume: (data: { volumeId: string; title: string }) => Promise<Volume>
    renameChapter: (data: { chapterId: string; title: string }) => Promise<Chapter>
    updateNovel: (data: { id: string; data: { title?: string; coverUrl?: string; formatting?: string } }) => Promise<Novel>
    getIdeas: (novelId: string) => Promise<Idea[]>
    createIdea: (data: Idea) => Promise<Idea>
    deleteIdea: (id: string) => Promise<void>
    updateIdea: (id: string, data: Partial<Idea>) => Promise<Idea>
    getAllTags: (novelId?: string) => Promise<string[]>
    // Search
    search: (params: { novelId: string; keyword: string; limit?: number; offset?: number }) => Promise<SearchResult[]>
    rebuildSearchIndex: (novelId: string) => Promise<{ chapters: number; ideas: number }>
    checkIndexStatus: (novelId: string) => Promise<{
        indexedChapters: number
        totalChapters: number
        indexedIdeas: number
        totalIdeas: number
    }>
}

interface SearchResult {
    entityType: 'chapter' | 'idea'
    entityId: string
    chapterId: string
    novelId: string
    title: string
    snippet: string
    preview?: string // Longer text for tooltip
    keyword: string
    matchType: 'content' | 'title' | 'volume'
    chapterOrder?: number
    volumeId?: string
    volumeTitle?: string
    volumeOrder?: number
}

interface Idea {
    id: string
    novelId: string
    chapterId?: string
    content: string
    quote?: string
    cursor?: string
    timestamp: number
    isStarred?: boolean
}

interface Novel {
    id: string
    title: string
    description?: string | null
    coverUrl?: string | null
    createdAt: Date
    updatedAt: Date
    wordCount?: number
    formatting?: string
}

interface Volume {
    id: string
    title: string
    order: number
    chapters: ChapterMetadata[]
}

interface ChapterMetadata {
    id: string
    title: string
    order: number
    wordCount: number
    updatedAt: Date
}

interface Chapter extends ChapterMetadata {
    content: string
}

interface SyncAPI {
    pull: () => Promise<{ success: boolean; count: number }>
    push: () => Promise<{ success: boolean; count: number }>
}

interface Window {
    // expose in the `electron/preload.ts`
    ipcRenderer: import('electron').IpcRenderer
    db: DBAPI
    sync: SyncAPI
    backup: {
        export: (password?: string) => Promise<string>;
        import: (filePath?: string, password?: string) => Promise<{ success: boolean; code?: string; message?: string; filePath?: string }>;
        getAutoBackups: () => Promise<Array<{ filename: string; createdAt: number; size: number }>>;
        restoreAutoBackup: (filename: string) => Promise<void>;
    }
}
