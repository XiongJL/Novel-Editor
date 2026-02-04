import { app, ipcMain, BrowserWindow } from "electron";
import { db, initDb } from "@novel-editor/core";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execSync } from "child_process";
import fs from "fs";
const API_BASE = "http://localhost:8080/api/sync";
class SyncManager {
  // Get the global sync cursor
  async getCursor() {
    const state = await db.syncState.findUnique({ where: { id: "global" } });
    return state ? Number(state.cursor) : 0;
  }
  async setCursor(val) {
    await db.syncState.upsert({
      where: { id: "global" },
      create: { id: "global", cursor: BigInt(val) },
      update: { cursor: BigInt(val) }
    });
  }
  async pull() {
    var _a, _b;
    const cursor = await this.getCursor();
    console.log("[Sync] Pulling from cursor:", cursor);
    try {
      const response = await fetch(`${API_BASE}/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastSyncCursor: cursor })
      });
      if (!response.ok)
        throw new Error(`Pull failed: ${response.statusText}`);
      const result = await response.json();
      const { newSyncCursor, data } = result;
      await db.$transaction(async (tx) => {
        var _a2, _b2, _c;
        if ((_a2 = data.novels) == null ? void 0 : _a2.length) {
          for (const novel of data.novels) {
            await tx.novel.upsert({
              where: { id: novel.id },
              create: { ...novel, updatedAt: new Date(novel.updatedAt), createdAt: new Date(novel.createdAt) },
              update: { ...novel, updatedAt: new Date(novel.updatedAt), createdAt: new Date(novel.createdAt) }
            });
          }
        }
        if ((_b2 = data.volumes) == null ? void 0 : _b2.length) {
          for (const vol of data.volumes) {
            await tx.volume.upsert({
              where: { id: vol.id },
              create: { ...vol, updatedAt: new Date(vol.updatedAt), createdAt: new Date(vol.createdAt) },
              update: { ...vol, updatedAt: new Date(vol.updatedAt), createdAt: new Date(vol.createdAt) }
            });
          }
        }
        if ((_c = data.chapters) == null ? void 0 : _c.length) {
          for (const ch of data.chapters) {
            await tx.chapter.upsert({
              where: { id: ch.id },
              create: { ...ch, updatedAt: new Date(ch.updatedAt), createdAt: new Date(ch.createdAt) },
              update: { ...ch, updatedAt: new Date(ch.updatedAt), createdAt: new Date(ch.createdAt) }
            });
          }
        }
      });
      await this.setCursor(newSyncCursor);
      console.log("[Sync] Pull complete. New cursor:", newSyncCursor);
      return { success: true, count: (((_a = data.novels) == null ? void 0 : _a.length) || 0) + (((_b = data.chapters) == null ? void 0 : _b.length) || 0) };
    } catch (e) {
      console.error("[Sync] Pull error:", e);
      throw e;
    }
  }
  async push() {
    const cursor = await this.getCursor();
    const changes = {
      novels: await db.novel.findMany({ where: { updatedAt: { gt: new Date(cursor) } } }),
      volumes: await db.volume.findMany({ where: { updatedAt: { gt: new Date(cursor) } } }),
      chapters: await db.chapter.findMany({ where: { updatedAt: { gt: new Date(cursor) } } })
    };
    if (changes.novels.length === 0 && changes.volumes.length === 0 && changes.chapters.length === 0) {
      return { success: true, count: 0 };
    }
    console.log("[Sync] Pushing changes...");
    const payload = JSON.stringify({
      lastSyncCursor: cursor,
      changes
    }, (_, v) => typeof v === "bigint" ? v.toString() : v);
    const response = await fetch(`${API_BASE}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload
    });
    if (!response.ok)
      throw new Error(`Push failed: ${response.statusText}`);
    console.log("[Sync] Push success");
    return await response.json();
  }
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
process.on("uncaughtException", (error) => {
  console.error("[Main] Uncaught Exception:", error);
  app.quit();
  process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Main] Unhandled Rejection at:", promise, "reason:", reason);
  app.quit();
  process.exit(1);
});
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC || "", "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    },
    // Win11 style & White Screen Fix
    frame: true,
    titleBarStyle: "default",
    backgroundColor: "#0a0a0f",
    // Match App Theme
    show: false,
    // Wait for ready-to-show
    autoHideMenuBar: true
    // Hide default menu bar
  });
  win.once("ready-to-show", () => {
    win == null ? void 0 : win.show();
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12" || input.control && input.shift && input.key.toLowerCase() === "i") {
      if (win == null ? void 0 : win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools();
      } else {
        win == null ? void 0 : win.webContents.openDevTools();
      }
      event.preventDefault();
    }
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
ipcMain.handle("db:get-novels", async () => {
  console.log("[Main] Received db:get-novels");
  try {
    const novels = await db.novel.findMany({
      include: {
        volumes: {
          select: {
            chapters: { select: { wordCount: true } }
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
    return novels.map((n) => {
      const totalWords = n.volumes.reduce(
        (acc, v) => acc + v.chapters.reduce((cAcc, c) => cAcc + c.wordCount, 0),
        0
      );
      const { volumes, ...rest } = n;
      return {
        ...rest,
        wordCount: totalWords
      };
    });
  } catch (e) {
    console.error("[Main] db:get-novels failed:", e);
    throw e;
  }
});
ipcMain.handle("db:update-novel", async (_, { id, data }) => {
  console.log("[Main] Updating novel:", id, data);
  try {
    return await db.novel.update({
      where: { id },
      data: {
        ...data,
        updatedAt: /* @__PURE__ */ new Date()
      }
    });
  } catch (e) {
    console.error("[Main] db:update-novel failed:", e);
    throw e;
  }
});
ipcMain.handle("db:get-volumes", async (_, novelId) => {
  try {
    return await db.volume.findMany({
      where: { novelId },
      include: {
        chapters: { orderBy: { order: "asc" } }
      },
      orderBy: { order: "asc" }
    });
  } catch (e) {
    console.error("[Main] db:get-volumes failed:", e);
    throw e;
  }
});
ipcMain.handle("db:create-volume", async (_, { novelId, title }) => {
  try {
    const lastVol = await db.volume.findFirst({
      where: { novelId },
      orderBy: { order: "desc" }
    });
    const order = ((lastVol == null ? void 0 : lastVol.order) || 0) + 1;
    return await db.volume.create({
      data: { novelId, title, order }
    });
  } catch (e) {
    console.error("[Main] db:create-volume failed:", e);
    throw e;
  }
});
ipcMain.handle("db:create-chapter", async (_, { volumeId, title, order }) => {
  try {
    return await db.chapter.create({
      data: {
        volumeId,
        title,
        order,
        content: "",
        wordCount: 0
      }
    });
  } catch (e) {
    console.error("[Main] db:create-chapter failed:", e);
    throw e;
  }
});
ipcMain.handle("db:get-chapter", async (_, chapterId) => {
  try {
    return await db.chapter.findUnique({ where: { id: chapterId } });
  } catch (e) {
    console.error("[Main] db:get-chapter failed:", e);
    throw e;
  }
});
ipcMain.handle("db:rename-volume", async (_, { volumeId, title }) => {
  try {
    return await db.volume.update({
      where: { id: volumeId },
      data: { title }
    });
  } catch (e) {
    console.error("[Main] db:rename-volume failed:", e);
    throw e;
  }
});
ipcMain.handle("db:rename-chapter", async (_, { chapterId, title }) => {
  try {
    return await db.chapter.update({
      where: { id: chapterId },
      data: { title }
    });
  } catch (e) {
    console.error("[Main] db:rename-chapter failed:", e);
    throw e;
  }
});
ipcMain.handle("db:create-novel", async (_, title) => {
  console.log("[Main] Received db:create-novel:", title);
  try {
    const novel = await db.novel.create({
      data: {
        title,
        wordCount: 0,
        volumes: {
          create: {
            title: "",
            // Default empty
            order: 1,
            chapters: {
              create: {
                title: "",
                // Default empty
                content: "",
                order: 1,
                wordCount: 0
              }
            }
          }
        }
      }
    });
    return novel;
  } catch (e) {
    console.error("[Main] db:create-novel failed:", e);
    throw e;
  }
});
ipcMain.handle("db:save-chapter", async (_, { chapterId, content }) => {
  try {
    console.log("[Main] Saving chapter:", chapterId);
    const chapter = await db.chapter.findUnique({
      where: { id: chapterId },
      select: {
        wordCount: true,
        volume: { select: { novelId: true } }
      }
    });
    if (!chapter || !chapter.volume)
      throw new Error("Chapter or Volume not found");
    const novelId = chapter.volume.novelId;
    const newWordCount = content.length;
    const delta = newWordCount - chapter.wordCount;
    const [, updatedChapter] = await db.$transaction([
      // 1. Update Novel WordCount
      db.novel.update({
        where: { id: novelId },
        data: {
          wordCount: { increment: delta },
          updatedAt: /* @__PURE__ */ new Date()
        }
      }),
      // 2. Update Chapter
      db.chapter.update({
        where: { id: chapterId },
        data: {
          content,
          wordCount: newWordCount,
          updatedAt: /* @__PURE__ */ new Date()
        }
      })
    ]);
    return updatedChapter;
  } catch (e) {
    console.error("[Main] db:save-chapter failed:", e);
    throw e;
  }
});
ipcMain.handle("db:create-idea", async (_, data) => {
  try {
    const { timestamp, tags, ...prismaData } = data;
    const novelId = prismaData.novelId;
    const result = await db.idea.create({
      data: {
        ...prismaData,
        tags: {
          connectOrCreate: (tags || []).map((tag) => ({
            where: { name_novelId: { name: tag, novelId } },
            create: { name: tag, novelId }
          }))
        }
      },
      include: { tags: true }
    });
    return {
      ...result,
      tags: result.tags.map((t) => t.name),
      timestamp: result.createdAt.getTime()
    };
  } catch (e) {
    console.error("[Main] db:create-idea failed:", e);
    throw e;
  }
});
ipcMain.handle("db:get-ideas", async (_, novelId) => {
  try {
    const ideas = await db.idea.findMany({
      where: { novelId },
      include: { tags: true },
      orderBy: [
        { isStarred: "desc" },
        { updatedAt: "desc" }
      ]
    });
    return ideas.map((idea) => ({
      ...idea,
      tags: idea.tags.map((t) => t.name),
      timestamp: idea.createdAt.getTime()
    }));
  } catch (e) {
    console.error("[Main] db:get-ideas failed:", e);
    throw e;
  }
});
ipcMain.handle("db:update-idea", async (_, id, data) => {
  try {
    const { timestamp, tags, ...updateData } = data;
    const finalData = { ...updateData };
    if (tags !== void 0) {
      const currentIdea = await db.idea.findUnique({ where: { id }, select: { novelId: true } });
      if (currentIdea) {
        const novelId = currentIdea.novelId;
        finalData.tags = {
          set: [],
          // Disconnect all existing
          connectOrCreate: (tags || []).map((tag) => ({
            where: { name_novelId: { name: tag, novelId } },
            create: { name: tag, novelId }
          }))
        };
      }
    }
    const result = await db.idea.update({
      where: { id },
      data: {
        ...finalData,
        updatedAt: /* @__PURE__ */ new Date()
      },
      include: { tags: true }
    });
    return {
      ...result,
      tags: result.tags.map((t) => t.name),
      timestamp: result.createdAt.getTime()
    };
  } catch (e) {
    console.error("[Main] db:update-idea failed:", e);
    throw e;
  }
});
ipcMain.handle("db:delete-idea", async (_, id) => {
  try {
    return await db.idea.delete({ where: { id } });
  } catch (e) {
    console.error("[Main] db:delete-idea failed:", e);
    throw e;
  }
});
const syncManager = new SyncManager();
ipcMain.handle("sync:pull", async () => {
  try {
    return await syncManager.pull();
  } catch (e) {
    console.error("[Main] sync:pull failed:", e);
    throw e;
  }
});
ipcMain.handle("sync:push", async () => {
  try {
    return await syncManager.push();
  } catch (e) {
    console.error("[Main] sync:push failed:", e);
    throw e;
  }
});
ipcMain.handle("db:get-all-tags", async (_, novelId) => {
  try {
    if (!novelId)
      return [];
    const tags = await db.tag.findMany({
      where: { novelId },
      orderBy: { name: "asc" },
      select: { name: true }
    });
    return tags.map((t) => t.name);
  } catch (e) {
    console.error("[Main] db:get-all-tags failed:", e);
    throw e;
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(async () => {
  console.log("[Main] App Ready. Starting DB Setup...");
  let dataPath;
  if (app.isPackaged) {
    const exePath = path.dirname(app.getPath("exe"));
    dataPath = path.join(exePath, "data");
  } else {
    dataPath = app.getPath("userData");
  }
  const dbPath = path.join(dataPath, "novel_editor.db");
  const dbUrl = `file:${dbPath}`;
  console.log("[Main] Database Path:", dbPath);
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  if (!app.isPackaged) {
    const schemaPath = path.resolve(__dirname$1, "../../../packages/core/prisma/schema.prisma");
    console.log("[Main] Development mode detected (unpackaged). Checking schema at:", schemaPath);
    if (fs.existsSync(schemaPath)) {
      console.log("[Main] Schema found. Attempting synchronous DB push to:", dbPath);
      try {
        const prismaPath = path.resolve(__dirname$1, "../../../packages/core/node_modules/.bin/prisma.cmd");
        const dbFolder = path.dirname(dbPath);
        if (!fs.existsSync(dbFolder)) {
          fs.mkdirSync(dbFolder, { recursive: true });
        }
        const command = `"${prismaPath}" db push --schema="${schemaPath}" --accept-data-loss`;
        console.log("[Main] Executing migration command...");
        execSync(command, {
          env: { ...process.env, DATABASE_URL: dbUrl },
          cwd: path.resolve(__dirname$1, "../../../packages/core"),
          stdio: "inherit",
          // Show output in console!
          windowsHide: true
        });
        console.log("[Main] DB Push completed successfully.");
      } catch (error) {
        console.error("[Main] DB Push failed. Details:", error);
      }
    } else {
      console.warn("[Main] Schema file NOT found at:", schemaPath);
    }
  }
  initDb(dbUrl);
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
