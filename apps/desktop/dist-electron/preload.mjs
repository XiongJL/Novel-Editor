"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("db", {
  getNovels: () => electron.ipcRenderer.invoke("db:get-novels"),
  getAllTags: (novelId) => electron.ipcRenderer.invoke("db:get-all-tags", novelId),
  createNovel: (title) => electron.ipcRenderer.invoke("db:create-novel", title),
  getVolumes: (novelId) => electron.ipcRenderer.invoke("db:get-volumes", novelId),
  createVolume: (data) => electron.ipcRenderer.invoke("db:create-volume", data),
  createChapter: (data) => electron.ipcRenderer.invoke("db:create-chapter", data),
  getChapter: (chapterId) => electron.ipcRenderer.invoke("db:get-chapter", chapterId),
  saveChapter: (data) => electron.ipcRenderer.invoke("db:save-chapter", data),
  renameVolume: (data) => electron.ipcRenderer.invoke("db:rename-volume", data),
  renameChapter: (data) => electron.ipcRenderer.invoke("db:rename-chapter", data),
  updateNovel: (data) => electron.ipcRenderer.invoke("db:update-novel", data),
  // Idea
  getIdeas: (novelId) => electron.ipcRenderer.invoke("db:get-ideas", novelId),
  createIdea: (data) => electron.ipcRenderer.invoke("db:create-idea", data),
  updateIdea: (id, data) => electron.ipcRenderer.invoke("db:update-idea", id, data),
  deleteIdea: (id) => electron.ipcRenderer.invoke("db:delete-idea", id),
  // Search
  search: (params) => electron.ipcRenderer.invoke("db:search", params),
  rebuildSearchIndex: (novelId) => electron.ipcRenderer.invoke("db:rebuild-search-index", novelId),
  checkIndexStatus: (novelId) => electron.ipcRenderer.invoke("db:check-index-status", novelId),
  // Story Structure
  getPlotLines: (novelId) => electron.ipcRenderer.invoke("db:get-plot-lines", novelId),
  createPlotLine: (data) => electron.ipcRenderer.invoke("db:create-plot-line", data),
  updatePlotLine: (id, data) => electron.ipcRenderer.invoke("db:update-plot-line", { id, data }),
  deletePlotLine: (id) => electron.ipcRenderer.invoke("db:delete-plot-line", id),
  createPlotPoint: (data) => electron.ipcRenderer.invoke("db:create-plot-point", data),
  updatePlotPoint: (id, data) => electron.ipcRenderer.invoke("db:update-plot-point", { id, data }),
  deletePlotPoint: (id) => electron.ipcRenderer.invoke("db:delete-plot-point", id),
  createPlotPointAnchor: (data) => electron.ipcRenderer.invoke("db:create-plot-point-anchor", data),
  deletePlotPointAnchor: (id) => electron.ipcRenderer.invoke("db:delete-plot-point-anchor", id),
  reorderPlotLines: (novelId, lineIds) => electron.ipcRenderer.invoke("db:reorder-plot-lines", { novelId, lineIds }),
  reorderPlotPoints: (plotLineId, pointIds) => electron.ipcRenderer.invoke("db:reorder-plot-points", { plotLineId, pointIds }),
  // Character & Item
  getCharacters: (novelId) => electron.ipcRenderer.invoke("db:get-characters", novelId),
  getCharacter: (id) => electron.ipcRenderer.invoke("db:get-character", id),
  createCharacter: (data) => electron.ipcRenderer.invoke("db:create-character", data),
  updateCharacter: (id, data) => electron.ipcRenderer.invoke("db:update-character", { id, data }),
  deleteCharacter: (id) => electron.ipcRenderer.invoke("db:delete-character", id),
  getItems: (novelId) => electron.ipcRenderer.invoke("db:get-items", novelId),
  getItem: (id) => electron.ipcRenderer.invoke("db:get-item", id),
  createItem: (data) => electron.ipcRenderer.invoke("db:create-item", data),
  updateItem: (id, data) => electron.ipcRenderer.invoke("db:update-item", { id, data }),
  deleteItem: (id) => electron.ipcRenderer.invoke("db:delete-item", id),
  getMentionables: (novelId) => electron.ipcRenderer.invoke("db:get-mentionables", novelId),
  // World Settings
  getWorldSettings: (novelId) => electron.ipcRenderer.invoke("db:get-world-settings", novelId),
  createWorldSetting: (data) => electron.ipcRenderer.invoke("db:create-world-setting", data),
  updateWorldSetting: (id, data) => electron.ipcRenderer.invoke("db:update-world-setting", id, data),
  deleteWorldSetting: (id) => electron.ipcRenderer.invoke("db:delete-world-setting", id),
  // Relationships
  getRelationships: (characterId) => electron.ipcRenderer.invoke("db:get-relationships", characterId),
  createRelationship: (data) => electron.ipcRenderer.invoke("db:create-relationship", data),
  deleteRelationship: (id) => electron.ipcRenderer.invoke("db:delete-relationship", id),
  // Item Ownership
  getCharacterItems: (characterId) => electron.ipcRenderer.invoke("db:get-character-items", characterId),
  addItemToCharacter: (data) => electron.ipcRenderer.invoke("db:add-item-to-character", data),
  removeItemFromCharacter: (id) => electron.ipcRenderer.invoke("db:remove-item-from-character", id),
  updateItemOwnership: (id, data) => electron.ipcRenderer.invoke("db:update-item-ownership", id, data),
  // Data Aggregation
  getCharacterTimeline: (characterId) => electron.ipcRenderer.invoke("db:get-character-timeline", characterId),
  getRecentChapters: (characterName, novelId, limit) => electron.ipcRenderer.invoke("db:get-recent-chapters", characterName, novelId, limit),
  getCharacterChapterAppearances: (characterId) => electron.ipcRenderer.invoke("db:get-character-chapter-appearances", characterId)
});
electron.contextBridge.exposeInMainWorld("electron", {
  toggleFullScreen: () => electron.ipcRenderer.invoke("app:toggle-fullscreen"),
  onFullScreenChange: (callback) => {
    const listener = (_event, state) => callback(state);
    electron.ipcRenderer.on("app:fullscreen-change", listener);
    return () => electron.ipcRenderer.removeListener("app:fullscreen-change", listener);
  }
});
electron.contextBridge.exposeInMainWorld("sync", {
  pull: () => electron.ipcRenderer.invoke("sync:pull"),
  push: () => electron.ipcRenderer.invoke("sync:push")
});
electron.contextBridge.exposeInMainWorld("backup", {
  export: (password) => electron.ipcRenderer.invoke("backup:export", password),
  import: (filePath, password) => electron.ipcRenderer.invoke("backup:import", { filePath, password }),
  getAutoBackups: () => electron.ipcRenderer.invoke("backup:get-auto"),
  restoreAutoBackup: (filename) => electron.ipcRenderer.invoke("backup:restore-auto", filename)
});
