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
})

contextBridge.exposeInMainWorld('sync', {
    pull: () => ipcRenderer.invoke('sync:pull'),
    push: () => ipcRenderer.invoke('sync:push'),
})
