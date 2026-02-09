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

    // Story Structure
    getPlotLines: (novelId: string) => Promise<PlotLine[]>
    createPlotLine: (data: { novelId: string; name: string; color: string }) => Promise<PlotLine>
    updatePlotLine: (id: string, data: Partial<PlotLine>) => Promise<PlotLine>
    deletePlotLine: (id: string) => Promise<void>

    createPlotPoint: (data: Partial<PlotPoint>) => Promise<PlotPoint>
    updatePlotPoint: (id: string, data: Partial<PlotPoint>) => Promise<PlotPoint>
    deletePlotPoint: (id: string) => Promise<void>

    createPlotPointAnchor: (data: Partial<PlotPointAnchor>) => Promise<PlotPointAnchor>
    deletePlotPointAnchor: (id: string) => Promise<void>

    reorderPlotLines: (novelId: string, lineIds: string[]) => Promise<{ success: boolean }>
    reorderPlotPoints: (plotLineId: string, pointIds: string[]) => Promise<{ success: boolean }>
}

interface PlotLine {
    id: string;
    novelId: string;
    name: string;
    description?: string | null;
    color: string;
    sortOrder: number;
    points?: PlotPoint[];
    createdAt: string | Date;
    updatedAt: string | Date;
}

interface PlotPoint {
    id: string;
    novelId: string;
    plotLineId: string;
    title: string;
    description?: string | null;
    type: string;
    status: string;
    order: number;
    anchors?: PlotPointAnchor[];
    createdAt: string | Date;
    updatedAt: string | Date;
}

interface PlotPointAnchor {
    id: string;
    plotPointId: string;
    chapterId: string;
    type: string;
    lexicalKey?: string | null;
    offset?: number | null;
    length?: number | null;
    createdAt: string | Date;
    updatedAt: string | Date;
}

interface SearchResult {
    entityType: 'chapter' | 'idea'
    entityId: string
    chapterId: string
    novelId: string
    title: string
    snippet: string
    preview?: string
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
    createdAt: string | Date
    updatedAt: string | Date
    version: number
    deleted: boolean
    wordCount: number
    formatting: string
    volumes?: Volume[]
}

interface ChapterMetadata {
    id: string
    title: string
    order: number
    wordCount: number
    updatedAt: string | Date
}

interface Volume {
    id: string
    title: string
    order: number
    novelId: string
    version: number
    deleted: boolean
    createdAt: string | Date
    updatedAt: string | Date
    chapters: ChapterMetadata[]
}

interface Chapter extends ChapterMetadata {
    content: string
    volumeId: string
    createdAt: string | Date
    version: number
    deleted: boolean
    anchors?: PlotPointAnchor[]
}

interface SyncAPI {
    pull: () => Promise<{ success: boolean; count: number }>
    push: () => Promise<{ success: boolean; count: number }>
}

interface Window {
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
