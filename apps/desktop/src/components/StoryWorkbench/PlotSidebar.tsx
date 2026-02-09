import { useState } from 'react';
import { usePlotSystem } from '../../hooks/usePlotSystem';
import { Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    DragStartEvent,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { PlotLineItem } from './PlotLineItem';
import { PlotPointItem } from './PlotPointItem';


interface PlotSidebarProps {
    novelId: string;
    theme: 'dark' | 'light';
    onClose?: () => void;
}

const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: {
                opacity: '0.5',
            },
        },
    }),
};

export default function PlotSidebar({ novelId, theme, onClose }: PlotSidebarProps) {
    const {
        plotLines,
        createPlotLine,
        updatePlotLine,
        deletePlotLine,
        createPlotPoint,
        reorderPlotLines,
        reorderPlotPoints,
        isLoading
    } = usePlotSystem(novelId);


    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const [isCreating, setIsCreating] = useState(false);
    const [newPlotName, setNewPlotName] = useState('');
    const [newPlotColor, setNewPlotColor] = useState('#EF4444'); // Default Red

    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeItem, setActiveItem] = useState<any>(null);


    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleCreate = async () => {
        if (!newPlotName.trim()) return;
        try {
            await createPlotLine(newPlotName, newPlotColor);
            setNewPlotName('');
            setIsCreating(false);
        } catch (e) {
            console.error(e);
        }
    };

    const toggleExpand = (id: string) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedIds(newSet);
    };

    const handleEditPoint = (point: PlotPoint) => {
        window.dispatchEvent(new CustomEvent('open-plot-point-modal', {
            detail: {
                isCreateMode: false,
                pointId: point.id
            }
        }));
    };


    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        setActiveId(active.id as string);
        setActiveItem(active.data.current);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        setActiveItem(null);

        if (!over) return;
        if (active.id === over.id) return;

        const activeType = active.data.current?.type;
        const overData = over.data.current;

        if (activeType === 'PlotLine') {
            const oldIndex = plotLines.findIndex((line) => line.id === active.id);
            const newIndex = plotLines.findIndex((line) => line.id === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrder = arrayMove(plotLines, oldIndex, newIndex);
                reorderPlotLines(newOrder.map(l => l.id));
            }
        } else if (activeType === 'PlotPoint') {
            const activePoint = active.data.current?.point as PlotPoint;
            if (!activePoint) return;

            const oldLineId = activePoint.plotLineId;
            let newLineId = oldLineId;

            // Determine destination line and index
            if (overData?.type === 'PlotLine') {
                newLineId = over.id as string;
            } else if (overData?.type === 'PlotPoint') {
                newLineId = overData.point.plotLineId;
            }

            const oldLine = plotLines.find(l => l.id === oldLineId);
            const newLine = plotLines.find(l => l.id === newLineId);

            if (!oldLine || !newLine) return;

            // Case 1: Same Line Reorder
            if (oldLineId === newLineId) {
                const oldIndex = oldLine.points?.findIndex(p => p.id === active.id) ?? -1;
                const newIndex = newLine.points?.findIndex(p => p.id === over.id) ?? -1;

                if (oldIndex !== -1 && (newIndex !== -1 || overData?.type === 'PlotLine')) {
                    const finalIndex = newIndex === -1 ? newLine.points!.length : newIndex;
                    const newPoints = arrayMove(oldLine.points!, oldIndex, finalIndex);
                    reorderPlotPoints(newLineId, newPoints.map(p => p.id));
                }
            }
            // Case 2: Cross Line Move
            else {
                const oldPoints = [...(oldLine.points || [])];
                const newPoints = [...(newLine.points || [])];

                const activeIndex = oldPoints.findIndex(p => p.id === active.id);
                if (activeIndex === -1) return;

                const [movedPoint] = oldPoints.splice(activeIndex, 1);
                const overIndex = newPoints.findIndex(p => p.id === over.id);
                const finalIndex = overIndex === -1 ? newPoints.length : overIndex;

                newPoints.splice(finalIndex, 0, { ...movedPoint, plotLineId: newLineId });

                // We need an IPC that supports moving between lines
                // reorderPlotPoints(plotLineId, pointIds) currently updates plotLineId for all pointIds in main.ts L759
                // So calling it for the destination line with the moved point ID should work.
                reorderPlotPoints(newLineId, newPoints.map(p => p.id));
            }
        }
    };

    const colors = [
        '#EF4444', '#F97316', '#EAB308', '#22C55E',
        '#3B82F6', '#A855F7', '#EC4899', '#6B7280'
    ];

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className={clsx("p-4 border-b flex items-center justify-between", isDark ? "border-white/5" : "border-gray-200")}>
                <h2 className={clsx("text-sm font-medium uppercase tracking-wider", isDark ? "text-neutral-400" : "text-neutral-500")}>
                    {t('sidebar.outline', 'Outline')}
                </h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsCreating(true)}
                        className={clsx("p-1 rounded transition-colors", isDark ? "hover:bg-white/10 text-neutral-400 hover:text-white" : "hover:bg-black/5 text-neutral-500 hover:text-black")}
                        title={t('common.create', 'Create')}
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className={clsx("p-1 rounded transition-colors", isDark ? "hover:bg-white/10 text-neutral-400 hover:text-white" : "hover:bg-black/5 text-neutral-500 hover:text-black")}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2">
                {isCreating && (
                    <div className={clsx("p-3 rounded mb-2", isDark ? "bg-white/5" : "bg-gray-100")}>
                        <input
                            autoFocus
                            value={newPlotName}
                            onChange={(e) => setNewPlotName(e.target.value)}
                            placeholder={t('plot.namePlaceholder', 'Plot Line Name')}
                            className={clsx("w-full bg-transparent outline-none text-sm mb-2", isDark ? "text-white placeholder-white/20" : "text-black placeholder-black/30")}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        />
                        <div className="flex gap-1 mb-2">
                            {colors.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setNewPlotColor(c)}
                                    className={clsx("w-4 h-4 rounded-full transition-transform hover:scale-110", newPlotColor === c && "ring-2 ring-white")}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                        <div className="flex justify-end gap-2 text-xs">
                            <button onClick={() => setIsCreating(false)} className="opacity-60 hover:opacity-100">{t('common.cancel', 'Cancel')}</button>
                            <button onClick={handleCreate} className="text-purple-400 hover:text-purple-300 font-medium">{t('common.create', 'Create')}</button>
                        </div>
                    </div>
                )}

                {isLoading && plotLines.length === 0 ? (
                    <div className="p-4 text-center opacity-50 text-sm">{t('common.loading', 'Loading...')}</div>
                ) : plotLines.length === 0 && !isCreating ? (
                    <div className="p-4 text-center opacity-40 text-sm italic">{t('plot.noLines', 'No plot lines yet')}</div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={plotLines.map(l => l.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {plotLines.map(line => (
                                    <PlotLineItem
                                        key={line.id}
                                        line={line}
                                        isDark={isDark}
                                        expanded={expandedIds.has(line.id)}
                                        onToggleExpand={() => toggleExpand(line.id)}
                                        onUpdateName={(name) => updatePlotLine(line.id, { name })}
                                        onDelete={() => {
                                            if (confirm(t('common.confirmDelete', 'Are you sure?'))) {
                                                deletePlotLine(line.id);
                                            }
                                        }}
                                        onCreatePoint={(title) => createPlotPoint({
                                            plotLineId: line.id,
                                            title,
                                            description: '',
                                            type: 'event',
                                            status: 'active'
                                        })}
                                        onPointClick={handleEditPoint}
                                    />
                                ))}
                            </div>
                        </SortableContext>

                        <DragOverlay dropAnimation={dropAnimation}>
                            {activeId && activeItem ? (
                                activeItem.type === 'PlotLine' ? (
                                    <div className="opacity-80">
                                        <PlotLineItem
                                            line={activeItem.line}
                                            isDark={isDark}
                                            expanded={expandedIds.has(activeItem.line.id)}
                                            onToggleExpand={() => { }}
                                            onUpdateName={() => { }}
                                            onDelete={() => { }}
                                            onCreatePoint={() => { }}
                                            onPointClick={() => { }}
                                        />
                                    </div>
                                ) : (
                                    <div className="opacity-80">
                                        <PlotPointItem point={activeItem.point} isDark={isDark} />
                                    </div>
                                )
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}
            </div>


        </div>
    );
}
