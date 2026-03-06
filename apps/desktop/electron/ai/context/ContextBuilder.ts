import { db } from '@novel-editor/core';
import { ContinueWritingPayload } from '../types';

export interface ContinueWritingContext {
    hardContext: {
        worldSettings: Array<Record<string, unknown>>;
        plotLines: Array<Record<string, unknown>>;
        characters: Array<Record<string, unknown>>;
        items: Array<Record<string, unknown>>;
        maps: Array<Record<string, unknown>>;
    };
    dynamicContext: {
        recentChapters: Array<{ chapterId: string; title: string; excerpt: string }>;
        selectedIdeas: Array<{ ideaId: string; content: string; quote?: string; tags: string[] }>;
        selectedIdeaEntities: Array<{ name: string; kind: 'character' | 'item' | 'worldSetting' }>;
        currentChapterBeforeCursor: string;
        currentLocation?: string;
        narrativeSummaries: Array<{ level: 'volume' | 'novel'; title: string; summaryText: string; keyFacts: string[] }>;
    };
    params: {
        mode: 'new_chapter' | 'continue_chapter';
        contextChapterCount: number;
        targetLength: number;
        style: string;
        tone: string;
        pace: string;
    };
    usedContext: string[];
    warnings: string[];
}

function uniqueArray(values: string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const raw of values) {
        const item = String(raw || '').trim();
        if (!item) continue;
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(item);
    }
    return output;
}

function extractPlainTextFromLexical(content: string): string {
    if (!content?.trim()) return '';
    try {
        const parsed = JSON.parse(content);
        const texts: string[] = [];
        const walk = (node: any) => {
            if (!node || typeof node !== 'object') return;
            if (typeof node.text === 'string') {
                texts.push(node.text);
            }
            if (Array.isArray(node.children)) {
                node.children.forEach(walk);
            }
        };
        walk(parsed?.root || parsed);
        return texts.join(' ').replace(/\s+/g, ' ').trim();
    } catch {
        return content.replace(/\s+/g, ' ').trim();
    }
}

