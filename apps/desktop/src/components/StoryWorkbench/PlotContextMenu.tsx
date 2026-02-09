import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { PlotContextMenuData } from '../LexicalEditor/plugins/PlotContextMenuPlugin';
import { Trash2, Link, FileText, Plus } from 'lucide-react';

interface PlotContextMenuProps {
    data: PlotContextMenuData;
    onClose: () => void;
    onAddAnchor: () => void;
    onCreatePoint: () => void; // [NEW]
    onRemoveAnchor: () => void;
    onViewDetails: () => void;
    theme: 'dark' | 'light';
}

export default function PlotContextMenu({ data, onClose, onAddAnchor, onCreatePoint, onRemoveAnchor, onViewDetails, theme }: PlotContextMenuProps) {
    const { t } = useTranslation();
    const menuRef = useRef<HTMLDivElement>(null);
    const isDark = theme === 'dark';

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const style: React.CSSProperties = {
        top: data.y,
        left: data.x,
        position: 'fixed',
        zIndex: 50
    };

    return (
        <div
            ref={menuRef}
            className={clsx(
                "rounded-lg shadow-xl border overflow-hidden min-w-[180px]",
                isDark ? "bg-[#1e1e24] border-white/10 text-neutral-200" : "bg-white border-neutral-200 text-neutral-800"
            )}
            style={style}
        >
            <div className="flex flex-col py-1">
                {data.anchorId ? (
                    <>
                        <button
                            onClick={onViewDetails}
                            className={clsx("flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-opacity-10", isDark ? "hover:bg-white" : "hover:bg-black")}
                        >
                            <FileText className="w-4 h-4 opacity-70" />
                            {t('plot.viewDetails', 'View Details')}
                        </button>
                        <button
                            onClick={onRemoveAnchor}
                            className={clsx("flex items-center gap-2 px-3 py-2 text-sm text-left text-red-500 hover:bg-opacity-10", isDark ? "hover:bg-red-500/20" : "hover:bg-red-50")}
                        >
                            <Trash2 className="w-4 h-4 opacity-70" />
                            {t('plot.removeAnchor', 'Remove Anchor')}
                        </button>
                    </>
                ) : data.hasSelection ? (
                    <>
                        <button
                            onClick={onAddAnchor}
                            className={clsx("flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-opacity-10", isDark ? "hover:bg-white" : "hover:bg-black")}
                        >
                            <Link className="w-4 h-4 opacity-70" />
                            {t('plot.linkExisting', 'Link Existing Point')}
                        </button>
                        <button
                            onClick={onCreatePoint}
                            className={clsx("flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-opacity-10 text-purple-500", isDark ? "hover:bg-white" : "hover:bg-black")}
                        >
                            <Plus className="w-4 h-4 opacity-70" />
                            {t('plot.createNew', 'Create New Point')}
                        </button>
                    </>
                ) : (
                    <div className="px-3 py-2 text-xs opacity-50 text-center">
                        {t('common.noSelection', 'No selection')}
                    </div>
                )}
            </div>
        </div>
    );
}
