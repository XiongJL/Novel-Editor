import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, ChevronRight, ChevronDown, Plus, FileText } from 'lucide-react';
import clsx from 'clsx';
import { formatNumber } from '../utils/format';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
    volumes: Volume[];
    currentChapterId: string | null;
    formatting?: string;
    onSelectChapter: (chapterId: string) => void;
    onCreateChapter: (volumeId: string) => void;
    onCreateVolume: () => void;
    onRenameVolume: (id: string, newTitle: string) => void;
    onRenameChapter: (id: string, newTitle: string) => void;
    theme: 'dark' | 'light';
    lastCreatedVolumeId?: string | null;
}

export default function Sidebar({ volumes, currentChapterId, formatting, onSelectChapter, onCreateChapter, onCreateVolume, onRenameVolume, onRenameChapter, theme, lastCreatedVolumeId }: SidebarProps) {
    const { t } = useTranslation();
    const [expandedVolumes, setExpandedVolumes] = useState<Record<string, boolean>>({});

    const isDark = theme === 'dark';

    const formatConfig = formatting ? JSON.parse(formatting) : {};
    // Fallback to simpler defaults or keep existing logical defaults but translated?
    // Actually the default saving logic in SettingsModal used hardcoded "第 {n} 卷".
    // Ideally we respect what's passed in formatting. If empty, we use a sensible default.
    const volFormat = formatConfig.volume || '第 {n} 卷';
    const chapFormat = formatConfig.chapter || '第 {n} 章';


    // Auto-expand when currentChapterId changes
    useEffect(() => {
        if (currentChapterId) {
            const parentVolume = volumes.find(v => v.chapters.some(c => c.id === currentChapterId));
            if (parentVolume && !expandedVolumes[parentVolume.id]) {
                setExpandedVolumes(prev => ({
                    ...prev,
                    [parentVolume.id]: true
                }));
            }
        }
    }, [currentChapterId, volumes]);

    // Auto-expand when lastCreatedVolumeId changes
    useEffect(() => {
        if (lastCreatedVolumeId && !expandedVolumes[lastCreatedVolumeId]) {
            setExpandedVolumes(prev => ({
                ...prev,
                [lastCreatedVolumeId]: true
            }));
        }
    }, [lastCreatedVolumeId]);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const toggleVolume = (valid: string) => {
        if (editingId) return; // Prevent toggle when editing
        setExpandedVolumes(prev => ({
            ...prev,
            [valid]: !prev[valid]
        }));
    };

    const startEdit = (id: string, currentTitle: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(id);
        setEditValue(currentTitle);
    };

    const saveEdit = (type: 'volume' | 'chapter', id: string) => {
        if (!editValue.trim()) {
            setEditingId(null);
            return;
        }

        if (type === 'volume') {
            onRenameVolume(id, editValue);
        } else {
            onRenameChapter(id, editValue);
        }
        setEditingId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent, type: 'volume' | 'chapter', id: string) => {
        if (e.key === 'Enter') {
            saveEdit(type, id);
        } else if (e.key === 'Escape') {
            setEditingId(null);
        }
    };

    return (
        <div className={clsx(
            "w-64 border-r flex flex-col h-full transition-colors duration-300",
            isDark ? "bg-[#0F0F13] border-white/5" : "bg-gray-50 border-gray-200"
        )}>
            <div className={clsx("p-4 border-b flex items-center justify-between", isDark ? "border-white/5" : "border-gray-200")}>
                <h2 className={clsx("text-sm font-medium uppercase tracking-wider flex items-center gap-2", isDark ? "text-neutral-400" : "text-neutral-500")}>
                    <Book className="w-4 h-4" />
                    {t('sidebar.explorer')}
                </h2>
                <button
                    onClick={onCreateVolume}
                    className={clsx("p-1 rounded transition-colors", isDark ? "hover:bg-white/10 text-neutral-400 hover:text-white" : "hover:bg-black/5 text-neutral-500 hover:text-black")}
                    title={t('sidebar.newVolume')}
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {volumes.map(volume => (
                    <div key={volume.id} className="mb-4">
                        <div
                            className={clsx(
                                "flex items-center justify-between p-2 rounded cursor-pointer group outline-none focus:ring-1 focus:ring-purple-500",
                                isDark ? "text-neutral-300 hover:bg-white/5" : "text-neutral-700 hover:bg-black/5"
                            )}
                            tabIndex={0}
                            onDoubleClick={(e) => startEdit(volume.id, volume.title, e)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    toggleVolume(volume.id);
                                }
                            }}
                        >
                            <span className="flex items-center gap-2 text-sm font-medium flex-1">
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleVolume(volume.id); }}
                                    className={clsx("p-0.5 rounded", isDark ? "hover:bg-white/10" : "hover:bg-black/5")}
                                >
                                    {expandedVolumes[volume.id] ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                                </button>

                                {editingId === volume.id ? (
                                    <input
                                        autoFocus
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={() => saveEdit('volume', volume.id)}
                                        onKeyDown={(e) => handleKeyDown(e, 'volume', volume.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className={clsx(
                                            "border rounded px-1 min-w-[100px] outline-none text-xs",
                                            isDark ? "bg-black/50 border-white/20 text-white" : "bg-white border-black/20 text-black"
                                        )}
                                    />
                                ) : (
                                    <span title={t('sidebar.renameTip')} className="w-full">
                                        {formatNumber(volFormat, volume.order)}
                                        {volume.title ? <span className={clsx("ml-2", isDark ? "text-neutral-400" : "text-neutral-500")}>{volume.title}</span> : ''}
                                    </span>
                                )}
                            </span>

                            {!editingId && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCreateChapter(volume.id);
                                    }}
                                    className={clsx("opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity", isDark ? "hover:bg-white/10" : "hover:bg-black/5")}
                                    title={t('sidebar.addChapter')}
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        <AnimatePresence>
                            {(expandedVolumes[volume.id]) && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden ml-4 pl-2 border-l border-white/5"
                                >
                                    {volume.chapters.map(chapter => (
                                        <div
                                            key={chapter.id}
                                            onClick={() => onSelectChapter(chapter.id)}
                                            onDoubleClick={(e) => startEdit(chapter.id, chapter.title, e)}
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    onSelectChapter(chapter.id);
                                                }
                                            }}
                                            className={clsx(
                                                "flex items-center gap-2 p-2 mt-1 rounded text-sm cursor-pointer transition-colors min-h-[32px] outline-none focus:ring-1 focus:ring-purple-500",
                                                currentChapterId === chapter.id
                                                    ? (isDark ? "bg-purple-500/10 text-purple-300" : "bg-purple-500/10 text-purple-700")
                                                    : (isDark ? "text-neutral-500 hover:text-neutral-300 hover:bg-white/5" : "text-neutral-500 hover:text-neutral-800 hover:bg-black/5")
                                            )}
                                        >
                                            <FileText className="w-3 h-3 flex-shrink-0" />
                                            {editingId === chapter.id ? (
                                                <input
                                                    autoFocus
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    onBlur={() => saveEdit('chapter', chapter.id)}
                                                    onKeyDown={(e) => handleKeyDown(e, 'chapter', chapter.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className={clsx(
                                                        "border rounded px-1 w-full outline-none text-xs",
                                                        isDark ? "bg-black/50 border-white/20 text-white" : "bg-white border-black/20 text-black"
                                                    )}
                                                />
                                            ) : (
                                                <span className="truncate w-full" title={t('sidebar.renameTip')}>
                                                    {formatNumber(chapFormat, chapter.order)}
                                                    {chapter.title ? <span className={clsx("ml-2", isDark ? "text-neutral-400" : "text-neutral-500")}>{chapter.title}</span> : ''}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                    {volume.chapters.length === 0 && (
                                        <div className="text-xs text-neutral-700 italic p-2">
                                            {t('sidebar.noChapters')}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ))}
            </div>
        </div >
    );
}
