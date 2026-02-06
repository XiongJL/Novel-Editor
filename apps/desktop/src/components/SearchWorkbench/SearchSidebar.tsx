import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Search, X, Lightbulb, RefreshCw, Loader2, Library, ChevronRight, ChevronDown, FileText } from 'lucide-react';
import { formatNumber } from '../../utils/format';

interface SearchSidebarProps {
    theme: 'dark' | 'light';
    novelId: string;
    onClose?: () => void;
    onJumpToChapter?: (chapterId: string, keyword: string, context?: string) => void;
    onJumpToIdea?: (ideaId: string) => void;
    onSearchChange?: (keyword: string) => void; // Notify parent when search changes
}

export default function SearchSidebar({
    theme,
    novelId,
    onClose,
    onJumpToChapter,
    onJumpToIdea,
    onSearchChange
}: SearchSidebarProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isRebuilding, setIsRebuilding] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [offset, setOffset] = useState(0);
    const [tooltipData, setTooltipData] = useState<{ content: string; x: number; y: number } | null>(null);
    const [novelFormatting, setNovelFormatting] = useState<string>('');
    const [collapsedVolumes, setCollapsedVolumes] = useState<Set<string>>(new Set());
    const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(new Set());
    const [collapsedChapterGroup, setCollapsedChapterGroup] = useState(false);
    const [collapsedIdeas, setCollapsedIdeas] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const LIMIT = 20;

    // Reset state when novelId changes
    useEffect(() => {
        setSearchQuery('');
        setResults([]);
        setOffset(0);
        setHasMore(false);
        setCollapsedVolumes(new Set());
        setCollapsedChapters(new Set());
        setCollapsedChapterGroup(false);
        setCollapsedIdeas(false);

        // Fetch novel formatting
        const fetchNovel = async () => {
            if (!novelId) return;
            try {
                const novels = await window.db.getNovels();
                const currentNovel = novels.find(n => n.id === novelId);
                if (currentNovel) {
                    setNovelFormatting(currentNovel.formatting || '');
                }
            } catch (e) {
                console.error('Failed to fetch novel formatting:', e);
            }
        };
        fetchNovel();
    }, [novelId]);

    // Check index status on mount
    useEffect(() => {
        const checkIndex = async () => {
            if (!novelId) return;
            try {
                const status = await window.db.checkIndexStatus(novelId);
                // If there are chapters but no indexed chapters, trigger rebuild
                if (status.totalChapters > 0 && status.indexedChapters === 0) {
                    console.log('[SearchSidebar] Index missing, triggering rebuild...');
                    setIsRebuilding(true);
                    await window.db.rebuildSearchIndex(novelId);
                    setIsRebuilding(false);
                    // Re-search if query exists
                    if (searchQuery.trim()) {
                        performSearch(searchQuery, true);
                    }
                }
            } catch (e) {
                console.error('Failed to check index status:', e);
            }
        };
        checkIndex();
    }, [novelId, searchQuery]);

    // Debounced search
    const performSearch = useCallback(async (query: string, newSearch: boolean = true) => {
        if (!query.trim()) {
            setResults([]);
            setHasMore(false);
            return;
        }

        if (newSearch) {
            setCollapsedVolumes(new Set());
            setCollapsedChapters(new Set());
            setCollapsedChapterGroup(false);
            setCollapsedIdeas(false);
        }

        const currentOffset = newSearch ? 0 : offset;
        setIsLoading(true);

        try {
            const searchResults = await window.db.search({
                novelId,
                keyword: query.trim(),
                limit: LIMIT,
                offset: currentOffset
            });

            if (newSearch) {
                setResults(searchResults);
                setOffset(LIMIT);
            } else {
                setResults(prev => [...prev, ...searchResults]);
                setOffset(prev => prev + LIMIT);
            }

            setHasMore(searchResults.length === LIMIT);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setIsLoading(false);
        }
    }, [novelId, offset, setCollapsedVolumes, setCollapsedChapters, setCollapsedIdeas]);

    // Handle input change with debounce
    const handleInputChange = useCallback((value: string) => {
        setSearchQuery(value);
        onSearchChange?.(value); // Notify parent

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            performSearch(value, true);
        }, 300);
    }, [performSearch, onSearchChange]);

    // Rebuild index
    const handleRebuildIndex = async () => {
        setIsRebuilding(true);
        try {
            const result = await window.db.rebuildSearchIndex(novelId);
            console.log('Index rebuilt:', result);
            // Re-search if there's a query
            if (searchQuery.trim()) {
                await performSearch(searchQuery, true);
            }
        } catch (error) {
            console.error('Rebuild failed:', error);
        } finally {
            setIsRebuilding(false);
        }
    };

    const toggleVolumeCollapse = (volId: string) => {
        setCollapsedVolumes(prev => {
            const next = new Set(prev);
            if (next.has(volId)) next.delete(volId);
            else next.add(volId);
            return next;
        });
    };

    const toggleChapterCollapse = (chapId: string) => {
        setCollapsedChapters(prev => {
            const next = new Set(prev);
            if (next.has(chapId)) next.delete(chapId);
            else next.add(chapId);
            return next;
        });
    };

    // Group results by Volume -> Chapter -> Matches
    const groupedResults = useMemo(() => {
        const ideas = results.filter(r => r.entityType === 'idea');
        const chapterRelated = results.filter(r => r.entityType === 'chapter');

        // Nest into Volume -> Chapter
        const nestedMap = chapterRelated.reduce((acc, curr) => {
            const volId = curr.volumeId || 'default';
            if (!acc[volId]) {
                acc[volId] = {
                    volumeId: curr.volumeId,
                    volumeTitle: curr.volumeTitle,
                    volumeOrder: curr.volumeOrder,
                    isVolumeMatch: false,
                    chapters: {}
                };
            }

            // Flag volume match and skip redundant match entry
            if (curr.matchType === 'volume') {
                acc[volId].isVolumeMatch = true;
                return acc;
            }

            if (!acc[volId].chapters[curr.chapterId]) {
                acc[volId].chapters[curr.chapterId] = {
                    chapterId: curr.chapterId,
                    title: curr.title,
                    chapterOrder: curr.chapterOrder,
                    isTitleMatch: false,
                    matches: []
                };
            }

            // Flag title match and skip redundant match entry
            if (curr.matchType === 'title') {
                acc[volId].chapters[curr.chapterId].isTitleMatch = true;
                return acc;
            }

            acc[volId].chapters[curr.chapterId].matches.push(curr);
            return acc;
        }, {} as any);

        // Sort volumes by volumeOrder
        const sortedVolumes = Object.values(nestedMap).sort((a: any, b: any) => (a.volumeOrder || 0) - (b.volumeOrder || 0));

        // In each volume, sort chapters by chapterOrder
        sortedVolumes.forEach((v: any) => {
            v.sortedChapterList = Object.values(v.chapters).sort((a: any, b: any) => (a.chapterOrder || 0) - (b.chapterOrder || 0));
        });

        return { volumes: sortedVolumes, ideas };
    }, [results]);

    const totalChaptersFound = groupedResults.volumes.reduce((acc, vol: any) => acc + vol.sortedChapterList.length, 0);

    // Handle result click
    const handleResultClick = (result: SearchResult) => {
        if (result.entityType === 'chapter' && onJumpToChapter) {
            // Strip any HTML tags from snippet to use as context
            const context = result.snippet ? result.snippet.replace(/<[^>]+>/g, '') : undefined;
            onJumpToChapter(result.chapterId, result.keyword, context);
        } else if (result.entityType === 'idea' && onJumpToIdea) {
            onJumpToIdea(result.entityId);
        }
    };

    const handleMouseEnter = (e: React.MouseEvent, content: string) => {
        if (!content) return;
        setTooltipData({
            content: content.replace(/<[^>]+>/g, ''), // Strip HTML
            x: e.clientX + 10,
            y: e.clientY + 10
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (tooltipData) {
            setTooltipData(prev => prev ? { ...prev, x: e.clientX + 10, y: e.clientY + 10 } : null);
        }
    };

    const handleMouseLeave = () => {
        setTooltipData(null);
    };

    // Render snippet with highlighting
    const renderSnippet = (snippet: string) => {
        return (
            <span
                dangerouslySetInnerHTML={{ __html: snippet }}
                className={clsx(
                    isDark ? "text-neutral-400" : "text-neutral-600",
                    "[&>mark]:bg-yellow-500/30 [&>mark]:text-current [&>mark]:rounded-sm [&>mark]:px-0.5"
                )}
            />
        );
    };

    return (
        <div className={clsx(
            "flex flex-col h-full w-full",
            isDark ? "bg-[#0F0F13]" : "bg-gray-50"
        )}>
            {/* Header */}
            <div className={clsx(
                "p-4 border-b flex items-center justify-between",
                isDark ? "border-white/5" : "border-gray-200"
            )}>
                <span className={clsx(
                    "text-xs font-bold uppercase tracking-wider",
                    isDark ? "text-neutral-500" : "text-neutral-400"
                )}>
                    {t('sidebar.search', 'Search')}
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleRebuildIndex}
                        disabled={isRebuilding}
                        className={clsx(
                            "p-1 rounded transition-colors",
                            isDark ? "hover:bg-white/10 text-neutral-400" : "hover:bg-black/5 text-neutral-500",
                            isRebuilding && "opacity-50 cursor-not-allowed"
                        )}
                        title={t('search.rebuildIndex', 'Rebuild Index')}
                    >
                        <RefreshCw className={clsx("w-4 h-4", isRebuilding && "animate-spin")} />
                    </button>
                    {onClose && (
                        <button onClick={onClose} className={clsx("p-1 rounded", isDark ? "hover:bg-white/10" : "hover:bg-black/5")}>
                            <X className="w-4 h-4 opacity-50" />
                        </button>
                    )}
                </div>
            </div>

            {/* Search Input */}
            <div className="p-4">
                <div className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors border",
                    isDark
                        ? "bg-black/20 border-white/10 text-white focus-within:border-white/20"
                        : "bg-white border-gray-200 text-neutral-900 focus-within:border-gray-300"
                )}>
                    <Search className={clsx("w-4 h-4", isDark ? "text-neutral-500" : "text-neutral-400")} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleInputChange(e.target.value)}
                        placeholder={t('search.placeholder', 'Search chapters and ideas...')}
                        className="bg-transparent border-none outline-none w-full text-sm placeholder-opacity-50"
                        autoFocus
                    />
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin opacity-50" />}
                </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
                {/* No results message */}
                {searchQuery.trim() && !isLoading && results.length === 0 && (
                    <div className={clsx(
                        "text-center py-8 text-sm",
                        isDark ? "text-neutral-500" : "text-neutral-400"
                    )}>
                        {t('search.noResults', 'No results found')}
                    </div>
                )}

                {/* Volumes & Chapters Grouped */}
                {/* Chapters Group */}
                {groupedResults.volumes.length > 0 && (
                    <div className="pt-2">
                        <div
                            className={clsx(
                                "flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-3 cursor-pointer group hover:opacity-80 transition-colors select-none",
                                isDark ? "text-neutral-500" : "text-neutral-400"
                            )}
                            onClick={() => setCollapsedChapterGroup(!collapsedChapterGroup)}
                        >
                            <ChevronDown className={clsx(
                                "w-3 h-3 transition-transform opacity-50",
                                collapsedChapterGroup && "-rotate-90"
                            )} />
                            <FileText className="w-3.5 h-3.5" />
                            <span>{t('search.chapters')} ({totalChaptersFound})</span>
                        </div>

                        {!collapsedChapterGroup && (
                            <div className="space-y-6">
                                {groupedResults.volumes.map((vol: any) => {
                                    const formatConfig = novelFormatting ? JSON.parse(novelFormatting) : {};
                                    const volFormat = formatConfig.volume || '第 {n} 卷';
                                    const chapFormat = formatConfig.chapter || '第 {n} 章';
                                    const volId = vol.volumeId || 'default';
                                    const isVolCollapsed = collapsedVolumes.has(volId);

                                    return (
                                        <div key={volId} className="space-y-3">
                                            {/* Volume Header */}
                                            <div
                                                className={clsx(
                                                    "flex items-center gap-2 text-xs font-bold mb-1 p-1 rounded-md transition-colors cursor-pointer group select-none",
                                                    isDark
                                                        ? "text-amber-500/80 hover:bg-white/5"
                                                        : "text-amber-700/80 hover:bg-black/5",
                                                    vol.isVolumeMatch && (isDark ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200")
                                                )}
                                                onClick={() => toggleVolumeCollapse(volId)}
                                            >
                                                <button className="p-0.5 rounded hover:bg-black/10">
                                                    {isVolCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                </button>
                                                <Library className="w-3.5 h-3.5" />
                                                <span className="flex-1 truncate">
                                                    {vol.volumeOrder ? formatNumber(volFormat, vol.volumeOrder) : ''}
                                                    {vol.volumeTitle ? ` ${vol.volumeTitle}` : ''}
                                                </span>
                                            </div>

                                            {/* Chapters inside this volume */}
                                            {!isVolCollapsed && (
                                                <div className="space-y-3 pl-2 border-l border-white/5">
                                                    {vol.sortedChapterList.map((chap: any) => {
                                                        const isChapCollapsed = collapsedChapters.has(chap.chapterId);
                                                        return (
                                                            <div key={chap.chapterId} className={clsx(
                                                                "rounded-lg overflow-hidden border transition-all",
                                                                isDark ? "border-white/5 bg-white/5" : "border-gray-200 bg-white",
                                                                chap.isTitleMatch && (isDark ? "ring-1 ring-amber-500/30 bg-amber-500/5" : "ring-1 ring-amber-200 bg-amber-50")
                                                            )}>
                                                                {/* Chapter Title Header */}
                                                                <div
                                                                    className={clsx(
                                                                        "px-3 py-2 text-xs font-semibold border-b flex items-center gap-2 cursor-pointer group hover:bg-opacity-80 transition-colors select-none",
                                                                        isDark ? "border-white/5 text-neutral-300 hover:bg-white/5" : "border-gray-100 text-neutral-700 hover:bg-gray-50",
                                                                        chap.isTitleMatch && (isDark ? "text-amber-400" : "text-amber-900")
                                                                    )}
                                                                    onClick={() => toggleChapterCollapse(chap.chapterId)}
                                                                >
                                                                    <ChevronDown className={clsx(
                                                                        "w-3 h-3 transition-transform opacity-50",
                                                                        isChapCollapsed && "-rotate-90"
                                                                    )} />
                                                                    <span className="opacity-70">
                                                                        {chap.chapterOrder ? formatNumber(chapFormat, chap.chapterOrder) : ''}
                                                                    </span>
                                                                    <span className="truncate flex-1">
                                                                        {chap.title || t('search.untitled', 'Untitled')}
                                                                    </span>
                                                                    <span className="text-[10px] opacity-40 font-normal">
                                                                        {chap.matches.length}
                                                                    </span>
                                                                </div>

                                                                {/* Matches */}
                                                                {!isChapCollapsed && chap.matches.length > 0 && (
                                                                    <div className="divide-y divide-gray-100/10">
                                                                        {chap.matches.map((result: SearchResult, idx: number) => (
                                                                            <button
                                                                                key={`${result.entityId}-${idx}`}
                                                                                onClick={() => handleResultClick(result)}
                                                                                className={clsx(
                                                                                    "w-full text-left px-3 py-2 transition-colors",
                                                                                    isDark
                                                                                        ? "hover:bg-white/5"
                                                                                        : "hover:bg-gray-50"
                                                                                )}
                                                                                onMouseEnter={(e) => handleMouseEnter(e, result.preview || result.snippet)}
                                                                                onMouseMove={handleMouseMove}
                                                                                onMouseLeave={handleMouseLeave}
                                                                            >
                                                                                <div className={clsx(
                                                                                    "line-clamp-2 leading-relaxed text-[10.5px]",
                                                                                    isDark ? "text-neutral-400" : "text-neutral-500"
                                                                                )}>
                                                                                    {renderSnippet(result.snippet)}
                                                                                </div>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Ideas Group */}
                {groupedResults.ideas.length > 0 && (
                    <div className="pt-2">
                        <div
                            className={clsx(
                                "flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2 cursor-pointer group hover:opacity-80 transition-colors select-none",
                                isDark ? "text-neutral-500" : "text-neutral-400"
                            )}
                            onClick={() => setCollapsedIdeas(!collapsedIdeas)}
                        >
                            <ChevronDown className={clsx(
                                "w-3 h-3 transition-transform opacity-50",
                                collapsedIdeas && "-rotate-90"
                            )} />
                            <Lightbulb className="w-3.5 h-3.5" />
                            <span>{t('search.ideas', 'Ideas')} ({groupedResults.ideas.length})</span>
                        </div>

                        {!collapsedIdeas && (
                            <div className="space-y-1">
                                {groupedResults.ideas.map((result: any) => (
                                    <button
                                        key={result.entityId}
                                        onClick={() => handleResultClick(result)}
                                        className={clsx(
                                            "w-full text-left p-3 rounded-lg transition-all border",
                                            isDark
                                                ? "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20"
                                                : "bg-purple-50 hover:bg-purple-100 border-purple-200"
                                        )}
                                        onMouseEnter={(e) => handleMouseEnter(e, result.preview || result.snippet)}
                                        onMouseMove={handleMouseMove}
                                        onMouseLeave={handleMouseLeave}
                                    >
                                        <div
                                            className={clsx(
                                                "line-clamp-2 text-[10.5px]",
                                                isDark ? "text-neutral-300" : "text-neutral-600"
                                            )}
                                        >
                                            {renderSnippet(result.snippet)}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Load More */}
                {hasMore && (
                    <button
                        onClick={() => performSearch(searchQuery, false)}
                        disabled={isLoading}
                        className={clsx(
                            "w-full py-2 text-sm rounded-lg transition-colors",
                            isDark
                                ? "text-neutral-400 hover:text-white hover:bg-white/5"
                                : "text-neutral-500 hover:text-neutral-900 hover:bg-gray-100"
                        )}
                    >
                        {isLoading ? t('common.loading', 'Loading...') : t('search.loadMore', 'Load more')}
                    </button>
                )}

                {/* Empty state */}
                {!searchQuery.trim() && (
                    <div className={clsx(
                        "flex flex-col items-center justify-center py-12 text-center space-y-2",
                        isDark ? "text-neutral-500" : "text-neutral-400"
                    )}>
                        <Search className="w-8 h-8 opacity-30" />
                        <p className="text-sm">{t('search.hint', 'Enter keywords to search')}</p>
                    </div>
                )}
            </div>
            {/* Portal Tooltip */}
            {tooltipData && createPortal(
                <div
                    className={clsx(
                        "fixed z-[9999] px-3 py-2 rounded shadow-lg max-w-xs text-xs pointer-events-none transition-opacity",
                        isDark
                            ? "bg-neutral-800 text-neutral-200 border border-white/10"
                            : "bg-white text-neutral-700 border border-gray-200"
                    )}
                    style={{
                        top: tooltipData.y,
                        left: Math.min(tooltipData.x, window.innerWidth - 320) // Prevent overflow right
                    }}
                >
                    <div className="leading-relaxed whitespace-pre-wrap">{tooltipData.content}</div>
                </div>,
                document.body
            )}
        </div>
    );
}
