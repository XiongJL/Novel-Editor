import { useState, useCallback, useEffect } from 'react';
import { PlotLine, PlotPoint, PlotPointAnchor } from '../types';

export function usePlotSystem(novelId: string) {
    const [plotLines, setPlotLines] = useState<PlotLine[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadPlotLines = useCallback(async () => {
        if (!novelId) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await window.db.getPlotLines(novelId);
            setPlotLines(data);
        } catch (err: any) {
            console.error('Failed to load plot lines:', err);
            setError(err.message || 'Failed to load plot lines');
        } finally {
            setIsLoading(false);
        }
    }, [novelId]);

    // Initial load & Sync
    useEffect(() => {
        loadPlotLines();

        const handleUpdate = () => {
            loadPlotLines();
        };

        window.addEventListener('plot-update', handleUpdate);
        return () => window.removeEventListener('plot-update', handleUpdate);
    }, [loadPlotLines]);

    const dispatchUpdate = () => {
        window.dispatchEvent(new Event('plot-update'));
    };

    // --- Plot Lines ---

    const createPlotLine = useCallback(async (name: string, color: string) => {
        try {
            const newLine = await window.db.createPlotLine({ novelId, name, color });
            setPlotLines(prev => [...prev, { ...newLine, points: [] }]); // Optimistic append? Or wait for reload?
            // Reloading ensures sort order is correct if backend logic handles it, 
            // but appending is faster. 
            // Let's reload to be safe about complete object structure if needed.
            // Actually, we can just append, but we need to ensure the points array exists.
            dispatchUpdate();
            return newLine;
        } catch (err: any) {
            console.error('Failed to create plot line:', err);
            throw err;
        }
    }, [novelId]);

    const updatePlotLine = useCallback(async (id: string, data: Partial<PlotLine>) => {
        try {
            const updated = await window.db.updatePlotLine(id, data);
            setPlotLines(prev => prev.map(line => line.id === id ? { ...line, ...updated } : line));
            dispatchUpdate();
            return updated;
        } catch (err: any) {
            console.error('Failed to update plot line:', err);
            throw err;
        }
    }, []);

    const deletePlotLine = useCallback(async (id: string) => {
        try {
            await window.db.deletePlotLine(id);
            setPlotLines(prev => prev.filter(line => line.id !== id));
            dispatchUpdate();
        } catch (err: any) {
            console.error('Failed to delete plot line:', err);
            throw err;
        }
    }, []);

    // --- Plot Points ---

    const createPlotPoint = useCallback(async (data: Partial<PlotPoint>) => {
        try {
            const newPoint = await window.db.createPlotPoint({ ...data, novelId });
            // Update local state
            setPlotLines(prev => prev.map(line => {
                if (line.id === newPoint.plotLineId) {
                    const points = line.points ? [...line.points, newPoint] : [newPoint];
                    return { ...line, points };
                }
                return line;
            }));
            dispatchUpdate();
            return newPoint;
        } catch (err: any) {
            console.error('Failed to create plot point:', err);
            throw err;
        }
    }, [novelId]);

    const updatePlotPoint = useCallback(async (id: string, data: Partial<PlotPoint>) => {
        try {
            const updated = await window.db.updatePlotPoint(id, data);

            // If plotLineId changed, we need to move the point. For now assuming simple update.
            setPlotLines(prev => prev.map(line => {
                if (line.points?.some(p => p.id === id)) {
                    return {
                        ...line,
                        points: line.points.map(p => p.id === id ? { ...p, ...updated } : p)
                    };
                }
                return line;
            }));
            dispatchUpdate();
            return updated;
        } catch (err: any) {
            console.error('Failed to update plot point:', err);
            throw err;
        }
    }, []);

    const deletePlotPoint = useCallback(async (id: string) => {
        try {
            await window.db.deletePlotPoint(id);
            setPlotLines(prev => prev.map(line => ({
                ...line,
                points: line.points?.filter(p => p.id !== id) || []
            })));
            dispatchUpdate();
        } catch (err: any) {
            console.error('Failed to delete plot point:', err);
            throw err;
        }
    }, []);

    // --- Anchors ---

    const addAnchor = useCallback(async (data: Partial<PlotPointAnchor>) => {
        try {
            const newAnchor = await window.db.createPlotPointAnchor(data);
            // Updating deep nested state is complex here. 
            // We might want to reload or carefully update.
            // Let's rely on reload for now for complex deep updates, or try to update.
            // Finding the point to update:
            setPlotLines(prev => prev.map(line => ({
                ...line,
                points: line.points?.map(point => {
                    if (point.id === data.plotPointId) {
                        return {
                            ...point,
                            anchors: [...(point.anchors || []), newAnchor]
                        };
                    }
                    return point;
                })
            })));
            dispatchUpdate();
            return newAnchor;
        } catch (err: any) {
            console.error('Failed to add anchor:', err);
            throw err;
        }
    }, []);

    const removeAnchor = useCallback(async (id: string, plotPointId: string) => {
        try {
            await window.db.deletePlotPointAnchor(id);
            setPlotLines(prev => prev.map(line => ({
                ...line,
                points: line.points?.map(point => {
                    if (point.id === plotPointId) {
                        return {
                            ...point,
                            anchors: point.anchors?.filter(a => a.id !== id) || []
                        };
                    }
                    return point;
                })
            })));
        } catch (err: any) {
            console.error('Failed to remove anchor:', err);
            throw err;
        }
    }, []);

    const reorderPlotLines = useCallback(async (lineIds: string[]) => {
        // Optimistic update
        setPlotLines(prev => {
            const map = new Map(prev.map(p => [p.id, p]));
            return lineIds.map(id => map.get(id)).filter((p): p is PlotLine => !!p);
        });

        try {
            await window.db.reorderPlotLines(novelId, lineIds);
            dispatchUpdate();
        } catch (err) {
            console.error('Failed to reorder plot lines:', err);
            // Revert or reload
            loadPlotLines();
        }
    }, [novelId, loadPlotLines]);

    const reorderPlotPoints = useCallback(async (plotLineId: string, pointIds: string[]) => {
        // Optimistic update
        setPlotLines(prev => prev.map(line => {
            if (line.id === plotLineId && line.points) {
                const map = new Map(line.points.map(p => [p.id, p]));
                const newPoints = pointIds.map(id => map.get(id)).filter((p): p is PlotPoint => !!p);
                return { ...line, points: newPoints };
            }
            return line;
        }));

        try {
            await window.db.reorderPlotPoints(plotLineId, pointIds);
            dispatchUpdate();
        } catch (err) {
            console.error('Failed to reorder plot points:', err);
            loadPlotLines();
        }
    }, [loadPlotLines]);

    return {
        plotLines,
        isLoading,
        error,
        refresh: loadPlotLines,
        createPlotLine,
        updatePlotLine,
        deletePlotLine,
        createPlotPoint,
        updatePlotPoint,
        deletePlotPoint,
        addAnchor,
        removeAnchor,
        reorderPlotLines,
        reorderPlotPoints
    };
}
