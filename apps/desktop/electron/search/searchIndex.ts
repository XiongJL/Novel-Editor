/**
 * FTS5 Full-Text Search Index Manager
 * 
 * 使用 SQLite FTS5 实现全文搜索，支持章节、灵感等内容的统一索引。
 */

import { db } from '@novel-editor/core';

// Initialize FTS5 table if not exists
export async function initSearchIndex(): Promise<void> {
    try {
        // Check if table exists
        const tableExists = await db.$queryRaw<{ name: string }[]>`
            SELECT name FROM sqlite_master WHERE type='table' AND name='search_index';
        `;

        if (tableExists.length === 0) {
            // Create FTS5 virtual table
            await db.$executeRaw`
                CREATE VIRTUAL TABLE search_index USING fts5(
                    content,
                    entity_type,
                    entity_id UNINDEXED,
                    novel_id UNINDEXED,
                    chapter_id UNINDEXED,
                    title,
                    tokenize='unicode61'
                );
            `;
            console.log('[SearchIndex] FTS5 table created successfully');
        }
    } catch (error) {
        console.error('[SearchIndex] Failed to initialize FTS5 table:', error);
    }
}

// Extract plain text from Lexical JSON
export function extractPlainText(lexicalJson: string): string {
    try {
        const state = JSON.parse(lexicalJson);
        const textParts: string[] = [];

        const traverse = (node: any) => {
            if (node.type === 'text' && node.text) {
                textParts.push(node.text);
            }
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach(traverse);
            }
        };

        if (state.root) {
            traverse(state.root);
        }

        return textParts.join('');
    } catch {
        // If not valid JSON, return as-is (might be plain text)
        return lexicalJson;
    }
}

// Index a chapter
export async function indexChapter(chapter: {
    id: string;
    title: string;
    content: string;
    volumeId: string;
    novelId?: string;
}): Promise<void> {
    const plainText = extractPlainText(chapter.content);

    // Get novelId from volume if not provided
    let novelId = chapter.novelId;
    if (!novelId) {
        const volume = await db.volume.findUnique({
            where: { id: chapter.volumeId },
            select: { novelId: true }
        });
        novelId = volume?.novelId;
    }

    if (!novelId) {
        console.warn('[SearchIndex] Cannot index chapter without novelId');
        return;
    }

    try {
        // Delete existing entry
        await db.$executeRaw`
            DELETE FROM search_index WHERE entity_type = 'chapter' AND entity_id = ${chapter.id};
        `;

        // Insert new entry
        await db.$executeRaw`
            INSERT INTO search_index (content, entity_type, entity_id, novel_id, chapter_id, title)
            VALUES (${plainText}, 'chapter', ${chapter.id}, ${novelId}, ${chapter.id}, ${chapter.title});
        `;
    } catch (error) {
        console.error('[SearchIndex] Failed to index chapter:', error);
    }
}

// Index an idea
export async function indexIdea(idea: {
    id: string;
    content: string;
    quote?: string | null;
    novelId: string;
    chapterId?: string | null;
}): Promise<void> {
    const searchContent = [idea.content, idea.quote].filter(Boolean).join(' ');

    try {
        // Delete existing entry
        await db.$executeRaw`
            DELETE FROM search_index WHERE entity_type = 'idea' AND entity_id = ${idea.id};
        `;

        // Insert new entry
        await db.$executeRaw`
            INSERT INTO search_index (content, entity_type, entity_id, novel_id, chapter_id, title)
            VALUES (${searchContent}, 'idea', ${idea.id}, ${idea.novelId}, ${idea.chapterId || ''}, ${idea.content.substring(0, 50)});
        `;
    } catch (error) {
        console.error('[SearchIndex] Failed to index idea:', error);
    }
}

// Remove from index
export async function removeFromIndex(entityType: string, entityId: string): Promise<void> {
    try {
        await db.$executeRaw`
            DELETE FROM search_index WHERE entity_type = ${entityType} AND entity_id = ${entityId};
        `;
    } catch (error) {
        console.error('[SearchIndex] Failed to remove from index:', error);
    }
}

// Search result interface
export interface SearchResult {
    entityType: 'chapter' | 'idea';
    entityId: string;
    chapterId: string;
    novelId: string;
    title: string;
    snippet: string;
    preview?: string;
    keyword: string;
}

