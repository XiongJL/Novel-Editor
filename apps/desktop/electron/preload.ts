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
    uploadNovelCover: (novelId: string) => ipcRenderer.invoke('db:upload-novel-cover', novelId),

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

    // Character & Item
    getCharacters: (novelId: string) => ipcRenderer.invoke('db:get-characters', novelId),
    getCharacter: (id: string) => ipcRenderer.invoke('db:get-character', id),
    createCharacter: (data: any) => ipcRenderer.invoke('db:create-character', data),
    updateCharacter: (id: string, data: any) => ipcRenderer.invoke('db:update-character', { id, data }),
    deleteCharacter: (id: string) => ipcRenderer.invoke('db:delete-character', id),
    uploadCharacterImage: (characterId: string, type: 'avatar' | 'fullBody') => ipcRenderer.invoke('db:upload-character-image', { characterId, type }),
    deleteCharacterImage: (characterId: string, imagePath: string, type: 'avatar' | 'fullBody') => ipcRenderer.invoke('db:delete-character-image', { characterId, imagePath, type }),
    getCharacterMapLocations: (characterId: string) => ipcRenderer.invoke('db:get-character-map-locations', characterId),

    getItems: (novelId: string) => ipcRenderer.invoke('db:get-items', novelId),
    getItem: (id: string) => ipcRenderer.invoke('db:get-item', id),
    createItem: (data: any) => ipcRenderer.invoke('db:create-item', data),
    updateItem: (id: string, data: any) => ipcRenderer.invoke('db:update-item', { id, data }),
    deleteItem: (id: string) => ipcRenderer.invoke('db:delete-item', id),

    getMentionables: (novelId: string) => ipcRenderer.invoke('db:get-mentionables', novelId),

    // World Settings
    getWorldSettings: (novelId: string) => ipcRenderer.invoke('db:get-world-settings', novelId),
    createWorldSetting: (data: { novelId: string; name: string; type?: string }) => ipcRenderer.invoke('db:create-world-setting', data),
    updateWorldSetting: (id: string, data: any) => ipcRenderer.invoke('db:update-world-setting', id, data),
    deleteWorldSetting: (id: string) => ipcRenderer.invoke('db:delete-world-setting', id),

    // Relationships
    getRelationships: (characterId: string) => ipcRenderer.invoke('db:get-relationships', characterId),
    createRelationship: (data: { sourceId: string; targetId: string; relation: string; description?: string }) => ipcRenderer.invoke('db:create-relationship', data),
    deleteRelationship: (id: string) => ipcRenderer.invoke('db:delete-relationship', id),

    // Item Ownership
    getCharacterItems: (characterId: string) => ipcRenderer.invoke('db:get-character-items', characterId),
    addItemToCharacter: (data: { characterId: string; itemId: string; note?: string }) => ipcRenderer.invoke('db:add-item-to-character', data),
    removeItemFromCharacter: (id: string) => ipcRenderer.invoke('db:remove-item-from-character', id),
    updateItemOwnership: (id: string, data: { note?: string }) => ipcRenderer.invoke('db:update-item-ownership', id, data),

    // Data Aggregation
    getCharacterTimeline: (characterId: string) => ipcRenderer.invoke('db:get-character-timeline', characterId),
    getRecentChapters: (characterName: string, novelId: string, limit?: number) => ipcRenderer.invoke('db:get-recent-chapters', characterName, novelId, limit),
    getCharacterChapterAppearances: (characterId: string) => ipcRenderer.invoke('db:get-character-chapter-appearances', characterId),

    // Map System
    getMaps: (novelId: string) => ipcRenderer.invoke('db:get-maps', novelId),
    getMap: (id: string) => ipcRenderer.invoke('db:get-map', id),
    createMap: (data: { novelId: string; name: string; type?: string }) => ipcRenderer.invoke('db:create-map', data),
    updateMap: (id: string, data: any) => ipcRenderer.invoke('db:update-map', { id, data }),
    deleteMap: (id: string) => ipcRenderer.invoke('db:delete-map', id),
    uploadMapBackground: (mapId: string) => ipcRenderer.invoke('db:upload-map-bg', mapId),

    getMapMarkers: (mapId: string) => ipcRenderer.invoke('db:get-map-markers', mapId),
    createMapMarker: (data: { characterId: string; mapId: string; x: number; y: number; label?: string }) => ipcRenderer.invoke('db:create-map-marker', data),
    updateMapMarker: (id: string, data: { x?: number; y?: number; label?: string }) => ipcRenderer.invoke('db:update-map-marker', { id, data }),
    deleteMapMarker: (id: string) => ipcRenderer.invoke('db:delete-map-marker', id),

    getMapElements: (mapId: string) => ipcRenderer.invoke('db:get-map-elements', mapId),
    createMapElement: (data: { mapId: string; type: string; x: number; y: number; text?: string; iconKey?: string }) => ipcRenderer.invoke('db:create-map-element', data),
    updateMapElement: (id: string, data: any) => ipcRenderer.invoke('db:update-map-element', { id, data }),
    deleteMapElement: (id: string) => ipcRenderer.invoke('db:delete-map-element', id),
})

contextBridge.exposeInMainWorld('electron', {
    toggleFullScreen: () => ipcRenderer.invoke('app:toggle-fullscreen'),
    getUserDataPath: () => ipcRenderer.invoke('app:get-user-data-path'),
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
