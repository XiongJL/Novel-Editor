import React, { useState, useEffect, useMemo, memo, useRef } from 'react';
import { usePlotSystem } from '../../hooks/usePlotSystem';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { LayoutGrid, Loader2, HelpCircle, Flag, Sparkles, CircleDot, Check } from 'lucide-react';
import { Chapter, PlotLine, PlotPoint, Volume } from '../../types'; // Assuming global types
import { formatNumber } from '../../utils/format';
import { EntityInfoCard } from './EntityInfoCard';
import { ICON_MAP } from '../ui/IconPicker';

/**
 * 渲染带 Mention 样式的纯文本描述
 */
const PlotPointDescription = ({ text, isDark, onMentionClick }: { text: string, isDark: boolean, onMentionClick: (name: string, pos: { top: number, left: number }) => void }) => {
    // Regex for mentions like @Name. Using non-greedy and non-whitespace match.
    const mentionRegex = /(@[^\s@]+)/g;
    const parts = text.split(mentionRegex);

    return (
        <div className="text-[10px] opacity-70 line-clamp-3 leading-tight mt-1 whitespace-pre-wrap">
            {parts.map((part, i) => {
                if (part.startsWith('@')) {
                    const name = part.slice(1);
                    return (
                        <span
                            key={i}
                            onClick={(e) => {
                                e.stopPropagation();
                                onMentionClick(name, { top: e.clientY, left: e.clientX });
                            }}
                            className={clsx(
                                "inline-flex items-center px-1 py-0.5 rounded-[4px] text-[9px] font-medium mx-0.5 align-baseline transition-all cursor-pointer",
                                isDark
                                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 shadow-sm shadow-black/5"
                                    : "bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm shadow-gray-200/50",
                                "hover:scale-105 active:scale-95 hover:brightness-110"
                            )}
                        >
                            <span className="opacity-40 mr-0.5 text-[8px]">@</span>
                            {name}
                        </span>
                    );
                }
                return part;
            })}
        </div>
    );
};

interface NarrativeMatrixProps {
    novelId: string;
    theme: 'dark' | 'light';
    activeChapterId?: string | null;
    volumes?: Volume[];
    formatting?: string;
    // New: Pass external state to ensure sync
    plotLines?: PlotLine[];
    isPlotLoading?: boolean;
    recentFiles?: { id: string; title: string; timestamp: number }[];
}

type DisplayRow =
    | { type: 'single'; chapter: Chapter; index: number; isRecent?: boolean }
    | { type: 'aggregate'; chapters: Chapter[]; startIndex: number; endIndex: number };

