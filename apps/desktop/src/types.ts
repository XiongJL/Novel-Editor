export interface Idea {
    id: string;
    novelId: string;
    content: string;
    quote?: string;
    cursor?: string;
    timestamp: number;
    isStarred?: boolean;
    tags?: string[];
    chapterId?: string;
}