export class ContextBuilder {
    async buildForContinueWriting(payload: ContinueWritingPayload): Promise<ContinueWritingContext> {
        const contextChapterCount = Math.max(1, Math.min(8, payload.contextChapterCount ?? 3));
        const recentRawChapterCount = Math.max(0, Math.min(contextChapterCount, payload.recentRawChapterCount ?? 2));

        const [worldSettings, plotLines, characters, items, maps, recentChapters, currentChapter] = await Promise.all([
            (db as any).worldSetting.findMany({
                where: { novelId: payload.novelId },
                orderBy: { updatedAt: 'desc' },
            }),
            (db as any).plotLine.findMany({
                where: { novelId: payload.novelId },
                include: { points: { include: { anchors: true } } },
                orderBy: { sortOrder: 'asc' },
            }),
            (db as any).character.findMany({
                where: { novelId: payload.novelId },
                select: { name: true, role: true, description: true },
                orderBy: { updatedAt: 'desc' },
                take: 100,
            }),
            (db as any).item.findMany({
                where: { novelId: payload.novelId },
                select: { name: true, type: true, description: true },
                orderBy: { updatedAt: 'desc' },
                take: 100,
            }),
            (db as any).mapCanvas.findMany({
                where: { novelId: payload.novelId },
                select: { name: true, type: true, description: true },
                orderBy: { updatedAt: 'desc' },
                take: 50,
            }),
            db.chapter.findMany({
                where: {
                    id: { not: payload.chapterId },
                    volume: { novelId: payload.novelId },
                },
                select: {
                    id: true,
                    title: true,
                    content: true,
                    updatedAt: true,
                },
                orderBy: { updatedAt: 'desc' },
                take: contextChapterCount,
            }),
            db.chapter.findUnique({
                where: { id: payload.chapterId },
                select: { volumeId: true },
            }),
        ]);
        const requestedIdeaIds = Array.isArray(payload.ideaIds)
            ? payload.ideaIds.map((id) => String(id)).filter(Boolean)
            : [];
        const selectedIdeasRaw = requestedIdeaIds.length > 0
            ? await db.idea.findMany({
                where: {
                    novelId: payload.novelId,
                    id: { in: requestedIdeaIds },
                },
                include: { tags: true },
                orderBy: { updatedAt: 'desc' },
                take: 20,
            })
            : [];

        const recentChapterIds = recentChapters.map((chapter: any) => chapter.id);
        const latestSummaries = recentChapterIds.length > 0
            ? await (db as any).chapterSummary.findMany({
                where: {
                    chapterId: { in: recentChapterIds },
                    isLatest: true,
                    status: 'active',
                },
                orderBy: { updatedAt: 'desc' },
            })
            : [];
        const summaryByChapterId = new Map<string, any>();
        for (const summary of latestSummaries) {
            if (!summaryByChapterId.has(summary.chapterId)) {
                summaryByChapterId.set(summary.chapterId, summary);
            }
        }
        const fallbackCount = { value: 0 };

        const latestNarrativeSummaries = await (db as any).narrativeSummary.findMany({
            where: {
                novelId: payload.novelId,
                isLatest: true,
                status: 'active',
                OR: [
                    { level: 'novel', volumeId: null },
                    ...(currentChapter?.volumeId ? [{ level: 'volume', volumeId: currentChapter.volumeId }] : []),
                ],
            },
            orderBy: { updatedAt: 'desc' },
            take: 2,
        });
        const narrativeSummaries = latestNarrativeSummaries.map((item: any) => {
            let keyFacts: string[] = [];
            if (typeof item.keyFacts === 'string' && item.keyFacts.trim()) {
                try {
                    const parsed = JSON.parse(item.keyFacts);
                    if (Array.isArray(parsed)) {
                        keyFacts = uniqueArray(
                            parsed
                                .map((fact) => String(fact || '').trim())
                                .filter(Boolean)
                                .slice(0, 12),
                        ).slice(0, 5);
                    }
                } catch {
                    keyFacts = [];
                }
            }
            return {
                level: (item.level === 'volume' ? 'volume' : 'novel') as 'volume' | 'novel',
                title: String(item.title || ''),
                summaryText: String(item.summaryText || '').slice(0, 1200),
                keyFacts,
            };
        });

        const recentChapterItems = recentChapters.map((chapter: any, index: number) => ({
            chapterId: chapter.id,
            title: chapter.title || '',
            excerpt: (() => {
                if (index < recentRawChapterCount) {
                    return extractPlainTextFromLexical(chapter.content || '').slice(-1200);
                }
                const summary = summaryByChapterId.get(chapter.id);
                const summaryText = summary?.compressedMemory || summary?.summaryText;
                if (typeof summaryText === 'string' && summaryText.trim()) {
                    return summaryText.slice(-1200);
                }
                fallbackCount.value += 1;
                return extractPlainTextFromLexical(chapter.content || '').slice(-1200);
            })(),
        }));

        const currentChapterBeforeCursor = extractPlainTextFromLexical(payload.currentContent || '').slice(-2400);
        const selectedIdeas = selectedIdeasRaw.map((idea: any) => ({
            ideaId: idea.id,
            content: (idea.content || '').slice(0, 800),
            quote: typeof idea.quote === 'string' ? idea.quote.slice(0, 300) : undefined,
            tags: Array.isArray(idea.tags) ? idea.tags.map((tag: any) => String(tag.name || '').trim()).filter(Boolean).slice(0, 12) : [],
        }));
        const entityIndex = {
            characters: new Set(
                characters
                    .map((item: any) => String(item?.name || '').trim())
                    .filter(Boolean),
            ),
            items: new Set(
                items
                    .map((item: any) => String(item?.name || '').trim())
                    .filter(Boolean),
            ),
            worldSettings: new Set(
                worldSettings
                    .map((item: any) => String(item?.name || '').trim())
                    .filter(Boolean),
            ),
        };
        const entityMatches: Array<{ name: string; kind: 'character' | 'item' | 'worldSetting' }> = [];
        const mentionRegex = /@([^\s@，。！？,!.;；:："'“”‘’()[\]{}<>]+)/g;
        for (const idea of selectedIdeas) {
            const text = `${idea.content || ''}\n${idea.quote || ''}`;
            const hits = Array.from(text.matchAll(mentionRegex));
            for (const hit of hits) {
                const name = String(hit[1] || '').trim();
                if (!name) continue;
                if (entityIndex.characters.has(name)) {
                    entityMatches.push({ name, kind: 'character' });
                } else if (entityIndex.items.has(name)) {
                    entityMatches.push({ name, kind: 'item' });
                } else if (entityIndex.worldSettings.has(name)) {
                    entityMatches.push({ name, kind: 'worldSetting' });
                }
            }
        }
        const selectedIdeaEntities = uniqueArray(entityMatches.map((item) => `${item.kind}:${item.name}`))
            .map((encoded) => {
                const [kind, ...nameRest] = encoded.split(':');
                const name = nameRest.join(':');
                return {
                    name,
                    kind: (kind === 'character' || kind === 'item' || kind === 'worldSetting')
                        ? kind
                        : 'character',
                } as { name: string; kind: 'character' | 'item' | 'worldSetting' };
            })
            .slice(0, 20);
        const currentLocation = String(payload.currentLocation || '').trim().slice(0, 120);
        const missingIdeaCount = Math.max(0, requestedIdeaIds.length - selectedIdeas.length);
        const warnings: string[] = [];
        if (fallbackCount.value > 0) {
            warnings.push(`${fallbackCount.value} chapter summaries missing; fell back to chapter text excerpts.`);
        }
        if (missingIdeaCount > 0) {
            warnings.push(`${missingIdeaCount} selected ideas not found; ignored.`);
        }

        return {
            hardContext: {
                worldSettings,
                plotLines,
                characters,
                items,
                maps,
            },
            dynamicContext: {
                recentChapters: recentChapterItems,
                selectedIdeas,
                selectedIdeaEntities,
                currentChapterBeforeCursor,
                ...(currentLocation ? { currentLocation } : {}),
                narrativeSummaries,
            },
            params: {
                mode: payload.mode === 'new_chapter' ? 'new_chapter' : 'continue_chapter',
                contextChapterCount,
                style: payload.style || 'default',
                tone: payload.tone || 'balanced',
                pace: payload.pace || 'medium',
                targetLength: payload.targetLength ?? 500,
            },
            usedContext: [
                'world_settings_full',
                'plot_outline_full',
                'characters_items_maps_snapshot',
                `recent_chapter_summary_memory_preferred_${contextChapterCount}`,
                `recent_chapter_raw_text_${recentRawChapterCount}`,
                narrativeSummaries.length > 0 ? `narrative_summaries_${narrativeSummaries.length}` : 'narrative_summaries_0',
                selectedIdeas.length > 0 ? `selected_ideas_${selectedIdeas.length}` : 'selected_ideas_0',
                selectedIdeaEntities.length > 0 ? `selected_idea_entities_${selectedIdeaEntities.length}` : 'selected_idea_entities_0',
                ...(currentLocation ? ['current_location'] : []),
                'current_chapter_before_cursor',
            ],
            warnings,
        };
    }
}
