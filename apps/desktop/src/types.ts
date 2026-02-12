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
    icon?: string | null;
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

export interface Character {
    id: string;
    novelId: string;
    name: string;
    role?: string | null;
    avatar?: string | null;
    fullBodyImages?: string | null; // JSON array of file paths
    description?: string | null;
    profile: string; // JSON: 自定义属性
    sortOrder: number;
    isStarred?: boolean;
    items?: ItemOwnershipWithItem[];
    createdAt: string | Date;
    updatedAt: string | Date;
}

export interface Item {
    id: string;
    novelId: string;
    name: string;
    type: string; // 'item' | 'skill' | 'location'
    icon?: string | null;
    description?: string | null;
    profile: string; // JSON
    sortOrder: number;
    createdAt: string | Date;
    updatedAt: string | Date;
}

export interface ItemOwnershipWithItem {
    id: string;
    itemId: string;
    characterId: string;
    note?: string | null;
    item: Item;
}

export interface MentionableItem {
    id: string;
    name: string;
    type: 'character' | 'item' | 'world' | 'map';
    avatar?: string | null;
    icon?: string | null;
    role?: string | null;
}

export interface WorldSetting {
    id: string;
    novelId: string;
    name: string;
    content: string;
    type: string; // 'history' | 'geography' | 'magic_system' | 'faction' | 'technology' | 'other'
    icon?: string | null;
    sortOrder: number;
    createdAt: string | Date;
    updatedAt: string | Date;
}

export interface Relationship {
    id: string;
    sourceId: string;
    targetId: string;
    relation: string;
    description?: string | null;
    source?: Character;
    target?: Character;
    createdAt: string | Date;
    updatedAt: string | Date;
}

export interface ItemOwnership {
    id: string;
    characterId: string;
    itemId: string;
    note?: string | null;
    character?: Character;
    item?: Item;
    createdAt: string | Date;
}

export interface CharacterTimelineEntry {
    chapterId: string;
    chapterTitle: string;
    volumeTitle: string;
    order: number;
    volumeOrder: number;
    snippet: string;
}

// ── Map System ──

export interface MapCanvas {
    id: string;
    novelId: string;
    name: string;
    type: string; // 'world' | 'region' | 'scene'
    description?: string | null;
    background?: string | null;
    width: number;
    height: number;
    sortOrder: number;
    markers?: CharacterMapMarker[];
    elements?: MapElement[];
    createdAt: string | Date;
    updatedAt: string | Date;
}

export interface MapElement {
    id: string;
    mapId: string;
    type: string; // 'poi' | 'label'
    x: number;
    y: number;
    text?: string | null;
    iconKey?: string | null;
    style: string; // JSON string
    z: number;
}

export interface CharacterMapMarker {
    id: string;
    characterId: string;
    mapId: string;
    x: number;
    y: number;
    label?: string | null;
    character?: Character;
}
