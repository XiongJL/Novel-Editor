import React, { useState, useRef, useEffect } from 'react';
import { Clock, Trash2, FileText, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

export interface RecentFile {
    id: string; // Chapter ID
    title: string;
    timestamp: number;
}

interface RecentFilesDropdownProps {
    files: RecentFile[];
    onSelect: (chapterId: string) => void;
    onDelete: (chapterId: string) => void;
    theme: 'light' | 'dark';
}

export const RecentFilesDropdown: React.FC<RecentFilesDropdownProps> = ({
    files,
    onSelect,
    onDelete,
    theme
}) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        // Simple relative time or fast formatting
        const now = Date.now();
        const diff = now - timestamp;

        if (diff < 60000) return t('common.justNow', '刚刚');
        if (diff < 3600000) return t('common.minutesAgo', '{{count}}分钟前', { count: Math.floor(diff / 60000) });
        if (diff < 86400000) return t('common.hoursAgo', '{{count}}小时前', { count: Math.floor(diff / 3600000) });
        return date.toLocaleDateString();
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "flex items-center gap-1 p-2 rounded-full transition-colors",
                    theme === 'dark' ? "hover:bg-white/10 text-neutral-400 hover:text-white" : "hover:bg-black/5 text-neutral-600 hover:text-black",
                    isOpen && (theme === 'dark' ? "bg-white/10 text-white" : "bg-black/5 text-black")
                )}
                title={t('editor.recentFiles', '最近编辑')}
            >
                <Clock className="w-5 h-5" />
                {/* Optional: <ChevronDown className="w-3 h-3" /> */}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className={clsx(
                            "absolute top-full right-0 mt-2 w-72 rounded-xl shadow-xl border overflow-hidden z-[60]",
                            theme === 'dark' ? "bg-[#1a1a20] border-white/10" : "bg-white border-gray-200"
                        )}
                    >
                        <div className={clsx("px-4 py-3 border-b text-sm font-medium flex justify-between items-center",
                            theme === 'dark' ? "border-white/5 text-neutral-400" : "border-gray-100 text-neutral-500"
                        )}>
                            <span>{t('editor.recentFiles', '最近编辑')}</span>
                            <span className="text-xs opacity-70">{files.length}</span>
                        </div>

                        <div className="max-h-[220px] overflow-y-auto py-1 custom-scrollbar">
                            {files.length === 0 ? (
                                <div className="px-4 py-8 text-center text-sm opacity-50">
                                    {t('editor.noRecentFiles', '暂无记录')}
                                </div>
                            ) : (
                                files.map((file) => (
                                    <div
                                        key={file.id}
                                        className={clsx(
                                            "group flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors",
                                            theme === 'dark' ? "hover:bg-white/5 text-neutral-300" : "hover:bg-gray-50 text-neutral-700"
                                        )}
                                        onClick={() => {
                                            onSelect(file.id);
                                            setIsOpen(false);
                                        }}
                                    >
                                        <FileText className="w-4 h-4 opacity-50 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{file.title}</div>
                                            <div className="text-xs opacity-50">{formatTime(file.timestamp)}</div>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(file.id);
                                            }}
                                            className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/20 hover:text-red-500"
                                            title={t('common.delete', '删除')}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
