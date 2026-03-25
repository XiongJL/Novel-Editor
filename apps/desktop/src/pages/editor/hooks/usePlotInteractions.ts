import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import {
    $createRangeSelection,
    $getNodeByKey,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $isTextNode,
    $setSelection,
    type LexicalEditor,
} from 'lexical';
import { $wrapSelectionInMarkNode } from '@lexical/mark';
import { $createPlotAnchorNode, $isPlotAnchorNode } from '../../../components/LexicalEditor/nodes/PlotAnchorNode';
import type { PlotContextMenuData } from '../../../components/LexicalEditor/plugins/PlotContextMenuPlugin';
import type { ActivityTab } from '../../../components/ActivityBar';
import type { Chapter } from '../../../types';

type PlotAnchorType = 'setup' | 'payoff';

type PlotPointLike = {
    id: string;
    anchors?: Array<{ id: string }>;
};

type PlotLineLike = {
    points?: PlotPointLike[];
};

function hasId(value: unknown): value is { id: string } {
    return typeof value === 'object' && value !== null && 'id' in value && typeof (value as { id?: unknown }).id === 'string';
}

type UsePlotInteractionsParams = {
    novelId: string;
    currentChapter: Chapter | null;
    plotLines: PlotLineLike[];
    addAnchor: (payload: {
        plotPointId: string;
        chapterId: string;
        type: PlotAnchorType;
        lexicalKey?: string;
        offset?: number;
        length?: number;
    }) => Promise<unknown>;
    removeAnchor: (anchorId: string, plotPointId: string) => Promise<any>;
    createPlotPoint: (data: Partial<any>) => Promise<unknown>;
    updatePlotPoint: (id: string, data: Partial<any>) => Promise<unknown>;
    deletePlotPoint: (id: string) => Promise<any>;
    editorRef: MutableRefObject<LexicalEditor | null>;
    activeChapterMeta: { id: string; title: string } | null;
    setActiveTab: (tab: ActivityTab) => void;
    setIsSidePanelOpen: (open: boolean) => void;
    isDarkTheme: boolean;
};

