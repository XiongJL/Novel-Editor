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
  checkIndexStatus: (novelId) => electron.ipcRenderer.invoke("db:check-index-status", novelId)
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
