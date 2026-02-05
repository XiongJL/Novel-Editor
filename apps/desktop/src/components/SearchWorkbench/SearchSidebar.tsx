import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Search, X, FileText, Lightbulb, RefreshCw, Loader2 } from 'lucide-react';

interface SearchSidebarProps {
    theme: 'dark' | 'light';
    novelId: string;
    onClose?: () => void;
    onJumpToChapter?: (chapterId: string, keyword: string) => void;
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
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const LIMIT = 20;

    // Reset state when novelId changes
    useEffect(() => {
        setSearchQuery('');
        setResults([]);
        setOffset(0);
        setHasMore(false);
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
    }, [novelId, searchQuery]); // Depend on searchQuery? No, just novelId. But to re-run? Just on mount/change.

    // Debounced search
    const performSearch = useCallback(async (query: string, newSearch: boolean = true) => {
        if (!query.trim()) {
            setResults([]);
            setHasMore(false);
            return;
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
    }, [novelId, offset]);

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

    // Group results by type and then by chapter
    const groupedResults = useMemo(() => {
        const chapters = results.filter(r => r.entityType === 'chapter');
        // Group chapters by chapterId
        const chaptersdByMap = chapters.reduce((acc, curr) => {
            if (!acc[curr.chapterId]) {
                acc[curr.chapterId] = [];
            }
            acc[curr.chapterId].push(curr);
            return acc;
        }, {} as Record<string, SearchResult[]>);

        const ideas = results.filter(r => r.entityType === 'idea');
        return { chapters: chaptersdByMap, ideas };
    }, [results]);

    // Handle result click
    const handleResultClick = (result: SearchResult) => {
        if (result.entityType === 'chapter' && onJumpToChapter) {
            onJumpToChapter(result.chapterId, result.keyword);
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
        // snippet contains <mark>...</mark> tags from FTS5
        return (
            <span
                dangerouslySetInnerHTML={{ __html: snippet }}
                className={clsx(
                    // Inherit font size from parent
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
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
                {/* No results message */}
                {searchQuery.trim() && !isLoading && results.length === 0 && (
                    <div className={clsx(
                        "text-center py-8 text-sm",
                        isDark ? "text-neutral-500" : "text-neutral-400"
                    )}>
                        {t('search.noResults', 'No results found')}
                    </div>
                )}

                {/* Chapters Group */}
                {Object.keys(groupedResults.chapters).length > 0 && (
                    <div>
                        <div className={clsx(
                            "flex items-center gap-2 text-xs font-medium mb-2",
                            isDark ? "text-neutral-400" : "text-neutral-500"
                        )}>
                            <FileText className="w-3.5 h-3.5" />
                            <span>{t('search.chapters', 'Chapters')} ({Object.values(groupedResults.chapters).flat().length})</span>
                        </div>
                        <div className="space-y-3">
                            {Object.entries(groupedResults.chapters).map(([chapterId, chapterResults]) => (
                                <div key={chapterId} className={clsx(
                                    "rounded-lg overflow-hidden border",
                                    isDark ? "border-white/5 bg-white/5" : "border-gray-200 bg-white"
                                )}>
                                    {/* Chapter Title Header */}
                                    <div className={clsx(
                                        "px-3 py-2 text-xs font-semibold border-b",
                                        isDark ? "border-white/5 text-neutral-300" : "border-gray-100 text-neutral-700"
                                    )}>
                                        {chapterResults[0]?.title || t('search.untitled', 'Untitled')}
                                    </div>

                                    {/* Matches */}
                                    <div className="divide-y divide-gray-100/10">
                                        {chapterResults.map((result, idx) => (
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
                                            </button>))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Ideas Group */}
                {groupedResults.ideas.length > 0 && (
                    <div>
                        <div className={clsx(
                            "flex items-center gap-2 text-xs font-medium mb-2",
                            isDark ? "text-neutral-400" : "text-neutral-500"
                        )}>
                            <Lightbulb className="w-3.5 h-3.5" />
                            <span>{t('search.ideas', 'Ideas')} ({groupedResults.ideas.length})</span>
                        </div>
                        <div className="space-y-1">
                            {groupedResults.ideas.map((result) => (
                                <button
                                    key={result.entityId}
                                    onClick={() => handleResultClick(result)}
                                    className={clsx(
                                        "w-full text-left p-3 rounded-lg transition-all",
                                        isDark
                                            ? "bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20"
                                            : "bg-purple-50 hover:bg-purple-100 border border-purple-200"
                                    )}
                                >
                                    <div
                                        className={clsx(
                                            "line-clamp-2 text-[10.5px]",
                                            isDark ? "text-neutral-300" : "text-neutral-600"
                                        )}
                                        onMouseEnter={(e) => handleMouseEnter(e, result.preview || result.snippet)}
                                        onMouseMove={handleMouseMove}
                                        onMouseLeave={handleMouseLeave}
                                    >
                                        {renderSnippet(result.snippet)}
                                    </div>
                                </button>
                            ))}
                        </div>
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
