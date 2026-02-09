export interface Idea {
    id: string;
    novelId: string;
    chapterId?: string;
    content: string;
    quote?: string;
    cursor?: string;
    timestamp: number;
    isStarred?: boolean;
    tags?: string[];
}

export interface PlotLine {
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

export interface PlotPoint {
    id: string;
    novelId: string;
    plotLineId: string;
    plotLine?: PlotLine;
    title: string;
    description?: string | null;
    type: string; // 'foreshadowing' | 'mystery' | 'promise' | 'event'
    status: string; // 'active' | 'resolved'
    order: number;
    anchors?: PlotPointAnchor[];
    createdAt: string | Date;
    updatedAt: string | Date;
}

export interface PlotPointAnchor {
    id: string;
    plotPointId: string;
    chapterId: string;
    type: string; // 'setup' | 'payoff'
    lexicalKey?: string | null;
    offset?: number | null;
    length?: number | null;
    createdAt: string | Date;
    updatedAt: string | Date;
}

export interface Volume {
    id: string;
    novelId: string;
    title: string;
    order: number;
    chapters: Chapter[];
    createdAt: string | Date;
    updatedAt: string | Date;
}

export interface Novel {
    id: string;
    title: string;
    description?: string | null;
    coverUrl?: string | null;
    createdAt: string | Date;
    updatedAt: string | Date;
    version: number;
    deleted: boolean;
    wordCount: number;
    formatting: string;
    volumes?: Volume[];
}

export interface ChapterMetadata {
    id: string;
    title: string;
    order: number;
    wordCount: number;
    updatedAt: string | Date;
}

export interface Volume {
    id: string;
    title: string;
    order: number;
    novelId: string;
    version: number;
    deleted: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
    chapters: ChapterMetadata[];
}

export interface Chapter extends ChapterMetadata {
    content: string;
    volumeId: string;
    createdAt: string | Date;
    version: number;
    deleted: boolean;
    anchors?: PlotPointAnchor[];
}
