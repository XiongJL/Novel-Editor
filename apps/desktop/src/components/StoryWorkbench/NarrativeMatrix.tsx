import { useState, useEffect, useMemo } from 'react';
import { usePlotSystem } from '../../hooks/usePlotSystem';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { LayoutGrid } from 'lucide-react';
import { Chapter, PlotLine, PlotPoint, Volume } from '../../types'; // Assuming global types
import { formatNumber } from '../../utils/format';

interface NarrativeMatrixProps {
    novelId: string;
    theme: 'dark' | 'light';
    activeChapterId?: string | null;
    volumes?: Volume[];
    formatting?: string;
}

export default function NarrativeMatrix({ novelId, theme, activeChapterId, volumes, formatting }: NarrativeMatrixProps) {
    console.log('NarrativeMatrix Rendered - Version Check 2');
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    // 1. Data hooks
    const {
        plotLines,
        isLoading: isPlotLoading
    } = usePlotSystem(novelId);

    // 2. Local State
    const [fetchedChapters, setFetchedChapters] = useState<Chapter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTransposed, setIsTransposed] = useState(false);

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

    if (isLoading || isPlotLoading) {
        return <div className="flex-1 flex items-center justify-center p-10 opacity-50">{t('common.loading', 'Loading...')}</div>;
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
                <h2 className="text-2xl font-bold font-serif shrink min-w-0 truncate mr-4">{t('matrix.title', 'Narrative Matrix')}</h2>
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
                                "p-4 text-left border-b border-r min-w-[200px] sticky top-0 left-0 z-30 font-bold uppercase text-xs tracking-wider opacity-70", // Increase z-index to stay above other sticky headers
                                isDark ? "bg-[#0a0a0f] border-white/10" : "bg-white border-gray-100"
                            )}>
                                {isTransposed ? t('common.plotLine') : t('common.chapter')}
                            </th>
                            {isTransposed ? (
                                // Transposed Headers: Chapters
                                chapters.map((chapter, index) => (
                                    <th
                                        key={chapter.id}
                                        className={clsx(
                                            "p-4 text-left border-b border-r min-w-[150px] sticky top-0 z-10 font-medium text-sm whitespace-nowrap",
                                            isDark ? "bg-[#0a0a0f] border-white/10" : "bg-white border-gray-100"
                                        )}
                                    >
                                        <div className={clsx(
                                            "px-2 py-1 rounded inline-block",
                                            chapter.id === activeChapterId && (isDark ? "bg-primary-900/40" : "bg-primary-50 text-primary-700")
                                        )}>
                                            <div className={clsx("font-bold", isDark ? "text-white" : "text-neutral-900")}>
                                                {formatNumber(chapterFormat, chapter.order || (index + 1))}
                                            </div>
                                            <div className="text-xs opacity-60 font-normal">{chapter.title}</div>
                                        </div>
                                    </th>
                                ))
                            ) : (
                                // Standard Headers: Plot Lines
                                plotLines.map(line => (
                                    <th
                                        key={line.id}
                                        className={clsx(
                                            "p-4 text-left border-b border-r min-w-[200px] sticky top-0 z-10 font-medium",
                                            isDark ? "bg-[#0a0a0f] border-white/10" : "bg-white border-gray-100"
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
                            plotLines.map(line => (
                                <tr key={line.id} className={clsx("border-b", isDark ? "border-white/5 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50")}>
                                    <td className={clsx(
                                        "p-4 border-r sticky left-0 z-10 font-medium text-sm",
                                        isDark ? "bg-[#0a0a0f] border-white/10" : "bg-white border-gray-100"
                                    )}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: line.color }} />
                                            {line.name}
                                        </div>
                                    </td>
                                    {chapters.map(chapter => {
                                        const points = line.points?.filter(p =>
                                            p.anchors?.some(a => a.chapterId === chapter.id)
                                        ) || [];

                                        return (
                                            <Cell
                                                key={`${chapter.id}-${line.id}`}
                                                points={points}
                                                lineColor={line.color}
                                                onClick={() => handleCreateAt(chapter.id, line.id)}
                                                onPointClick={handlePointClick}
                                            />
                                        );
                                    })}
                                </tr>
                            ))
                        ) : (
                            // Standard Body: Chapters as Rows
                            chapters.map((chapter, index) => {
                                const isActive = chapter.id === activeChapterId;
                                return (
                                    <tr
                                        key={chapter.id}
                                        id={`matrix-row-${chapter.id}`}
                                        className={clsx(
                                            "border-b transition-colors duration-300",
                                            isDark ? "border-white/5 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50",
                                            isActive && (isDark ? "bg-primary-900/20" : "bg-primary-50")
                                        )}
                                    >
                                        <td className={clsx(
                                            "p-4 border-r opacity-70 min-w-[200px] align-top sticky left-0 z-10",
                                            isDark ? "bg-[#0a0a0f] border-white/10" : "bg-white border-gray-100",
                                            isActive && (isDark ? "!bg-primary-900/20" : "!bg-primary-50")
                                        )}>
                                            <div className={clsx("font-medium text-sm mb-1", isDark ? "text-white" : "text-neutral-800")}>
                                                {formatNumber(chapterFormat, chapter.order || (index + 1))}
                                            </div>
                                            <div className={clsx("text-xs font-serif leading-relaxed", isDark ? "text-neutral-400" : "text-neutral-500")}>{chapter.title}</div>
                                        </td>
                                        {plotLines.map(line => {
                                            const points = line.points?.filter(p =>
                                                p.anchors?.some(a => a.chapterId === chapter.id)
                                            ) || [];
                                            return (
                                                <Cell
                                                    key={`${chapter.id}-${line.id}`}
                                                    points={points}
                                                    lineColor={line.color}
                                                    onClick={() => handleCreateAt(chapter.id, line.id)}
                                                    onPointClick={handlePointClick}
                                                />
                                            );
                                        })}
                                    </tr>
                                );
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
        </div>
    );
}

// Extracted Cell Component for reuse
const Cell = ({ points, lineColor, onClick, onPointClick }: {
    points: PlotPoint[],
    lineColor: string,
    onClick: () => void,
    onPointClick: (p: PlotPoint, e: React.MouseEvent) => void
}) => (
    <td
        className="p-4 border-r align-top text-sm relative group cursor-pointer transition-colors hover:bg-black/5 min-w-[200px]"
        onClick={onClick}
    >
        {points.length > 0 ? (
            <div className="space-y-2 relative z-10">
                {points.map(point => (
                    <div
                        key={point.id}
                        className="p-2 rounded bg-opacity-20 border border-opacity-20 shadow-sm transition-all hover:scale-[1.02] cursor-pointer"
                        style={{
                            backgroundColor: `${lineColor}15`,
                            borderColor: lineColor
                        }}
                        onClick={(e) => onPointClick(point, e)}
                    >
                        <div className="font-medium text-xs mb-1">{point.title}</div>
                        {point.description && (
                            <div className="opacity-70 text-[10px] line-clamp-2">{point.description}</div>
                        )}
                    </div>
                ))}
            </div>
        ) : (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-black/50">+</span>
                </div>
            </div>
        )}
    </td>
);