export function usePlotInteractions({
    novelId,
    currentChapter,
    plotLines,
    addAnchor,
    removeAnchor,
    createPlotPoint,
    updatePlotPoint,
    deletePlotPoint,
    editorRef,
    activeChapterMeta,
    setActiveTab,
    setIsSidePanelOpen,
    isDarkTheme,
}: UsePlotInteractionsParams) {
    const [plotContextMenuData, setPlotContextMenuData] = useState<PlotContextMenuData | null>(null);
    const [isPlotAnchorModalOpen, setIsPlotAnchorModalOpen] = useState(false);
    const [pendingAnchorSelection, setPendingAnchorSelection] = useState<PlotContextMenuData | null>(null);
    const [isPlotPointModalOpen, setIsPlotPointModalOpen] = useState(false);
    const [plotPointCreateData, setPlotPointCreateData] = useState<any>(null);
    const [editingPlotPoint, setEditingPlotPoint] = useState<any>(null);
    const [isPlotPointCreateMode, setIsPlotPointCreateMode] = useState(false);
    const [highlightedPlotPointId, setHighlightedPlotPointId] = useState<string | null>(null);

    const applyPlotAnchor = useCallback((anchorId: string) => {
        const editor = editorRef.current;
        if (!editor) return;

        editor.focus();
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $wrapSelectionInMarkNode(selection as any, selection.isCollapsed(), anchorId, $createPlotAnchorNode);
            }
        });
    }, [editorRef]);

    const applyPlotAnchorFromData = useCallback((anchorId: string, data: PlotContextMenuData) => {
        const editor = editorRef.current;
        if (!editor) return;
        if (!data.nodeKey || data.offset === undefined || data.length === undefined) return;
        const nodeKey = data.nodeKey;
        const offset = data.offset;
        const length = data.length;

        editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if (node && $isTextNode(node)) {
                const selection = $createRangeSelection();
                selection.anchor.set(nodeKey, offset, 'text');
                selection.focus.set(nodeKey, offset + length, 'text');
                $setSelection(selection);
                $wrapSelectionInMarkNode(selection as any, false, anchorId, $createPlotAnchorNode);
            }
        });
    }, [editorRef]);

    const handlePlotContextMenu = useCallback((data: PlotContextMenuData) => {
        setPlotContextMenuData(data);
    }, []);

    const handleAddAnchorClick = useCallback(() => {
        if (plotContextMenuData?.text) {
            setPendingAnchorSelection(plotContextMenuData);
            setIsPlotAnchorModalOpen(true);
        }
        setPlotContextMenuData(null);
    }, [plotContextMenuData]);

    const handleRemoveAnchor = useCallback(async () => {
        if (!plotContextMenuData?.anchorId) return;
        const anchorId = plotContextMenuData.anchorId;

        try {
            const allLines = await window.db.getPlotLines(novelId);
            let targetPointId: string | null = null;
            for (const line of allLines) {
                for (const point of line.points || []) {
                    if (point.anchors?.some((anchor) => anchor.id === anchorId)) {
                        targetPointId = point.id;
                        break;
                    }
                }
                if (targetPointId) break;
            }

            if (targetPointId) {
                await removeAnchor(anchorId, targetPointId);
            } else {
                await window.db.deletePlotPointAnchor(anchorId);
            }

            const editor = editorRef.current;
            if (editor) {
                editor.update(() => {
                    $getRoot().getAllTextNodes().forEach((textNode) => {
                        const parent = textNode.getParent();
                        if ($isPlotAnchorNode(parent)) {
                            const ids = parent.getIDs();
                            if (ids.includes(anchorId)) {
                                parent.unwrap();
                            }
                        }
                    });
                });
            }

            setPlotContextMenuData(null);
        } catch (error) {
            console.error('Failed to remove anchor:', error);
        }
    }, [editorRef, novelId, plotContextMenuData, removeAnchor]);

    const handleSubmitAnchor = useCallback(async (plotPointId: string, type: PlotAnchorType) => {
        if (!currentChapter || !pendingAnchorSelection) return;

        try {
            const newAnchor = await addAnchor({
                plotPointId,
                chapterId: currentChapter.id,
                type,
                lexicalKey: pendingAnchorSelection.nodeKey,
                offset: pendingAnchorSelection.offset,
                length: pendingAnchorSelection.length,
            });

            if (hasId(newAnchor)) {
                if (pendingAnchorSelection.hasSelection) {
                    applyPlotAnchor(newAnchor.id);
                } else {
                    applyPlotAnchorFromData(newAnchor.id, pendingAnchorSelection);
                }
            }

            setIsPlotAnchorModalOpen(false);
            setPendingAnchorSelection(null);
        } catch (error) {
            console.error('Create anchor failed:', error);
        }
    }, [addAnchor, applyPlotAnchor, applyPlotAnchorFromData, currentChapter, pendingAnchorSelection]);

    const handleCreatePointFromSelection = useCallback(() => {
        if (plotContextMenuData?.text) {
            setPlotPointCreateData({
                title: plotContextMenuData.text.slice(0, 20),
                description: plotContextMenuData.text,
                chapterId: currentChapter?.id,
            });
            setPendingAnchorSelection(plotContextMenuData);
            setIsPlotPointCreateMode(true);
            setIsPlotPointModalOpen(true);
        }
        setPlotContextMenuData(null);
    }, [currentChapter?.id, plotContextMenuData]);

    const handleCreatePlotPoint = useCallback(async (data: Partial<any>, initialChapterId?: string) => {
        try {
            const newPoint = await createPlotPoint(data);
            const targetChapterId = initialChapterId || (pendingAnchorSelection && currentChapter?.id);
            const shouldAnchorToSelection = pendingAnchorSelection && currentChapter?.id && targetChapterId === currentChapter.id;

            if (hasId(newPoint) && shouldAnchorToSelection && pendingAnchorSelection) {
                const newAnchor = await addAnchor({
                    plotPointId: newPoint.id,
                    chapterId: targetChapterId!,
                    type: 'setup',
                    lexicalKey: pendingAnchorSelection.nodeKey,
                    offset: pendingAnchorSelection.offset,
                    length: pendingAnchorSelection.length,
                });
                if (hasId(newAnchor)) {
                    if (pendingAnchorSelection.hasSelection) {
                        applyPlotAnchor(newAnchor.id);
                    } else {
                        applyPlotAnchorFromData(newAnchor.id, pendingAnchorSelection);
                    }
                }
            } else if (hasId(newPoint) && targetChapterId) {
                await addAnchor({
                    plotPointId: newPoint.id,
                    chapterId: targetChapterId,
                    type: 'setup',
                });
            }

            setIsPlotPointModalOpen(false);
            setPendingAnchorSelection(null);
        } catch (error) {
            console.error('Failed to create point from selection:', error);
        }
    }, [addAnchor, applyPlotAnchor, applyPlotAnchorFromData, createPlotPoint, currentChapter?.id, pendingAnchorSelection]);

    const handleSavePlotPoint = useCallback(async (id: string, data: Partial<any>) => {
        await updatePlotPoint(id, data);
        setIsPlotPointModalOpen(false);
    }, [updatePlotPoint]);

    const handleViewDetails = useCallback(() => {
        if (!plotContextMenuData?.anchorId) return;
        const anchorId = plotContextMenuData.anchorId;

        for (const line of plotLines) {
            const point = line.points?.find((p) => p.anchors?.some((a) => a.id === anchorId));
            if (point) {
                setEditingPlotPoint(point);
                setIsPlotPointCreateMode(false);
                setIsPlotPointModalOpen(true);
                break;
            }
        }
        setPlotContextMenuData(null);
    }, [plotContextMenuData, plotLines]);

    const handlePlotAnchorClick = useCallback((anchorId: string) => {
        for (const line of plotLines) {
            const point = line.points?.find((p) => p.anchors?.some((a) => a.id === anchorId));
            if (point) {
                setHighlightedPlotPointId(point.id);
                setActiveTab('outline');
                setIsSidePanelOpen(true);
                window.setTimeout(() => setHighlightedPlotPointId(null), 2000);
                return;
            }
        }
    }, [plotLines, setActiveTab, setIsSidePanelOpen]);

    const handleJumpToPlotPoint = useCallback((point: PlotPointLike): boolean => {
        if (!point.anchors || point.anchors.length === 0) return false;
        const editor = editorRef.current;
        if (!editor) return false;
        const editorRoot = editor.getRootElement();
        if (!editorRoot) return false;

        for (const anchor of point.anchors) {
            const element = editorRoot.querySelector(`[data-plot-anchor-id="${anchor.id}"]`);
            if (element) {
                (element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
                const originalBg = (element as HTMLElement).style.backgroundColor;
                (element as HTMLElement).style.transition = 'background-color 0.5s';
                (element as HTMLElement).style.backgroundColor = isDarkTheme
                    ? 'rgba(234, 179, 8, 0.4)'
                    : 'rgba(250, 204, 21, 0.4)';
                window.setTimeout(() => {
                    (element as HTMLElement).style.backgroundColor = originalBg;
                }, 2000);
                return true;
            }
        }

        console.warn('[Editor] Anchors exist but DOM elements not found for point:', point.id);
        return false;
    }, [editorRef, isDarkTheme]);

    const handleDeletePlotPoint = useCallback(async (id: string) => {
        try {
            let anchorsToRemove: string[] = [];
            for (const line of plotLines) {
                const point = line.points?.find((item) => item.id === id);
                if (point?.anchors) {
                    anchorsToRemove = point.anchors.map((anchor) => anchor.id);
                    break;
                }
            }

            if (anchorsToRemove.length > 0 && editorRef.current) {
                editorRef.current.update(() => {
                    $getRoot().getAllTextNodes().forEach((textNode) => {
                        const parent = textNode.getParent();
                        if ($isPlotAnchorNode(parent)) {
                            const ids = parent.getIDs();
                            if (ids.some((anchorId) => anchorsToRemove.includes(anchorId))) {
                                parent.unwrap();
                            }
                        }
                    });
                });
            }

            await deletePlotPoint(id);
        } catch (error) {
            console.error('Failed to delete plot point:', error);
        }
    }, [deletePlotPoint, editorRef, plotLines]);

    useEffect(() => {
        const handleOpenModal = (event: Event) => {
            const customEvent = event as CustomEvent<{
                isCreateMode: boolean;
                pointId?: string;
                initialData?: any;
                anchorData?: PlotContextMenuData;
            }>;
            const { isCreateMode, pointId, initialData, anchorData } = customEvent.detail || {};
            setIsPlotPointCreateMode(Boolean(isCreateMode));

            if (isCreateMode) {
                let data = initialData || {};
                if (!data.chapterId && activeChapterMeta) {
                    data = { ...data, chapterId: activeChapterMeta.id, title: data.title || activeChapterMeta.title };
                }
                if (anchorData) {
                    setPendingAnchorSelection(anchorData);
                }
                setPlotPointCreateData(data);
                setEditingPlotPoint(null);
            } else {
                if (pointId) {
                    let found: PlotPointLike | null = null;
                    for (const line of plotLines) {
                        const point = line.points?.find((item) => item.id === pointId);
                        if (point) {
                            found = point;
                            break;
                        }
                    }
                    setEditingPlotPoint(found);
                }
            }

            setIsPlotPointModalOpen(true);
        };

        window.addEventListener('open-plot-point-modal', handleOpenModal as EventListener);
        return () => window.removeEventListener('open-plot-point-modal', handleOpenModal as EventListener);
    }, [activeChapterMeta, plotLines]);

    return {
        highlightedPlotPointId,
        plotContextMenuData,
        isPlotAnchorModalOpen,
        isPlotPointModalOpen,
        plotPointCreateData,
        editingPlotPoint,
        isPlotPointCreateMode,
        setPlotContextMenuData,
        setIsPlotAnchorModalOpen,
        setIsPlotPointModalOpen,
        handlePlotContextMenu,
        handleAddAnchorClick,
        handleRemoveAnchor,
        handleSubmitAnchor,
        handleCreatePointFromSelection,
        handleCreatePlotPoint,
        handleSavePlotPoint,
        handleViewDetails,
        handlePlotAnchorClick,
        handleJumpToPlotPoint,
        handleDeletePlotPoint,
    };
}
