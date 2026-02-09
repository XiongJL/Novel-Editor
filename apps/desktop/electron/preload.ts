import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('db', {
    getNovels: () => ipcRenderer.invoke('db:get-novels'),
    getAllTags: (novelId?: string) => ipcRenderer.invoke('db:get-all-tags', novelId),
    createNovel: (title: string) => ipcRenderer.invoke('db:create-novel', title),
    getVolumes: (novelId: string) => ipcRenderer.invoke('db:get-volumes', novelId),
    createVolume: (data: { novelId: string; title: string }) => ipcRenderer.invoke('db:create-volume', data),
    createChapter: (data: { volumeId: string; title: string; order: number }) => ipcRenderer.invoke('db:create-chapter', data),
    getChapter: (chapterId: string) => ipcRenderer.invoke('db:get-chapter', chapterId),
    saveChapter: (data: { chapterId: string; content: string }) => ipcRenderer.invoke('db:save-chapter', data),
    renameVolume: (data: { volumeId: string; title: string }) => ipcRenderer.invoke('db:rename-volume', data),
    renameChapter: (data: { chapterId: string; title: string }) => ipcRenderer.invoke('db:rename-chapter', data),
    updateNovel: (data: { id: string; data: { title?: string; coverUrl?: string; formatting?: string } }) => ipcRenderer.invoke('db:update-novel', data),

    // Idea
    getIdeas: (novelId: string) => ipcRenderer.invoke('db:get-ideas', novelId),
    createIdea: (data: any) => ipcRenderer.invoke('db:create-idea', data),
    updateIdea: (id: string, data: any) => ipcRenderer.invoke('db:update-idea', id, data),
    deleteIdea: (id: string) => ipcRenderer.invoke('db:delete-idea', id),

    // Search
    search: (params: { novelId: string; keyword: string; limit?: number; offset?: number }) =>
        ipcRenderer.invoke('db:search', params),
    rebuildSearchIndex: (novelId: string) => ipcRenderer.invoke('db:rebuild-search-index', novelId),
    checkIndexStatus: (novelId: string) => ipcRenderer.invoke('db:check-index-status', novelId),

    // Story Structure
    getPlotLines: (novelId: string) => ipcRenderer.invoke('db:get-plot-lines', novelId),
    createPlotLine: (data: { novelId: string; name: string; color: string }) => ipcRenderer.invoke('db:create-plot-line', data),
    updatePlotLine: (id: string, data: any) => ipcRenderer.invoke('db:update-plot-line', { id, data }),
    deletePlotLine: (id: string) => ipcRenderer.invoke('db:delete-plot-line', id),

    createPlotPoint: (data: any) => ipcRenderer.invoke('db:create-plot-point', data),
    updatePlotPoint: (id: string, data: any) => ipcRenderer.invoke('db:update-plot-point', { id, data }),
    deletePlotPoint: (id: string) => ipcRenderer.invoke('db:delete-plot-point', id),

    createPlotPointAnchor: (data: any) => ipcRenderer.invoke('db:create-plot-point-anchor', data),
    deletePlotPointAnchor: (id: string) => ipcRenderer.invoke('db:delete-plot-point-anchor', id),

    reorderPlotLines: (novelId: string, lineIds: string[]) => ipcRenderer.invoke('db:reorder-plot-lines', { novelId, lineIds }),
    reorderPlotPoints: (plotLineId: string, pointIds: string[]) => ipcRenderer.invoke('db:reorder-plot-points', { plotLineId, pointIds }),
})

contextBridge.exposeInMainWorld('electron', {
    toggleFullScreen: () => ipcRenderer.invoke('app:toggle-fullscreen'),
    onFullScreenChange: (callback: (isFullScreen: boolean) => void) => {
        const listener = (_event: any, state: boolean) => callback(state);
        ipcRenderer.on('app:fullscreen-change', listener);
        return () => ipcRenderer.removeListener('app:fullscreen-change', listener);
    }
})

contextBridge.exposeInMainWorld('sync', {
    pull: () => ipcRenderer.invoke('sync:pull'),
    push: () => ipcRenderer.invoke('sync:push'),
})

contextBridge.exposeInMainWorld('backup', {
    export: (password?: string) => ipcRenderer.invoke('backup:export', password),
    import: (filePath?: string, password?: string) => ipcRenderer.invoke('backup:import', { filePath, password }),
    getAutoBackups: () => ipcRenderer.invoke('backup:get-auto'),
    restoreAutoBackup: (filename: string) => ipcRenderer.invoke('backup:restore-auto', filename),
})