// Search function using LIKE for flexible substring matching
export async function search(
    novelId: string,
    keyword: string,
    limit: number = 20,
    offset: number = 0
): Promise<SearchResult[]> {
    if (!keyword.trim()) return [];

    try {
        // Escape special characters for LIKE
        const escapedKeyword = keyword.replace(/[%_]/g, '\\$&');
        const likePattern = `%${escapedKeyword}%`;

        // Use LIKE for flexible substring matching
        // Note: limit/offset here limits the number of DOCUMENTS (chapters) found, 
        // not the total number of snippet matches. This is intended behavior.
        const results = await db.$queryRaw<{
            entity_type: string;
            entity_id: string;
            chapter_id: string;
            novel_id: string;
            title: string;
            content: string;
        }[]>`
            SELECT 
                entity_type,
                entity_id,
                chapter_id,
                novel_id,
                title,
                content
            FROM search_index
            WHERE novel_id = ${novelId} AND content LIKE ${likePattern}
            LIMIT ${limit} OFFSET ${offset};
        `;

        const allResults: SearchResult[] = [];
        const lowerKeyword = keyword.toLowerCase();

        for (const r of results) {
            const docContent = r.content || '';
            const lowerContent = docContent.toLowerCase();

            // Find all indices of the keyword
            const indices: number[] = [];
            let pos = 0;
            // Cap matches per document to avoid extreme performance issues with common words
            while (pos < lowerContent.length && indices.length < 50) {
                const idx = lowerContent.indexOf(lowerKeyword, pos);
                if (idx === -1) break;
                indices.push(idx);
                pos = idx + lowerKeyword.length;
            }

            // Fallback if no specific match found but query returned it (shouldn't happen with LIKE)
            if (indices.length === 0) {
                // Try to generate at least one generic snippet?
                // Or just skip.
                continue;
            }

            // Create a SearchResult for EACH match
            for (const index of indices) {
                allResults.push({
                    entityType: r.entity_type as 'chapter' | 'idea',
                    entityId: r.entity_id,
                    chapterId: r.chapter_id,
                    novelId: r.novel_id,
                    title: r.title,
                    // Use a shorter context for the list item (10 chars before)
                    snippet: generateSnippetAtIndex(docContent, keyword, index, 10, true),
                    // Use longer context for tooltip preview (60 chars before/after), no HTML
                    preview: generateSnippetAtIndex(docContent, keyword, index, 60, false),
                    keyword: keyword
                });
            }
        }

        return allResults;

    } catch (error) {
        console.error('[SearchIndex] Search failed:', error);
        return [];
    }
}

// Generate snippet at specific index
function generateSnippetAtIndex(content: string, keyword: string, index: number, contextLength: number = 30, useMark: boolean = true): string {
    if (!content) return '';

    // Calculate snippet range
    const start = Math.max(0, index - contextLength);
    // Show more context after
    const end = Math.min(content.length, index + keyword.length + contextLength * 3);

    let snippet = '';
    if (start > 0) snippet += '...';

    // Get the actual matched text (preserve original case)
    const before = content.substring(start, index);
    const match = content.substring(index, index + keyword.length);
    const after = content.substring(index + keyword.length, end);

    if (useMark) {
        snippet += before + '<mark>' + match + '</mark>' + after;
    } else {
        snippet += before + match + after;
    }

    if (end < content.length) snippet += '...';

    return snippet;
}

// Rebuild entire index for a novel
export async function rebuildIndex(novelId: string): Promise<{ chapters: number; ideas: number }> {
    let chaptersIndexed = 0;
    let ideasIndexed = 0;

    try {
        // Clear existing entries for this novel
        await db.$executeRaw`
            DELETE FROM search_index WHERE novel_id = ${novelId};
        `;

        // Index all chapters
        const chapters = await db.chapter.findMany({
            where: { volume: { novelId } },
            select: { id: true, title: true, content: true, volumeId: true }
        });

        for (const chapter of chapters) {
            await indexChapter({ ...chapter, novelId });
            chaptersIndexed++;
        }

        // Index all ideas
        const ideas = await db.idea.findMany({
            where: { novelId },
            select: { id: true, content: true, quote: true, novelId: true, chapterId: true }
        });

        for (const idea of ideas) {
            await indexIdea(idea);
            ideasIndexed++;
        }

        console.log(`[SearchIndex] Rebuilt index: ${chaptersIndexed} chapters, ${ideasIndexed} ideas`);
    } catch (error) {
        console.error('[SearchIndex] Rebuild failed:', error);
    }

    return { chapters: chaptersIndexed, ideas: ideasIndexed };
}

// Get index statistics
export async function getIndexStats(novelId: string): Promise<{ chapters: number; ideas: number }> {
    try {
        const result = await db.$queryRaw<{ entity_type: string; count: bigint }[]>`
            SELECT entity_type, COUNT(*) as count 
            FROM search_index 
            WHERE novel_id = ${novelId} 
            GROUP BY entity_type;
        `;

        let chapters = 0;
        let ideas = 0;

        result.forEach(r => {
            if (r.entity_type === 'chapter') chapters = Number(r.count);
            if (r.entity_type === 'idea') ideas = Number(r.count);
        });

        return { chapters, ideas };
    } catch (error) {
        console.error('[SearchIndex] Failed to get stats:', error);
        return { chapters: 0, ideas: 0 };
    }
}
