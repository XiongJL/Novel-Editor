import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { BookOpen, Clock, ScrollText, Search } from 'lucide-react';
import { CharacterTimelineEntry } from '../../types';

interface CharacterTimelineProps {
    characterId: string;
    theme: 'dark' | 'light';
}

type TimelineMode = 'chapters' | 'story';

export default function CharacterTimeline({ characterId, theme }: CharacterTimelineProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const [mode, setMode] = useState<TimelineMode>('chapters');
    const [chapterEntries, setChapterEntries] = useState<CharacterTimelineEntry[]>([]);
    const [storyEntries, setStoryEntries] = useState<CharacterTimelineEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadChapterAppearances = useCallback(async () => {
        try {
            const data = await window.db.getCharacterChapterAppearances(characterId);
            setChapterEntries(data);
        } catch (e) {
            console.error('Failed to load chapter appearances:', e);
        }
    }, [characterId]);

    const loadStoryTimeline = useCallback(async () => {
        try {
            const data = await window.db.getCharacterTimeline(characterId);
            setStoryEntries(data);
        } catch (e) {
            console.error('Failed to load story timeline:', e);
        }
    }, [characterId]);

    useEffect(() => {
        setIsLoading(true);
        Promise.all([loadChapterAppearances(), loadStoryTimeline()]).finally(() => setIsLoading(false));
    }, [loadChapterAppearances, loadStoryTimeline]);

    const entries = mode === 'chapters' ? chapterEntries : storyEntries;

    if (isLoading) {
        return (
            <div className={clsx("flex items-center justify-center py-12", isDark ? "text-neutral-600" : "text-neutral-400")}>
                <Clock className="w-4 h-4 animate-spin mr-2" />
                <span className="text-xs">{t('common.loading')}</span>
            </div>
        );
    }

    // Group by volume
    const grouped = entries.reduce<Record<string, CharacterTimelineEntry[]>>((acc, entry) => {
        const key = entry.volumeTitle;
        if (!acc[key]) acc[key] = [];
        acc[key].push(entry);
        return acc;
    }, {});

    return (
        <div className="min-h-full">
            {/* Sticky Header */}
            <div className={clsx(
                "sticky top-0 z-10 px-6 py-3 border-b",
                isDark ? "bg-[#1a1a20] border-white/5" : "bg-white border-gray-100"
            )}>
                <div className={clsx("flex rounded-lg p-0.5", isDark ? "bg-white/5" : "bg-gray-100")}>
                    <button
                        onClick={() => setMode('chapters')}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-md transition-all",
                            mode === 'chapters'
                                ? (isDark ? "bg-indigo-500/20 text-indigo-300 shadow-sm" : "bg-white text-indigo-600 shadow-sm")
                                : (isDark ? "text-neutral-500 hover:text-neutral-300" : "text-neutral-400 hover:text-neutral-600")
                        )}
                    >
                        <Search className="w-3 h-3" />
                        {t('world.chapterLine', '章节线')}
                        {chapterEntries.length > 0 && (
                            <span className={clsx("text-[10px] px-1 rounded", isDark ? "bg-white/10" : "bg-gray-200")}>{chapterEntries.length}</span>
                        )}
                    </button>
                    <button
                        onClick={() => setMode('story')}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium rounded-md transition-all",
                            mode === 'story'
                                ? (isDark ? "bg-indigo-500/20 text-indigo-300 shadow-sm" : "bg-white text-indigo-600 shadow-sm")
                                : (isDark ? "text-neutral-500 hover:text-neutral-300" : "text-neutral-400 hover:text-neutral-600")
                        )}
                    >
                        <ScrollText className="w-3 h-3" />
                        {t('world.storyTimeline', '故事性生平')}
                        {storyEntries.length > 0 && (
                            <span className={clsx("text-[10px] px-1 rounded", isDark ? "bg-white/10" : "bg-gray-200")}>{storyEntries.length}</span>
                        )}
                    </button>
                </div>
            </div>

            <div className="p-6 space-y-3">
                {/* Empty State */}
                {entries.length === 0 ? (
                    <div className={clsx("text-center py-8", isDark ? "text-neutral-600" : "text-neutral-400")}>
                        <BookOpen className="w-7 h-7 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">
                            {mode === 'chapters'
                                ? t('world.noChapterAppearances', '该角色未在任何章节中出现')
                                : t('world.noTimeline', '暂无故事性生平记录')
                            }
                        </p>
                        <p className="text-[10px] mt-1 opacity-60">
                            {mode === 'chapters'
                                ? t('world.noChapterAppearancesHint', '角色名称出现在章节正文中时自动标记')
                                : t('world.noTimelineHint', '在情节要点中使用 @提及 该角色后自动生成')
                            }
                        </p>
                    </div>
                ) : (
                    /* Timeline Items grouped by volume */
                    Object.entries(grouped).map(([volumeTitle, volumeEntries]) => (
                        <div key={volumeTitle}>
                            {/* Volume Header */}
                            <div className={clsx("text-[10px] font-medium uppercase tracking-wider px-1 mb-2", isDark ? "text-neutral-500" : "text-neutral-400")}>
                                {volumeTitle}
                            </div>

                            {/* Timeline Items */}
                            <div className="relative pl-4">
                                {/* Vertical line */}
                                <div className={clsx(
                                    "absolute left-[7px] top-2 bottom-2 w-px",
                                    isDark ? "bg-white/10" : "bg-gray-200"
                                )} />

                                <div className="space-y-2">
                                    {volumeEntries.map((entry, i) => (
                                        <div key={`${entry.chapterId}-${i}`} className="relative flex items-start gap-3">
                                            {/* Dot */}
                                            <div className={clsx(
                                                "absolute -left-4 top-2 w-2 h-2 rounded-full ring-2 flex-shrink-0",
                                                isDark
                                                    ? "bg-indigo-400 ring-[#0F0F13]"
                                                    : "bg-indigo-500 ring-gray-50"
                                            )} />

                                            {/* Content */}
                                            <div className={clsx(
                                                "flex-1 rounded-lg px-3 py-2 transition-colors",
                                                isDark ? "hover:bg-white/5" : "hover:bg-black/5"
                                            )}>
                                                <div className={clsx("text-xs font-medium", isDark ? "text-neutral-200" : "text-neutral-700")}>
                                                    {entry.chapterTitle}
                                                </div>
                                                {entry.snippet && (
                                                    <p className={clsx("text-[11px] mt-1 leading-relaxed", isDark ? "text-neutral-500" : "text-neutral-400")}>
                                                        {entry.snippet}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