export default function NarrativeMatrix({ novelId, theme, activeChapterId, volumes, formatting, plotLines: externalPlotLines, isPlotLoading: externalIsPlotLoading, recentFiles }: NarrativeMatrixProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    // 1. Data hooks - Only use local if external is not provided
    const localPlotSystem = usePlotSystem(novelId);

    const plotLines = externalPlotLines || localPlotSystem.plotLines;
    const isPlotLoading = externalIsPlotLoading !== undefined ? externalIsPlotLoading : localPlotSystem.isLoading;

    // 2. Local State
    const [fetchedChapters, setFetchedChapters] = useState<Chapter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTransposed, setIsTransposed] = useState(false);
    const [visibleLineIds, setVisibleLineIds] = useState<Set<string>>(new Set());
    const hasInitializedRef = useRef(false);

    // Initialize visibleLineIds when plotLines load
    useEffect(() => {
        if (plotLines.length > 0 && !hasInitializedRef.current) {
            setVisibleLineIds(new Set(plotLines.map(l => l.id)));
            hasInitializedRef.current = true;
        }
    }, [plotLines]);

    // --- Entity Dossier States ---
    const [activeEntity, setActiveEntity] = useState<any>(null);
    const [entityType, setEntityType] = useState<'character' | 'item'>('character');
    const [entityPosition, setEntityPosition] = useState<{ top: number; left: number } | null>(null);

    // Auto-close EntityInfoCard when clicking elsewhere
    useEffect(() => {
        if (!activeEntity) return;
        const handleCardBlur = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Close if click is not on card and not on a mention badge (which has specific classes or attributes)
            // Mentions in matrix have 'cursor-pointer' and specific styles
            const isMention = target.closest('.cursor-pointer');
            const isCard = target.closest('.entity-info-card');

            if (!isCard && !isMention) {
                setActiveEntity(null);
            }
        };
        document.addEventListener('mousedown', handleCardBlur);
        return () => document.removeEventListener('mousedown', handleCardBlur);
    }, [activeEntity]);

    const handleMentionClick = async (name: string, pos: { top: number, left: number }) => {
        try {
            // First find basic info to know the type and ID
            const chars = await window.db.getCharacters(novelId);
            const items = await window.db.getItems(novelId);

            const targetChar = chars.find((c: any) => c.name === name);
            const targetItem = items.find((i: any) => i.name === name);

            if (targetChar) {
                const fullData = await window.db.getCharacter(targetChar.id);
                setActiveEntity(fullData);
                setEntityType('character');
                setEntityPosition(pos);
            } else if (targetItem) {
                const fullData = await window.db.getItem(targetItem.id);
                setActiveEntity(fullData);
                setEntityType('item');
                setEntityPosition(pos);
            }
        } catch (err) {
            console.error('Failed to handle mention click:', err);
        }
    };

    const visiblePlotLines = useMemo(() => {
        return plotLines.filter(line => visibleLineIds.has(line.id));
    }, [plotLines, visibleLineIds]);

    // Parse chapter format from settings
    const chapterFormat = useMemo(() => {
        try {
            const parsed = JSON.parse(formatting || '{}');
            return parsed.chapter || '第 {n} 章';
        } catch (e) {
            return '第 {n} 章';
        }
    }, [formatting]);

    // Derive chapters from props or state
    const chapters = useMemo(() => {
        if (volumes) {
            const flatChapters: Chapter[] = [];
            volumes.forEach(v => {
                v.chapters.forEach((c: any) => flatChapters.push(c));
            });
            return flatChapters;
        }
        return fetchedChapters;
    }, [volumes, fetchedChapters]);

    // 3. Effects
    useEffect(() => {
        if (volumes) {
            setIsLoading(false);
            return;
        }

        const loadStructure = async () => {
            setIsLoading(true);
            try {
                const vols = await window.db.getVolumes(novelId);
                const flatChapters: Chapter[] = [];
                vols.forEach(v => {
                    v.chapters.forEach((c: any) => flatChapters.push(c));
                });
                setFetchedChapters(flatChapters);
            } catch (e) {
                console.error("Failed to load volumes for matrix", e);
            } finally {
                setIsLoading(false);
            }
        };
        loadStructure();
    }, [novelId, volumes]);

    // Auto-scroll to active chapter
    useEffect(() => {
        // Only auto-scroll if NOT transposed (rows are chapters)
        if (activeChapterId && !isLoading && !isTransposed) {
            const row = document.getElementById(`matrix-row-${activeChapterId}`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [activeChapterId, isLoading, isTransposed]);

    // 4. Handlers
    const handlePointClick = (point: PlotPoint, e: React.MouseEvent) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('open-plot-point-modal', {
            detail: {
                isCreateMode: false,
                pointId: point.id
            }
        }));
    };

    const handleCreateAt = async (chapterId: string, plotLineId: string) => {
        // Open Modal in Create Mode with pre-filled Chapter and PlotLine
        window.dispatchEvent(new CustomEvent('open-plot-point-modal', {
            detail: {
                isCreateMode: true,
                initialData: {
                    chapterId,
                    plotLineId
                }
            }
        }));
    };

    const [hoveredRow, setHoveredRow] = useState<string | null>(null);
    const [hoveredCol, setHoveredCol] = useState<string | null>(null);

    // 5. Performance Optimization: Pre-map plot points for O(1) lookup
    const pointMap = useMemo(() => {
        const map = new Map<string, PlotPoint[]>();
        plotLines.forEach(line => {
            line.points?.forEach(point => {
                point.anchors?.forEach(anchor => {
                    const key = `${anchor.chapterId}-${line.id}`;
                    if (!map.has(key)) map.set(key, []);
                    map.get(key)!.push(point);
                });
            });
        });
        return map;
    }, [plotLines]);

    // Recent Files Map
    const recentChapterIds = useMemo(() => {
        return new Set((recentFiles || []).map(f => f.id));
    }, [recentFiles]);

    // 6. Intelligent Aggregation: Merge consecutive empty chapters
    // Now also considers 'recent' status to ensure they are visible
    const displayRows = useMemo(() => {
        const result: DisplayRow[] = [];
        let currentAggregate: Chapter[] = [];
        let startIdx = -1;

        chapters.forEach((chapter, index) => {
            const isRecent = recentChapterIds.has(chapter.id);
            const isActive = chapter.id === activeChapterId;

            // Check if this chapter has ANY points in ANY VISIBLE line
            const hasAnyPoints = visiblePlotLines.some(line =>
                (pointMap.get(`${chapter.id}-${line.id}`)?.length || 0) > 0
            );

            if (hasAnyPoints || isActive || isRecent) {
                // If we were aggregating, flush it
                if (currentAggregate.length > 0) {
                    if (currentAggregate.length === 1) {
                        const aggChapter = currentAggregate[0];
                        result.push({
                            type: 'single',
                            chapter: aggChapter,
                            index: startIdx,
                            isRecent: recentChapterIds.has(aggChapter.id)
                        });
                    } else {
                        result.push({
                            type: 'aggregate',
                            chapters: [...currentAggregate],
                            startIndex: startIdx,
                            endIndex: index - 1
                        });
                    }
                    currentAggregate = [];
                }
                result.push({
                    type: 'single',
                    chapter,
                    index,
                    isRecent
                });
            } else {
                if (currentAggregate.length === 0) startIdx = index;
                currentAggregate.push(chapter);
            }
        });

        // Final flush
        if (currentAggregate.length > 0) {
            if (currentAggregate.length === 1) {
                const aggChapter = currentAggregate[0];
                result.push({
                    type: 'single',
                    chapter: aggChapter,
                    index: startIdx,
                    isRecent: recentChapterIds.has(aggChapter.id)
                });
            } else {
                result.push({
                    type: 'aggregate',
                    chapters: [...currentAggregate],
                    startIndex: startIdx,
                    endIndex: chapters.length - 1
                });
            }
        }

        return result;
    }, [chapters, visiblePlotLines, pointMap, activeChapterId, recentChapterIds]);




    // Helper for stable callback - crucial for memoization
    const setHoveredPair = React.useCallback((row: string | null, col: string | null) => {
        setHoveredRow(row);
        setHoveredCol(col);
    }, []);

    if ((isLoading || isPlotLoading) && plotLines.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center p-12">
                <div className="flex flex-col items-center gap-4 opacity-50">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="text-sm font-medium">{t('common.loading', 'Loading Narrative Matrix...')}</p>
                </div>
            </div>
        );
    }

    return (
        <div
            key="matrix-v2"
            className={clsx(
                "flex-1 flex flex-col min-h-0 relative z-0 p-8 overflow-hidden", // Enforce z-0 and min-h-0
                isDark ? "bg-[#0a0a0f] text-neutral-200" : "bg-white text-neutral-800"
            )}
        >
            {/* Header Section */}
            <div className="w-full flex items-center justify-between mb-6 shrink-0 z-10 relative">
                <div className="flex items-center gap-3 shrink min-w-0 mr-4">
                    <h2 className="text-2xl font-bold font-serif truncate ">{t('matrix.title', 'Narrative Matrix')}</h2>
                    {(isLoading || isPlotLoading) && <Loader2 className="w-4 h-4 animate-spin opacity-40" />}
                </div>

                {/* Plot Line Filter Tags */}
                <div className="flex-1 flex flex-wrap gap-2 px-4 max-h-24 overflow-y-auto no-scrollbar items-center">
                    <button
                        onClick={() => {
                            if (visibleLineIds.size === plotLines.length) setVisibleLineIds(new Set());
                            else setVisibleLineIds(new Set(plotLines.map(l => l.id)));
                        }}
                        className={clsx(
                            "px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter transition-all border",
                            visibleLineIds.size === plotLines.length
                                ? (isDark ? "bg-white/10 border-white/20" : "bg-black/5 border-black/10")
                                : (isDark ? "border-primary-500/50 text-primary-400" : "border-primary-200 text-primary-600")
                        )}
                    >
                        {visibleLineIds.size === plotLines.length ? t('common.hideAll', 'Hide All') : t('common.showAll', 'Show All')}
                    </button>
                    {plotLines.map(line => {
                        const isSelected = visibleLineIds.has(line.id); // Changed from selectedLineIds
                        return (
                            <button
                                key={line.id}
                                onClick={() => {
                                    const next = new Set(visibleLineIds); // Changed from selectedLineIds
                                    if (isSelected) next.delete(line.id);
                                    else next.add(line.id);
                                    setVisibleLineIds(next); // Changed from setSelectedLineIds
                                }}
                                className={clsx(
                                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border",
                                    isSelected
                                        ? "opacity-100 scale-100"
                                        : "opacity-40 scale-95 grayscale hover:grayscale-0 hover:opacity-100",
                                    isDark ? "border-white/10" : "border-black/5"
                                )}
                                style={{
                                    backgroundColor: isSelected ? `${line.color}20` : 'transparent',
                                    color: isSelected ? line.color : 'inherit',
                                    borderColor: isSelected ? `${line.color}40` : undefined
                                }}
                            >
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: line.color }} />
                                {line.name}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        isDark ? "bg-white/5 border-white/10 text-neutral-400" : "bg-gray-50 border-gray-200 text-gray-500"
                    )}>
                        <span className="flex items-center gap-1">
                            <span className={isDark ? "text-neutral-200" : "text-neutral-800"}>{chapters.length}</span>
                            {t('common.chapters', 'Chapters')}
                        </span>
                        <span className="w-px h-3 bg-current opacity-20" />
                        <span className="flex items-center gap-1">
                            <span className={isDark ? "text-neutral-200" : "text-neutral-800"}>{plotLines.length}</span>
                            {t('common.plotLines', 'Plot Lines')}
                        </span>
                    </div>



                    <button
                        onClick={() => setIsTransposed(!isTransposed)}
                        className={clsx(
                            "px-4 py-1.5 rounded-full text-sm font-medium transition-all border flex items-center gap-2 shadow-sm active:scale-95",
                            isTransposed
                                ? (isDark ? "bg-primary-500/20 border-primary-500/50 text-primary-400 hover:bg-primary-500/30" : "bg-primary-50 border-primary-200 text-primary-700 hover:bg-primary-100")
                                : (isDark ? "bg-white/10 border-white/20 hover:bg-white/20 text-neutral-200" : "bg-white border-gray-300 hover:bg-gray-50 text-gray-700")
                        )}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        {isTransposed ? t('matrix.viewStandard', "Standard View") : t('matrix.viewTranspose', "Transpose View")}
                    </button>
                </div>
            </div>

            <div className={clsx(
                "flex-1 border rounded-lg overflow-auto relative",
                isDark ? 'border-white/10' : 'border-black/10'
            )}>
                <table className="w-full border-collapse" style={{ minWidth: isTransposed ? 'auto' : '100%' }}>
                    <thead>
                        <tr className={isDark ? "bg-[#0a0a0f]" : "bg-white"}>
                            <th className={clsx(
                                "p-4 text-left border-b border-r min-w-[200px] sticky top-0 left-0 z-40 font-bold uppercase text-xs tracking-wider opacity-70", // Increase z-index to stay above other sticky headers
                                isDark ? "bg-[#0a0a0f] border-white/10" : "bg-white border-gray-100"
                            )}>
                                {isTransposed ? t('common.plotLine') : t('common.chapter')}
                            </th>
                            {isTransposed ? (
                                // Transposed Headers: Chapters (Units)
                                displayRows.map((unit) => {
                                    if (unit.type === 'aggregate') {
                                        return (
                                            <th
                                                key={`agg-col-${unit.startIndex}`}
                                                className={clsx(
                                                    "p-0 border-b border-r min-w-[30px] max-w-[40px] sticky top-0 z-20 transition-all",
                                                    isDark ? "bg-[#0a0a0f] border-white/10" : "bg-white border-gray-100"
                                                )}
                                            />
                                        );
                                    }
                                    const { chapter, isRecent } = unit;
                                    return (
                                        <th
                                            key={chapter.id}
                                            onMouseEnter={() => setHoveredCol(chapter.id)}
                                            onMouseLeave={() => setHoveredCol(null)}
                                            className={clsx(
                                                "p-4 text-left border-b border-r min-w-[150px] sticky top-0 z-20 font-medium text-sm whitespace-nowrap transition-colors duration-200",
                                                isDark ? "bg-[#0a0a0f] border-white/10" : "bg-white border-gray-100",
                                                hoveredCol === chapter.id && (isDark ? "bg-white/5" : "bg-gray-50"),
                                                isRecent && (isDark ? "bg-amber-500/5 border-b-amber-500/20" : "bg-amber-50 border-b-amber-200")
                                            )}
                                        >
                                            <div className={clsx(
                                                "px-2 py-1 rounded inline-block",
                                                chapter.id === activeChapterId && (isDark ? "bg-primary-900/40" : "bg-primary-50 text-primary-700")
                                            )}>
                                                <div className={clsx("font-bold relative", isDark ? "text-white" : "text-neutral-900")}>
                                                    {isRecent && <span className="absolute -top-1 -right-2 w-1.5 h-1.5 rounded-full bg-amber-500" title="Recent" />}
                                                    {formatNumber(chapterFormat, chapter.order || (unit.index + 1))}
                                                </div>
                                                <div className="text-xs opacity-60 font-normal">{chapter.title}</div>
                                            </div>
                                        </th>
                                    );
                                })
                            ) : (
                                // Standard Headers: Plot Lines
                                visiblePlotLines.map(line => (
                                    <th
                                        key={line.id}
                                        onMouseEnter={() => setHoveredCol(line.id)}
                                        onMouseLeave={() => setHoveredCol(null)}
                                        className={clsx(
                                            "p-4 text-left border-b border-r min-w-[200px] sticky top-0 z-20 font-medium transition-colors duration-200",
                                            isDark ? "bg-[#0a0a0f] border-white/10" : "bg-white border-gray-100",
                                            hoveredCol === line.id && (isDark ? "bg-white/5" : "bg-gray-50")
                                        )}
                                        style={{ borderBottomColor: line.color }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: line.color }} />
                                            <span>{line.name}</span>
                                        </div>
                                    </th>
                                ))
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {isTransposed ? (
                            // Transposed Body: Plot Lines as Rows
                            visiblePlotLines.map((line, lineIdx) => (
                                <tr
                                    key={line.id}
                                    onMouseEnter={() => setHoveredRow(line.id)}
                                    onMouseLeave={() => setHoveredRow(null)}
                                    className={clsx(
                                        "border-b transition-colors duration-200",
                                        isDark ? "border-white/5" : "border-gray-100",
                                        hoveredRow === line.id && (isDark ? "bg-white/[0.03]" : "bg-gray-50/50")
                                    )}
                                >
                                    <td className={clsx(
                                        "p-4 border-r sticky left-0 z-20 font-medium text-sm",
                                        isDark ? "bg-[#0a0a0f] border-white/10" : "bg-white border-gray-100"
                                    )}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: line.color }} />
                                            {line.name}
                                        </div>
                                    </td>

                                    {/* Standard Cells (now includes recent in-order) */}
                                    {displayRows.map((unit: any) => {
                                        if (unit.type === 'aggregate') {
                                            if (lineIdx === 0) {
                                                return (
                                                    <td
                                                        key={`agg-cell-${unit.startIndex}`}
                                                        rowSpan={visiblePlotLines.length}
                                                        className={clsx(
                                                            "p-2 border-r text-center align-middle sticky top-[100px]",
                                                            isDark ? "bg-white/[0.01] border-white/5" : "bg-gray-50/20 border-gray-50"
                                                        )}
                                                    >
                                                        <div className="flex flex-col items-center justify-center opacity-30 hover:opacity-60 transition-opacity">
                                                            <div className="text-[10px] font-black leading-none mb-1 tracking-widest text-[#6366f1]">•••</div>
                                                            <div className="text-[9px] font-bold tracking-wider uppercase whitespace-nowrap px-2 py-1 rounded-full border border-dashed border-current">
                                                                {t('matrix.emptyChapters', { count: unit.chapters.length })}
                                                                <div className="mt-1 font-normal opacity-50 text-[8px]">
                                                                    {t('matrix.chapterRange', { start: unit.startIndex + 1, end: unit.endIndex + 1 })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            }
                                            return null;
                                        }
                                        const { chapter } = unit;
                                        const points = pointMap.get(`${chapter.id}-${line.id}`) || [];
                                        return <Cell key={`${chapter.id}-${line.id}`} points={points} lineId={line.id} chapterId={chapter.id} lineColor={line.color} isHovered={hoveredRow === line.id || hoveredCol === chapter.id} onHover={setHoveredPair} onClick={() => handleCreateAt(chapter.id, line.id)} onPointClick={handlePointClick} onMentionClick={handleMentionClick} isDark={isDark} />;
                                    })}
                                </tr>
                            ))
                        ) : (
                            // Standard Body: Chapters as Rows (In Order)
                            displayRows.map((row: any) => {
                                if (row.type === 'aggregate') {
                                    return <AggregateRow key={`agg-${row.startIndex}`} aggregate={row} colSpan={visiblePlotLines.length + 1} isDark={isDark} t={t} />;
                                }
                                const { chapter, isRecent } = row;
                                const isActive = chapter.id === activeChapterId;
                                return <ChapterRow key={chapter.id} id={`matrix-row-${chapter.id}`} chapter={chapter} index={row.index} isActive={isActive} plotLines={visiblePlotLines} pointMap={pointMap} hoveredRow={hoveredRow} hoveredCol={hoveredCol} setHoveredPair={setHoveredPair} handleCreateAt={handleCreateAt} handlePointClick={handlePointClick} onMentionClick={handleMentionClick} chapterFormat={chapterFormat} isDark={isDark} isRecent={isRecent} />;
                            })
                        )}
                        {!isTransposed && chapters.length === 0 && (
                            <tr>
                                <td colSpan={plotLines.length + 1} className="p-8 text-center opacity-50">
                                    {t('matrix.noChapters', 'No chapters found. Create chapters to see the matrix.')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {activeEntity && entityPosition && (
                <EntityInfoCard
                    entity={activeEntity}
                    type={entityType}
                    isDark={isDark}
                    position={entityPosition}
                    onClose={() => setActiveEntity(null)}
                />
            )}
        </div>
    );
}

const AggregateRow = ({ aggregate, colSpan, isDark, t }: {
    aggregate: { startIndex: number, endIndex: number, chapters: Chapter[] },
    colSpan: number,
    isDark: boolean,
    t: any
}) => (
    <tr className={clsx("border-b group", isDark ? "border-white/5 bg-white/[0.02]" : "border-gray-100 bg-gray-50/30")}>
        <td colSpan={colSpan} className="p-2 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-dashed border-current opacity-30 text-[10px] uppercase tracking-widest font-bold">
                {t('matrix.chapterRange', { start: aggregate.startIndex + 1, end: aggregate.endIndex + 1 })} ({t('matrix.emptyChapters', { count: aggregate.chapters.length })})
            </div>
        </td>
    </tr>
)

// Standard Chapter Row extracted for clarity
const ChapterRow = ({
    chapter,
    index,
    isActive,
    plotLines,
    pointMap,
    hoveredRow,
    hoveredCol,
    setHoveredPair,
    handleCreateAt,
    handlePointClick,
    chapterFormat,
    isDark,
    isRecent,
    onMentionClick
}: any) => (
    <tr
        key={chapter.id}
        id={`matrix-row-${chapter.id}`}
        onMouseEnter={() => setHoveredPair(chapter.id, null)}
        onMouseLeave={() => setHoveredPair(null, null)}
        className={clsx(
            "border-b transition-colors duration-200",
            isDark ? "border-white/5" : "border-gray-100",
            isActive && (isDark ? "bg-primary-900/20" : "bg-primary-50"),
            isRecent && !isActive && (isDark ? "bg-amber-500/5" : "bg-amber-50/20"),
            hoveredRow === chapter.id && (isDark ? "bg-white/[0.03]" : "bg-gray-50/50")
        )}
    >
        <td className={clsx(
            "p-4 border-r opacity-70 min-w-[200px] align-top sticky left-0 z-20",
            isDark ? "bg-[#0a0a0f] border-white/10" : "bg-white border-gray-100",
            isActive && (isDark ? "!bg-primary-900/20" : "!bg-primary-50"),
            isRecent && !isActive && (isDark ? "!bg-amber-500/5" : "!bg-amber-50/20")
        )}>
            <div className={clsx("font-medium text-sm mb-1 flex items-center gap-2", isDark ? "text-white" : "text-neutral-800")}>
                {isRecent && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Recent" />}
                {formatNumber(chapterFormat, chapter.order || (index + 1))}
            </div>
            <div className={clsx("text-xs font-serif leading-relaxed", isDark ? "text-neutral-400" : "text-neutral-500")}>{chapter.title}</div>
        </td>
        {plotLines.map((line: any) => {
            const points = pointMap.get(`${chapter.id}-${line.id}`) || [];
            return (
                <Cell
                    key={`${chapter.id}-${line.id}`}
                    points={points}
                    lineId={line.id}
                    chapterId={chapter.id}
                    lineColor={line.color}
                    isHovered={hoveredRow === chapter.id || hoveredCol === line.id}
                    onHover={setHoveredPair}
                    onClick={() => handleCreateAt(chapter.id, line.id)}
                    onPointClick={handlePointClick}
                    onMentionClick={onMentionClick}
                    isDark={isDark}
                />
            );
        })}
    </tr>
)

// Helper to get icon for point type
const getTypeIcon = (type: string) => {
    switch (type) {
        case 'mystery': // 悬念
        case '悬念':
            return <HelpCircle className="w-3 h-3" />;
        case 'promise': // 承诺
        case '承诺':
            return <Flag className="w-3 h-3" />;
        case 'foreshadowing': // 伏笔
        case '伏笔':
            return <Sparkles className="w-3 h-3" />;
        case 'event': // 事件
        case '事件':
        default:
            return <CircleDot className="w-3 h-3" />;
    }
};

// Extracted Cell Component - Optimized with dots-only default view
const Cell = memo(({ points, lineColor, isHovered, lineId, chapterId, onHover, onClick, onPointClick, onMentionClick, isDark }: {
    points: PlotPoint[],
    lineColor: string,
    isHovered: boolean,
    lineId: string,
    chapterId: string,
    onHover: (row: string | null, col: string | null) => void,
    onClick: () => void,
    onPointClick: (p: PlotPoint, e: React.MouseEvent) => void,
    onMentionClick: (name: string, pos: { top: number, left: number }) => void,
    isDark: boolean
}) => (
    <td
        className={clsx(
            "p-4 border-r align-top text-sm relative group cursor-pointer transition-colors min-w-[200px]",
            isHovered && "bg-black/5 dark:bg-white/5"
        )}
        onMouseEnter={() => onHover(lineId, chapterId)}
        onMouseLeave={() => onHover(null, null)}
        onClick={onClick}
    >
        {points.length > 0 ? (
            <div className="flex flex-col gap-2 relative z-10">
                {points.map(point => {
                    const isResolved = point.status === 'resolved' || point.status === '已完成';
                    return (
                        <div
                            key={point.id}
                            className={clsx(
                                "p-2 rounded border transition-all hover:shadow-md active:scale-[0.98] group/card",
                                isDark
                                    ? "bg-white/5 border-white/10 hover:bg-white/10"
                                    : "bg-white border-gray-200 hover:border-purple-300 shadow-sm",
                                isResolved && "opacity-60 grayscale-[0.5]"
                            )}
                            onClick={(e) => onPointClick(point, e)}
                        >
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <div className={clsx(
                                    "flex items-center justify-center w-5 h-5 rounded-full shrink-0",
                                    isDark ? "bg-white/10 text-white/80" : "bg-gray-100 text-gray-600"
                                )}>
                                    {getTypeIcon(point.type)}
                                </div>
                                <div className={clsx(
                                    "font-bold text-[11px] truncate tracking-tight flex-1",
                                    isResolved && "line-through opacity-70"
                                )}>
                                    {point.title}
                                </div>
                                {isResolved && <Check className="w-3 h-3 text-green-500 shrink-0" />}
                            </div>

                            {/* Line Color Indicator (Small bar at bottom or side?) Let's keep a small dot or bar */}
                            <div className="flex items-center gap-1.5 mb-1 opacity-70">
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lineColor }} />
                                <span className="text-[9px] uppercase tracking-wider font-semibold opacity-80">
                                    {point.type || 'Event'}
                                </span>
                            </div>

                            {point.description && (
                                <PlotPointDescription
                                    text={point.description}
                                    isDark={isDark}
                                    onMentionClick={onMentionClick}
                                />
                            )}

                        </div>
                    );
                })}
            </div>
        ) : (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-black/50">+</span>
                </div>
            </div>
        )}
    </td>
));
