import React from 'react';
import { clsx } from 'clsx';
import { User, Package, X, Hash, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface EntityInfoCardProps {
    entity: any; // Character or Item
    type: 'character' | 'item';
    onClose: () => void;
    position: { top: number; left: number };
    isDark: boolean;
}

export const EntityInfoCard: React.FC<EntityInfoCardProps> = ({
    entity,
    type,
    onClose,
    position,
    isDark
}) => {
    const { t } = useTranslation();
    if (!entity) return null;

    return (
        <div
            className={clsx(
                "fixed z-[100] w-72 rounded-xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 entity-info-card",
                isDark ? "bg-neutral-900 border-white/10 shadow-black/60" : "bg-white border-gray-200 shadow-gray-300/50"
            )}
            style={{
                top: Math.max(10, Math.min(position.top, window.innerHeight - 400)),
                left: Math.max(10, Math.min(position.left, window.innerWidth - 300))
            }}
        >
            {/* Header */}
            <div className={clsx(
                "p-4 border-b flex items-center justify-between",
                isDark ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-100"
            )}>
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        "w-10 h-10 rounded-lg flex items-center justify-center shadow-inner",
                        type === 'character'
                            ? (isDark ? "bg-indigo-500/20 text-indigo-400" : "bg-indigo-100 text-indigo-600")
                            : (isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-600")
                    )}>
                        {type === 'character' ? <User className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                    </div>
                    <div>
                        <h3 className={clsx("font-bold text-base leading-tight", isDark ? "text-white" : "text-gray-900")}>
                            {entity.name}
                        </h3>
                        <p className="text-[10px] uppercase tracking-widest opacity-40 font-bold mt-0.5">
                            {type === 'character'
                                ? t('world.dossier.characterTitle', 'Character Dossier')
                                : t('world.dossier.itemTitle', 'Object Profile')}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-full hover:bg-black/10 transition-colors opacity-50 hover:opacity-100"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 max-h-[350px] overflow-y-auto custom-scrollbar">
                {/* Description */}
                {(entity.description || entity.profile) && (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 opacity-30">
                            <BookOpen className="w-3 h-3" />
                            <span className="text-[10px] font-bold uppercase tracking-tight">
                                {t('world.dossier.notes', 'Biography / Notes')}
                            </span>
                        </div>
                        <p className={clsx("text-xs leading-relaxed", isDark ? "text-neutral-400" : "text-gray-600")}>
                            {entity.description || entity.profile || t('world.dossier.noData', 'No details recorded.')}
                        </p>
                    </div>
                )}

                {/* Character Specifics */}
                {type === 'character' && (
                    <div className="grid grid-cols-2 gap-3">
                        {entity.role && (
                            <div className={clsx("p-2 rounded-lg border", isDark ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-100")}>
                                <div className="text-[9px] opacity-40 font-bold uppercase mb-1">
                                    {t('world.dossier.role', 'Role')}
                                </div>
                                <div className="text-[11px] font-medium truncate">{entity.role}</div>
                            </div>
                        )}
                        {entity.tags && entity.tags.length > 0 && (
                            <div className={clsx("p-2 rounded-lg border", isDark ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-100")}>
                                <div className="text-[9px] opacity-40 font-bold uppercase mb-1">
                                    {t('world.dossier.traits', 'Traits')}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {(Array.isArray(entity.tags) ? entity.tags : JSON.parse(entity.tags || '[]')).slice(0, 2).map((tag: string, i: number) => (
                                        <span key={i} className="text-[9px] px-1 bg-black/20 rounded truncate">{tag}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer/Stats */}
                <div className="pt-2 flex items-center justify-between opacity-30 text-[9px] border-t border-white/5 mt-4">
                    <span className="flex items-center gap-1"><Hash className="w-2.5 h-2.5" /> ID: {entity.id.slice(-6)}</span>
                    <span className="flex items-center gap-1 uppercase tracking-tighter">
                        {t('world.dossier.verified', 'Verified Link')}
                    </span>
                </div>
            </div>
        </div>
    );
};
