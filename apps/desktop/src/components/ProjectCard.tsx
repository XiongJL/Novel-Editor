import { motion } from 'framer-motion';
import { BookOpen, MoreVertical } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTranslation } from 'react-i18next';
import { useEditorPreferences } from '../hooks/useEditorPreferences';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ProjectCardProps {
    novel: Novel;
    onOpen: () => void;
    onEdit?: () => void;
}

function stringToColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

function generateGradient(str: string) {
    const c1 = stringToColor(str);
    const c2 = stringToColor(str.split('').reverse().join(''));
    return `linear-gradient(135deg, ${c1}, ${c2})`;
}

export function ProjectCard({ novel, onOpen, onEdit }: ProjectCardProps) {
    const { t, i18n } = useTranslation();
    const { preferences } = useEditorPreferences();
    const isDark = preferences.theme === 'dark';

    const updated = new Date(novel.updatedAt);
    const displayTime = updated.toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(/\//g, '/');

    return (
        <motion.div
            layoutId={`project-card-${novel.id}`}
            className="group relative cursor-pointer"
            onClick={onOpen}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
        >
            {/* Glow Effect */}
            <div className={cn(
                "absolute -inset-1 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 blur-xl transition duration-500",
                isDark ? "opacity-20 group-hover:opacity-40" : "opacity-10 group-hover:opacity-20"
            )} />

            {/* Card Container */}
            <div className={cn(
                "relative flex h-[480px] w-[320px] flex-col items-center justify-between overflow-hidden rounded-xl p-6 border shadow-sm",
                "backdrop-blur-2xl transition-all duration-300",
                isDark
                    ? "bg-white/5 border-white/10 group-hover:bg-white/10"
                    : "bg-white/80 border-gray-200 group-hover:bg-white group-hover:shadow-md"
            )}>

                {/* Edit Action (Top Right) */}
                <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                        className={cn(
                            "p-2 rounded-full transition-colors",
                            isDark ? "bg-black/40 hover:bg-black/60 text-white/70 hover:text-white" : "bg-gray-100/80 hover:bg-gray-200 text-gray-500 hover:text-gray-900"
                        )}
                        title={t('home.editNovel')}
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>
                </div>

                {/* Book Cover */}
                <div className={cn(
                    "relative mb-6 flex h-64 w-44 items-center justify-center rounded-lg shadow-2xl transition-transform duration-500 group-hover:-translate-y-2 overflow-hidden",
                    isDark ? "bg-[#1a1a20]" : "bg-gray-100 shadow-lg shadow-black/5"
                )}>
                    {novel.coverUrl ? (
                        <img src={novel.coverUrl.startsWith('covers/') ? `local-resource://${novel.coverUrl}` : novel.coverUrl} alt={novel.title} className="h-full w-full object-cover" />
                    ) : (
                        <>
                            {/* Generated Cover */}
                            <div
                                className="absolute inset-0"
                                style={{ background: generateGradient(novel.title) }}
                            />
                            {/* Overlay for readability */}
                            <div className="absolute inset-0 bg-black/20" />

                            {/* Title Text on Cover */}
                            <div className="relative text-center p-4">
                                <h3 className="text-xl font-serif font-bold text-white/95 drop-shadow-md break-words line-clamp-4">
                                    {novel.title}
                                </h3>
                            </div>

                            {/* Gloss Shine */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent mix-blend-overlay pointer-events-none" />
                        </>
                    )}
                </div>

                {/* Info Area */}
                <div className="flex w-full flex-col items-center space-y-4">
                    <div className="text-center">
                        <h4 className={cn(
                            "text-lg font-medium truncate max-w-[250px]",
                            isDark ? "text-white/90" : "text-gray-900"
                        )}>
                            {novel.title}
                        </h4>
                        <div className="mt-2 text-xs flex items-center justify-center gap-3">
                            <span className={isDark ? "text-neutral-400" : "text-gray-500"}>{displayTime}</span>
                            <span className={cn("w-1 h-1 rounded-full", isDark ? "bg-neutral-600" : "bg-gray-300")} />
                            <span className={isDark ? "text-neutral-400" : "text-gray-500"}>{novel.wordCount?.toLocaleString() || 0} {t('home.words')}</span>
                        </div>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 shadow-lg shadow-indigo-500/20"
                    >
                        <BookOpen className="h-4 w-4" />
                        <span className="tracking-wide">{t('home.continue')}</span>
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
}
