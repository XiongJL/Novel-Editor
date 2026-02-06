import { app, dialog, ipcMain, BrowserWindow } from "electron";
import { db, initDb } from "@novel-editor/core";
import { fileURLToPath } from "node:url";
import path$1 from "node:path";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import require$$0 from "zlib";
import crypto from "crypto";
async function initSearchIndex() {
  try {
    const tableExists = await db.$queryRaw`
            SELECT name FROM sqlite_master WHERE type='table' AND name='search_index';
        `;
    if (tableExists.length === 0) {
      await db.$executeRaw`
                CREATE VIRTUAL TABLE search_index USING fts5(
                    content,
                    entity_type,
                    entity_id UNINDEXED,
                    novel_id UNINDEXED,
                    chapter_id UNINDEXED,
                    title,
                    volume_title,
                    chapter_order UNINDEXED,
                    volume_order UNINDEXED,
                    volume_id UNINDEXED,
                    tokenize='unicode61'
                );
            `;
      console.log("[SearchIndex] FTS5 table created successfully");
    } else {
      const columnsToAdd = ["volume_title", "chapter_order", "volume_order", "volume_id"];
      for (const col of columnsToAdd) {
        try {
          await db.$executeRawUnsafe(`SELECT ${col} FROM search_index LIMIT 1;`);
        } catch (e) {
          console.warn(`[SearchIndex] Schema mismatch (missing ${col}). Attempting to add column...`);
          try {
            await db.$executeRawUnsafe(`ALTER TABLE search_index ADD COLUMN ${col};`);
            console.log(`[SearchIndex] Added ${col} column successfully`);
          } catch (alterError) {
            console.error(`[SearchIndex] Failed to add column ${col}:`, alterError);
          }
        }
      }
    }
  } catch (error) {
    console.error("[SearchIndex] Failed to initialize FTS5 table:", error);
  }
}
function extractPlainText(lexicalJson) {
  if (!lexicalJson)
    return "";
  try {
    const state = JSON.parse(lexicalJson);
    const textParts = [];
    const traverse = (node) => {
      if (node.type === "text" && node.text) {
        textParts.push(node.text);
      }
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(traverse);
        if (node.type !== "root" && node.type !== "list" && node.type !== "listitem") {
          textParts.push(" ");
        }
      }
    };
    if (state.root) {
      traverse(state.root);
    }
    return textParts.join("").trim();
  } catch {
    return lexicalJson;
  }
}
async function indexChapter(chapter) {
  const plainText = extractPlainText(chapter.content);
  let novelId = chapter.novelId;
  let volumeTitle = chapter.volumeTitle;
  let order = chapter.order;
  let volumeOrder = chapter.volumeOrder;
  if (!novelId || !volumeTitle || order === void 0 || volumeOrder === void 0) {
    const chapterWithVol = await db.chapter.findUnique({
      where: { id: chapter.id },
      select: {
        order: true,
        volume: { select: { id: true, novelId: true, title: true, order: true } }
      }
    });
    if (chapterWithVol) {
      if (order === void 0)
        order = chapterWithVol.order;
      if (chapterWithVol.volume) {
        if (!novelId)
          novelId = chapterWithVol.volume.novelId;
        if (!volumeTitle)
          volumeTitle = chapterWithVol.volume.title;
        if (volumeOrder === void 0)
          volumeOrder = chapterWithVol.volume.order;
      }
    }
  }
  if (!novelId)
    return;
  try {
    await db.$executeRaw`
            DELETE FROM search_index WHERE entity_type = 'chapter' AND entity_id = ${chapter.id};
        `;
    await db.$executeRaw`
            INSERT INTO search_index (content, entity_type, entity_id, novel_id, chapter_id, title, volume_title, chapter_order, volume_order, volume_id)
            VALUES (${plainText}, 'chapter', ${chapter.id}, ${novelId}, ${chapter.id}, ${chapter.title}, ${volumeTitle || ""}, ${order || 0}, ${volumeOrder || 0}, ${chapter.volumeId});
        `;
  } catch (error) {
    console.error("[SearchIndex] Failed to index chapter:", error);
  }
}
async function indexIdea(idea) {
  const searchContent = [idea.content, idea.quote].filter(Boolean).join(" ");
  try {
    await db.$executeRaw`
            DELETE FROM search_index WHERE entity_type = 'idea' AND entity_id = ${idea.id};
        `;
    await db.$executeRaw`
            INSERT INTO search_index (content, entity_type, entity_id, novel_id, chapter_id, title, volume_title, chapter_order, volume_order, volume_id)
            VALUES (${searchContent}, 'idea', ${idea.id}, ${idea.novelId}, ${idea.chapterId || ""}, ${idea.content.substring(0, 50)}, '', 0, 0, '');
        `;
  } catch (error) {
    console.error("[SearchIndex] Failed to index idea:", error);
  }
}
async function removeFromIndex(entityType, entityId) {
  try {
    await db.$executeRaw`
            DELETE FROM search_index WHERE entity_type = ${entityType} AND entity_id = ${entityId};
        `;
  } catch (error) {
    console.error("[SearchIndex] Failed to remove from index:", error);
  }
}
async function search(novelId, keyword, limit = 20, offset = 0) {
  if (!keyword.trim())
    return [];
  try {
    const escapedKeyword = keyword.replace(/[%_]/g, "\\$&");
    const likePattern = `%${escapedKeyword}%`;
    const results = await db.$queryRaw`
            SELECT entity_type, entity_id, chapter_id, novel_id, title, volume_title, content, chapter_order, volume_order, volume_id
            FROM search_index
            WHERE novel_id = ${novelId} 
            AND (content LIKE ${likePattern} OR title LIKE ${likePattern} OR volume_title LIKE ${likePattern})
            ORDER BY volume_order ASC, chapter_order ASC
            LIMIT ${limit} OFFSET ${offset};
        `;
    const allResults = [];
    const lowerKeyword = keyword.toLowerCase();
    const matchedVolumes = /* @__PURE__ */ new Set();
    for (const r of results) {
      const docContent = r.content || "";
      const title = r.title || "";
      const volumeTitle = r.volume_title || "";
      const chapterOrder = Number(r.chapter_order || 0);
      const volumeOrder = Number(r.volume_order || 0);
      if (r.entity_type === "chapter" && volumeTitle && volumeTitle.toLowerCase().includes(lowerKeyword)) {
        if (!matchedVolumes.has(volumeTitle)) {
          allResults.push({
            entityType: "chapter",
            entityId: r.entity_id,
            chapterId: r.chapter_id,
            novelId: r.novel_id,
            title: r.title,
            snippet: `Volume match: <mark>${volumeTitle}</mark>`,
            preview: `Found in Volume: ${volumeTitle}`,
            keyword,
            matchType: "volume",
            chapterOrder,
            volumeTitle,
            volumeOrder,
            volumeId: r.volume_id
          });
          matchedVolumes.add(volumeTitle);
        }
      }
      if (r.entity_type === "chapter" && title.toLowerCase().includes(lowerKeyword)) {
        allResults.push({
          entityType: "chapter",
          entityId: r.entity_id,
          chapterId: r.chapter_id,
          novelId: r.novel_id,
          title: r.title,
          snippet: `Title match: <mark>${title}</mark>`,
          preview: `Found in Title: ${title}`,
          keyword,
          matchType: "title",
          chapterOrder,
          volumeTitle,
          volumeOrder,
          volumeId: r.volume_id
        });
      }
      const lowerContent = docContent.toLowerCase();
      const indices = [];
      let pos = 0;
      while (pos < lowerContent.length && indices.length < 50) {
        const idx = lowerContent.indexOf(lowerKeyword, pos);
        if (idx === -1)
          break;
        indices.push(idx);
        pos = idx + lowerKeyword.length;
      }
      for (const index of indices) {
        allResults.push({
          entityType: r.entity_type,
          entityId: r.entity_id,
          chapterId: r.chapter_id,
          novelId: r.novel_id,
          title: r.title,
          snippet: generateSnippetAtIndex(docContent, keyword, index, 10, true),
          preview: generateSnippetAtIndex(docContent, keyword, index, 25, false),
          keyword,
          matchType: "content",
          chapterOrder,
          volumeTitle,
          volumeOrder,
          volumeId: r.volume_id
        });
      }
    }
    return allResults;
  } catch (error) {
    console.error("[SearchIndex] Search failed:", error);
    return [];
  }
}
function generateSnippetAtIndex(content, keyword, index, contextLength = 30, useMark = true) {
  if (!content)
    return "";
  const start = Math.max(0, index - contextLength);
  const end = Math.min(content.length, index + keyword.length + contextLength * 2);
  let snippet = "";
  if (start > 0)
    snippet += "...";
  const before = content.substring(start, index);
  const match = content.substring(index, index + keyword.length);
  const after = content.substring(index + keyword.length, end);
  if (useMark) {
    snippet += before + "<mark>" + match + "</mark>" + after;
  } else {
    snippet += before + match + after;
  }
  if (end < content.length)
    snippet += "...";
  return snippet;
}
async function rebuildIndex(novelId) {
  var _a, _b;
  let chaptersIndexed = 0;
  let ideasIndexed = 0;
  try {
    await db.$executeRaw`DELETE FROM search_index WHERE novel_id = ${novelId};`;
    const chapters = await db.chapter.findMany({
      where: { volume: { novelId } },
      select: {
        id: true,
        title: true,
        content: true,
        volumeId: true,
        order: true,
        volume: { select: { title: true, order: true } }
      }
    });
    for (const chapter of chapters) {
      await indexChapter({
        ...chapter,
        novelId,
        volumeTitle: (_a = chapter.volume) == null ? void 0 : _a.title,
        volumeOrder: (_b = chapter.volume) == null ? void 0 : _b.order
      });
      chaptersIndexed++;
    }
    const ideas = await db.idea.findMany({
      where: { novelId },
      select: { id: true, content: true, quote: true, novelId: true, chapterId: true }
    });
    for (const idea of ideas) {
      await indexIdea(idea);
      ideasIndexed++;
    }
  } catch (error) {
    console.error("[SearchIndex] Rebuild failed:", error);
  }
  return { chapters: chaptersIndexed, ideas: ideasIndexed };
}
async function getIndexStats(novelId) {
  try {
    const result = await db.$queryRaw`
            SELECT entity_type, COUNT(*) as count FROM search_index WHERE novel_id = ${novelId} GROUP BY entity_type;
        `;
    let chapters = 0;
    let ideas = 0;
    result.forEach((r) => {
      if (r.entity_type === "chapter")
        chapters = Number(r.count);
      if (r.entity_type === "idea")
        ideas = Number(r.count);
    });
    return { chapters, ideas };
  } catch (error) {
    console.error("[SearchIndex] Failed to get stats:", error);
    return { chapters: 0, ideas: 0 };
  }
}
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
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var util = { exports: {} };
var constants = {
  /* The local file header */
  LOCHDR: 30,
  // LOC header size
  LOCSIG: 67324752,
  // "PK\003\004"
  LOCVER: 4,
  // version needed to extract
  LOCFLG: 6,
  // general purpose bit flag
  LOCHOW: 8,
  // compression method
  LOCTIM: 10,
  // modification time (2 bytes time, 2 bytes date)
  LOCCRC: 14,
  // uncompressed file crc-32 value
  LOCSIZ: 18,
  // compressed size
  LOCLEN: 22,
  // uncompressed size
  LOCNAM: 26,
  // filename length
  LOCEXT: 28,
  // extra field length
  /* The Data descriptor */
  EXTSIG: 134695760,
  // "PK\007\008"
  EXTHDR: 16,
  // EXT header size
  EXTCRC: 4,
  // uncompressed file crc-32 value
  EXTSIZ: 8,
  // compressed size
  EXTLEN: 12,
  // uncompressed size
  /* The central directory file header */
  CENHDR: 46,
  // CEN header size
  CENSIG: 33639248,
  // "PK\001\002"
  CENVEM: 4,
  // version made by
  CENVER: 6,
  // version needed to extract
  CENFLG: 8,
  // encrypt, decrypt flags
  CENHOW: 10,
  // compression method
  CENTIM: 12,
  // modification time (2 bytes time, 2 bytes date)
  CENCRC: 16,
  // uncompressed file crc-32 value
  CENSIZ: 20,
  // compressed size
  CENLEN: 24,
  // uncompressed size
  CENNAM: 28,
  // filename length
  CENEXT: 30,
  // extra field length
  CENCOM: 32,
  // file comment length
  CENDSK: 34,
  // volume number start
  CENATT: 36,
  // internal file attributes
  CENATX: 38,
  // external file attributes (host system dependent)
  CENOFF: 42,
  // LOC header offset
  /* The entries in the end of central directory */
  ENDHDR: 22,
  // END header size
  ENDSIG: 101010256,
  // "PK\005\006"
  ENDSUB: 8,
  // number of entries on this disk
  ENDTOT: 10,
  // total number of entries
  ENDSIZ: 12,
  // central directory size in bytes
  ENDOFF: 16,
  // offset of first CEN header
  ENDCOM: 20,
  // zip file comment length
  END64HDR: 20,
  // zip64 END header size
  END64SIG: 117853008,
  // zip64 Locator signature, "PK\006\007"
  END64START: 4,
  // number of the disk with the start of the zip64
  END64OFF: 8,
  // relative offset of the zip64 end of central directory
  END64NUMDISKS: 16,
  // total number of disks
  ZIP64SIG: 101075792,
  // zip64 signature, "PK\006\006"
  ZIP64HDR: 56,
  // zip64 record minimum size
  ZIP64LEAD: 12,
  // leading bytes at the start of the record, not counted by the value stored in ZIP64SIZE
  ZIP64SIZE: 4,
  // zip64 size of the central directory record
  ZIP64VEM: 12,
  // zip64 version made by
  ZIP64VER: 14,
  // zip64 version needed to extract
  ZIP64DSK: 16,
  // zip64 number of this disk
  ZIP64DSKDIR: 20,
  // number of the disk with the start of the record directory
  ZIP64SUB: 24,
  // number of entries on this disk
  ZIP64TOT: 32,
  // total number of entries
  ZIP64SIZB: 40,
  // zip64 central directory size in bytes
  ZIP64OFF: 48,
  // offset of start of central directory with respect to the starting disk number
  ZIP64EXTRA: 56,
  // extensible data sector
  /* Compression methods */
  STORED: 0,
  // no compression
  SHRUNK: 1,
  // shrunk
  REDUCED1: 2,
  // reduced with compression factor 1
  REDUCED2: 3,
  // reduced with compression factor 2
  REDUCED3: 4,
  // reduced with compression factor 3
  REDUCED4: 5,
  // reduced with compression factor 4
  IMPLODED: 6,
  // imploded
  // 7 reserved for Tokenizing compression algorithm
  DEFLATED: 8,
  // deflated
  ENHANCED_DEFLATED: 9,
  // enhanced deflated
  PKWARE: 10,
  // PKWare DCL imploded
  // 11 reserved by PKWARE
  BZIP2: 12,
  //  compressed using BZIP2
  // 13 reserved by PKWARE
  LZMA: 14,
  // LZMA
  // 15-17 reserved by PKWARE
  IBM_TERSE: 18,
  // compressed using IBM TERSE
  IBM_LZ77: 19,
  // IBM LZ77 z
  AES_ENCRYPT: 99,
  // WinZIP AES encryption method
  /* General purpose bit flag */
  // values can obtained with expression 2**bitnr
  FLG_ENC: 1,
  // Bit 0: encrypted file
  FLG_COMP1: 2,
  // Bit 1, compression option
  FLG_COMP2: 4,
  // Bit 2, compression option
  FLG_DESC: 8,
  // Bit 3, data descriptor
  FLG_ENH: 16,
  // Bit 4, enhanced deflating
  FLG_PATCH: 32,
  // Bit 5, indicates that the file is compressed patched data.
  FLG_STR: 64,
  // Bit 6, strong encryption (patented)
  // Bits 7-10: Currently unused.
  FLG_EFS: 2048,
  // Bit 11: Language encoding flag (EFS)
  // Bit 12: Reserved by PKWARE for enhanced compression.
  // Bit 13: encrypted the Central Directory (patented).
  // Bits 14-15: Reserved by PKWARE.
  FLG_MSK: 4096,
  // mask header values
  /* Load type */
  FILE: 2,
  BUFFER: 1,
  NONE: 0,
  /* 4.5 Extensible data fields */
  EF_ID: 0,
  EF_SIZE: 2,
  /* Header IDs */
  ID_ZIP64: 1,
  ID_AVINFO: 7,
  ID_PFS: 8,
  ID_OS2: 9,
  ID_NTFS: 10,
  ID_OPENVMS: 12,
  ID_UNIX: 13,
  ID_FORK: 14,
  ID_PATCH: 15,
  ID_X509_PKCS7: 20,
  ID_X509_CERTID_F: 21,
  ID_X509_CERTID_C: 22,
  ID_STRONGENC: 23,
  ID_RECORD_MGT: 24,
  ID_X509_PKCS7_RL: 25,
  ID_IBM1: 101,
  ID_IBM2: 102,
  ID_POSZIP: 18064,
  EF_ZIP64_OR_32: 4294967295,
  EF_ZIP64_OR_16: 65535,
  EF_ZIP64_SUNCOMP: 0,
  EF_ZIP64_SCOMP: 8,
  EF_ZIP64_RHO: 16,
  EF_ZIP64_DSN: 24
};
var errors = {};
(function(exports$1) {
  const errors2 = {
    /* Header error messages */
    INVALID_LOC: "Invalid LOC header (bad signature)",
    INVALID_CEN: "Invalid CEN header (bad signature)",
    INVALID_END: "Invalid END header (bad signature)",
    /* Descriptor */
    DESCRIPTOR_NOT_EXIST: "No descriptor present",
    DESCRIPTOR_UNKNOWN: "Unknown descriptor format",
    DESCRIPTOR_FAULTY: "Descriptor data is malformed",
    /* ZipEntry error messages*/
    NO_DATA: "Nothing to decompress",
    BAD_CRC: "CRC32 checksum failed {0}",
    FILE_IN_THE_WAY: "There is a file in the way: {0}",
    UNKNOWN_METHOD: "Invalid/unsupported compression method",
    /* Inflater error messages */
    AVAIL_DATA: "inflate::Available inflate data did not terminate",
    INVALID_DISTANCE: "inflate::Invalid literal/length or distance code in fixed or dynamic block",
    TO_MANY_CODES: "inflate::Dynamic block code description: too many length or distance codes",
    INVALID_REPEAT_LEN: "inflate::Dynamic block code description: repeat more than specified lengths",
    INVALID_REPEAT_FIRST: "inflate::Dynamic block code description: repeat lengths with no first length",
    INCOMPLETE_CODES: "inflate::Dynamic block code description: code lengths codes incomplete",
    INVALID_DYN_DISTANCE: "inflate::Dynamic block code description: invalid distance code lengths",
    INVALID_CODES_LEN: "inflate::Dynamic block code description: invalid literal/length code lengths",
    INVALID_STORE_BLOCK: "inflate::Stored block length did not match one's complement",
    INVALID_BLOCK_TYPE: "inflate::Invalid block type (type == 3)",
    /* ADM-ZIP error messages */
    CANT_EXTRACT_FILE: "Could not extract the file",
    CANT_OVERRIDE: "Target file already exists",
    DISK_ENTRY_TOO_LARGE: "Number of disk entries is too large",
    NO_ZIP: "No zip file was loaded",
    NO_ENTRY: "Entry doesn't exist",
    DIRECTORY_CONTENT_ERROR: "A directory cannot have content",
    FILE_NOT_FOUND: 'File not found: "{0}"',
    NOT_IMPLEMENTED: "Not implemented",
    INVALID_FILENAME: "Invalid filename",
    INVALID_FORMAT: "Invalid or unsupported zip format. No END header found",
    INVALID_PASS_PARAM: "Incompatible password parameter",
    WRONG_PASSWORD: "Wrong Password",
    /* ADM-ZIP */
    COMMENT_TOO_LONG: "Comment is too long",
    // Comment can be max 65535 bytes long (NOTE: some non-US characters may take more space)
    EXTRA_FIELD_PARSE_ERROR: "Extra field parsing error"
  };
  function E(message) {
    return function(...args) {
      if (args.length) {
        message = message.replace(/\{(\d)\}/g, (_, n) => args[n] || "");
      }
      return new Error("ADM-ZIP: " + message);
    };
  }
  for (const msg of Object.keys(errors2)) {
    exports$1[msg] = E(errors2[msg]);
  }
})(errors);
const fsystem = fs;
const pth$2 = path;
const Constants$3 = constants;
const Errors$1 = errors;
const isWin = typeof process === "object" && "win32" === process.platform;
const is_Obj = (obj) => typeof obj === "object" && obj !== null;
const crcTable = new Uint32Array(256).map((t, c) => {
  for (let k = 0; k < 8; k++) {
    if ((c & 1) !== 0) {
      c = 3988292384 ^ c >>> 1;
    } else {
      c >>>= 1;
    }
  }
  return c >>> 0;
});
function Utils$5(opts) {
  this.sep = pth$2.sep;
  this.fs = fsystem;
  if (is_Obj(opts)) {
    if (is_Obj(opts.fs) && typeof opts.fs.statSync === "function") {
      this.fs = opts.fs;
    }
  }
}
var utils = Utils$5;
Utils$5.prototype.makeDir = function(folder) {
  const self = this;
  function mkdirSync(fpath) {
    let resolvedPath = fpath.split(self.sep)[0];
    fpath.split(self.sep).forEach(function(name) {
      if (!name || name.substr(-1, 1) === ":")
        return;
      resolvedPath += self.sep + name;
      var stat;
      try {
        stat = self.fs.statSync(resolvedPath);
      } catch (e) {
        self.fs.mkdirSync(resolvedPath);
      }
      if (stat && stat.isFile())
        throw Errors$1.FILE_IN_THE_WAY(`"${resolvedPath}"`);
    });
  }
  mkdirSync(folder);
};
Utils$5.prototype.writeFileTo = function(path2, content, overwrite, attr) {
  const self = this;
  if (self.fs.existsSync(path2)) {
    if (!overwrite)
      return false;
    var stat = self.fs.statSync(path2);
    if (stat.isDirectory()) {
      return false;
    }
  }
  var folder = pth$2.dirname(path2);
  if (!self.fs.existsSync(folder)) {
    self.makeDir(folder);
  }
  var fd;
  try {
    fd = self.fs.openSync(path2, "w", 438);
  } catch (e) {
    self.fs.chmodSync(path2, 438);
    fd = self.fs.openSync(path2, "w", 438);
  }
  if (fd) {
    try {
      self.fs.writeSync(fd, content, 0, content.length, 0);
    } finally {
      self.fs.closeSync(fd);
    }
  }
  self.fs.chmodSync(path2, attr || 438);
  return true;
};
Utils$5.prototype.writeFileToAsync = function(path2, content, overwrite, attr, callback) {
  if (typeof attr === "function") {
    callback = attr;
    attr = void 0;
  }
  const self = this;
  self.fs.exists(path2, function(exist) {
    if (exist && !overwrite)
      return callback(false);
    self.fs.stat(path2, function(err, stat) {
      if (exist && stat.isDirectory()) {
        return callback(false);
      }
      var folder = pth$2.dirname(path2);
      self.fs.exists(folder, function(exists) {
        if (!exists)
          self.makeDir(folder);
        self.fs.open(path2, "w", 438, function(err2, fd) {
          if (err2) {
            self.fs.chmod(path2, 438, function() {
              self.fs.open(path2, "w", 438, function(err3, fd2) {
                self.fs.write(fd2, content, 0, content.length, 0, function() {
                  self.fs.close(fd2, function() {
                    self.fs.chmod(path2, attr || 438, function() {
                      callback(true);
                    });
                  });
                });
              });
            });
          } else if (fd) {
            self.fs.write(fd, content, 0, content.length, 0, function() {
              self.fs.close(fd, function() {
                self.fs.chmod(path2, attr || 438, function() {
                  callback(true);
                });
              });
            });
          } else {
            self.fs.chmod(path2, attr || 438, function() {
              callback(true);
            });
          }
        });
      });
    });
  });
};
Utils$5.prototype.findFiles = function(path2) {
  const self = this;
  function findSync(dir, pattern, recursive) {
    let files = [];
    self.fs.readdirSync(dir).forEach(function(file) {
      const path3 = pth$2.join(dir, file);
      const stat = self.fs.statSync(path3);
      {
        files.push(pth$2.normalize(path3) + (stat.isDirectory() ? self.sep : ""));
      }
      if (stat.isDirectory() && recursive)
        files = files.concat(findSync(path3, pattern, recursive));
    });
    return files;
  }
  return findSync(path2, void 0, true);
};
Utils$5.prototype.findFilesAsync = function(dir, cb) {
  const self = this;
  let results = [];
  self.fs.readdir(dir, function(err, list) {
    if (err)
      return cb(err);
    let list_length = list.length;
    if (!list_length)
      return cb(null, results);
    list.forEach(function(file) {
      file = pth$2.join(dir, file);
      self.fs.stat(file, function(err2, stat) {
        if (err2)
          return cb(err2);
        if (stat) {
          results.push(pth$2.normalize(file) + (stat.isDirectory() ? self.sep : ""));
          if (stat.isDirectory()) {
            self.findFilesAsync(file, function(err3, res) {
              if (err3)
                return cb(err3);
              results = results.concat(res);
              if (!--list_length)
                cb(null, results);
            });
          } else {
            if (!--list_length)
              cb(null, results);
          }
        }
      });
    });
  });
};
Utils$5.prototype.getAttributes = function() {
};
Utils$5.prototype.setAttributes = function() {
};
Utils$5.crc32update = function(crc, byte) {
  return crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
};
Utils$5.crc32 = function(buf) {
  if (typeof buf === "string") {
    buf = Buffer.from(buf, "utf8");
  }
  let len = buf.length;
  let crc = -1;
  for (let off = 0; off < len; )
    crc = Utils$5.crc32update(crc, buf[off++]);
  return ~crc >>> 0;
};
Utils$5.methodToString = function(method) {
  switch (method) {
    case Constants$3.STORED:
      return "STORED (" + method + ")";
    case Constants$3.DEFLATED:
      return "DEFLATED (" + method + ")";
    default:
      return "UNSUPPORTED (" + method + ")";
  }
};
Utils$5.canonical = function(path2) {
  if (!path2)
    return "";
  const safeSuffix = pth$2.posix.normalize("/" + path2.split("\\").join("/"));
  return pth$2.join(".", safeSuffix);
};
Utils$5.zipnamefix = function(path2) {
  if (!path2)
    return "";
  const safeSuffix = pth$2.posix.normalize("/" + path2.split("\\").join("/"));
  return pth$2.posix.join(".", safeSuffix);
};
Utils$5.findLast = function(arr, callback) {
  if (!Array.isArray(arr))
    throw new TypeError("arr is not array");
  const len = arr.length >>> 0;
  for (let i = len - 1; i >= 0; i--) {
    if (callback(arr[i], i, arr)) {
      return arr[i];
    }
  }
  return void 0;
};
Utils$5.sanitize = function(prefix, name) {
  prefix = pth$2.resolve(pth$2.normalize(prefix));
  var parts = name.split("/");
  for (var i = 0, l = parts.length; i < l; i++) {
    var path2 = pth$2.normalize(pth$2.join(prefix, parts.slice(i, l).join(pth$2.sep)));
    if (path2.indexOf(prefix) === 0) {
      return path2;
    }
  }
  return pth$2.normalize(pth$2.join(prefix, pth$2.basename(name)));
};
Utils$5.toBuffer = function toBuffer(input, encoder) {
  if (Buffer.isBuffer(input)) {
    return input;
  } else if (input instanceof Uint8Array) {
    return Buffer.from(input);
  } else {
    return typeof input === "string" ? encoder(input) : Buffer.alloc(0);
  }
};
Utils$5.readBigUInt64LE = function(buffer, index) {
  var slice = Buffer.from(buffer.slice(index, index + 8));
  slice.swap64();
  return parseInt(`0x${slice.toString("hex")}`);
};
Utils$5.fromDOS2Date = function(val) {
  return new Date((val >> 25 & 127) + 1980, Math.max((val >> 21 & 15) - 1, 0), Math.max(val >> 16 & 31, 1), val >> 11 & 31, val >> 5 & 63, (val & 31) << 1);
};
Utils$5.fromDate2DOS = function(val) {
  let date = 0;
  let time = 0;
  if (val.getFullYear() > 1979) {
    date = (val.getFullYear() - 1980 & 127) << 9 | val.getMonth() + 1 << 5 | val.getDate();
    time = val.getHours() << 11 | val.getMinutes() << 5 | val.getSeconds() >> 1;
  }
  return date << 16 | time;
};
Utils$5.isWin = isWin;
Utils$5.crcTable = crcTable;
const pth$1 = path;
var fattr = function(path2, { fs: fs2 }) {
  var _path = path2 || "", _obj = newAttr(), _stat = null;
  function newAttr() {
    return {
      directory: false,
      readonly: false,
      hidden: false,
      executable: false,
      mtime: 0,
      atime: 0
    };
  }
  if (_path && fs2.existsSync(_path)) {
    _stat = fs2.statSync(_path);
    _obj.directory = _stat.isDirectory();
    _obj.mtime = _stat.mtime;
    _obj.atime = _stat.atime;
    _obj.executable = (73 & _stat.mode) !== 0;
    _obj.readonly = (128 & _stat.mode) === 0;
    _obj.hidden = pth$1.basename(_path)[0] === ".";
  } else {
    console.warn("Invalid path: " + _path);
  }
  return {
    get directory() {
      return _obj.directory;
    },
    get readOnly() {
      return _obj.readonly;
    },
    get hidden() {
      return _obj.hidden;
    },
    get mtime() {
      return _obj.mtime;
    },
    get atime() {
      return _obj.atime;
    },
    get executable() {
      return _obj.executable;
    },
    decodeAttributes: function() {
    },
    encodeAttributes: function() {
    },
    toJSON: function() {
      return {
        path: _path,
        isDirectory: _obj.directory,
        isReadOnly: _obj.readonly,
        isHidden: _obj.hidden,
        isExecutable: _obj.executable,
        mTime: _obj.mtime,
        aTime: _obj.atime
      };
    },
    toString: function() {
      return JSON.stringify(this.toJSON(), null, "	");
    }
  };
};
var decoder = {
  efs: true,
  encode: (data) => Buffer.from(data, "utf8"),
  decode: (data) => data.toString("utf8")
};
util.exports = utils;
util.exports.Constants = constants;
util.exports.Errors = errors;
util.exports.FileAttr = fattr;
util.exports.decoder = decoder;
var utilExports = util.exports;
var headers = {};
var Utils$4 = utilExports, Constants$2 = Utils$4.Constants;
var entryHeader = function() {
  var _verMade = 20, _version = 10, _flags = 0, _method = 0, _time = 0, _crc = 0, _compressedSize = 0, _size = 0, _fnameLen = 0, _extraLen = 0, _comLen = 0, _diskStart = 0, _inattr = 0, _attr = 0, _offset = 0;
  _verMade |= Utils$4.isWin ? 2560 : 768;
  _flags |= Constants$2.FLG_EFS;
  const _localHeader = {
    extraLen: 0
  };
  const uint32 = (val) => Math.max(0, val) >>> 0;
  const uint8 = (val) => Math.max(0, val) & 255;
  _time = Utils$4.fromDate2DOS(/* @__PURE__ */ new Date());
  return {
    get made() {
      return _verMade;
    },
    set made(val) {
      _verMade = val;
    },
    get version() {
      return _version;
    },
    set version(val) {
      _version = val;
    },
    get flags() {
      return _flags;
    },
    set flags(val) {
      _flags = val;
    },
    get flags_efs() {
      return (_flags & Constants$2.FLG_EFS) > 0;
    },
    set flags_efs(val) {
      if (val) {
        _flags |= Constants$2.FLG_EFS;
      } else {
        _flags &= ~Constants$2.FLG_EFS;
      }
    },
    get flags_desc() {
      return (_flags & Constants$2.FLG_DESC) > 0;
    },
    set flags_desc(val) {
      if (val) {
        _flags |= Constants$2.FLG_DESC;
      } else {
        _flags &= ~Constants$2.FLG_DESC;
      }
    },
    get method() {
      return _method;
    },
    set method(val) {
      switch (val) {
        case Constants$2.STORED:
          this.version = 10;
        case Constants$2.DEFLATED:
        default:
          this.version = 20;
      }
      _method = val;
    },
    get time() {
      return Utils$4.fromDOS2Date(this.timeval);
    },
    set time(val) {
      this.timeval = Utils$4.fromDate2DOS(val);
    },
    get timeval() {
      return _time;
    },
    set timeval(val) {
      _time = uint32(val);
    },
    get timeHighByte() {
      return uint8(_time >>> 8);
    },
    get crc() {
      return _crc;
    },
    set crc(val) {
      _crc = uint32(val);
    },
    get compressedSize() {
      return _compressedSize;
    },
    set compressedSize(val) {
      _compressedSize = uint32(val);
    },
    get size() {
      return _size;
    },
    set size(val) {
      _size = uint32(val);
    },
    get fileNameLength() {
      return _fnameLen;
    },
    set fileNameLength(val) {
      _fnameLen = val;
    },
    get extraLength() {
      return _extraLen;
    },
    set extraLength(val) {
      _extraLen = val;
    },
    get extraLocalLength() {
      return _localHeader.extraLen;
    },
    set extraLocalLength(val) {
      _localHeader.extraLen = val;
    },
    get commentLength() {
      return _comLen;
    },
    set commentLength(val) {
      _comLen = val;
    },
    get diskNumStart() {
      return _diskStart;
    },
    set diskNumStart(val) {
      _diskStart = uint32(val);
    },
    get inAttr() {
      return _inattr;
    },
    set inAttr(val) {
      _inattr = uint32(val);
    },
    get attr() {
      return _attr;
    },
    set attr(val) {
      _attr = uint32(val);
    },
    // get Unix file permissions
    get fileAttr() {
      return (_attr || 0) >> 16 & 4095;
    },
    get offset() {
      return _offset;
    },
    set offset(val) {
      _offset = uint32(val);
    },
    get encrypted() {
      return (_flags & Constants$2.FLG_ENC) === Constants$2.FLG_ENC;
    },
    get centralHeaderSize() {
      return Constants$2.CENHDR + _fnameLen + _extraLen + _comLen;
    },
    get realDataOffset() {
      return _offset + Constants$2.LOCHDR + _localHeader.fnameLen + _localHeader.extraLen;
    },
    get localHeader() {
      return _localHeader;
    },
    loadLocalHeaderFromBinary: function(input) {
      var data = input.slice(_offset, _offset + Constants$2.LOCHDR);
      if (data.readUInt32LE(0) !== Constants$2.LOCSIG) {
        throw Utils$4.Errors.INVALID_LOC();
      }
      _localHeader.version = data.readUInt16LE(Constants$2.LOCVER);
      _localHeader.flags = data.readUInt16LE(Constants$2.LOCFLG);
      _localHeader.method = data.readUInt16LE(Constants$2.LOCHOW);
      _localHeader.time = data.readUInt32LE(Constants$2.LOCTIM);
      _localHeader.crc = data.readUInt32LE(Constants$2.LOCCRC);
      _localHeader.compressedSize = data.readUInt32LE(Constants$2.LOCSIZ);
      _localHeader.size = data.readUInt32LE(Constants$2.LOCLEN);
      _localHeader.fnameLen = data.readUInt16LE(Constants$2.LOCNAM);
      _localHeader.extraLen = data.readUInt16LE(Constants$2.LOCEXT);
      const extraStart = _offset + Constants$2.LOCHDR + _localHeader.fnameLen;
      const extraEnd = extraStart + _localHeader.extraLen;
      return input.slice(extraStart, extraEnd);
    },
    loadFromBinary: function(data) {
      if (data.length !== Constants$2.CENHDR || data.readUInt32LE(0) !== Constants$2.CENSIG) {
        throw Utils$4.Errors.INVALID_CEN();
      }
      _verMade = data.readUInt16LE(Constants$2.CENVEM);
      _version = data.readUInt16LE(Constants$2.CENVER);
      _flags = data.readUInt16LE(Constants$2.CENFLG);
      _method = data.readUInt16LE(Constants$2.CENHOW);
      _time = data.readUInt32LE(Constants$2.CENTIM);
      _crc = data.readUInt32LE(Constants$2.CENCRC);
      _compressedSize = data.readUInt32LE(Constants$2.CENSIZ);
      _size = data.readUInt32LE(Constants$2.CENLEN);
      _fnameLen = data.readUInt16LE(Constants$2.CENNAM);
      _extraLen = data.readUInt16LE(Constants$2.CENEXT);
      _comLen = data.readUInt16LE(Constants$2.CENCOM);
      _diskStart = data.readUInt16LE(Constants$2.CENDSK);
      _inattr = data.readUInt16LE(Constants$2.CENATT);
      _attr = data.readUInt32LE(Constants$2.CENATX);
      _offset = data.readUInt32LE(Constants$2.CENOFF);
    },
    localHeaderToBinary: function() {
      var data = Buffer.alloc(Constants$2.LOCHDR);
      data.writeUInt32LE(Constants$2.LOCSIG, 0);
      data.writeUInt16LE(_version, Constants$2.LOCVER);
      data.writeUInt16LE(_flags, Constants$2.LOCFLG);
      data.writeUInt16LE(_method, Constants$2.LOCHOW);
      data.writeUInt32LE(_time, Constants$2.LOCTIM);
      data.writeUInt32LE(_crc, Constants$2.LOCCRC);
      data.writeUInt32LE(_compressedSize, Constants$2.LOCSIZ);
      data.writeUInt32LE(_size, Constants$2.LOCLEN);
      data.writeUInt16LE(_fnameLen, Constants$2.LOCNAM);
      data.writeUInt16LE(_localHeader.extraLen, Constants$2.LOCEXT);
      return data;
    },
    centralHeaderToBinary: function() {
      var data = Buffer.alloc(Constants$2.CENHDR + _fnameLen + _extraLen + _comLen);
      data.writeUInt32LE(Constants$2.CENSIG, 0);
      data.writeUInt16LE(_verMade, Constants$2.CENVEM);
      data.writeUInt16LE(_version, Constants$2.CENVER);
      data.writeUInt16LE(_flags, Constants$2.CENFLG);
      data.writeUInt16LE(_method, Constants$2.CENHOW);
      data.writeUInt32LE(_time, Constants$2.CENTIM);
      data.writeUInt32LE(_crc, Constants$2.CENCRC);
      data.writeUInt32LE(_compressedSize, Constants$2.CENSIZ);
      data.writeUInt32LE(_size, Constants$2.CENLEN);
      data.writeUInt16LE(_fnameLen, Constants$2.CENNAM);
      data.writeUInt16LE(_extraLen, Constants$2.CENEXT);
      data.writeUInt16LE(_comLen, Constants$2.CENCOM);
      data.writeUInt16LE(_diskStart, Constants$2.CENDSK);
      data.writeUInt16LE(_inattr, Constants$2.CENATT);
      data.writeUInt32LE(_attr, Constants$2.CENATX);
      data.writeUInt32LE(_offset, Constants$2.CENOFF);
      return data;
    },
    toJSON: function() {
      const bytes = function(nr) {
        return nr + " bytes";
      };
      return {
        made: _verMade,
        version: _version,
        flags: _flags,
        method: Utils$4.methodToString(_method),
        time: this.time,
        crc: "0x" + _crc.toString(16).toUpperCase(),
        compressedSize: bytes(_compressedSize),
        size: bytes(_size),
        fileNameLength: bytes(_fnameLen),
        extraLength: bytes(_extraLen),
        commentLength: bytes(_comLen),
        diskNumStart: _diskStart,
        inAttr: _inattr,
        attr: _attr,
        offset: _offset,
        centralHeaderSize: bytes(Constants$2.CENHDR + _fnameLen + _extraLen + _comLen)
      };
    },
    toString: function() {
      return JSON.stringify(this.toJSON(), null, "	");
    }
  };
};
var Utils$3 = utilExports, Constants$1 = Utils$3.Constants;
var mainHeader = function() {
  var _volumeEntries = 0, _totalEntries = 0, _size = 0, _offset = 0, _commentLength = 0;
  return {
    get diskEntries() {
      return _volumeEntries;
    },
    set diskEntries(val) {
      _volumeEntries = _totalEntries = val;
    },
    get totalEntries() {
      return _totalEntries;
    },
    set totalEntries(val) {
      _totalEntries = _volumeEntries = val;
    },
    get size() {
      return _size;
    },
    set size(val) {
      _size = val;
    },
    get offset() {
      return _offset;
    },
    set offset(val) {
      _offset = val;
    },
    get commentLength() {
      return _commentLength;
    },
    set commentLength(val) {
      _commentLength = val;
    },
    get mainHeaderSize() {
      return Constants$1.ENDHDR + _commentLength;
    },
    loadFromBinary: function(data) {
      if ((data.length !== Constants$1.ENDHDR || data.readUInt32LE(0) !== Constants$1.ENDSIG) && (data.length < Constants$1.ZIP64HDR || data.readUInt32LE(0) !== Constants$1.ZIP64SIG)) {
        throw Utils$3.Errors.INVALID_END();
      }
      if (data.readUInt32LE(0) === Constants$1.ENDSIG) {
        _volumeEntries = data.readUInt16LE(Constants$1.ENDSUB);
        _totalEntries = data.readUInt16LE(Constants$1.ENDTOT);
        _size = data.readUInt32LE(Constants$1.ENDSIZ);
        _offset = data.readUInt32LE(Constants$1.ENDOFF);
        _commentLength = data.readUInt16LE(Constants$1.ENDCOM);
      } else {
        _volumeEntries = Utils$3.readBigUInt64LE(data, Constants$1.ZIP64SUB);
        _totalEntries = Utils$3.readBigUInt64LE(data, Constants$1.ZIP64TOT);
        _size = Utils$3.readBigUInt64LE(data, Constants$1.ZIP64SIZE);
        _offset = Utils$3.readBigUInt64LE(data, Constants$1.ZIP64OFF);
        _commentLength = 0;
      }
    },
    toBinary: function() {
      var b = Buffer.alloc(Constants$1.ENDHDR + _commentLength);
      b.writeUInt32LE(Constants$1.ENDSIG, 0);
      b.writeUInt32LE(0, 4);
      b.writeUInt16LE(_volumeEntries, Constants$1.ENDSUB);
      b.writeUInt16LE(_totalEntries, Constants$1.ENDTOT);
      b.writeUInt32LE(_size, Constants$1.ENDSIZ);
      b.writeUInt32LE(_offset, Constants$1.ENDOFF);
      b.writeUInt16LE(_commentLength, Constants$1.ENDCOM);
      b.fill(" ", Constants$1.ENDHDR);
      return b;
    },
    toJSON: function() {
      const offset = function(nr, len) {
        let offs = nr.toString(16).toUpperCase();
        while (offs.length < len)
          offs = "0" + offs;
        return "0x" + offs;
      };
      return {
        diskEntries: _volumeEntries,
        totalEntries: _totalEntries,
        size: _size + " bytes",
        offset: offset(_offset, 4),
        commentLength: _commentLength
      };
    },
    toString: function() {
      return JSON.stringify(this.toJSON(), null, "	");
    }
  };
};
headers.EntryHeader = entryHeader;
headers.MainHeader = mainHeader;
var methods = {};
var deflater = function(inbuf) {
  var zlib = require$$0;
  var opts = { chunkSize: (parseInt(inbuf.length / 1024) + 1) * 1024 };
  return {
    deflate: function() {
      return zlib.deflateRawSync(inbuf, opts);
    },
    deflateAsync: function(callback) {
      var tmp = zlib.createDeflateRaw(opts), parts = [], total = 0;
      tmp.on("data", function(data) {
        parts.push(data);
        total += data.length;
      });
      tmp.on("end", function() {
        var buf = Buffer.alloc(total), written = 0;
        buf.fill(0);
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i];
          part.copy(buf, written);
          written += part.length;
        }
        callback && callback(buf);
      });
      tmp.end(inbuf);
    }
  };
};
const version = +(process.versions ? process.versions.node : "").split(".")[0] || 0;
var inflater = function(inbuf, expectedLength) {
  var zlib = require$$0;
  const option = version >= 15 && expectedLength > 0 ? { maxOutputLength: expectedLength } : {};
  return {
    inflate: function() {
      return zlib.inflateRawSync(inbuf, option);
    },
    inflateAsync: function(callback) {
      var tmp = zlib.createInflateRaw(option), parts = [], total = 0;
      tmp.on("data", function(data) {
        parts.push(data);
        total += data.length;
      });
      tmp.on("end", function() {
        var buf = Buffer.alloc(total), written = 0;
        buf.fill(0);
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i];
          part.copy(buf, written);
          written += part.length;
        }
        callback && callback(buf);
      });
      tmp.end(inbuf);
    }
  };
};
const { randomFillSync } = crypto;
const Errors = errors;
const crctable = new Uint32Array(256).map((t, crc) => {
  for (let j = 0; j < 8; j++) {
    if (0 !== (crc & 1)) {
      crc = crc >>> 1 ^ 3988292384;
    } else {
      crc >>>= 1;
    }
  }
  return crc >>> 0;
});
const uMul = (a, b) => Math.imul(a, b) >>> 0;
const crc32update = (pCrc32, bval) => {
  return crctable[(pCrc32 ^ bval) & 255] ^ pCrc32 >>> 8;
};
const genSalt = () => {
  if ("function" === typeof randomFillSync) {
    return randomFillSync(Buffer.alloc(12));
  } else {
    return genSalt.node();
  }
};
genSalt.node = () => {
  const salt = Buffer.alloc(12);
  const len = salt.length;
  for (let i = 0; i < len; i++)
    salt[i] = Math.random() * 256 & 255;
  return salt;
};
const config = {
  genSalt
};
function Initkeys(pw) {
  const pass = Buffer.isBuffer(pw) ? pw : Buffer.from(pw);
  this.keys = new Uint32Array([305419896, 591751049, 878082192]);
  for (let i = 0; i < pass.length; i++) {
    this.updateKeys(pass[i]);
  }
}
Initkeys.prototype.updateKeys = function(byteValue) {
  const keys = this.keys;
  keys[0] = crc32update(keys[0], byteValue);
  keys[1] += keys[0] & 255;
  keys[1] = uMul(keys[1], 134775813) + 1;
  keys[2] = crc32update(keys[2], keys[1] >>> 24);
  return byteValue;
};
Initkeys.prototype.next = function() {
  const k = (this.keys[2] | 2) >>> 0;
  return uMul(k, k ^ 1) >> 8 & 255;
};
function make_decrypter(pwd) {
  const keys = new Initkeys(pwd);
  return function(data) {
    const result = Buffer.alloc(data.length);
    let pos = 0;
    for (let c of data) {
      result[pos++] = keys.updateKeys(c ^ keys.next());
    }
    return result;
  };
}
function make_encrypter(pwd) {
  const keys = new Initkeys(pwd);
  return function(data, result, pos = 0) {
    if (!result)
      result = Buffer.alloc(data.length);
    for (let c of data) {
      const k = keys.next();
      result[pos++] = c ^ k;
      keys.updateKeys(c);
    }
    return result;
  };
}
function decrypt(data, header, pwd) {
  if (!data || !Buffer.isBuffer(data) || data.length < 12) {
    return Buffer.alloc(0);
  }
  const decrypter = make_decrypter(pwd);
  const salt = decrypter(data.slice(0, 12));
  const verifyByte = (header.flags & 8) === 8 ? header.timeHighByte : header.crc >>> 24;
  if (salt[11] !== verifyByte) {
    throw Errors.WRONG_PASSWORD();
  }
  return decrypter(data.slice(12));
}
function _salter(data) {
  if (Buffer.isBuffer(data) && data.length >= 12) {
    config.genSalt = function() {
      return data.slice(0, 12);
    };
  } else if (data === "node") {
    config.genSalt = genSalt.node;
  } else {
    config.genSalt = genSalt;
  }
}
function encrypt(data, header, pwd, oldlike = false) {
  if (data == null)
    data = Buffer.alloc(0);
  if (!Buffer.isBuffer(data))
    data = Buffer.from(data.toString());
  const encrypter = make_encrypter(pwd);
  const salt = config.genSalt();
  salt[11] = header.crc >>> 24 & 255;
  if (oldlike)
    salt[10] = header.crc >>> 16 & 255;
  const result = Buffer.alloc(data.length + 12);
  encrypter(salt, result);
  return encrypter(data, result, 12);
}
var zipcrypto = { decrypt, encrypt, _salter };
methods.Deflater = deflater;
methods.Inflater = inflater;
methods.ZipCrypto = zipcrypto;
var Utils$2 = utilExports, Headers$1 = headers, Constants = Utils$2.Constants, Methods = methods;
var zipEntry = function(options, input) {
  var _centralHeader = new Headers$1.EntryHeader(), _entryName = Buffer.alloc(0), _comment = Buffer.alloc(0), _isDirectory = false, uncompressedData = null, _extra = Buffer.alloc(0), _extralocal = Buffer.alloc(0), _efs = true;
  const opts = options;
  const decoder2 = typeof opts.decoder === "object" ? opts.decoder : Utils$2.decoder;
  _efs = decoder2.hasOwnProperty("efs") ? decoder2.efs : false;
  function getCompressedDataFromZip() {
    if (!input || !(input instanceof Uint8Array)) {
      return Buffer.alloc(0);
    }
    _extralocal = _centralHeader.loadLocalHeaderFromBinary(input);
    return input.slice(_centralHeader.realDataOffset, _centralHeader.realDataOffset + _centralHeader.compressedSize);
  }
  function crc32OK(data) {
    if (!_centralHeader.flags_desc) {
      if (Utils$2.crc32(data) !== _centralHeader.localHeader.crc) {
        return false;
      }
    } else {
      const descriptor = {};
      const dataEndOffset = _centralHeader.realDataOffset + _centralHeader.compressedSize;
      if (input.readUInt32LE(dataEndOffset) == Constants.LOCSIG || input.readUInt32LE(dataEndOffset) == Constants.CENSIG) {
        throw Utils$2.Errors.DESCRIPTOR_NOT_EXIST();
      }
      if (input.readUInt32LE(dataEndOffset) == Constants.EXTSIG) {
        descriptor.crc = input.readUInt32LE(dataEndOffset + Constants.EXTCRC);
        descriptor.compressedSize = input.readUInt32LE(dataEndOffset + Constants.EXTSIZ);
        descriptor.size = input.readUInt32LE(dataEndOffset + Constants.EXTLEN);
      } else if (input.readUInt16LE(dataEndOffset + 12) === 19280) {
        descriptor.crc = input.readUInt32LE(dataEndOffset + Constants.EXTCRC - 4);
        descriptor.compressedSize = input.readUInt32LE(dataEndOffset + Constants.EXTSIZ - 4);
        descriptor.size = input.readUInt32LE(dataEndOffset + Constants.EXTLEN - 4);
      } else {
        throw Utils$2.Errors.DESCRIPTOR_UNKNOWN();
      }
      if (descriptor.compressedSize !== _centralHeader.compressedSize || descriptor.size !== _centralHeader.size || descriptor.crc !== _centralHeader.crc) {
        throw Utils$2.Errors.DESCRIPTOR_FAULTY();
      }
      if (Utils$2.crc32(data) !== descriptor.crc) {
        return false;
      }
    }
    return true;
  }
  function decompress(async, callback, pass) {
    if (typeof callback === "undefined" && typeof async === "string") {
      pass = async;
      async = void 0;
    }
    if (_isDirectory) {
      if (async && callback) {
        callback(Buffer.alloc(0), Utils$2.Errors.DIRECTORY_CONTENT_ERROR());
      }
      return Buffer.alloc(0);
    }
    var compressedData = getCompressedDataFromZip();
    if (compressedData.length === 0) {
      if (async && callback)
        callback(compressedData);
      return compressedData;
    }
    if (_centralHeader.encrypted) {
      if ("string" !== typeof pass && !Buffer.isBuffer(pass)) {
        throw Utils$2.Errors.INVALID_PASS_PARAM();
      }
      compressedData = Methods.ZipCrypto.decrypt(compressedData, _centralHeader, pass);
    }
    var data = Buffer.alloc(_centralHeader.size);
    switch (_centralHeader.method) {
      case Utils$2.Constants.STORED:
        compressedData.copy(data);
        if (!crc32OK(data)) {
          if (async && callback)
            callback(data, Utils$2.Errors.BAD_CRC());
          throw Utils$2.Errors.BAD_CRC();
        } else {
          if (async && callback)
            callback(data);
          return data;
        }
      case Utils$2.Constants.DEFLATED:
        var inflater2 = new Methods.Inflater(compressedData, _centralHeader.size);
        if (!async) {
          const result = inflater2.inflate(data);
          result.copy(data, 0);
          if (!crc32OK(data)) {
            throw Utils$2.Errors.BAD_CRC(`"${decoder2.decode(_entryName)}"`);
          }
          return data;
        } else {
          inflater2.inflateAsync(function(result) {
            result.copy(result, 0);
            if (callback) {
              if (!crc32OK(result)) {
                callback(result, Utils$2.Errors.BAD_CRC());
              } else {
                callback(result);
              }
            }
          });
        }
        break;
      default:
        if (async && callback)
          callback(Buffer.alloc(0), Utils$2.Errors.UNKNOWN_METHOD());
        throw Utils$2.Errors.UNKNOWN_METHOD();
    }
  }
  function compress(async, callback) {
    if ((!uncompressedData || !uncompressedData.length) && Buffer.isBuffer(input)) {
      if (async && callback)
        callback(getCompressedDataFromZip());
      return getCompressedDataFromZip();
    }
    if (uncompressedData.length && !_isDirectory) {
      var compressedData;
      switch (_centralHeader.method) {
        case Utils$2.Constants.STORED:
          _centralHeader.compressedSize = _centralHeader.size;
          compressedData = Buffer.alloc(uncompressedData.length);
          uncompressedData.copy(compressedData);
          if (async && callback)
            callback(compressedData);
          return compressedData;
        default:
        case Utils$2.Constants.DEFLATED:
          var deflater2 = new Methods.Deflater(uncompressedData);
          if (!async) {
            var deflated = deflater2.deflate();
            _centralHeader.compressedSize = deflated.length;
            return deflated;
          } else {
            deflater2.deflateAsync(function(data) {
              compressedData = Buffer.alloc(data.length);
              _centralHeader.compressedSize = data.length;
              data.copy(compressedData);
              callback && callback(compressedData);
            });
          }
          deflater2 = null;
          break;
      }
    } else if (async && callback) {
      callback(Buffer.alloc(0));
    } else {
      return Buffer.alloc(0);
    }
  }
  function readUInt64LE(buffer, offset) {
    return (buffer.readUInt32LE(offset + 4) << 4) + buffer.readUInt32LE(offset);
  }
  function parseExtra(data) {
    try {
      var offset = 0;
      var signature, size, part;
      while (offset + 4 < data.length) {
        signature = data.readUInt16LE(offset);
        offset += 2;
        size = data.readUInt16LE(offset);
        offset += 2;
        part = data.slice(offset, offset + size);
        offset += size;
        if (Constants.ID_ZIP64 === signature) {
          parseZip64ExtendedInformation(part);
        }
      }
    } catch (error) {
      throw Utils$2.Errors.EXTRA_FIELD_PARSE_ERROR();
    }
  }
  function parseZip64ExtendedInformation(data) {
    var size, compressedSize, offset, diskNumStart;
    if (data.length >= Constants.EF_ZIP64_SCOMP) {
      size = readUInt64LE(data, Constants.EF_ZIP64_SUNCOMP);
      if (_centralHeader.size === Constants.EF_ZIP64_OR_32) {
        _centralHeader.size = size;
      }
    }
    if (data.length >= Constants.EF_ZIP64_RHO) {
      compressedSize = readUInt64LE(data, Constants.EF_ZIP64_SCOMP);
      if (_centralHeader.compressedSize === Constants.EF_ZIP64_OR_32) {
        _centralHeader.compressedSize = compressedSize;
      }
    }
    if (data.length >= Constants.EF_ZIP64_DSN) {
      offset = readUInt64LE(data, Constants.EF_ZIP64_RHO);
      if (_centralHeader.offset === Constants.EF_ZIP64_OR_32) {
        _centralHeader.offset = offset;
      }
    }
    if (data.length >= Constants.EF_ZIP64_DSN + 4) {
      diskNumStart = data.readUInt32LE(Constants.EF_ZIP64_DSN);
      if (_centralHeader.diskNumStart === Constants.EF_ZIP64_OR_16) {
        _centralHeader.diskNumStart = diskNumStart;
      }
    }
  }
  return {
    get entryName() {
      return decoder2.decode(_entryName);
    },
    get rawEntryName() {
      return _entryName;
    },
    set entryName(val) {
      _entryName = Utils$2.toBuffer(val, decoder2.encode);
      var lastChar = _entryName[_entryName.length - 1];
      _isDirectory = lastChar === 47 || lastChar === 92;
      _centralHeader.fileNameLength = _entryName.length;
    },
    get efs() {
      if (typeof _efs === "function") {
        return _efs(this.entryName);
      } else {
        return _efs;
      }
    },
    get extra() {
      return _extra;
    },
    set extra(val) {
      _extra = val;
      _centralHeader.extraLength = val.length;
      parseExtra(val);
    },
    get comment() {
      return decoder2.decode(_comment);
    },
    set comment(val) {
      _comment = Utils$2.toBuffer(val, decoder2.encode);
      _centralHeader.commentLength = _comment.length;
      if (_comment.length > 65535)
        throw Utils$2.Errors.COMMENT_TOO_LONG();
    },
    get name() {
      var n = decoder2.decode(_entryName);
      return _isDirectory ? n.substr(n.length - 1).split("/").pop() : n.split("/").pop();
    },
    get isDirectory() {
      return _isDirectory;
    },
    getCompressedData: function() {
      return compress(false, null);
    },
    getCompressedDataAsync: function(callback) {
      compress(true, callback);
    },
    setData: function(value) {
      uncompressedData = Utils$2.toBuffer(value, Utils$2.decoder.encode);
      if (!_isDirectory && uncompressedData.length) {
        _centralHeader.size = uncompressedData.length;
        _centralHeader.method = Utils$2.Constants.DEFLATED;
        _centralHeader.crc = Utils$2.crc32(value);
        _centralHeader.changed = true;
      } else {
        _centralHeader.method = Utils$2.Constants.STORED;
      }
    },
    getData: function(pass) {
      if (_centralHeader.changed) {
        return uncompressedData;
      } else {
        return decompress(false, null, pass);
      }
    },
    getDataAsync: function(callback, pass) {
      if (_centralHeader.changed) {
        callback(uncompressedData);
      } else {
        decompress(true, callback, pass);
      }
    },
    set attr(attr) {
      _centralHeader.attr = attr;
    },
    get attr() {
      return _centralHeader.attr;
    },
    set header(data) {
      _centralHeader.loadFromBinary(data);
    },
    get header() {
      return _centralHeader;
    },
    packCentralHeader: function() {
      _centralHeader.flags_efs = this.efs;
      _centralHeader.extraLength = _extra.length;
      var header = _centralHeader.centralHeaderToBinary();
      var addpos = Utils$2.Constants.CENHDR;
      _entryName.copy(header, addpos);
      addpos += _entryName.length;
      _extra.copy(header, addpos);
      addpos += _centralHeader.extraLength;
      _comment.copy(header, addpos);
      return header;
    },
    packLocalHeader: function() {
      let addpos = 0;
      _centralHeader.flags_efs = this.efs;
      _centralHeader.extraLocalLength = _extralocal.length;
      const localHeaderBuf = _centralHeader.localHeaderToBinary();
      const localHeader = Buffer.alloc(localHeaderBuf.length + _entryName.length + _centralHeader.extraLocalLength);
      localHeaderBuf.copy(localHeader, addpos);
      addpos += localHeaderBuf.length;
      _entryName.copy(localHeader, addpos);
      addpos += _entryName.length;
      _extralocal.copy(localHeader, addpos);
      addpos += _extralocal.length;
      return localHeader;
    },
    toJSON: function() {
      const bytes = function(nr) {
        return "<" + (nr && nr.length + " bytes buffer" || "null") + ">";
      };
      return {
        entryName: this.entryName,
        name: this.name,
        comment: this.comment,
        isDirectory: this.isDirectory,
        header: _centralHeader.toJSON(),
        compressedData: bytes(input),
        data: bytes(uncompressedData)
      };
    },
    toString: function() {
      return JSON.stringify(this.toJSON(), null, "	");
    }
  };
};
const ZipEntry$1 = zipEntry;
const Headers = headers;
const Utils$1 = utilExports;
var zipFile = function(inBuffer, options) {
  var entryList = [], entryTable = {}, _comment = Buffer.alloc(0), mainHeader2 = new Headers.MainHeader(), loadedEntries = false;
  const temporary = /* @__PURE__ */ new Set();
  const opts = options;
  const { noSort, decoder: decoder2 } = opts;
  if (inBuffer) {
    readMainHeader(opts.readEntries);
  } else {
    loadedEntries = true;
  }
  function makeTemporaryFolders() {
    const foldersList = /* @__PURE__ */ new Set();
    for (const elem of Object.keys(entryTable)) {
      const elements = elem.split("/");
      elements.pop();
      if (!elements.length)
        continue;
      for (let i = 0; i < elements.length; i++) {
        const sub = elements.slice(0, i + 1).join("/") + "/";
        foldersList.add(sub);
      }
    }
    for (const elem of foldersList) {
      if (!(elem in entryTable)) {
        const tempfolder = new ZipEntry$1(opts);
        tempfolder.entryName = elem;
        tempfolder.attr = 16;
        tempfolder.temporary = true;
        entryList.push(tempfolder);
        entryTable[tempfolder.entryName] = tempfolder;
        temporary.add(tempfolder);
      }
    }
  }
  function readEntries() {
    loadedEntries = true;
    entryTable = {};
    if (mainHeader2.diskEntries > (inBuffer.length - mainHeader2.offset) / Utils$1.Constants.CENHDR) {
      throw Utils$1.Errors.DISK_ENTRY_TOO_LARGE();
    }
    entryList = new Array(mainHeader2.diskEntries);
    var index = mainHeader2.offset;
    for (var i = 0; i < entryList.length; i++) {
      var tmp = index, entry = new ZipEntry$1(opts, inBuffer);
      entry.header = inBuffer.slice(tmp, tmp += Utils$1.Constants.CENHDR);
      entry.entryName = inBuffer.slice(tmp, tmp += entry.header.fileNameLength);
      if (entry.header.extraLength) {
        entry.extra = inBuffer.slice(tmp, tmp += entry.header.extraLength);
      }
      if (entry.header.commentLength)
        entry.comment = inBuffer.slice(tmp, tmp + entry.header.commentLength);
      index += entry.header.centralHeaderSize;
      entryList[i] = entry;
      entryTable[entry.entryName] = entry;
    }
    temporary.clear();
    makeTemporaryFolders();
  }
  function readMainHeader(readNow) {
    var i = inBuffer.length - Utils$1.Constants.ENDHDR, max = Math.max(0, i - 65535), n = max, endStart = inBuffer.length, endOffset = -1, commentEnd = 0;
    const trailingSpace = typeof opts.trailingSpace === "boolean" ? opts.trailingSpace : false;
    if (trailingSpace)
      max = 0;
    for (i; i >= n; i--) {
      if (inBuffer[i] !== 80)
        continue;
      if (inBuffer.readUInt32LE(i) === Utils$1.Constants.ENDSIG) {
        endOffset = i;
        commentEnd = i;
        endStart = i + Utils$1.Constants.ENDHDR;
        n = i - Utils$1.Constants.END64HDR;
        continue;
      }
      if (inBuffer.readUInt32LE(i) === Utils$1.Constants.END64SIG) {
        n = max;
        continue;
      }
      if (inBuffer.readUInt32LE(i) === Utils$1.Constants.ZIP64SIG) {
        endOffset = i;
        endStart = i + Utils$1.readBigUInt64LE(inBuffer, i + Utils$1.Constants.ZIP64SIZE) + Utils$1.Constants.ZIP64LEAD;
        break;
      }
    }
    if (endOffset == -1)
      throw Utils$1.Errors.INVALID_FORMAT();
    mainHeader2.loadFromBinary(inBuffer.slice(endOffset, endStart));
    if (mainHeader2.commentLength) {
      _comment = inBuffer.slice(commentEnd + Utils$1.Constants.ENDHDR);
    }
    if (readNow)
      readEntries();
  }
  function sortEntries() {
    if (entryList.length > 1 && !noSort) {
      entryList.sort((a, b) => a.entryName.toLowerCase().localeCompare(b.entryName.toLowerCase()));
    }
  }
  return {
    /**
     * Returns an array of ZipEntry objects existent in the current opened archive
     * @return Array
     */
    get entries() {
      if (!loadedEntries) {
        readEntries();
      }
      return entryList.filter((e) => !temporary.has(e));
    },
    /**
     * Archive comment
     * @return {String}
     */
    get comment() {
      return decoder2.decode(_comment);
    },
    set comment(val) {
      _comment = Utils$1.toBuffer(val, decoder2.encode);
      mainHeader2.commentLength = _comment.length;
    },
    getEntryCount: function() {
      if (!loadedEntries) {
        return mainHeader2.diskEntries;
      }
      return entryList.length;
    },
    forEach: function(callback) {
      this.entries.forEach(callback);
    },
    /**
     * Returns a reference to the entry with the given name or null if entry is inexistent
     *
     * @param entryName
     * @return ZipEntry
     */
    getEntry: function(entryName) {
      if (!loadedEntries) {
        readEntries();
      }
      return entryTable[entryName] || null;
    },
    /**
     * Adds the given entry to the entry list
     *
     * @param entry
     */
    setEntry: function(entry) {
      if (!loadedEntries) {
        readEntries();
      }
      entryList.push(entry);
      entryTable[entry.entryName] = entry;
      mainHeader2.totalEntries = entryList.length;
    },
    /**
     * Removes the file with the given name from the entry list.
     *
     * If the entry is a directory, then all nested files and directories will be removed
     * @param entryName
     * @returns {void}
     */
    deleteFile: function(entryName, withsubfolders = true) {
      if (!loadedEntries) {
        readEntries();
      }
      const entry = entryTable[entryName];
      const list = this.getEntryChildren(entry, withsubfolders).map((child) => child.entryName);
      list.forEach(this.deleteEntry);
    },
    /**
     * Removes the entry with the given name from the entry list.
     *
     * @param {string} entryName
     * @returns {void}
     */
    deleteEntry: function(entryName) {
      if (!loadedEntries) {
        readEntries();
      }
      const entry = entryTable[entryName];
      const index = entryList.indexOf(entry);
      if (index >= 0) {
        entryList.splice(index, 1);
        delete entryTable[entryName];
        mainHeader2.totalEntries = entryList.length;
      }
    },
    /**
     *  Iterates and returns all nested files and directories of the given entry
     *
     * @param entry
     * @return Array
     */
    getEntryChildren: function(entry, subfolders = true) {
      if (!loadedEntries) {
        readEntries();
      }
      if (typeof entry === "object") {
        if (entry.isDirectory && subfolders) {
          const list = [];
          const name = entry.entryName;
          for (const zipEntry2 of entryList) {
            if (zipEntry2.entryName.startsWith(name)) {
              list.push(zipEntry2);
            }
          }
          return list;
        } else {
          return [entry];
        }
      }
      return [];
    },
    /**
     *  How many child elements entry has
     *
     * @param {ZipEntry} entry
     * @return {integer}
     */
    getChildCount: function(entry) {
      if (entry && entry.isDirectory) {
        const list = this.getEntryChildren(entry);
        return list.includes(entry) ? list.length - 1 : list.length;
      }
      return 0;
    },
    /**
     * Returns the zip file
     *
     * @return Buffer
     */
    compressToBuffer: function() {
      if (!loadedEntries) {
        readEntries();
      }
      sortEntries();
      const dataBlock = [];
      const headerBlocks = [];
      let totalSize = 0;
      let dindex = 0;
      mainHeader2.size = 0;
      mainHeader2.offset = 0;
      let totalEntries = 0;
      for (const entry of this.entries) {
        const compressedData = entry.getCompressedData();
        entry.header.offset = dindex;
        const localHeader = entry.packLocalHeader();
        const dataLength = localHeader.length + compressedData.length;
        dindex += dataLength;
        dataBlock.push(localHeader);
        dataBlock.push(compressedData);
        const centralHeader = entry.packCentralHeader();
        headerBlocks.push(centralHeader);
        mainHeader2.size += centralHeader.length;
        totalSize += dataLength + centralHeader.length;
        totalEntries++;
      }
      totalSize += mainHeader2.mainHeaderSize;
      mainHeader2.offset = dindex;
      mainHeader2.totalEntries = totalEntries;
      dindex = 0;
      const outBuffer = Buffer.alloc(totalSize);
      for (const content of dataBlock) {
        content.copy(outBuffer, dindex);
        dindex += content.length;
      }
      for (const content of headerBlocks) {
        content.copy(outBuffer, dindex);
        dindex += content.length;
      }
      const mh = mainHeader2.toBinary();
      if (_comment) {
        _comment.copy(mh, Utils$1.Constants.ENDHDR);
      }
      mh.copy(outBuffer, dindex);
      inBuffer = outBuffer;
      loadedEntries = false;
      return outBuffer;
    },
    toAsyncBuffer: function(onSuccess, onFail, onItemStart, onItemEnd) {
      try {
        if (!loadedEntries) {
          readEntries();
        }
        sortEntries();
        const dataBlock = [];
        const centralHeaders = [];
        let totalSize = 0;
        let dindex = 0;
        let totalEntries = 0;
        mainHeader2.size = 0;
        mainHeader2.offset = 0;
        const compress2Buffer = function(entryLists) {
          if (entryLists.length > 0) {
            const entry = entryLists.shift();
            const name = entry.entryName + entry.extra.toString();
            if (onItemStart)
              onItemStart(name);
            entry.getCompressedDataAsync(function(compressedData) {
              if (onItemEnd)
                onItemEnd(name);
              entry.header.offset = dindex;
              const localHeader = entry.packLocalHeader();
              const dataLength = localHeader.length + compressedData.length;
              dindex += dataLength;
              dataBlock.push(localHeader);
              dataBlock.push(compressedData);
              const centalHeader = entry.packCentralHeader();
              centralHeaders.push(centalHeader);
              mainHeader2.size += centalHeader.length;
              totalSize += dataLength + centalHeader.length;
              totalEntries++;
              compress2Buffer(entryLists);
            });
          } else {
            totalSize += mainHeader2.mainHeaderSize;
            mainHeader2.offset = dindex;
            mainHeader2.totalEntries = totalEntries;
            dindex = 0;
            const outBuffer = Buffer.alloc(totalSize);
            dataBlock.forEach(function(content) {
              content.copy(outBuffer, dindex);
              dindex += content.length;
            });
            centralHeaders.forEach(function(content) {
              content.copy(outBuffer, dindex);
              dindex += content.length;
            });
            const mh = mainHeader2.toBinary();
            if (_comment) {
              _comment.copy(mh, Utils$1.Constants.ENDHDR);
            }
            mh.copy(outBuffer, dindex);
            inBuffer = outBuffer;
            loadedEntries = false;
            onSuccess(outBuffer);
          }
        };
        compress2Buffer(Array.from(this.entries));
      } catch (e) {
        onFail(e);
      }
    }
  };
};
const Utils = utilExports;
const pth = path;
const ZipEntry = zipEntry;
const ZipFile = zipFile;
const get_Bool = (...val) => Utils.findLast(val, (c) => typeof c === "boolean");
const get_Str = (...val) => Utils.findLast(val, (c) => typeof c === "string");
const get_Fun = (...val) => Utils.findLast(val, (c) => typeof c === "function");
const defaultOptions = {
  // option "noSort" : if true it disables files sorting
  noSort: false,
  // read entries during load (initial loading may be slower)
  readEntries: false,
  // default method is none
  method: Utils.Constants.NONE,
  // file system
  fs: null
};
var admZip = function(input, options) {
  let inBuffer = null;
  const opts = Object.assign(/* @__PURE__ */ Object.create(null), defaultOptions);
  if (input && "object" === typeof input) {
    if (!(input instanceof Uint8Array)) {
      Object.assign(opts, input);
      input = opts.input ? opts.input : void 0;
      if (opts.input)
        delete opts.input;
    }
    if (Buffer.isBuffer(input)) {
      inBuffer = input;
      opts.method = Utils.Constants.BUFFER;
      input = void 0;
    }
  }
  Object.assign(opts, options);
  const filetools = new Utils(opts);
  if (typeof opts.decoder !== "object" || typeof opts.decoder.encode !== "function" || typeof opts.decoder.decode !== "function") {
    opts.decoder = Utils.decoder;
  }
  if (input && "string" === typeof input) {
    if (filetools.fs.existsSync(input)) {
      opts.method = Utils.Constants.FILE;
      opts.filename = input;
      inBuffer = filetools.fs.readFileSync(input);
    } else {
      throw Utils.Errors.INVALID_FILENAME();
    }
  }
  const _zip = new ZipFile(inBuffer, opts);
  const { canonical, sanitize, zipnamefix } = Utils;
  function getEntry(entry) {
    if (entry && _zip) {
      var item;
      if (typeof entry === "string")
        item = _zip.getEntry(pth.posix.normalize(entry));
      if (typeof entry === "object" && typeof entry.entryName !== "undefined" && typeof entry.header !== "undefined")
        item = _zip.getEntry(entry.entryName);
      if (item) {
        return item;
      }
    }
    return null;
  }
  function fixPath(zipPath) {
    const { join, normalize, sep } = pth.posix;
    return join(".", normalize(sep + zipPath.split("\\").join(sep) + sep));
  }
  function filenameFilter(filterfn) {
    if (filterfn instanceof RegExp) {
      return /* @__PURE__ */ function(rx) {
        return function(filename) {
          return rx.test(filename);
        };
      }(filterfn);
    } else if ("function" !== typeof filterfn) {
      return () => true;
    }
    return filterfn;
  }
  const relativePath = (local, entry) => {
    let lastChar = entry.slice(-1);
    lastChar = lastChar === filetools.sep ? filetools.sep : "";
    return pth.relative(local, entry) + lastChar;
  };
  return {
    /**
     * Extracts the given entry from the archive and returns the content as a Buffer object
     * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
     * @param {Buffer|string} [pass] - password
     * @return Buffer or Null in case of error
     */
    readFile: function(entry, pass) {
      var item = getEntry(entry);
      return item && item.getData(pass) || null;
    },
    /**
     * Returns how many child elements has on entry (directories) on files it is always 0
     * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
     * @returns {integer}
     */
    childCount: function(entry) {
      const item = getEntry(entry);
      if (item) {
        return _zip.getChildCount(item);
      }
    },
    /**
     * Asynchronous readFile
     * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
     * @param {callback} callback
     *
     * @return Buffer or Null in case of error
     */
    readFileAsync: function(entry, callback) {
      var item = getEntry(entry);
      if (item) {
        item.getDataAsync(callback);
      } else {
        callback(null, "getEntry failed for:" + entry);
      }
    },
    /**
     * Extracts the given entry from the archive and returns the content as plain text in the given encoding
     * @param {ZipEntry|string} entry - ZipEntry object or String with the full path of the entry
     * @param {string} encoding - Optional. If no encoding is specified utf8 is used
     *
     * @return String
     */
    readAsText: function(entry, encoding) {
      var item = getEntry(entry);
      if (item) {
        var data = item.getData();
        if (data && data.length) {
          return data.toString(encoding || "utf8");
        }
      }
      return "";
    },
    /**
     * Asynchronous readAsText
     * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
     * @param {callback} callback
     * @param {string} [encoding] - Optional. If no encoding is specified utf8 is used
     *
     * @return String
     */
    readAsTextAsync: function(entry, callback, encoding) {
      var item = getEntry(entry);
      if (item) {
        item.getDataAsync(function(data, err) {
          if (err) {
            callback(data, err);
            return;
          }
          if (data && data.length) {
            callback(data.toString(encoding || "utf8"));
          } else {
            callback("");
          }
        });
      } else {
        callback("");
      }
    },
    /**
     * Remove the entry from the file or the entry and all it's nested directories and files if the given entry is a directory
     *
     * @param {ZipEntry|string} entry
     * @returns {void}
     */
    deleteFile: function(entry, withsubfolders = true) {
      var item = getEntry(entry);
      if (item) {
        _zip.deleteFile(item.entryName, withsubfolders);
      }
    },
    /**
     * Remove the entry from the file or directory without affecting any nested entries
     *
     * @param {ZipEntry|string} entry
     * @returns {void}
     */
    deleteEntry: function(entry) {
      var item = getEntry(entry);
      if (item) {
        _zip.deleteEntry(item.entryName);
      }
    },
    /**
     * Adds a comment to the zip. The zip must be rewritten after adding the comment.
     *
     * @param {string} comment
     */
    addZipComment: function(comment) {
      _zip.comment = comment;
    },
    /**
     * Returns the zip comment
     *
     * @return String
     */
    getZipComment: function() {
      return _zip.comment || "";
    },
    /**
     * Adds a comment to a specified zipEntry. The zip must be rewritten after adding the comment
     * The comment cannot exceed 65535 characters in length
     *
     * @param {ZipEntry} entry
     * @param {string} comment
     */
    addZipEntryComment: function(entry, comment) {
      var item = getEntry(entry);
      if (item) {
        item.comment = comment;
      }
    },
    /**
     * Returns the comment of the specified entry
     *
     * @param {ZipEntry} entry
     * @return String
     */
    getZipEntryComment: function(entry) {
      var item = getEntry(entry);
      if (item) {
        return item.comment || "";
      }
      return "";
    },
    /**
     * Updates the content of an existing entry inside the archive. The zip must be rewritten after updating the content
     *
     * @param {ZipEntry} entry
     * @param {Buffer} content
     */
    updateFile: function(entry, content) {
      var item = getEntry(entry);
      if (item) {
        item.setData(content);
      }
    },
    /**
     * Adds a file from the disk to the archive
     *
     * @param {string} localPath File to add to zip
     * @param {string} [zipPath] Optional path inside the zip
     * @param {string} [zipName] Optional name for the file
     * @param {string} [comment] Optional file comment
     */
    addLocalFile: function(localPath2, zipPath, zipName, comment) {
      if (filetools.fs.existsSync(localPath2)) {
        zipPath = zipPath ? fixPath(zipPath) : "";
        const p = pth.win32.basename(pth.win32.normalize(localPath2));
        zipPath += zipName ? zipName : p;
        const _attr = filetools.fs.statSync(localPath2);
        const data = _attr.isFile() ? filetools.fs.readFileSync(localPath2) : Buffer.alloc(0);
        if (_attr.isDirectory())
          zipPath += filetools.sep;
        this.addFile(zipPath, data, comment, _attr);
      } else {
        throw Utils.Errors.FILE_NOT_FOUND(localPath2);
      }
    },
    /**
     * Callback for showing if everything was done.
     *
     * @callback doneCallback
     * @param {Error} err - Error object
     * @param {boolean} done - was request fully completed
     */
    /**
     * Adds a file from the disk to the archive
     *
     * @param {(object|string)} options - options object, if it is string it us used as localPath.
     * @param {string} options.localPath - Local path to the file.
     * @param {string} [options.comment] - Optional file comment.
     * @param {string} [options.zipPath] - Optional path inside the zip
     * @param {string} [options.zipName] - Optional name for the file
     * @param {doneCallback} callback - The callback that handles the response.
     */
    addLocalFileAsync: function(options2, callback) {
      options2 = typeof options2 === "object" ? options2 : { localPath: options2 };
      const localPath2 = pth.resolve(options2.localPath);
      const { comment } = options2;
      let { zipPath, zipName } = options2;
      const self = this;
      filetools.fs.stat(localPath2, function(err, stats) {
        if (err)
          return callback(err, false);
        zipPath = zipPath ? fixPath(zipPath) : "";
        const p = pth.win32.basename(pth.win32.normalize(localPath2));
        zipPath += zipName ? zipName : p;
        if (stats.isFile()) {
          filetools.fs.readFile(localPath2, function(err2, data) {
            if (err2)
              return callback(err2, false);
            self.addFile(zipPath, data, comment, stats);
            return setImmediate(callback, void 0, true);
          });
        } else if (stats.isDirectory()) {
          zipPath += filetools.sep;
          self.addFile(zipPath, Buffer.alloc(0), comment, stats);
          return setImmediate(callback, void 0, true);
        }
      });
    },
    /**
     * Adds a local directory and all its nested files and directories to the archive
     *
     * @param {string} localPath - local path to the folder
     * @param {string} [zipPath] - optional path inside zip
     * @param {(RegExp|function)} [filter] - optional RegExp or Function if files match will be included.
     */
    addLocalFolder: function(localPath2, zipPath, filter) {
      filter = filenameFilter(filter);
      zipPath = zipPath ? fixPath(zipPath) : "";
      localPath2 = pth.normalize(localPath2);
      if (filetools.fs.existsSync(localPath2)) {
        const items = filetools.findFiles(localPath2);
        const self = this;
        if (items.length) {
          for (const filepath of items) {
            const p = pth.join(zipPath, relativePath(localPath2, filepath));
            if (filter(p)) {
              self.addLocalFile(filepath, pth.dirname(p));
            }
          }
        }
      } else {
        throw Utils.Errors.FILE_NOT_FOUND(localPath2);
      }
    },
    /**
     * Asynchronous addLocalFolder
     * @param {string} localPath
     * @param {callback} callback
     * @param {string} [zipPath] optional path inside zip
     * @param {RegExp|function} [filter] optional RegExp or Function if files match will
     *               be included.
     */
    addLocalFolderAsync: function(localPath2, callback, zipPath, filter) {
      filter = filenameFilter(filter);
      zipPath = zipPath ? fixPath(zipPath) : "";
      localPath2 = pth.normalize(localPath2);
      var self = this;
      filetools.fs.open(localPath2, "r", function(err) {
        if (err && err.code === "ENOENT") {
          callback(void 0, Utils.Errors.FILE_NOT_FOUND(localPath2));
        } else if (err) {
          callback(void 0, err);
        } else {
          var items = filetools.findFiles(localPath2);
          var i = -1;
          var next = function() {
            i += 1;
            if (i < items.length) {
              var filepath = items[i];
              var p = relativePath(localPath2, filepath).split("\\").join("/");
              p = p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
              if (filter(p)) {
                filetools.fs.stat(filepath, function(er0, stats) {
                  if (er0)
                    callback(void 0, er0);
                  if (stats.isFile()) {
                    filetools.fs.readFile(filepath, function(er1, data) {
                      if (er1) {
                        callback(void 0, er1);
                      } else {
                        self.addFile(zipPath + p, data, "", stats);
                        next();
                      }
                    });
                  } else {
                    self.addFile(zipPath + p + "/", Buffer.alloc(0), "", stats);
                    next();
                  }
                });
              } else {
                process.nextTick(() => {
                  next();
                });
              }
            } else {
              callback(true, void 0);
            }
          };
          next();
        }
      });
    },
    /**
     * Adds a local directory and all its nested files and directories to the archive
     *
     * @param {object | string} options - options object, if it is string it us used as localPath.
     * @param {string} options.localPath - Local path to the folder.
     * @param {string} [options.zipPath] - optional path inside zip.
     * @param {RegExp|function} [options.filter] - optional RegExp or Function if files match will be included.
     * @param {function|string} [options.namefix] - optional function to help fix filename
     * @param {doneCallback} callback - The callback that handles the response.
     *
     */
    addLocalFolderAsync2: function(options2, callback) {
      const self = this;
      options2 = typeof options2 === "object" ? options2 : { localPath: options2 };
      localPath = pth.resolve(fixPath(options2.localPath));
      let { zipPath, filter, namefix } = options2;
      if (filter instanceof RegExp) {
        filter = /* @__PURE__ */ function(rx) {
          return function(filename) {
            return rx.test(filename);
          };
        }(filter);
      } else if ("function" !== typeof filter) {
        filter = function() {
          return true;
        };
      }
      zipPath = zipPath ? fixPath(zipPath) : "";
      if (namefix == "latin1") {
        namefix = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
      }
      if (typeof namefix !== "function")
        namefix = (str) => str;
      const relPathFix = (entry) => pth.join(zipPath, namefix(relativePath(localPath, entry)));
      const fileNameFix = (entry) => pth.win32.basename(pth.win32.normalize(namefix(entry)));
      filetools.fs.open(localPath, "r", function(err) {
        if (err && err.code === "ENOENT") {
          callback(void 0, Utils.Errors.FILE_NOT_FOUND(localPath));
        } else if (err) {
          callback(void 0, err);
        } else {
          filetools.findFilesAsync(localPath, function(err2, fileEntries) {
            if (err2)
              return callback(err2);
            fileEntries = fileEntries.filter((dir) => filter(relPathFix(dir)));
            if (!fileEntries.length)
              callback(void 0, false);
            setImmediate(
              fileEntries.reverse().reduce(function(next, entry) {
                return function(err3, done) {
                  if (err3 || done === false)
                    return setImmediate(next, err3, false);
                  self.addLocalFileAsync(
                    {
                      localPath: entry,
                      zipPath: pth.dirname(relPathFix(entry)),
                      zipName: fileNameFix(entry)
                    },
                    next
                  );
                };
              }, callback)
            );
          });
        }
      });
    },
    /**
     * Adds a local directory and all its nested files and directories to the archive
     *
     * @param {string} localPath - path where files will be extracted
     * @param {object} props - optional properties
     * @param {string} [props.zipPath] - optional path inside zip
     * @param {RegExp|function} [props.filter] - optional RegExp or Function if files match will be included.
     * @param {function|string} [props.namefix] - optional function to help fix filename
     */
    addLocalFolderPromise: function(localPath2, props) {
      return new Promise((resolve, reject) => {
        this.addLocalFolderAsync2(Object.assign({ localPath: localPath2 }, props), (err, done) => {
          if (err)
            reject(err);
          if (done)
            resolve(this);
        });
      });
    },
    /**
     * Allows you to create a entry (file or directory) in the zip file.
     * If you want to create a directory the entryName must end in / and a null buffer should be provided.
     * Comment and attributes are optional
     *
     * @param {string} entryName
     * @param {Buffer | string} content - file content as buffer or utf8 coded string
     * @param {string} [comment] - file comment
     * @param {number | object} [attr] - number as unix file permissions, object as filesystem Stats object
     */
    addFile: function(entryName, content, comment, attr) {
      entryName = zipnamefix(entryName);
      let entry = getEntry(entryName);
      const update = entry != null;
      if (!update) {
        entry = new ZipEntry(opts);
        entry.entryName = entryName;
      }
      entry.comment = comment || "";
      const isStat = "object" === typeof attr && attr instanceof filetools.fs.Stats;
      if (isStat) {
        entry.header.time = attr.mtime;
      }
      var fileattr = entry.isDirectory ? 16 : 0;
      let unix = entry.isDirectory ? 16384 : 32768;
      if (isStat) {
        unix |= 4095 & attr.mode;
      } else if ("number" === typeof attr) {
        unix |= 4095 & attr;
      } else {
        unix |= entry.isDirectory ? 493 : 420;
      }
      fileattr = (fileattr | unix << 16) >>> 0;
      entry.attr = fileattr;
      entry.setData(content);
      if (!update)
        _zip.setEntry(entry);
      return entry;
    },
    /**
     * Returns an array of ZipEntry objects representing the files and folders inside the archive
     *
     * @param {string} [password]
     * @returns Array
     */
    getEntries: function(password) {
      _zip.password = password;
      return _zip ? _zip.entries : [];
    },
    /**
     * Returns a ZipEntry object representing the file or folder specified by ``name``.
     *
     * @param {string} name
     * @return ZipEntry
     */
    getEntry: function(name) {
      return getEntry(name);
    },
    getEntryCount: function() {
      return _zip.getEntryCount();
    },
    forEach: function(callback) {
      return _zip.forEach(callback);
    },
    /**
     * Extracts the given entry to the given targetPath
     * If the entry is a directory inside the archive, the entire directory and it's subdirectories will be extracted
     *
     * @param {string|ZipEntry} entry - ZipEntry object or String with the full path of the entry
     * @param {string} targetPath - Target folder where to write the file
     * @param {boolean} [maintainEntryPath=true] - If maintainEntryPath is true and the entry is inside a folder, the entry folder will be created in targetPath as well. Default is TRUE
     * @param {boolean} [overwrite=false] - If the file already exists at the target path, the file will be overwriten if this is true.
     * @param {boolean} [keepOriginalPermission=false] - The file will be set as the permission from the entry if this is true.
     * @param {string} [outFileName] - String If set will override the filename of the extracted file (Only works if the entry is a file)
     *
     * @return Boolean
     */
    extractEntryTo: function(entry, targetPath, maintainEntryPath, overwrite, keepOriginalPermission, outFileName) {
      overwrite = get_Bool(false, overwrite);
      keepOriginalPermission = get_Bool(false, keepOriginalPermission);
      maintainEntryPath = get_Bool(true, maintainEntryPath);
      outFileName = get_Str(keepOriginalPermission, outFileName);
      var item = getEntry(entry);
      if (!item) {
        throw Utils.Errors.NO_ENTRY();
      }
      var entryName = canonical(item.entryName);
      var target = sanitize(targetPath, outFileName && !item.isDirectory ? outFileName : maintainEntryPath ? entryName : pth.basename(entryName));
      if (item.isDirectory) {
        var children = _zip.getEntryChildren(item);
        children.forEach(function(child) {
          if (child.isDirectory)
            return;
          var content2 = child.getData();
          if (!content2) {
            throw Utils.Errors.CANT_EXTRACT_FILE();
          }
          var name = canonical(child.entryName);
          var childName = sanitize(targetPath, maintainEntryPath ? name : pth.basename(name));
          const fileAttr2 = keepOriginalPermission ? child.header.fileAttr : void 0;
          filetools.writeFileTo(childName, content2, overwrite, fileAttr2);
        });
        return true;
      }
      var content = item.getData(_zip.password);
      if (!content)
        throw Utils.Errors.CANT_EXTRACT_FILE();
      if (filetools.fs.existsSync(target) && !overwrite) {
        throw Utils.Errors.CANT_OVERRIDE();
      }
      const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
      filetools.writeFileTo(target, content, overwrite, fileAttr);
      return true;
    },
    /**
     * Test the archive
     * @param {string} [pass]
     */
    test: function(pass) {
      if (!_zip) {
        return false;
      }
      for (var entry in _zip.entries) {
        try {
          if (entry.isDirectory) {
            continue;
          }
          var content = _zip.entries[entry].getData(pass);
          if (!content) {
            return false;
          }
        } catch (err) {
          return false;
        }
      }
      return true;
    },
    /**
     * Extracts the entire archive to the given location
     *
     * @param {string} targetPath Target location
     * @param {boolean} [overwrite=false] If the file already exists at the target path, the file will be overwriten if this is true.
     *                  Default is FALSE
     * @param {boolean} [keepOriginalPermission=false] The file will be set as the permission from the entry if this is true.
     *                  Default is FALSE
     * @param {string|Buffer} [pass] password
     */
    extractAllTo: function(targetPath, overwrite, keepOriginalPermission, pass) {
      keepOriginalPermission = get_Bool(false, keepOriginalPermission);
      pass = get_Str(keepOriginalPermission, pass);
      overwrite = get_Bool(false, overwrite);
      if (!_zip)
        throw Utils.Errors.NO_ZIP();
      _zip.entries.forEach(function(entry) {
        var entryName = sanitize(targetPath, canonical(entry.entryName));
        if (entry.isDirectory) {
          filetools.makeDir(entryName);
          return;
        }
        var content = entry.getData(pass);
        if (!content) {
          throw Utils.Errors.CANT_EXTRACT_FILE();
        }
        const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
        filetools.writeFileTo(entryName, content, overwrite, fileAttr);
        try {
          filetools.fs.utimesSync(entryName, entry.header.time, entry.header.time);
        } catch (err) {
          throw Utils.Errors.CANT_EXTRACT_FILE();
        }
      });
    },
    /**
     * Asynchronous extractAllTo
     *
     * @param {string} targetPath Target location
     * @param {boolean} [overwrite=false] If the file already exists at the target path, the file will be overwriten if this is true.
     *                  Default is FALSE
     * @param {boolean} [keepOriginalPermission=false] The file will be set as the permission from the entry if this is true.
     *                  Default is FALSE
     * @param {function} callback The callback will be executed when all entries are extracted successfully or any error is thrown.
     */
    extractAllToAsync: function(targetPath, overwrite, keepOriginalPermission, callback) {
      callback = get_Fun(overwrite, keepOriginalPermission, callback);
      keepOriginalPermission = get_Bool(false, keepOriginalPermission);
      overwrite = get_Bool(false, overwrite);
      if (!callback) {
        return new Promise((resolve, reject) => {
          this.extractAllToAsync(targetPath, overwrite, keepOriginalPermission, function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this);
            }
          });
        });
      }
      if (!_zip) {
        callback(Utils.Errors.NO_ZIP());
        return;
      }
      targetPath = pth.resolve(targetPath);
      const getPath = (entry) => sanitize(targetPath, pth.normalize(canonical(entry.entryName)));
      const getError = (msg, file) => new Error(msg + ': "' + file + '"');
      const dirEntries = [];
      const fileEntries = [];
      _zip.entries.forEach((e) => {
        if (e.isDirectory) {
          dirEntries.push(e);
        } else {
          fileEntries.push(e);
        }
      });
      for (const entry of dirEntries) {
        const dirPath = getPath(entry);
        const dirAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
        try {
          filetools.makeDir(dirPath);
          if (dirAttr)
            filetools.fs.chmodSync(dirPath, dirAttr);
          filetools.fs.utimesSync(dirPath, entry.header.time, entry.header.time);
        } catch (er) {
          callback(getError("Unable to create folder", dirPath));
        }
      }
      fileEntries.reverse().reduce(function(next, entry) {
        return function(err) {
          if (err) {
            next(err);
          } else {
            const entryName = pth.normalize(canonical(entry.entryName));
            const filePath = sanitize(targetPath, entryName);
            entry.getDataAsync(function(content, err_1) {
              if (err_1) {
                next(err_1);
              } else if (!content) {
                next(Utils.Errors.CANT_EXTRACT_FILE());
              } else {
                const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
                filetools.writeFileToAsync(filePath, content, overwrite, fileAttr, function(succ) {
                  if (!succ) {
                    next(getError("Unable to write file", filePath));
                  }
                  filetools.fs.utimes(filePath, entry.header.time, entry.header.time, function(err_2) {
                    if (err_2) {
                      next(getError("Unable to set times", filePath));
                    } else {
                      next();
                    }
                  });
                });
              }
            });
          }
        };
      }, callback)();
    },
    /**
     * Writes the newly created zip file to disk at the specified location or if a zip was opened and no ``targetFileName`` is provided, it will overwrite the opened zip
     *
     * @param {string} targetFileName
     * @param {function} callback
     */
    writeZip: function(targetFileName, callback) {
      if (arguments.length === 1) {
        if (typeof targetFileName === "function") {
          callback = targetFileName;
          targetFileName = "";
        }
      }
      if (!targetFileName && opts.filename) {
        targetFileName = opts.filename;
      }
      if (!targetFileName)
        return;
      var zipData = _zip.compressToBuffer();
      if (zipData) {
        var ok = filetools.writeFileTo(targetFileName, zipData, true);
        if (typeof callback === "function")
          callback(!ok ? new Error("failed") : null, "");
      }
    },
    /**
             *
             * @param {string} targetFileName
             * @param {object} [props]
             * @param {boolean} [props.overwrite=true] If the file already exists at the target path, the file will be overwriten if this is true.
             * @param {boolean} [props.perm] The file will be set as the permission from the entry if this is true.
    
             * @returns {Promise<void>}
             */
    writeZipPromise: function(targetFileName, props) {
      const { overwrite, perm } = Object.assign({ overwrite: true }, props);
      return new Promise((resolve, reject) => {
        if (!targetFileName && opts.filename)
          targetFileName = opts.filename;
        if (!targetFileName)
          reject("ADM-ZIP: ZIP File Name Missing");
        this.toBufferPromise().then((zipData) => {
          const ret = (done) => done ? resolve(done) : reject("ADM-ZIP: Wasn't able to write zip file");
          filetools.writeFileToAsync(targetFileName, zipData, overwrite, perm, ret);
        }, reject);
      });
    },
    /**
     * @returns {Promise<Buffer>} A promise to the Buffer.
     */
    toBufferPromise: function() {
      return new Promise((resolve, reject) => {
        _zip.toAsyncBuffer(resolve, reject);
      });
    },
    /**
     * Returns the content of the entire zip file as a Buffer object
     *
     * @prop {function} [onSuccess]
     * @prop {function} [onFail]
     * @prop {function} [onItemStart]
     * @prop {function} [onItemEnd]
     * @returns {Buffer}
     */
    toBuffer: function(onSuccess, onFail, onItemStart, onItemEnd) {
      if (typeof onSuccess === "function") {
        _zip.toAsyncBuffer(onSuccess, onFail, onItemStart, onItemEnd);
        return null;
      }
      return _zip.compressToBuffer();
    }
  };
};
const AdmZip = /* @__PURE__ */ getDefaultExportFromCjs(admZip);
const BACKUP_DIR = path.join(app.getPath("userData"), "backups");
const AUTO_BACKUP_DIR = path.join(BACKUP_DIR, "auto");
if (!fs.existsSync(BACKUP_DIR))
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
if (!fs.existsSync(AUTO_BACKUP_DIR))
  fs.mkdirSync(AUTO_BACKUP_DIR, { recursive: true });
