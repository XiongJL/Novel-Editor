import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { PlotPoint, PlotPointAnchor } from '../../types';
import { SearchableSelect } from './SearchableSelect';
import { formatNumber } from '../../utils/format';

interface PlotPointModalProps {
    isOpen: boolean;
    onClose: () => void;
    point: PlotPoint | null; // If null, we might be in create mode if initial data is provided, or just closed. 
    // Creating usually needs a PlotLineId.
    // New Props for Create Mode
    isCreateMode?: boolean;
    initialData?: {
        novelId: string;
        description?: string;
        title?: string;
        chapterId?: string; // Pre-associate
        plotLineId?: string; // Pre-select
    };

    onSave: (id: string, data: Partial<PlotPoint>) => Promise<void>;
    onCreate?: (data: Partial<PlotPoint>, initialChapterId?: string) => Promise<void>; // New handler for creation

    onAddAnchor: (data: Partial<PlotPointAnchor>) => Promise<any>;
    onRemoveAnchor: (id: string, plotPointId: string) => Promise<void>;
    novelId: string;
    theme: 'dark' | 'light';
    formatting?: string;
}

export function PlotPointModal({ isOpen, onClose, point, onSave, onCreate, onAddAnchor, onRemoveAnchor, novelId, theme, isCreateMode, initialData, formatting }: PlotPointModalProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    // ESC to close
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [isOpen, onClose]);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState('foreshadowing');
    const [status, setStatus] = useState('active');

    // Create Mode specific
    const [selectedPlotLineId, setSelectedPlotLineId] = useState<string>('');
    const [plotLines, setPlotLines] = useState<{ id: string, name: string, color: string }[]>([]);

    // Chapter Association
    const [chapters, setChapters] = useState<{ id: string, title: string }[]>([]);
    const [selectedChapterId, setSelectedChapterId] = useState<string>('');
    const [originalAnchorId, setOriginalAnchorId] = useState<string | null>(null);

    // Load chapters and plot lines
    useEffect(() => {
        if (isOpen && novelId) {
            Promise.all([
                window.db.getVolumes(novelId).then(volumes => {
                    const flatChapters: { id: string, title: string, order: number, group: string }[] = [];
                    // Parse formatting
                    const formatConfig = formatting ? JSON.parse(formatting) : {};
                    const chapFormat = formatConfig.chapter || t('common.chapterPrefix', '第') + '{n}' + t('common.chapterSuffix', '章');
                    const volFormat = formatConfig.volume || t('common.volumePrefix', '第') + '{n}' + t('common.volumeSuffix', '卷');

                    volumes.forEach(v => {
                        const volumeTitle = `${formatNumber(volFormat, v.order)} ${v.title || ''}`.trim();

                        v.chapters.forEach(c => {
                            const chapterTitle = `${formatNumber(chapFormat, c.order)} ${c.title}`;

                            flatChapters.push({
                                id: c.id,
                                title: chapterTitle,
                                order: c.order,
                                group: volumeTitle
                            });
                        });
                    });
                    setChapters(flatChapters);
                    return flatChapters;
                }),
                isCreateMode ? window.db.getPlotLines(novelId).then(lines => {
                    setPlotLines(lines.map(l => ({ id: l.id, name: l.name, color: l.color })));
                    return lines;
                }) : Promise.resolve([])
            ]).then(([loadedChapters, loadedLines]) => {
                // Apply initial data AFTER loading resources to ensure options exist
                console.log('PlotPointModal loaded resources:', { loadedChaptersCount: loadedChapters.length, loadedLinesCount: loadedLines.length });
                console.log('PlotPointModal initialData:', initialData);

                if (isCreateMode && initialData) {
                    const defaultTitle = initialData.title || t('plot.defaultTitle', 'Plot Point Title');

                    setTitle(defaultTitle);
                    setDescription(initialData.description || '');
                    setType('foreshadowing');
                    setStatus('active');

                    // Set Chapter
                    if (initialData.chapterId) {
                        const chapterExists = loadedChapters.find(c => c.id === initialData.chapterId);
                        console.log(`Setting chapter: ${initialData.chapterId}, Found: ${!!chapterExists}`);
                        setSelectedChapterId(initialData.chapterId);
                    } else {
                        setSelectedChapterId('');
                    }

                    // Set Plot Line
                    if (initialData.plotLineId) {
                        setSelectedPlotLineId(initialData.plotLineId);
                    } else if (loadedLines.length > 0 && !selectedPlotLineId) {
                        setSelectedPlotLineId(loadedLines[0].id);
                    }
                    setOriginalAnchorId(null);
                } else if (point) {
                    // Edit Mode Logic
                    setTitle(point.title || '');
                    setDescription(point.description || '');
                    setType(point.type || 'foreshadowing');
                    setStatus(point.status || 'active');

                    const anchor = point.anchors?.find(a => a.chapterId);
                    if (anchor) {
                        setSelectedChapterId(anchor.chapterId);
                        setOriginalAnchorId(anchor.id);
                    } else {
                        setSelectedChapterId('');
                        setOriginalAnchorId(null);
                    }
                }
            }).catch(console.error);
        }
    }, [isOpen, novelId, isCreateMode, initialData, point, t]);

    // Merged into previous useEffect to handle async loading dependency

    const handleSave = async () => {
        if (isCreateMode) {
            if (!onCreate) return;
            if (!selectedPlotLineId) {
                // Should show error?
                return;
            }
            await onCreate({
                plotLineId: selectedPlotLineId,
                title,
                description,
                type,
                status
            }, selectedChapterId); // Pass chapterId to handler to create anchor immediately
        } else {
            if (!point) return;
            // Update Existing
            await onSave(point.id, {
                title,
                description,
                type,
                status
            });

            // Handle Anchor
            if (selectedChapterId) {
                if (!originalAnchorId) {
                    await onAddAnchor({ plotPointId: point.id, chapterId: selectedChapterId, type: 'setup' });
                } else {
                    const oldAnchor = point.anchors?.find(a => a.id === originalAnchorId);
                    if (oldAnchor && oldAnchor.chapterId !== selectedChapterId) {
                        await onRemoveAnchor(originalAnchorId, point.id);
                        await onAddAnchor({ plotPointId: point.id, chapterId: selectedChapterId, type: 'setup' });
                    }
                }
            } else {
                if (originalAnchorId) {
                    await onRemoveAnchor(originalAnchorId, point.id);
                }
            }
        }
        toast.success(t('plot.saveSuccess'));
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className={clsx(
                        "w-full max-w-lg rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]",
                        isDark ? "bg-neutral-900 border border-white/10 text-neutral-200" : "bg-white border border-gray-200 text-neutral-800"
                    )}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-white/5">
                        <h3 className="font-medium text-lg">{isCreateMode ? t('plot.addPoint') : t('plot.editPoint')}</h3>
                        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4 overflow-y-auto">

                        {/* Plot Line Selection (Only in Create Mode) */}
                        {isCreateMode && (
                            <div>
                                <label className="block text-xs font-medium uppercase opacity-50 mb-1">{t('plot.plotLine')}</label>
                                <select
                                    value={selectedPlotLineId}
                                    onChange={(e) => setSelectedPlotLineId(e.target.value)}
                                    className={clsx(
                                        "w-full p-2 rounded text-sm outline-none border transition-colors focus:border-purple-500",
                                        isDark ? "bg-black/20 border-white/10" : "bg-gray-50 border-gray-200"
                                    )}
                                >
                                    {plotLines.map(l => (
                                        <option key={l.id} value={l.id}>
                                            {l.name}
                                        </option>
                                    ))}
                                    {plotLines.length === 0 && <option value="">{t('plot.noPlotLines', 'No Plot Lines')}</option>}
                                </select>
                            </div>
                        )}

                        {/* Title */}
                        <div>
                            <label className="block text-xs font-medium uppercase opacity-50 mb-1">{t('common.title')}</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className={clsx(
                                    "w-full p-2 rounded text-sm outline-none border transition-colors focus:border-purple-500",
                                    isDark ? "bg-black/20 border-white/10" : "bg-gray-50 border-gray-200"
                                )}
                            />
                        </div>

                        {/* Chapter Association */}
                        <div>
                            <label className="block text-xs font-medium uppercase opacity-50 mb-1">{t('common.chapter')}</label>
                            <SearchableSelect
                                options={chapters}
                                value={selectedChapterId}
                                onChange={setSelectedChapterId}
                                placeholder={t('plot.selectChapter', 'Select Chapter...')}
                                searchPlaceholder={t('common.search', 'Search...')}
                                theme={theme}
                            />
                        </div>

                        {/* Type & Status Row */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium uppercase opacity-50 mb-1">{t('plot.type')}</label>
                                <select
                                    value={type}
                                    onChange={(e) => setType(e.target.value)}
                                    className={clsx(
                                        "w-full p-2 rounded text-sm outline-none border transition-colors focus:border-purple-500",
                                        isDark ? "bg-black/20 border-white/10" : "bg-gray-50 border-gray-200"
                                    )}
                                >
                                    <option value="foreshadowing">{t('plot.types.foreshadowing')}</option>
                                    <option value="mystery">{t('plot.types.mystery')}</option>
                                    <option value="promise">{t('plot.types.promise')}</option>
                                    <option value="event">{t('plot.types.event')}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium uppercase opacity-50 mb-1">{t('plot.status')}</label>
                                <div className="flex bg-black/20 rounded p-1 border border-white/5">
                                    <button
                                        onClick={() => setStatus('active')}
                                        className={clsx(
                                            "flex-1 text-xs py-1 rounded transition-colors",
                                            status === 'active' ? (isDark ? "bg-purple-600 text-white" : "bg-purple-500 text-white shadow-sm") : "opacity-50 hover:opacity-100"
                                        )}
                                    >
                                        {t('plot.statuses.active')}
                                    </button>
                                    <button
                                        onClick={() => setStatus('resolved')}
                                        className={clsx(
                                            "flex-1 text-xs py-1 rounded transition-colors",
                                            status === 'resolved' ? (isDark ? "bg-green-600 text-white" : "bg-green-500 text-white shadow-sm") : "opacity-50 hover:opacity-100"
                                        )}
                                    >
                                        {t('plot.statuses.resolved')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-xs font-medium uppercase opacity-50 mb-1">{t('common.description')}</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={5}
                                className={clsx(
                                    "w-full p-2 rounded text-sm outline-none border transition-colors focus:border-purple-500 resize-none",
                                    isDark ? "bg-black/20 border-white/10" : "bg-gray-50 border-gray-200"
                                )}
                                placeholder={t('plot.descriptionPlaceholder')}
                            />
                        </div>

                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-white/5 flex justify-end gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm rounded hover:bg-white/5 transition-colors">
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-sm rounded bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center gap-2 transition-colors active:scale-95"
                        >
                            <Check className="w-4 h-4" />
                            {t('common.save')}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
}
