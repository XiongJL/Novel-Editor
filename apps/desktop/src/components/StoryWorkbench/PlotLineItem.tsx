import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { GripVertical, Edit2, Trash2, ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PlotPointItem } from './PlotPointItem';
import { ConfirmModal } from '../ui/ConfirmModal';

interface PlotLineItemProps {
    line: PlotLine;
    isDark: boolean;
    expanded: boolean;
    onToggleExpand: () => void;
    onUpdateName: (name: string) => void;
    onDelete: () => void;
    onCreatePoint: (title: string) => void;
    onPointClick: (point: PlotPoint) => void;
    onPointDelete: (pointId: string) => void;
    onJump?: (point: PlotPoint) => boolean;
    highlightedPointId?: string | null;
}

export function PlotLineItem({
    line,
    isDark,
    expanded,
    onToggleExpand,
    onUpdateName,
    onDelete,
    onCreatePoint,
    onPointClick,
    onPointDelete,
    onJump,
    highlightedPointId
}: PlotLineItemProps) {
    const { t } = useTranslation();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: line.id, data: { type: 'PlotLine', line } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(line.name);

    const [isCreatingPoint, setIsCreatingPoint] = useState(false);
    const [newPointTitle, setNewPointTitle] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleSaveName = () => {
        if (editName.trim() !== line.name) {
            onUpdateName(editName);
        }
        setIsEditing(false);
    };

    const handleCreatePointSubmit = () => {
        if (newPointTitle.trim()) {
            onCreatePoint(newPointTitle);
            setNewPointTitle('');
            // Keep isCreatingPoint true for rapid entry
        } else {
            setIsCreatingPoint(false);
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={clsx("group rounded overflow-hidden mb-2 transition-colors", isDark ? "bg-white/5 hover:bg-white/10" : "bg-black/5 hover:bg-black/10")}
        >
            {/* Header */}
            <div className="flex items-center p-2">
                {/* Drag Handle */}
                <div {...attributes} {...listeners} className="mr-2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-50 hover:!opacity-100">
                    <GripVertical className="w-4 h-4" />
                </div>

                <div className="w-1 h-8 rounded-full mr-2" style={{ backgroundColor: line.color }} onClick={onToggleExpand} />

                {isEditing ? (
                    <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleSaveName}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                        autoFocus
                        className="flex-1 bg-transparent outline-none text-sm min-w-0"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleExpand}>
                        <div className={clsx("text-sm font-medium truncate", isDark ? "text-neutral-200" : "text-neutral-800")}>
                            {line.name}
                        </div>
                        <div className="text-xs opacity-50 truncate">
                            {line.points?.length || 0} {t('plot.points', 'points')}
                        </div>
                    </div>
                )}

                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsEditing(true); setEditName(line.name); }}
                        className="p-1 hover:text-purple-400"
                    >
                        <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                        className="p-1 hover:text-red-400"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                    <button className="p-1" onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}>
                        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                </div>
            </div>

            {/* Points List */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="pl-8 pr-2 pb-2 space-y-1">
                            <SortableContext items={line.points?.map(p => p.id) || []} strategy={verticalListSortingStrategy}>
                                {line.points?.map(point => (
                                    <PlotPointItem
                                        key={point.id}
                                        point={point}
                                        isDark={isDark}
                                        onClick={() => onPointClick(point)}
                                        onDelete={() => onPointDelete(point.id)}
                                        onJump={onJump}
                                        isHighlighted={highlightedPointId === point.id}
                                    />
                                ))}
                            </SortableContext>

                            {/* Add Point UI */}
                            {isCreatingPoint ? (
                                <div className="p-1">
                                    <input
                                        autoFocus
                                        value={newPointTitle}
                                        onChange={(e) => setNewPointTitle(e.target.value)}
                                        placeholder={t('plot.pointNamePlaceholder', 'Point Title')}
                                        className={clsx("w-full bg-transparent outline-none text-xs border-b border-purple-500/50 mb-1 pb-1", isDark ? "text-white placeholder-white/20" : "text-black placeholder-black/30")}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCreatePointSubmit();
                                            if (e.key === 'Escape') setIsCreatingPoint(false);
                                        }}
                                    />
                                    <div className="flex justify-end gap-2 text-[10px]">
                                        <button onClick={() => setIsCreatingPoint(false)} className="opacity-60 hover:opacity-100 uppercase">{t('common.cancel', 'Cancel')}</button>
                                        <button onClick={handleCreatePointSubmit} className="text-purple-400 hover:text-purple-300 font-medium uppercase">{t('common.create', 'Create')}</button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    className="w-full text-xs text-left p-1 opacity-50 hover:opacity-100 hover:text-purple-400 flex items-center gap-1"
                                    onClick={() => {
                                        setIsCreatingPoint(true);
                                        setNewPointTitle('');
                                    }}
                                >
                                    <Plus className="w-3 h-3" /> {t('plot.addPoint', 'Add Point')}
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={() => {
                    onDelete();
                    setShowDeleteConfirm(false);
                }}
                title={t('plot.deleteLine')}
                message={t('plot.confirmDeleteLine')}
                theme={isDark ? 'dark' : 'light'}
            />
        </div>
    );
}