class BackupService {
  // --- Encryption Helpers ---
  deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 1e5, 32, "sha256");
  }
  encryptData(data, password) {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = this.deriveKey(password, salt);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encryptedData: encrypted,
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex")
    };
  }
  decryptData(encryptedData, password, encryption) {
    const salt = Buffer.from(encryption.salt, "hex");
    const iv = Buffer.from(encryption.iv, "hex");
    const authTag = Buffer.from(encryption.authTag, "hex");
    const key = this.deriveKey(password, salt);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  }
  // --- Core Logic ---
  // 1. Export Data
  async exportData(targetPath, password) {
    const [novels, volumes, chapters, characters, ideas, tags] = await Promise.all([
      db.novel.findMany(),
      db.volume.findMany(),
      db.chapter.findMany(),
      db.character.findMany(),
      db.idea.findMany(),
      db.tag.findMany()
    ]);
    const fullData = { novels, volumes, chapters, characters, ideas, tags };
    const dataBuffer = Buffer.from(JSON.stringify(fullData));
    const zip = new AdmZip();
    const manifest = {
      version: 1,
      appVersion: app.getVersion(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      platform: process.platform,
      encrypted: !!password
    };
    if (password) {
      const { encryptedData, salt, iv, authTag } = this.encryptData(dataBuffer, password);
      manifest.encryption = { algo: "aes-256-gcm", salt, iv, authTag };
      zip.addFile("data.bin", encryptedData);
    } else {
      zip.addFile("data.json", dataBuffer);
    }
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
    if (!targetPath) {
      const { filePath } = await dialog.showSaveDialog({
        title: "Export Backup",
        defaultPath: `NovelData_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_")}.nebak`,
        filters: [{ name: "Novel Editor Backup", extensions: ["nebak"] }]
      });
      if (!filePath)
        throw new Error("Export cancelled");
      targetPath = filePath;
    }
    zip.writeZip(targetPath);
    return targetPath;
  }
  // 2. Import Data (Restore)
  async importData(filePath, password) {
    const zip = new AdmZip(filePath);
    const manifestEntry = zip.getEntry("manifest.json");
    if (!manifestEntry)
      throw new Error("Invalid backup file: manifest.json missing");
    const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
    let dataJson;
    if (manifest.encrypted) {
      if (!password)
        throw new Error("PASSWORD_REQUIRED");
      const dataEntry = zip.getEntry("data.bin");
      if (!dataEntry)
        throw new Error("Invalid backup file: data.bin missing");
      if (!manifest.encryption)
        throw new Error("Invalid backup file: encryption metadata missing");
      try {
        const decrypted = this.decryptData(dataEntry.getData(), password, manifest.encryption);
        dataJson = JSON.parse(decrypted.toString("utf8"));
      } catch (e) {
        throw new Error("PASSWORD_INVALID");
      }
    } else {
      const dataEntry = zip.getEntry("data.json");
      if (!dataEntry)
        throw new Error("Invalid backup file: data.json missing");
      dataJson = JSON.parse(dataEntry.getData().toString("utf8"));
    }
    await this.performRestore(dataJson);
  }
  // Helper: Perform Restore (Transactional)
  async performRestore(data) {
    await this.createAutoBackup();
    await db.$transaction(async (tx) => {
      var _a, _b, _c, _d, _e, _f;
      await tx.tag.deleteMany();
      await tx.idea.deleteMany();
      await tx.character.deleteMany();
      await tx.chapter.deleteMany();
      await tx.volume.deleteMany();
      await tx.novel.deleteMany();
      if ((_a = data.novels) == null ? void 0 : _a.length)
        for (const item of data.novels)
          await tx.novel.create({ data: item });
      if ((_b = data.volumes) == null ? void 0 : _b.length)
        for (const item of data.volumes)
          await tx.volume.create({ data: item });
      if ((_c = data.chapters) == null ? void 0 : _c.length)
        for (const item of data.chapters)
          await tx.chapter.create({ data: item });
      if ((_d = data.characters) == null ? void 0 : _d.length)
        for (const item of data.characters)
          await tx.character.create({ data: item });
      if ((_e = data.ideas) == null ? void 0 : _e.length)
        for (const item of data.ideas)
          await tx.idea.create({ data: item });
      if ((_f = data.tags) == null ? void 0 : _f.length)
        for (const item of data.tags)
          await tx.tag.create({ data: item });
    }, {
      maxWait: 1e4,
      timeout: 2e4
    });
  }
  // 3. Auto Backup Logic
  async createAutoBackup() {
    try {
      const timestamp = Date.now();
      const filename = `auto_backup_${timestamp}.nebak`;
      const filePath = path.join(AUTO_BACKUP_DIR, filename);
      await this.exportData(filePath);
      console.log("[BackupService] Auto-backup created:", filename);
      await this.rotateAutoBackups();
    } catch (e) {
      console.error("[BackupService] Failed to create auto-backup:", e);
    }
  }
  async rotateAutoBackups() {
    const files = fs.readdirSync(AUTO_BACKUP_DIR).filter((f) => f.endsWith(".nebak")).map((f) => ({
      name: f,
      time: fs.statSync(path.join(AUTO_BACKUP_DIR, f)).mtime.getTime()
    })).sort((a, b) => b.time - a.time);
    const toDelete = files.slice(3);
    for (const file of toDelete) {
      fs.unlinkSync(path.join(AUTO_BACKUP_DIR, file.name));
      console.log("[BackupService] Rotated auto-backup:", file.name);
    }
  }
  // 4. List Auto Backups
  async getAutoBackups() {
    return fs.readdirSync(AUTO_BACKUP_DIR).filter((f) => f.endsWith(".nebak")).map((f) => {
      const stats = fs.statSync(path.join(AUTO_BACKUP_DIR, f));
      return {
        filename: f,
        createdAt: stats.mtime.getTime(),
        size: stats.size
      };
    }).sort((a, b) => b.createdAt - a.createdAt);
  }
  // 5. Restore from Auto Backup
  async restoreAutoBackup(filename) {
    const filePath = path.join(AUTO_BACKUP_DIR, filename);
    if (!fs.existsSync(filePath))
      throw new Error("Backup file not found");
    await this.importData(filePath);
  }
}
const backupService = new BackupService();
const __dirname$1 = path$1.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path$1.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path$1.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path$1.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path$1.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
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
    icon: path$1.join(process.env.VITE_PUBLIC || "", "electron-vite.svg"),
    webPreferences: {
      preload: path$1.join(__dirname$1, "preload.mjs")
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
    if (input.key === "F11") {
      win == null ? void 0 : win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
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
    win.loadFile(path$1.join(RENDERER_DIST, "index.html"));
  }
  win.on("enter-full-screen", () => {
    win == null ? void 0 : win.webContents.send("app:fullscreen-change", true);
  });
  win.on("leave-full-screen", () => {
    win == null ? void 0 : win.webContents.send("app:fullscreen-change", false);
  });
}
ipcMain.handle("app:toggle-fullscreen", () => {
  if (win) {
    const isFullScreen = win.isFullScreen();
    win.setFullScreen(!isFullScreen);
    return !isFullScreen;
  }
  return false;
});
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
    const chapter = await db.chapter.create({
      data: {
        volumeId,
        title,
        order,
        content: "",
        wordCount: 0
      },
      include: { volume: { select: { novelId: true } } }
    });
    await indexChapter({ ...chapter, novelId: chapter.volume.novelId });
    return chapter;
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
    const updated = await db.volume.update({
      where: { id: volumeId },
      data: { title }
    });
    const chapters = await db.chapter.findMany({
      where: { volumeId },
      include: { volume: { select: { novelId: true, title: true, order: true } } }
    });
    for (const chapter of chapters) {
      await indexChapter({
        ...chapter,
        novelId: chapter.volume.novelId,
        volumeTitle: chapter.volume.title,
        volumeOrder: chapter.volume.order
      });
    }
    return updated;
  } catch (e) {
    console.error("[Main] db:rename-volume failed:", e);
    throw e;
  }
});
ipcMain.handle("db:rename-chapter", async (_, { chapterId, title }) => {
  try {
    const updated = await db.chapter.update({
      where: { id: chapterId },
      data: { title }
    });
    const chapterData = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, title: true, content: true, volumeId: true, order: true, volume: { select: { novelId: true } } }
    });
    if (chapterData && chapterData.volume) {
      await indexChapter({ ...chapterData, novelId: chapterData.volume.novelId });
    }
    return updated;
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
    const chapterData = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, title: true, content: true, volumeId: true, order: true }
    });
    if (chapterData) {
      await indexChapter({ ...chapterData, novelId });
    }
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
    const mappedResult = {
      ...result,
      tags: result.tags.map((t) => t.name),
      timestamp: result.createdAt.getTime()
    };
    await indexIdea({
      id: result.id,
      content: result.content,
      quote: result.quote,
      novelId: result.novelId,
      chapterId: result.chapterId
    });
    return mappedResult;
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
    const mappedResult = {
      ...result,
      tags: result.tags.map((t) => t.name),
      timestamp: result.createdAt.getTime()
    };
    await indexIdea({
      id: result.id,
      content: result.content,
      quote: result.quote,
      novelId: result.novelId,
      chapterId: result.chapterId
    });
    return mappedResult;
  } catch (e) {
    console.error("[Main] db:update-idea failed:", e);
    throw e;
  }
});
ipcMain.handle("db:delete-idea", async (_, id) => {
  try {
    const result = await db.idea.delete({ where: { id } });
    await removeFromIndex("idea", id);
    return result;
  } catch (e) {
    console.error("[Main] db:delete-idea failed:", e);
    throw e;
  }
});
ipcMain.handle("db:check-index-status", async (_, novelId) => {
  try {
    const stats = await getIndexStats(novelId);
    const chapterCount = await db.chapter.count({
      where: { volume: { novelId } }
    });
    const ideaCount = await db.idea.count({
      where: { novelId }
    });
    return {
      indexedChapters: stats.chapters,
      totalChapters: chapterCount,
      indexedIdeas: stats.ideas,
      totalIdeas: ideaCount
    };
  } catch (e) {
    console.error("[Main] db:check-index-status failed:", e);
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
ipcMain.handle("backup:export", async (_, password) => {
  try {
    return await backupService.exportData(void 0, password);
  } catch (e) {
    console.error("[Main] backup:export failed:", e);
    throw e;
  }
});
ipcMain.handle("backup:import", async (_, { filePath, password }) => {
  try {
    if (!filePath) {
      const result = await dialog.showOpenDialog({
        title: "Import Backup",
        filters: [{ name: "Novel Editor Backup", extensions: ["nebak"] }],
        properties: ["openFile"]
      });
      if (result.canceled || result.filePaths.length === 0)
        return { success: false, code: "CANCELLED" };
      filePath = result.filePaths[0];
    }
    await backupService.importData(filePath, password);
    return { success: true };
  } catch (e) {
    console.error("[Main] backup:import failed:", e);
    const msg = e.message || e.toString();
    if (msg.includes("PASSWORD_REQUIRED")) {
      return { success: false, code: "PASSWORD_REQUIRED", filePath };
    }
    if (msg.includes("PASSWORD_INVALID")) {
      return { success: false, code: "PASSWORD_INVALID", filePath };
    }
    return { success: false, message: msg };
  }
});
ipcMain.handle("backup:get-auto", async () => {
  try {
    return await backupService.getAutoBackups();
  } catch (e) {
    console.error("[Main] backup:get-auto failed:", e);
    throw e;
  }
});
ipcMain.handle("backup:restore-auto", async (_, filename) => {
  try {
    await backupService.restoreAutoBackup(filename);
    return true;
  } catch (e) {
    console.error("[Main] backup:restore-auto failed:", e);
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
ipcMain.handle("db:search", async (_, { novelId, keyword, limit = 20, offset = 0 }) => {
  try {
    return await search(novelId, keyword, limit, offset);
  } catch (e) {
    console.error("[Main] db:search failed:", e);
    throw e;
  }
});
ipcMain.handle("db:rebuild-search-index", async (_, novelId) => {
  try {
    return await rebuildIndex(novelId);
  } catch (e) {
    console.error("[Main] db:rebuild-search-index failed:", e);
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
    const exePath = path$1.dirname(app.getPath("exe"));
    dataPath = path$1.join(exePath, "data");
  } else {
    dataPath = app.getPath("userData");
  }
  const dbPath = path$1.join(dataPath, "novel_editor.db");
  const dbUrl = `file:${dbPath}`;
  console.log("[Main] Database Path:", dbPath);
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  if (!app.isPackaged) {
    const schemaPath = path$1.resolve(__dirname$1, "../../../packages/core/prisma/schema.prisma");
    console.log("[Main] Development mode detected (unpackaged). Checking schema at:", schemaPath);
    if (fs.existsSync(schemaPath)) {
      console.log("[Main] Schema found. Attempting synchronous DB push to:", dbPath);
      try {
        const prismaPath = path$1.resolve(__dirname$1, "../../../packages/core/node_modules/.bin/prisma.cmd");
        const dbFolder = path$1.dirname(dbPath);
        if (!fs.existsSync(dbFolder)) {
          fs.mkdirSync(dbFolder, { recursive: true });
        }
        const command = `"${prismaPath}" db push --schema="${schemaPath}" --accept-data-loss`;
        console.log("[Main] Executing migration command...");
        execSync(command, {
          env: { ...process.env, DATABASE_URL: dbUrl },
          cwd: path$1.resolve(__dirname$1, "../../../packages/core"),
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
  await initSearchIndex();
  console.log("[Main] Search index initialized");
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
