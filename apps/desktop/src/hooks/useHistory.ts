import { useState, useCallback, useRef } from 'react';

export interface HistoryState<T> {
    past: T[];
    present: T;
    future: T[];
}

export function useHistory<T>(initialPresent: T, debounceTime = 800, maxHistory = 100) {
    const [state, setState] = useState<HistoryState<T>>({
        past: [],
        present: initialPresent,
        future: []
    });

    // We use 'lastSaveTime' to track the last time a meaningful change was pushed to history (or the start of a burst).
    // Actually, to implement "Group by pause", we need to track the last EDIT time.
    const lastEditTime = useRef<number>(Date.now());

    const canUndo = state.past.length > 0;
    const canRedo = state.future.length > 0;

    const undo = useCallback(() => {
        setState(currentState => {
            const { past, present, future } = currentState;
            if (past.length === 0) return currentState;

            const previous = past[past.length - 1];
            const newPast = past.slice(0, past.length - 1);

            return {
                past: newPast,
                present: previous,
                future: [present, ...future]
            };
        });
    }, []);

    const redo = useCallback(() => {
        setState(currentState => {
            const { past, present, future } = currentState;
            if (future.length === 0) return currentState;

            const next = future[0];
            const newFuture = future.slice(1);

            return {
                past: [...past, present],
                present: next,
                future: newFuture
            };
        });
    }, []);

    const set = useCallback((newPresent: T, immediate = false) => {
        setState(currentState => {
            if (currentState.present === newPresent) return currentState;

            const now = Date.now();
            const timeDiff = now - lastEditTime.current;
            lastEditTime.current = now;

            // Strategy:
            // 1. If immediate (formatting, paste) -> Force new snapshot.
            // 2. If timeDiff > debounceTime (pause detected) -> Force new snapshot.
            // 3. Otherwise -> Merge into current 'present' (don't push to past).

            if (immediate || timeDiff > debounceTime) {
                const newPast = [...currentState.past, currentState.present];
                // Limit history size
                if (newPast.length > maxHistory) {
                    newPast.shift(); // Remove oldest
                }

                return {
                    past: newPast,
                    present: newPresent,
                    future: []
                };
            } else {
                return {
                    ...currentState,
                    present: newPresent,
                    future: []
                };
            }
        });
    }, [debounceTime, maxHistory]);

    // Force a snapshot (e.g. before a large operation)
    const snapshot = useCallback(() => {
        setState(curr => ({
            ...curr,
            past: [...curr.past, curr.present]
        }));
        lastEditTime.current = Date.now();
    }, []);

    // Completely reset history (e.g. for new content load)
    const reset = useCallback((newPresent: T) => {
        setState({
            past: [],
            present: newPresent,
            future: []
        });
        lastEditTime.current = Date.now();
    }, []);

    // Restore full history state (for switching tabs/chapters)
    const restore = useCallback((fullState: HistoryState<T>) => {
        setState(fullState);
        lastEditTime.current = Date.now();
    }, []);

    return {
        state: state.present,
        fullState: state, // Export full state for caching
        set,
        reset,
        restore,
        undo,
        redo,
        canUndo,
        canRedo,
        snapshot
    };
}
