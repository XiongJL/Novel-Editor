var $t = Object.defineProperty;
var Rt = (r, t, e) => t in r ? $t(r, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : r[t] = e;
var ee = (r, t, e) => (Rt(r, typeof t != "symbol" ? t + "" : t, e), e);
import { app as b, dialog as Ce, ipcMain as S, nativeImage as Ft, BrowserWindow as wt, protocol as Ut, net as Bt, session as _e } from "electron";
import { db as h, initDb as Ze, ensureDbSchema as zt } from "@novel-editor/core";
import { fileURLToPath as jt } from "node:url";
import L from "node:path";
import { execSync as Ht } from "child_process";
import x from "fs";
import z from "node:fs";
import { createHash as vt, randomUUID as qt } from "node:crypto";
import { spawn as Vt } from "node:child_process";
import ne from "path";
import It from "zlib";
import fe from "crypto";
async function Wt() {
  try {
    if ((await h.$queryRaw`
            SELECT name FROM sqlite_master WHERE type='table' AND name='search_index';
        `).length === 0)
      await h.$executeRaw`
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
            `, console.log("[SearchIndex] FTS5 table created successfully");
    else {
      const t = ["volume_title", "chapter_order", "volume_order", "volume_id"];
      for (const e of t)
        try {
          await h.$executeRawUnsafe(`SELECT ${e} FROM search_index LIMIT 1;`);
        } catch {
          console.warn(`[SearchIndex] Schema mismatch (missing ${e}). Attempting to add column...`);
          try {
            await h.$executeRawUnsafe(`ALTER TABLE search_index ADD COLUMN ${e};`), console.log(`[SearchIndex] Added ${e} column successfully`);
          } catch (a) {
            console.error(`[SearchIndex] Failed to add column ${e}:`, a);
          }
        }
    }
  } catch (r) {
    console.error("[SearchIndex] Failed to initialize FTS5 table:", r);
  }
}
function Gt(r) {
  if (!r)
    return "";
  try {
    const t = JSON.parse(r), e = [], n = (a) => {
      a.type === "text" && a.text && e.push(a.text), a.children && Array.isArray(a.children) && (a.children.forEach(n), a.type !== "root" && a.type !== "list" && a.type !== "listitem" && e.push(" "));
    };
    return t.root && n(t.root), e.join("").trim();
  } catch {
    return r;
  }
}
async function Ee(r) {
  const t = Gt(r.content);
  let e = r.novelId, n = r.volumeTitle, a = r.order, o = r.volumeOrder;
  if (!e || !n || a === void 0 || o === void 0) {
    const c = await h.chapter.findUnique({
      where: { id: r.id },
      select: {
        order: !0,
        volume: { select: { id: !0, novelId: !0, title: !0, order: !0 } }
      }
    });
    c && (a === void 0 && (a = c.order), c.volume && (e || (e = c.volume.novelId), n || (n = c.volume.title), o === void 0 && (o = c.volume.order)));
  }
  if (e)
    try {
      await h.$executeRaw`
            DELETE FROM search_index WHERE entity_type = 'chapter' AND entity_id = ${r.id};
        `, await h.$executeRaw`
            INSERT INTO search_index (content, entity_type, entity_id, novel_id, chapter_id, title, volume_title, chapter_order, volume_order, volume_id)
            VALUES (${t}, 'chapter', ${r.id}, ${e}, ${r.id}, ${r.title}, ${n || ""}, ${a || 0}, ${o || 0}, ${r.volumeId});
        `;
    } catch (c) {
      console.error("[SearchIndex] Failed to index chapter:", c);
    }
}
async function Ve(r) {
  const t = [r.content, r.quote].filter(Boolean).join(" ");
  try {
    await h.$executeRaw`
            DELETE FROM search_index WHERE entity_type = 'idea' AND entity_id = ${r.id};
        `, await h.$executeRaw`
            INSERT INTO search_index (content, entity_type, entity_id, novel_id, chapter_id, title, volume_title, chapter_order, volume_order, volume_id)
            VALUES (${t}, 'idea', ${r.id}, ${r.novelId}, ${r.chapterId || ""}, ${r.content.substring(0, 50)}, '', 0, 0, '');
        `;
  } catch (e) {
    console.error("[SearchIndex] Failed to index idea:", e);
  }
}
async function Zt(r, t) {
  try {
    await h.$executeRaw`
            DELETE FROM search_index WHERE entity_type = ${r} AND entity_id = ${t};
        `;
  } catch (e) {
    console.error("[SearchIndex] Failed to remove from index:", e);
  }
}
async function Ct(r, t, e = 20, n = 0) {
  if (!t.trim())
    return [];
  try {
    const o = `%${t.replace(/[%_]/g, "\\$&")}%`, c = await h.$queryRaw`
            SELECT entity_type, entity_id, chapter_id, novel_id, title, volume_title, content, chapter_order, volume_order, volume_id
            FROM search_index
            WHERE novel_id = ${r} 
            AND (content LIKE ${o} OR title LIKE ${o} OR volume_title LIKE ${o})
            ORDER BY volume_order ASC, chapter_order ASC
            LIMIT ${e} OFFSET ${n};
        `, i = [], l = t.toLowerCase(), I = /* @__PURE__ */ new Set();
    for (const w of c) {
      const E = w.content || "", C = w.title || "", p = w.volume_title || "", g = Number(w.chapter_order || 0), f = Number(w.volume_order || 0);
      w.entity_type === "chapter" && p && p.toLowerCase().includes(l) && (I.has(p) || (i.push({
        entityType: "chapter",
        entityId: w.entity_id,
        chapterId: w.chapter_id,
        novelId: w.novel_id,
        title: w.title,
        snippet: `Volume match: <mark>${p}</mark>`,
        preview: `Found in Volume: ${p}`,
        keyword: t,
        matchType: "volume",
        chapterOrder: g,
        volumeTitle: p,
        volumeOrder: f,
        volumeId: w.volume_id
      }), I.add(p))), w.entity_type === "chapter" && C.toLowerCase().includes(l) && i.push({
        entityType: "chapter",
        entityId: w.entity_id,
        chapterId: w.chapter_id,
        novelId: w.novel_id,
        title: w.title,
        snippet: `Title match: <mark>${C}</mark>`,
        preview: `Found in Title: ${C}`,
        keyword: t,
        matchType: "title",
        chapterOrder: g,
        volumeTitle: p,
        volumeOrder: f,
        volumeId: w.volume_id
      });
      const m = E.toLowerCase(), u = [];
      let s = 0;
      for (; s < m.length && u.length < 200; ) {
        const v = m.indexOf(l, s);
        if (v === -1)
          break;
        u.push(v), s = v + l.length;
      }
      const d = 60, y = [];
      for (const v of u)
        (y.length === 0 || v - y[y.length - 1] > d) && y.push(v);
      for (const v of y)
        i.push({
          entityType: w.entity_type,
          entityId: w.entity_id,
          chapterId: w.chapter_id,
          novelId: w.novel_id,
          title: w.title,
          snippet: Je(E, t, v, 10, !0),
          preview: Je(E, t, v, 25, !1),
          keyword: t,
          matchType: "content",
          chapterOrder: g,
          volumeTitle: p,
          volumeOrder: f,
          volumeId: w.volume_id
        });
    }
    return i;
  } catch (a) {
    return console.error("[SearchIndex] Search failed:", a), [];
  }
}
function Je(r, t, e, n = 30, a = !0) {
  if (!r)
    return "";
  const o = Math.max(0, e - n), c = Math.min(r.length, e + t.length + n * 2);
  let i = "";
  o > 0 && (i += "...");
  const l = r.substring(o, e), I = r.substring(e, e + t.length), w = r.substring(e + t.length, c);
  return a ? i += l + "<mark>" + I + "</mark>" + w : i += l + I + w, c < r.length && (i += "..."), i;
}
async function Jt(r) {
  var n, a;
  let t = 0, e = 0;
  try {
    await h.$executeRaw`DELETE FROM search_index WHERE novel_id = ${r};`;
    const o = await h.chapter.findMany({
      where: { volume: { novelId: r } },
      select: {
        id: !0,
        title: !0,
        content: !0,
        volumeId: !0,
        order: !0,
        volume: { select: { title: !0, order: !0 } }
      }
    });
    for (const i of o)
      await Ee({
        ...i,
        novelId: r,
        volumeTitle: (n = i.volume) == null ? void 0 : n.title,
        volumeOrder: (a = i.volume) == null ? void 0 : a.order
      }), t++;
    const c = await h.idea.findMany({
      where: { novelId: r },
      select: { id: !0, content: !0, quote: !0, novelId: !0, chapterId: !0 }
    });
    for (const i of c)
      await Ve(i), e++;
  } catch (o) {
    console.error("[SearchIndex] Rebuild failed:", o);
  }
  return { chapters: t, ideas: e };
}
async function Kt(r) {
  try {
    const t = await h.$queryRaw`
            SELECT entity_type, COUNT(*) as count FROM search_index WHERE novel_id = ${r} GROUP BY entity_type;
        `;
    let e = 0, n = 0;
    return t.forEach((a) => {
      a.entity_type === "chapter" && (e = Number(a.count)), a.entity_type === "idea" && (n = Number(a.count));
    }), { chapters: e, ideas: n };
  } catch (t) {
    return console.error("[SearchIndex] Failed to get stats:", t), { chapters: 0, ideas: 0 };
  }
}
class j extends Error {
  constructor(e, n, a) {
    super(n);
    ee(this, "code");
    ee(this, "detail");
    this.code = e, this.detail = a, this.name = "AiActionError";
  }
}
function Xt(r) {
  const t = r.toLowerCase();
  return t.includes("timed out") || t.includes("timeout") || t.includes("aborterror") || t.includes("aborted") ? new j("PROVIDER_TIMEOUT", r) : t.includes("401") || t.includes("403") || t.includes("unauthorized") || t.includes("forbidden") || t.includes("api key") ? new j("PROVIDER_AUTH", r) : t.includes("content_filter") || t.includes("safety") || t.includes("filtered") ? new j("PROVIDER_FILTERED", r) : t.includes("429") || t.includes("503") || t.includes("model") || t.includes("unavailable") ? new j("PROVIDER_UNAVAILABLE", r) : t.includes("fetch") || t.includes("network") || t.includes("econn") ? new j("NETWORK_ERROR", r) : new j("UNKNOWN", r);
}
function te(r) {
  if (r instanceof j)
    return r;
  const t = r instanceof Error ? r.message : String(r ?? "unknown error");
  return Xt(t);
}
function ge(r, t) {
  switch (r) {
    case "INVALID_INPUT":
      return "参数不完整或格式错误，请检查输入。";
    case "NOT_FOUND":
      return "目标数据不存在，可能已被删除。";
    case "CONFLICT":
      return "当前操作与现有数据冲突，请调整后重试。";
    case "PROVIDER_AUTH":
      return "模型鉴权失败，请检查 API Key 或权限。";
    case "PROVIDER_TIMEOUT":
      return "模型请求超时，请稍后重试。";
    case "PROVIDER_UNAVAILABLE":
      return "模型暂不可用，请稍后重试或切换模型。";
    case "PROVIDER_FILTERED":
      return "请求触发内容策略限制，请调整提示词。";
    case "NETWORK_ERROR":
      return "网络连接失败，请检查网络或代理设置。";
    case "PERSISTENCE_ERROR":
      return "写入失败，数据未成功保存。";
    case "UNKNOWN":
    default:
      return t || "未知错误，请稍后重试。";
  }
}
const Yt = "debug-dev.log", Qt = 15 * 1024 * 1024, er = "***REDACTED***", tr = /* @__PURE__ */ new Set([
  "authorization",
  "apikey",
  "api_key",
  "api key",
  "token",
  "access_token",
  "refresh_token"
]);
let ae = null;
function We() {
  return process.env.NODE_ENV !== "production";
}
function Ke(r) {
  We() && (ae = L.join(r, Yt), Et());
}
function oe(r) {
  return je(r, /* @__PURE__ */ new WeakSet());
}
function M(r, t, e, n) {
  if (!We())
    return;
  const a = [
    `[${(/* @__PURE__ */ new Date()).toISOString()}] [${r}] [${t}]`,
    `message=${e}`,
    n === void 0 ? "" : `extra=${nr(oe(n))}`,
    ""
  ].filter(Boolean);
  rr(a.join(`
`));
}
function ie(r, t, e) {
  const n = St(t);
  M("ERROR", r, n.message, {
    error: n,
    ...e === void 0 ? {} : { extra: e }
  });
}
function Et() {
  if (!ae)
    return;
  const r = L.dirname(ae);
  z.existsSync(r) || z.mkdirSync(r, { recursive: !0 }), z.existsSync(ae) || z.writeFileSync(ae, "", "utf8");
}
function rr(r) {
  if (ae)
    try {
      Et(), (z.existsSync(ae) ? z.statSync(ae).size : 0) >= Qt && z.writeFileSync(ae, "", "utf8"), z.appendFileSync(ae, `${r}
`, "utf8");
    } catch {
    }
}
function nr(r) {
  try {
    return JSON.stringify(r, null, 2);
  } catch {
    return String(r);
  }
}
function St(r) {
  return r instanceof Error ? {
    name: r.name,
    message: r.message,
    stack: r.stack
  } : {
    name: typeof r,
    message: String(r)
  };
}
function je(r, t) {
  if (r == null || typeof r == "string" || typeof r == "number" || typeof r == "boolean")
    return r;
  if (typeof r == "bigint")
    return r.toString();
  if (r instanceof Error)
    return St(r);
  if (Array.isArray(r))
    return r.map((e) => je(e, t));
  if (typeof r == "object") {
    const e = r;
    if (t.has(e))
      return "[Circular]";
    t.add(e);
    const n = {};
    for (const [a, o] of Object.entries(e)) {
      if (tr.has(a.toLowerCase())) {
        n[a] = er;
        continue;
      }
      n[a] = je(o, t);
    }
    return t.delete(e), n;
  }
  return String(r);
}
function be(r, t) {
  return `${r.replace(/\/+$/, "")}/${t.replace(/^\/+/, "")}`;
}
function Xe(r) {
  try {
    return JSON.parse(r);
  } catch {
    return null;
  }
}
class _t {
  constructor(t) {
    ee(this, "name", "http");
    this.settings = t;
  }
  async healthCheck() {
    const { baseUrl: t, apiKey: e, timeoutMs: n } = this.settings.http;
    if (!t.trim())
      return { ok: !1, detail: "HTTP baseUrl is empty" };
    try {
      new URL(t);
    } catch {
      return { ok: !1, detail: "HTTP baseUrl is invalid" };
    }
    if (!e.trim())
      return { ok: !1, detail: "API key is empty" };
    const a = new AbortController();
    let o = !1;
    const c = Math.max(1e3, n), i = setTimeout(() => {
      o = !0, a.abort();
    }, c), l = be(t, "models"), I = Date.now();
    try {
      M("INFO", "HttpProvider.healthCheck.request", "HTTP health check request", {
        url: l,
        timeoutMs: c,
        headers: { Authorization: `Bearer ${e}` }
      });
      const w = await fetch(l, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${e}`
        },
        signal: a.signal
      });
      return w.ok ? (M("INFO", "HttpProvider.healthCheck.response", "HTTP health check ok", {
        url: l,
        status: w.status,
        elapsedMs: Date.now() - I
      }), { ok: !0, detail: "HTTP provider is reachable" }) : (M("WARN", "HttpProvider.healthCheck.response", "HTTP health check rejected", {
        url: l,
        status: w.status,
        elapsedMs: Date.now() - I
      }), { ok: !1, detail: `HTTP provider rejected: ${w.status}` });
    } catch (w) {
      return ie("HttpProvider.healthCheck.error", w, {
        url: l,
        elapsedMs: Date.now() - I,
        didTimeout: o
      }), o ? { ok: !1, detail: `HTTP health check timed out after ${c}ms` } : { ok: !1, detail: `HTTP health check failed: ${(w == null ? void 0 : w.message) || "unknown error"}` };
    } finally {
      clearTimeout(i);
    }
  }
  async generate(t) {
    var w, E, C, p, g, f;
    const e = t.prompt.trim();
    if (!e)
      return { text: "", model: this.settings.http.model };
    const n = new AbortController();
    let a = !1;
    const o = Math.max(1e3, this.settings.http.timeoutMs), c = setTimeout(() => {
      a = !0, n.abort();
    }, o), i = {
      model: this.settings.http.model,
      messages: [
        ...t.systemPrompt ? [{ role: "system", content: t.systemPrompt }] : [],
        { role: "user", content: e }
      ],
      max_tokens: t.maxTokens ?? this.settings.http.maxTokens,
      temperature: t.temperature ?? this.settings.http.temperature
    }, l = be(this.settings.http.baseUrl, "chat/completions"), I = Date.now();
    try {
      M("INFO", "HttpProvider.generate.request", "AI text generation request", {
        url: l,
        timeoutMs: o,
        body: oe(i)
      });
      const m = await fetch(l, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.http.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(i),
        signal: n.signal
      }), u = await m.text(), s = Xe(u);
      if (M("INFO", "HttpProvider.generate.response", "AI text generation response", {
        url: l,
        status: m.status,
        elapsedMs: Date.now() - I,
        text: u
      }), !m.ok)
        throw new Error(((w = s == null ? void 0 : s.error) == null ? void 0 : w.message) || `HTTP ${m.status}: ${u.slice(0, 300)}`);
      const d = ((p = (C = (E = s == null ? void 0 : s.choices) == null ? void 0 : E[0]) == null ? void 0 : C.message) == null ? void 0 : p.content) || (s == null ? void 0 : s.output_text) || ((f = (g = s == null ? void 0 : s.content) == null ? void 0 : g[0]) == null ? void 0 : f.text) || "";
      return {
        text: typeof d == "string" ? d : JSON.stringify(d),
        model: (s == null ? void 0 : s.model) || this.settings.http.model
      };
    } catch (m) {
      throw ie("HttpProvider.generate.error", m, {
        url: l,
        elapsedMs: Date.now() - I,
        didTimeout: a,
        requestBody: oe(i)
      }), a || (m == null ? void 0 : m.name) === "AbortError" ? new Error(`HTTP request timeout after ${o}ms`) : m;
    } finally {
      clearTimeout(c);
    }
  }
  async generateImage(t) {
    var w, E;
    const e = t.prompt.trim();
    if (!e)
      return {};
    const n = new AbortController();
    let a = !1;
    const o = Math.max(1e3, this.settings.http.timeoutMs), c = setTimeout(() => {
      a = !0, n.abort();
    }, o), i = {
      model: t.model || this.settings.http.model,
      prompt: e,
      size: t.size || "1024x1024",
      output_format: t.outputFormat || "png",
      watermark: t.watermark ?? !0
    }, l = be(this.settings.http.baseUrl, "images/generations"), I = Date.now();
    try {
      M("INFO", "HttpProvider.generateImage.request", "AI image generation request", {
        url: l,
        timeoutMs: o,
        body: oe(i)
      });
      const C = await fetch(l, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.http.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(i),
        signal: n.signal
      }), p = await C.text(), g = Xe(p);
      if (M("INFO", "HttpProvider.generateImage.response", "AI image generation response", {
        url: l,
        status: C.status,
        elapsedMs: Date.now() - I,
        text: p
      }), !C.ok)
        throw new Error(((w = g == null ? void 0 : g.error) == null ? void 0 : w.message) || `HTTP ${C.status}: ${p.slice(0, 300)}`);
      const f = ((E = g == null ? void 0 : g.data) == null ? void 0 : E[0]) || {};
      return {
        imageUrl: f.url,
        imageBase64: f.b64_json,
        mimeType: "image/png"
      };
    } catch (C) {
      throw ie("HttpProvider.generateImage.error", C, {
        url: l,
        elapsedMs: Date.now() - I,
        didTimeout: a,
        requestBody: oe(i)
      }), a || (C == null ? void 0 : C.name) === "AbortError" ? new Error(`HTTP request timeout after ${o}ms`) : C;
    } finally {
      clearTimeout(c);
    }
  }
}
const B = "[Summary]", At = {
  summaryMode: "local",
  summaryTriggerPolicy: "manual",
  summaryDebounceMs: 3e4,
  summaryMinIntervalMs: 18e4,
  summaryMinWordDelta: 120,
  summaryFinalizeStableMs: 6e5,
  summaryFinalizeMinWords: 1200,
  recentChapterRawCount: 2
}, pe = {
  providerType: "http",
  http: {
    baseUrl: "",
    apiKey: "",
    model: "gpt-4.1-mini",
    imageModel: "doubao-seedream-5-0-260128",
    imageSize: "2K",
    imageOutputFormat: "png",
    imageWatermark: !1,
    timeoutMs: 6e4,
    maxTokens: 2048,
    temperature: 0.7
  },
  mcpCli: {
    cliPath: "",
    argsTemplate: "",
    workingDir: "",
    envJson: "{}",
    startupTimeoutMs: 6e4
  },
  proxy: {
    mode: "system",
    httpProxy: "",
    httpsProxy: "",
    allProxy: "",
    noProxy: ""
  },
  summary: At
}, xe = /* @__PURE__ */ new Map(), we = /* @__PURE__ */ new Map(), ke = /* @__PURE__ */ new Map(), Oe = /* @__PURE__ */ new Map();
let Ye = !1;
function ar(r) {
  if (!(r != null && r.trim()))
    return "";
  try {
    const t = JSON.parse(r), e = [], n = (a) => {
      !a || typeof a != "object" || (typeof a.text == "string" && e.push(a.text), Array.isArray(a.children) && a.children.forEach(n));
    };
    return n((t == null ? void 0 : t.root) || t), e.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return r.replace(/\s+/g, " ").trim();
  }
}
function or(r) {
  return r ? r.split(/[。！？!?]/).map((e) => e.trim()).filter(Boolean).slice(0, 5).map((e, n) => `fact_${n + 1}: ${e.slice(0, 80)}`) : [];
}
function ir(r) {
  return r ? r.split(/[。！？!?]/).map((t) => t.trim()).filter((t) => t.includes("？") || t.includes("?")).slice(0, 5) : [];
}
function sr(r, t, e, n) {
  const a = Number.isFinite(t) ? `第${t}章` : "章节", o = n.length > 0 ? n.join(" | ") : "无明显关键事实";
  return `${a}《${r || "未命名章节"}》摘要：${e}
关键事实：${o}`;
}
function Qe(r) {
  if (typeof r != "string" || !r.trim())
    return [];
  try {
    const t = JSON.parse(r);
    return Array.isArray(t) ? t.map((e) => String(e || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}
function cr(r) {
  return vt("sha256").update(r.join("|")).digest("hex");
}
function lr(r, t, e) {
  const n = r === "volume" ? `卷级摘要（覆盖${t}章）` : `全书摘要（覆盖${t}章）`, a = e.map((o, c) => `${c + 1}. ${o}`).join(`
`);
  return `${n}
${a}`.slice(0, 2400);
}
function dr() {
  return L.join(b.getPath("userData"), "ai-settings.json");
}
function Dt() {
  try {
    const r = dr();
    if (!z.existsSync(r))
      return pe;
    const t = z.readFileSync(r, "utf8"), e = JSON.parse(t);
    return {
      ...pe,
      ...e,
      http: { ...pe.http, ...e.http ?? {} },
      mcpCli: { ...pe.mcpCli, ...e.mcpCli ?? {} },
      proxy: { ...pe.proxy, ...e.proxy ?? {} },
      summary: { ...At, ...e.summary ?? {} }
    };
  } catch (r) {
    return console.warn(`${B} failed to load ai-settings.json, fallback to defaults:`, r), pe;
  }
}
async function et(r, t) {
  return {
    summaryText: r.slice(0, 220) || "章节内容为空，暂无可提炼摘要。",
    keyFacts: or(r),
    openQuestions: ir(r),
    timelineHints: [`chapter_order:${t ?? "unknown"}`],
    provider: "local",
    model: "heuristic-v1",
    promptVersion: "chapter-summary-v1",
    temperature: 0,
    maxTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0
  };
}
async function ur(r, t, e, n) {
  var E, C;
  if (!(e.providerType === "http" && !!((E = e.http.baseUrl) != null && E.trim()) && !!((C = e.http.apiKey) != null && C.trim())))
    throw new Error("AI summary mode requires HTTP provider with baseUrl and apiKey");
  console.log(`${B} [${r}] AI summary start (model=${e.http.model})`);
  const o = new _t(e), c = Date.now(), i = await o.generate({
    systemPrompt: [
      "You summarize novel chapters for continuity memory.",
      "Return strict JSON only.",
      'Schema: {"summaryText":"...","keyFacts":["..."],"openQuestions":["..."],"timelineHints":["..."]}'
    ].join(" "),
    prompt: JSON.stringify({
      task: "chapter_memory_summary",
      chapterOrder: n,
      content: t.slice(0, 8e3),
      constraints: [
        "summaryText should be concise and neutral",
        "keyFacts at most 6 items",
        "openQuestions at most 4 items"
      ]
    }),
    maxTokens: Math.min(1024, e.http.maxTokens),
    temperature: Math.min(0.3, e.http.temperature)
  }), l = JSON.parse(i.text || "{}"), I = String(l.summaryText || "").trim();
  if (!I)
    throw new Error("AI summary returned empty summaryText");
  const w = Date.now() - c;
  return console.log(`${B} [${r}] AI summary success (${w}ms)`), {
    summaryText: I.slice(0, 400),
    keyFacts: Array.isArray(l.keyFacts) ? l.keyFacts.map((p) => String(p).trim()).filter(Boolean).slice(0, 6) : [],
    openQuestions: Array.isArray(l.openQuestions) ? l.openQuestions.map((p) => String(p).trim()).filter(Boolean).slice(0, 4) : [],
    timelineHints: Array.isArray(l.timelineHints) ? l.timelineHints.map((p) => String(p).trim()).filter(Boolean).slice(0, 6) : [`chapter_order:${n ?? "unknown"}`],
    provider: "http",
    model: e.http.model,
    promptVersion: "chapter-summary-ai-v1",
    temperature: Math.min(0.3, e.http.temperature),
    maxTokens: Math.min(1024, e.http.maxTokens),
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: w
  };
}
async function tt(r, t, e) {
  const n = r === "volume" ? { novelId: t, volumeId: e || "", isLatest: !0, status: "active" } : { novelId: t, isLatest: !0, status: "active" }, a = await h.chapterSummary.findMany({
    where: n,
    select: {
      id: !0,
      chapterId: !0,
      chapterOrder: !0,
      updatedAt: !0,
      summaryText: !0,
      keyFacts: !0,
      openQuestions: !0
    },
    orderBy: [
      { chapterOrder: "asc" },
      { updatedAt: "asc" }
    ],
    take: r === "volume" ? 120 : 300
  });
  if (a.length === 0)
    return null;
  const o = a.map((m) => m.chapterId), c = a.map((m) => Number(m.chapterOrder)).filter((m) => Number.isFinite(m)), i = c.length > 0 ? Math.min(...c) : null, l = c.length > 0 ? Math.max(...c) : null, I = a.map((m) => String(m.summaryText || "").trim()).filter(Boolean).slice(-10), w = [...new Set(
    a.flatMap((m) => Qe(m.keyFacts))
  )].map((m) => String(m || "").slice(0, 120)).filter(Boolean).slice(0, 24), E = [...new Set(
    a.flatMap((m) => Qe(m.openQuestions))
  )].map((m) => String(m || "").slice(0, 120)).filter(Boolean).slice(0, 20), C = [
    r === "volume" ? "保持本卷叙事风格一致" : "保持全书叙事风格一致",
    "优先遵循现有大纲与关键事实"
  ], p = [
    "不得与已确认关键事实冲突",
    "保持角色动机与关系连续"
  ], g = cr(
    a.map((m) => `${m.id}:${new Date(m.updatedAt).toISOString()}`)
  );
  let f = null;
  if (r === "volume" && e) {
    const m = await h.volume.findUnique({
      where: { id: e },
      select: { title: !0 }
    });
    f = (m == null ? void 0 : m.title) || null;
  }
  return {
    title: f,
    summaryText: lr(r, o.length, I),
    keyFacts: w,
    unresolvedThreads: E,
    styleGuide: C,
    hardConstraints: p,
    coverageChapterIds: o,
    chapterRangeStart: i,
    chapterRangeEnd: l,
    sourceFingerprint: g
  };
}
async function rt(r, t, e, n) {
  await h.$transaction(async (a) => {
    await a.narrativeSummary.updateMany({
      where: {
        novelId: t,
        level: r,
        volumeId: r === "volume" && n || null,
        isLatest: !0
      },
      data: {
        isLatest: !1,
        status: "stale"
      }
    });
    const o = await a.narrativeSummary.findFirst({
      where: {
        novelId: t,
        level: r,
        volumeId: r === "volume" && n || null,
        sourceFingerprint: e.sourceFingerprint
      }
    }), c = {
      novelId: t,
      volumeId: r === "volume" && n || null,
      level: r,
      title: e.title || null,
      summaryText: e.summaryText,
      keyFacts: JSON.stringify(e.keyFacts),
      unresolvedThreads: JSON.stringify(e.unresolvedThreads),
      styleGuide: JSON.stringify(e.styleGuide),
      hardConstraints: JSON.stringify(e.hardConstraints),
      coverageChapterIds: JSON.stringify(e.coverageChapterIds),
      chapterRangeStart: e.chapterRangeStart,
      chapterRangeEnd: e.chapterRangeEnd,
      sourceFingerprint: e.sourceFingerprint,
      provider: "local",
      model: "heuristic-v1",
      promptVersion: "narrative-summary-v1",
      temperature: 0,
      maxTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      qualityScore: null,
      status: "active",
      errorCode: null,
      errorDetail: null,
      isLatest: !0
    };
    o != null && o.id ? await a.narrativeSummary.update({
      where: { id: o.id },
      data: c
    }) : await a.narrativeSummary.create({ data: c });
  });
}
async function mr(r, t) {
  try {
    const [e, n] = await Promise.all([
      tt("volume", r, t),
      tt("novel", r, null)
    ]);
    e && (await rt("volume", r, e, t), console.log(`${B} [novel=${r}] narrative summary updated (level=volume, volume=${t})`)), n && (await rt("novel", r, n, null), console.log(`${B} [novel=${r}] narrative summary updated (level=novel)`));
  } catch (e) {
    console.error(`${B} [novel=${r}] narrative summary rebuild failed:`, e);
  }
}
function pr(r, t) {
  const e = `${r}:${t}`, n = Oe.get(e);
  n && clearTimeout(n);
  const a = setTimeout(() => {
    Oe.delete(e), mr(r, t);
  }, 15e3);
  Oe.set(e, a);
}
async function $e(r, t) {
  var s;
  const e = Dt(), n = !!(t != null && t.force), a = (t == null ? void 0 : t.reason) || "save", o = e.summary.summaryMode === "ai", c = o ? Math.max(18e5, e.summary.summaryMinIntervalMs) : e.summary.summaryMinIntervalMs, i = o ? Math.max(800, e.summary.summaryMinWordDelta) : e.summary.summaryMinWordDelta, l = await h.chapter.findUnique({
    where: { id: r },
    select: {
      id: !0,
      title: !0,
      content: !0,
      wordCount: !0,
      order: !0,
      updatedAt: !0,
      volumeId: !0,
      volume: { select: { novelId: !0 } }
    }
  });
  if (!((s = l == null ? void 0 : l.volume) != null && s.novelId)) {
    console.log(`${B} [${r}] skip: chapter or novel relation missing`);
    return;
  }
  if (!Ye)
    try {
      const d = await h.$queryRawUnsafe("PRAGMA database_list;"), y = Array.isArray(d) ? d.find((v) => (v == null ? void 0 : v.name) === "main") : null;
      console.log(`${B} sqlite main db path: ${(y == null ? void 0 : y.file) || "unknown"}`);
    } catch {
      console.warn(`${B} failed to read sqlite db path via PRAGMA database_list`);
    } finally {
      Ye = !0;
    }
  const I = l.content || "", w = vt("sha256").update(I).digest("hex"), E = Date.now(), C = await h.chapterSummary.findFirst({
    where: {
      chapterId: l.id,
      isLatest: !0,
      status: "active",
      summaryType: "standard"
    },
    orderBy: { updatedAt: "desc" }
  });
  if (!n && (C == null ? void 0 : C.sourceContentHash) === w) {
    console.log(`${B} [${r}] skip: same content hash`);
    return;
  }
  const p = Math.abs((l.wordCount || 0) - Number((C == null ? void 0 : C.sourceWordCount) || 0)), g = C != null && C.updatedAt ? new Date(C.updatedAt).getTime() : 0, f = g > 0 ? E - g : Number.MAX_SAFE_INTEGER;
  if (!n && g > 0 && f < c && p < i) {
    console.log(
      `${B} [${r}] skip: throttled (deltaWords=${p}, sinceLastMs=${f}, minIntervalMs=${c}, minWordDelta=${i})`
    );
    return;
  }
  const m = ar(I);
  console.log(
    `${B} [${r}] start rebuild (reason=${a}, mode=${e.summary.summaryMode}, words=${l.wordCount || m.length}, deltaWords=${p}, force=${n})`
  );
  let u = await et(m, l.order ?? null);
  if (e.summary.summaryMode === "ai")
    try {
      u = await ur(r, m, e, l.order ?? null);
    } catch (d) {
      console.warn(`${B} [${r}] AI summary failed, fallback to local: ${(d == null ? void 0 : d.message) || "unknown error"}`), u = {
        ...await et(m, l.order ?? null),
        errorCode: "AI_SUMMARY_FALLBACK",
        errorDetail: (d == null ? void 0 : d.message) || "unknown ai summary error"
      };
    }
  await h.$transaction(async (d) => {
    await d.chapterSummary.updateMany({
      where: { chapterId: l.id, isLatest: !0 },
      data: { isLatest: !1, status: "stale" }
    });
    const y = await d.chapterSummary.findFirst({
      where: {
        chapterId: l.id,
        sourceContentHash: w,
        summaryType: "standard"
      }
    }), v = {
      novelId: l.volume.novelId,
      volumeId: l.volumeId,
      chapterId: l.id,
      summaryType: "standard",
      summaryText: u.summaryText,
      compressedMemory: sr(l.title || "", l.order ?? null, u.summaryText, u.keyFacts),
      keyFacts: JSON.stringify(u.keyFacts),
      entitiesSnapshot: JSON.stringify({}),
      timelineHints: JSON.stringify(u.timelineHints),
      openQuestions: JSON.stringify(u.openQuestions),
      sourceContentHash: w,
      sourceWordCount: l.wordCount || m.length,
      sourceUpdatedAt: l.updatedAt,
      chapterOrder: l.order ?? null,
      provider: u.provider,
      model: u.model,
      promptVersion: u.promptVersion,
      temperature: u.temperature,
      maxTokens: u.maxTokens,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      latencyMs: u.latencyMs,
      qualityScore: null,
      status: "active",
      errorCode: u.errorCode || null,
      errorDetail: u.errorDetail || null,
      isLatest: !0
    };
    if (y != null && y.id) {
      await d.chapterSummary.update({
        where: { id: y.id },
        data: v
      }), console.log(`${B} [${r}] done: updated existing summary`);
      return;
    }
    await d.chapterSummary.create({
      data: v
    }), console.log(`${B} [${r}] done: created new summary`);
  }), pr(l.volume.novelId, l.volumeId);
}
function Ge(r, t = "save") {
  const e = Dt();
  if (t === "manual") {
    console.log(`${B} [${r}] manual trigger received`), $e(r, { force: !0, reason: "manual" }).catch((i) => {
      console.error(`${B} [${r}] manual rebuild failed:`, i);
    });
    return;
  }
  if (e.summary.summaryMode === "ai" && e.summary.summaryTriggerPolicy === "manual") {
    console.log(`${B} [${r}] skip scheduling: ai mode manual-only policy`);
    return;
  }
  if (e.summary.summaryMode === "ai" && e.summary.summaryTriggerPolicy === "finalized") {
    const i = Math.max(6e4, e.summary.summaryFinalizeStableMs), l = ke.get(r);
    l && clearTimeout(l);
    const I = setTimeout(async () => {
      ke.delete(r);
      const w = await h.chapter.findUnique({
        where: { id: r },
        select: { wordCount: !0 }
      }), E = (w == null ? void 0 : w.wordCount) || 0;
      if (E < e.summary.summaryFinalizeMinWords) {
        console.log(
          `${B} [${r}] finalized trigger skipped (wordCount=${E}, min=${e.summary.summaryFinalizeMinWords})`
        );
        return;
      }
      console.log(`${B} [${r}] finalized trigger fired after stable window ${i}ms`), $e(r, { force: !0, reason: "finalized" }).catch((C) => {
        console.error(`${B} [${r}] finalized rebuild failed:`, C);
      });
    }, i);
    ke.set(r, I), console.log(`${B} [${r}] finalized trigger scheduled (${i}ms stable window)`);
    return;
  }
  const n = e.summary.summaryMode === "ai", a = Math.max(n ? 3e5 : 1e3, e.summary.summaryDebounceMs), o = xe.get(r);
  if (n) {
    if (o) {
      const i = (we.get(r) || 0) + 1;
      we.set(r, i), i % 10 === 0 && console.log(`${B} [${r}] ai mode coalescing saves (${i} updates queued, timer unchanged)`);
      return;
    }
    we.set(r, 1), console.log(`${B} [${r}] ai mode scheduled (${a}ms, fixed window)`);
  } else
    o ? (clearTimeout(o), console.log(`${B} [${r}] debounce reset (${a}ms)`)) : console.log(`${B} [${r}] debounce scheduled (${a}ms)`);
  const c = setTimeout(() => {
    xe.delete(r);
    const i = we.get(r) || 0;
    we.delete(r), console.log(n ? `${B} [${r}] ai mode fired after coalescing ${i} saves` : `${B} [${r}] debounce fired, evaluating rebuild`), $e(r).catch((l) => {
      console.error(`${B} [${r}] rebuild failed:`, l);
    });
  }, a);
  xe.set(r, c);
}
function fr(r) {
  return [
    {
      actionId: "novel.list",
      title: "List novels",
      description: "Return novels sorted by update time.",
      permission: "read",
      inputSchema: { type: "object", properties: {} },
      outputSchema: { type: "array" },
      handler: async () => h.novel.findMany({ orderBy: { updatedAt: "desc" } })
    },
    {
      actionId: "volume.list",
      title: "List volumes",
      description: "Return all volumes and chapter summaries under a novel.",
      permission: "read",
      inputSchema: {
        type: "object",
        properties: {
          novelId: { type: "string" }
        },
        required: ["novelId"]
      },
      outputSchema: { type: "array" },
      handler: async (t) => {
        const e = t;
        if (!(e != null && e.novelId))
          throw new j("INVALID_INPUT", "novelId is required");
        return h.volume.findMany({
          where: { novelId: e.novelId },
          include: {
            chapters: {
              select: { id: !0, title: !0, order: !0, wordCount: !0, updatedAt: !0 },
              orderBy: { order: "asc" }
            }
          },
          orderBy: { order: "asc" }
        });
      }
    },
    {
      actionId: "novel.create",
      title: "Create novel",
      description: "Create a novel with default volume/chapter.",
      permission: "write",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" }
        },
        required: []
      },
      outputSchema: { type: "object" },
      handler: async (t) => {
        var a;
        const e = t, n = ((a = e == null ? void 0 : e.title) == null ? void 0 : a.trim()) || `新作品 ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`;
        return h.novel.create({
          data: {
            title: n,
            wordCount: 0,
            volumes: {
              create: {
                title: "",
                order: 1,
                chapters: {
                  create: {
                    title: "",
                    content: "",
                    order: 1,
                    wordCount: 0
                  }
                }
              }
            }
          }
        });
      }
    },
    {
      actionId: "chapter.list",
      title: "List chapters",
      description: "Return chapters under a volume in ascending order.",
      permission: "read",
      inputSchema: {
        type: "object",
        properties: {
          volumeId: { type: "string" }
        },
        required: ["volumeId"]
      },
      outputSchema: { type: "array" },
      handler: async (t) => {
        const e = t;
        if (!(e != null && e.volumeId))
          throw new j("INVALID_INPUT", "volumeId is required");
        return h.chapter.findMany({
          where: { volumeId: e.volumeId },
          orderBy: { order: "asc" }
        });
      }
    },
    {
      actionId: "chapter.create",
      title: "Create chapter",
      description: "Create a chapter under volume with auto order fallback.",
      permission: "write",
      inputSchema: {
        type: "object",
        properties: {
          volumeId: { type: "string" },
          title: { type: "string" },
          order: { type: "number" }
        },
        required: ["volumeId"]
      },
      outputSchema: { type: "object" },
      handler: async (t) => {
        var a;
        const e = t;
        if (!(e != null && e.volumeId))
          throw new j("INVALID_INPUT", "volumeId is required");
        let n = e.order;
        if (!Number.isFinite(n)) {
          const o = await h.chapter.findFirst({
            where: { volumeId: e.volumeId },
            orderBy: { order: "desc" }
          });
          n = ((o == null ? void 0 : o.order) || 0) + 1;
        }
        return h.chapter.create({
          data: {
            volumeId: e.volumeId,
            title: ((a = e.title) == null ? void 0 : a.trim()) || "",
            order: n,
            content: "",
            wordCount: 0
          }
        });
      }
    },
    {
      actionId: "chapter.get",
      title: "Get chapter",
      description: "Return chapter content by chapter id.",
      permission: "read",
      inputSchema: {
        type: "object",
        properties: {
          chapterId: { type: "string" }
        },
        required: ["chapterId"]
      },
      outputSchema: { type: "object" },
      handler: async (t) => {
        const e = t;
        if (!(e != null && e.chapterId))
          throw new j("INVALID_INPUT", "chapterId is required");
        return h.chapter.findUnique({
          where: { id: e.chapterId },
          include: { volume: { select: { novelId: !0 } } }
        });
      }
    },
    {
      actionId: "chapter.save",
      title: "Save chapter content",
      description: "Persist chapter content and keep novel word count in sync.",
      permission: "write",
      inputSchema: {
        type: "object",
        properties: {
          chapterId: { type: "string" },
          content: { type: "string" },
          source: {
            type: "string",
            enum: ["ai_agent", "ai_ui"]
          }
        },
        required: ["chapterId", "content"]
      },
      outputSchema: { type: "object" },
      handler: async (t) => {
        const e = t;
        if (!(e != null && e.chapterId))
          throw new j("INVALID_INPUT", "chapterId is required");
        if (typeof e.content != "string")
          throw new j("INVALID_INPUT", "content is required");
        const n = e.source === "ai_ui" ? "ai_ui" : "ai_agent", a = await h.chapter.findUnique({
          where: { id: e.chapterId },
          select: { id: !0, content: !0, updatedAt: !0, wordCount: !0, volume: { select: { novelId: !0 } } }
        });
        if (!a || !a.volume)
          throw new j("NOT_FOUND", "Chapter or volume not found");
        const o = e.content.length, c = o - a.wordCount;
        try {
          const [, i] = await h.$transaction([
            h.novel.update({
              where: { id: a.volume.novelId },
              data: { wordCount: { increment: c }, updatedAt: /* @__PURE__ */ new Date() }
            }),
            h.chapter.update({
              where: { id: e.chapterId },
              data: { content: e.content, wordCount: o, updatedAt: /* @__PURE__ */ new Date() }
            })
          ]);
          return Ge(e.chapterId), {
            chapter: i,
            saveMeta: {
              source: n,
              rollbackPoint: {
                chapterId: a.id,
                content: a.content,
                updatedAt: a.updatedAt
              }
            }
          };
        } catch (i) {
          const l = te(i);
          throw new j("PERSISTENCE_ERROR", l.message);
        }
      }
    },
    {
      actionId: "chapter.generate",
      title: "Generate chapter draft",
      description: "Generate chapter continuation with strict lore/outline context via configured model provider.",
      permission: "write",
      inputSchema: {
        type: "object",
        properties: {
          locale: { type: "string" },
          mode: {
            type: "string",
            enum: ["new_chapter", "continue_chapter"]
          },
          novelId: { type: "string" },
          chapterId: { type: "string" },
          currentContent: { type: "string" },
          ideaIds: {
            type: "array",
            items: { type: "string" }
          },
          contextChapterCount: { type: "number" },
          recentRawChapterCount: { type: "number" },
          targetLength: { type: "number" },
          style: { type: "string" },
          tone: { type: "string" },
          pace: { type: "string" },
          temperature: { type: "number" },
          userIntent: { type: "string" },
          currentLocation: { type: "string" },
          overrideUserPrompt: { type: "string" }
        },
        required: ["novelId", "chapterId", "currentContent"]
      },
      outputSchema: { type: "object" },
      handler: async (t) => {
        const e = t;
        if (!(e != null && e.novelId) || !e.chapterId || typeof e.currentContent != "string")
          throw new j("INVALID_INPUT", "novelId, chapterId, currentContent are required");
        try {
          return await r.continueWriting({
            locale: e.locale,
            mode: e.mode,
            novelId: e.novelId,
            chapterId: e.chapterId,
            currentContent: e.currentContent,
            ideaIds: Array.isArray(e.ideaIds) ? e.ideaIds : void 0,
            contextChapterCount: e.contextChapterCount,
            recentRawChapterCount: e.recentRawChapterCount,
            targetLength: e.targetLength,
            style: e.style,
            tone: e.tone,
            pace: e.pace,
            temperature: e.temperature,
            userIntent: e.userIntent,
            currentLocation: e.currentLocation,
            overrideUserPrompt: e.overrideUserPrompt
          });
        } catch (n) {
          throw te(n);
        }
      }
    },
    {
      actionId: "plotline.list",
      title: "List plot lines",
      description: "Return all plot lines and points for a novel.",
      permission: "read",
      inputSchema: {
        type: "object",
        properties: {
          novelId: { type: "string" }
        },
        required: ["novelId"]
      },
      outputSchema: { type: "array" },
      handler: async (t) => {
        const e = t;
        if (!(e != null && e.novelId))
          throw new j("INVALID_INPUT", "novelId is required");
        return h.plotLine.findMany({
          where: { novelId: e.novelId },
          include: {
            points: {
              include: { anchors: !0 },
              orderBy: { order: "asc" }
            }
          },
          orderBy: { sortOrder: "asc" }
        });
      }
    },
    {
      actionId: "worldsetting.list",
      title: "List world settings",
      description: "Return all world settings under a novel.",
      permission: "read",
      inputSchema: {
        type: "object",
        properties: {
          novelId: { type: "string" }
        },
        required: ["novelId"]
      },
      outputSchema: { type: "array" },
      handler: async (t) => {
        const e = t;
        if (!(e != null && e.novelId))
          throw new j("INVALID_INPUT", "novelId is required");
        return h.worldSetting.findMany({
          where: { novelId: e.novelId },
          orderBy: { sortOrder: "asc" }
        });
      }
    },
    {
      actionId: "character.list",
      title: "List characters",
      description: "Return all characters under a novel.",
      permission: "read",
      inputSchema: {
        type: "object",
        properties: {
          novelId: { type: "string" }
        },
        required: ["novelId"]
      },
      outputSchema: { type: "array" },
      handler: async (t) => {
        const e = t;
        if (!(e != null && e.novelId))
          throw new j("INVALID_INPUT", "novelId is required");
        return h.character.findMany({
          where: { novelId: e.novelId },
          orderBy: { sortOrder: "asc" }
        });
      }
    },
    {
      actionId: "item.list",
      title: "List items",
      description: "Return all items and skills under a novel.",
      permission: "read",
      inputSchema: {
        type: "object",
        properties: {
          novelId: { type: "string" }
        },
        required: ["novelId"]
      },
      outputSchema: { type: "array" },
      handler: async (t) => {
        const e = t;
        if (!(e != null && e.novelId))
          throw new j("INVALID_INPUT", "novelId is required");
        return h.item.findMany({
          where: { novelId: e.novelId },
          orderBy: { sortOrder: "asc" }
        });
      }
    },
    {
      actionId: "map.list",
      title: "List maps",
      description: "Return all maps under a novel.",
      permission: "read",
      inputSchema: {
        type: "object",
        properties: {
          novelId: { type: "string" }
        },
        required: ["novelId"]
      },
      outputSchema: { type: "array" },
      handler: async (t) => {
        const e = t;
        if (!(e != null && e.novelId))
          throw new Error("novelId is required");
        return h.mapCanvas.findMany({
          where: { novelId: e.novelId },
          orderBy: { sortOrder: "asc" }
        });
      }
    },
    {
      actionId: "search.query",
      title: "Search novel content",
      description: "Run global search against chapter and idea index.",
      permission: "read",
      inputSchema: {
        type: "object",
        properties: {
          novelId: { type: "string" },
          keyword: { type: "string" },
          limit: { type: "number" },
          offset: { type: "number" }
        },
        required: ["novelId", "keyword"]
      },
      outputSchema: { type: "array" },
      handler: async (t) => {
        const e = t;
        if (!(e != null && e.novelId) || !(e != null && e.keyword))
          throw new j("INVALID_INPUT", "novelId and keyword are required");
        return Ct(e.novelId, e.keyword, e.limit ?? 20, e.offset ?? 0);
      }
    }
  ];
}
function hr(r) {
  return r.trim() ? (r.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((e) => e.replace(/^['"]|['"]$/g, "")) : [];
}
class nt {
  constructor(t) {
    ee(this, "name", "mcp-cli");
    this.settings = t;
  }
  async healthCheck() {
    const { cliPath: t } = this.settings.mcpCli;
    if (!t.trim())
      return { ok: !1, detail: "MCP CLI path is empty" };
    if (!z.existsSync(t))
      return { ok: !1, detail: "MCP CLI path does not exist" };
    try {
      M("INFO", "McpCliProvider.healthCheck.request", "MCP CLI health check request", {
        cliPath: t,
        timeoutMs: this.settings.mcpCli.startupTimeoutMs
      });
      const { stdout: e } = await this.runProcess(["--version"], "", this.settings.mcpCli.startupTimeoutMs);
      return M("INFO", "McpCliProvider.healthCheck.response", "MCP CLI health check response", {
        cliPath: t,
        stdout: e
      }), { ok: !0, detail: (e || "MCP CLI is executable").slice(0, 200) };
    } catch (e) {
      return ie("McpCliProvider.healthCheck.error", e, { cliPath: t }), { ok: !1, detail: `MCP CLI check failed: ${(e == null ? void 0 : e.message) || "unknown error"}` };
    }
  }
  async generate(t) {
    const e = t.prompt.trim();
    if (!e)
      return { text: "", model: "mcp-cli" };
    const n = this.settings.mcpCli.argsTemplate || "", a = n.includes("{prompt}"), o = hr(n.replace("{prompt}", e));
    M("INFO", "McpCliProvider.generate.request", "MCP CLI generate request", {
      cliPath: this.settings.mcpCli.cliPath,
      args: o,
      prompt: a ? "" : e,
      promptEmbeddedInArgs: a
    });
    const { stdout: c } = await this.runProcess(o, a ? "" : e, this.settings.mcpCli.startupTimeoutMs);
    return M("INFO", "McpCliProvider.generate.response", "MCP CLI generate response", {
      cliPath: this.settings.mcpCli.cliPath,
      stdout: c
    }), {
      text: c.trim(),
      model: "mcp-cli"
    };
  }
  async runProcess(t, e, n) {
    const { cliPath: a, workingDir: o, envJson: c } = this.settings.mcpCli, i = this.parseEnvJson(c), l = Date.now();
    return new Promise((I, w) => {
      const E = Vt(a, t, {
        cwd: o || process.cwd(),
        env: { ...process.env, ...i },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: !0
      });
      let C = "", p = "", g = !1;
      const f = setTimeout(() => {
        g || (g = !0, E.kill("SIGTERM"), M("ERROR", "McpCliProvider.runProcess.timeout", "MCP CLI process timeout", {
          cliPath: a,
          args: t,
          elapsedMs: Date.now() - l
        }), w(new Error("MCP CLI process timeout")));
      }, Math.max(1e3, n));
      E.stdout.on("data", (m) => {
        C += m.toString();
      }), E.stderr.on("data", (m) => {
        p += m.toString();
      }), E.on("error", (m) => {
        g || (g = !0, clearTimeout(f), ie("McpCliProvider.runProcess.error", m, {
          cliPath: a,
          args: t,
          elapsedMs: Date.now() - l,
          env: oe(i)
        }), w(m));
      }), E.on("close", (m) => {
        if (!g) {
          if (g = !0, clearTimeout(f), m !== 0) {
            M("ERROR", "McpCliProvider.runProcess.exit", "MCP CLI exited with non-zero code", {
              cliPath: a,
              args: t,
              code: m,
              elapsedMs: Date.now() - l,
              stderr: p
            }), w(new Error(`MCP CLI exited with code ${m}: ${p.slice(0, 300)}`));
            return;
          }
          M("INFO", "McpCliProvider.runProcess.exit", "MCP CLI process completed", {
            cliPath: a,
            args: t,
            code: m,
            elapsedMs: Date.now() - l,
            stderr: p
          }), I({ stdout: C, stderr: p });
        }
      }), e && E.stdin.write(e), E.stdin.end();
    });
  }
  parseEnvJson(t) {
    if (!t.trim())
      return {};
    try {
      const e = JSON.parse(t);
      if (!e || typeof e != "object")
        return {};
      const n = {};
      for (const [a, o] of Object.entries(e))
        n[a] = String(o ?? "");
      return n;
    } catch {
      return {};
    }
  }
}
function at(r) {
  const t = /* @__PURE__ */ new Set(), e = [];
  for (const n of r) {
    const a = String(n || "").trim();
    if (!a)
      continue;
    const o = a.toLowerCase();
    t.has(o) || (t.add(o), e.push(a));
  }
  return e;
}
function Re(r) {
  if (!(r != null && r.trim()))
    return "";
  try {
    const t = JSON.parse(r), e = [], n = (a) => {
      !a || typeof a != "object" || (typeof a.text == "string" && e.push(a.text), Array.isArray(a.children) && a.children.forEach(n));
    };
    return n((t == null ? void 0 : t.root) || t), e.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return r.replace(/\s+/g, " ").trim();
  }
}
class gr {
  async buildForContinueWriting(t) {
    const e = Math.max(1, Math.min(8, t.contextChapterCount ?? 3)), n = Math.max(0, Math.min(e, t.recentRawChapterCount ?? 2)), [a, o, c, i, l, I, w] = await Promise.all([
      h.worldSetting.findMany({
        where: { novelId: t.novelId },
        orderBy: { updatedAt: "desc" }
      }),
      h.plotLine.findMany({
        where: { novelId: t.novelId },
        include: { points: { include: { anchors: !0 } } },
        orderBy: { sortOrder: "asc" }
      }),
      h.character.findMany({
        where: { novelId: t.novelId },
        select: { name: !0, role: !0, description: !0 },
        orderBy: { updatedAt: "desc" },
        take: 100
      }),
      h.item.findMany({
        where: { novelId: t.novelId },
        select: { name: !0, type: !0, description: !0 },
        orderBy: { updatedAt: "desc" },
        take: 100
      }),
      h.mapCanvas.findMany({
        where: { novelId: t.novelId },
        select: { name: !0, type: !0, description: !0 },
        orderBy: { updatedAt: "desc" },
        take: 50
      }),
      h.chapter.findMany({
        where: {
          id: { not: t.chapterId },
          volume: { novelId: t.novelId }
        },
        select: {
          id: !0,
          title: !0,
          content: !0,
          updatedAt: !0
        },
        orderBy: { updatedAt: "desc" },
        take: e
      }),
      h.chapter.findUnique({
        where: { id: t.chapterId },
        select: { volumeId: !0 }
      })
    ]), E = Array.isArray(t.ideaIds) ? t.ideaIds.map((N) => String(N)).filter(Boolean) : [], C = E.length > 0 ? await h.idea.findMany({
      where: {
        novelId: t.novelId,
        id: { in: E }
      },
      include: { tags: !0 },
      orderBy: { updatedAt: "desc" },
      take: 20
    }) : [], p = I.map((N) => N.id), g = p.length > 0 ? await h.chapterSummary.findMany({
      where: {
        chapterId: { in: p },
        isLatest: !0,
        status: "active"
      },
      orderBy: { updatedAt: "desc" }
    }) : [], f = /* @__PURE__ */ new Map();
    for (const N of g)
      f.has(N.chapterId) || f.set(N.chapterId, N);
    const m = { value: 0 }, s = (await h.narrativeSummary.findMany({
      where: {
        novelId: t.novelId,
        isLatest: !0,
        status: "active",
        OR: [
          { level: "novel", volumeId: null },
          ...w != null && w.volumeId ? [{ level: "volume", volumeId: w.volumeId }] : []
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: 2
    })).map((N) => {
      let Z = [];
      if (typeof N.keyFacts == "string" && N.keyFacts.trim())
        try {
          const X = JSON.parse(N.keyFacts);
          Array.isArray(X) && (Z = at(
            X.map((ce) => String(ce || "").trim()).filter(Boolean).slice(0, 12)
          ).slice(0, 5));
        } catch {
          Z = [];
        }
      return {
        level: N.level === "volume" ? "volume" : "novel",
        title: String(N.title || ""),
        summaryText: String(N.summaryText || "").slice(0, 1200),
        keyFacts: Z
      };
    }), d = I.map((N, Z) => ({
      chapterId: N.id,
      title: N.title || "",
      excerpt: (() => {
        if (Z < n)
          return Re(N.content || "").slice(-1200);
        const X = f.get(N.id), ce = (X == null ? void 0 : X.compressedMemory) || (X == null ? void 0 : X.summaryText);
        return typeof ce == "string" && ce.trim() ? ce.slice(-1200) : (m.value += 1, Re(N.content || "").slice(-1200));
      })()
    })), y = Re(t.currentContent || "").slice(-2400), v = C.map((N) => ({
      ideaId: N.id,
      content: (N.content || "").slice(0, 800),
      quote: typeof N.quote == "string" ? N.quote.slice(0, 300) : void 0,
      tags: Array.isArray(N.tags) ? N.tags.map((Z) => String(Z.name || "").trim()).filter(Boolean).slice(0, 12) : []
    })), _ = {
      characters: new Set(
        c.map((N) => String((N == null ? void 0 : N.name) || "").trim()).filter(Boolean)
      ),
      items: new Set(
        i.map((N) => String((N == null ? void 0 : N.name) || "").trim()).filter(Boolean)
      ),
      worldSettings: new Set(
        a.map((N) => String((N == null ? void 0 : N.name) || "").trim()).filter(Boolean)
      )
    }, D = [], k = /@([^\s@，。！？,!.;；:："'“”‘’()[\]{}<>]+)/g;
    for (const N of v) {
      const Z = `${N.content || ""}
${N.quote || ""}`, X = Array.from(Z.matchAll(k));
      for (const ce of X) {
        const de = String(ce[1] || "").trim();
        de && (_.characters.has(de) ? D.push({ name: de, kind: "character" }) : _.items.has(de) ? D.push({ name: de, kind: "item" }) : _.worldSettings.has(de) && D.push({ name: de, kind: "worldSetting" }));
      }
    }
    const P = at(D.map((N) => `${N.kind}:${N.name}`)).map((N) => {
      const [Z, ...X] = N.split(":");
      return {
        name: X.join(":"),
        kind: Z === "character" || Z === "item" || Z === "worldSetting" ? Z : "character"
      };
    }).slice(0, 20), $ = String(t.currentLocation || "").trim().slice(0, 120), K = Math.max(0, E.length - v.length), Q = [];
    return m.value > 0 && Q.push(`${m.value} chapter summaries missing; fell back to chapter text excerpts.`), K > 0 && Q.push(`${K} selected ideas not found; ignored.`), {
      hardContext: {
        worldSettings: a,
        plotLines: o,
        characters: c,
        items: i,
        maps: l
      },
      dynamicContext: {
        recentChapters: d,
        selectedIdeas: v,
        selectedIdeaEntities: P,
        currentChapterBeforeCursor: y,
        ...$ ? { currentLocation: $ } : {},
        narrativeSummaries: s
      },
      params: {
        mode: t.mode === "new_chapter" ? "new_chapter" : "continue_chapter",
        contextChapterCount: e,
        style: t.style || "default",
        tone: t.tone || "balanced",
        pace: t.pace || "medium",
        targetLength: Math.max(100, Math.min(4e3, t.targetLength ?? 500))
      },
      usedContext: [
        "world_settings_full",
        "plot_outline_full",
        "characters_items_maps_snapshot",
        `recent_chapter_summary_memory_preferred_${e}`,
        `recent_chapter_raw_text_${n}`,
        s.length > 0 ? `narrative_summaries_${s.length}` : "narrative_summaries_0",
        v.length > 0 ? `selected_ideas_${v.length}` : "selected_ideas_0",
        P.length > 0 ? `selected_idea_entities_${P.length}` : "selected_idea_entities_0",
        ...$ ? ["current_location"] : [],
        "current_chapter_before_cursor"
      ],
      warnings: Q
    };
  }
}
const Fe = 10 * 1024 * 1024, yr = 2e3, ot = /* @__PURE__ */ new Set(["foreshadowing", "mystery", "promise", "event"]), it = /* @__PURE__ */ new Set(["active", "resolved"]), wr = /* @__PURE__ */ new Set(["item", "skill", "location"]), vr = /* @__PURE__ */ new Set(["world", "region", "scene"]), Ae = ["plotLines", "plotPoints", "characters", "items", "skills", "maps"], Ir = {
  plotLines: ["主线", "支线", "故事线", "剧情线", "plot line", "story line"],
  plotPoints: ["要点", "情节点", "剧情点", "事件", "桥段", "转折", "冲突", "plot point", "scene beat"],
  characters: ["角色", "龙套", "配角", "人物", "反派", "主角", "npc", "character"],
  items: ["物品", "道具", "装备", "宝物", "武器", "法宝", "artifact", "item"],
  skills: ["技能", "招式", "能力", "法术", "功法", "绝招", "spell", "skill"],
  maps: ["地图", "场景", "地点", "区域", "城市", "宗门地图", "world map", "map", "location"]
}, Ue = [
  "novel.list",
  "volume.list",
  "chapter.list",
  "chapter.create",
  "chapter.save",
  "chapter.generate"
], Cr = [
  {
    moduleId: "novel_volume_chapter",
    title: "小说/卷章管理",
    requiredActions: [
      "novel.list",
      "novel.create",
      "volume.list",
      "chapter.list",
      "chapter.get",
      "chapter.create",
      "chapter.save"
    ]
  },
  {
    moduleId: "editor_ops",
    title: "编辑器操作（标题/续写/总结）",
    requiredActions: [
      "chapter.generate"
    ]
  },
  {
    moduleId: "global_search",
    title: "全局搜索与跳转",
    requiredActions: [
      "search.query"
    ]
  },
  {
    moduleId: "outline_storyline_anchor",
    title: "大纲/故事线/锚点",
    requiredActions: [
      "plotline.list"
    ]
  },
  {
    moduleId: "world_item_map",
    title: "角色/物品/世界观/地图",
    requiredActions: [
      "character.list",
      "item.list",
      "worldsetting.list",
      "map.list"
    ]
  },
  {
    moduleId: "backup_restore",
    title: "备份恢复",
    requiredActions: []
  }
], ue = {
  providerType: "http",
  http: {
    baseUrl: "",
    apiKey: "",
    model: "gpt-4.1-mini",
    imageModel: "doubao-seedream-5-0-260128",
    imageSize: "2K",
    imageOutputFormat: "png",
    imageWatermark: !1,
    timeoutMs: 6e4,
    maxTokens: 2048,
    temperature: 0.7
  },
  mcpCli: {
    cliPath: "",
    argsTemplate: "",
    workingDir: "",
    envJson: "{}",
    startupTimeoutMs: 6e4
  },
  proxy: {
    mode: "system",
    httpProxy: "",
    httpsProxy: "",
    allProxy: "",
    noProxy: ""
  },
  summary: {
    summaryMode: "local",
    summaryTriggerPolicy: "manual",
    summaryDebounceMs: 3e4,
    summaryMinIntervalMs: 18e4,
    summaryMinWordDelta: 120,
    summaryFinalizeStableMs: 6e5,
    summaryFinalizeMinWords: 1200,
    recentChapterRawCount: 2
  }
};
function Be(r) {
  return JSON.stringify(r ?? {});
}
function Er(r) {
  const t = (r || "").toLowerCase();
  return t.includes("jpeg") || t.includes("jpg") ? "jpg" : t.includes("webp") ? "webp" : t.includes("gif") ? "gif" : t.includes("bmp") ? "bmp" : "png";
}
function Sr(r) {
  return r.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function _r(r) {
  if (!(r != null && r.trim()))
    return "";
  try {
    const t = JSON.parse(r), e = [], n = (a) => {
      !a || typeof a != "object" || (typeof a.text == "string" && e.push(a.text), Array.isArray(a.children) && a.children.forEach(n));
    };
    return n((t == null ? void 0 : t.root) || t), e.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return r.replace(/\s+/g, " ").trim();
  }
}
function Ar(r) {
  switch (r) {
    case "realistic":
      return "Style: realistic cartography, natural terrain textures, high geographic plausibility.";
    case "fantasy":
      return "Style: epic fantasy world map, dramatic terrain, mystical landmarks, rich parchment aesthetics.";
    case "ancient":
      return "Style: ancient oriental ink-and-parchment map, hand-drawn strokes, classical motifs.";
    case "scifi":
      return "Style: sci-fi strategic map, futuristic terrain overlays, advanced civilization markers.";
    default:
      return "";
  }
}
function st(r, t) {
  const e = [];
  return r != null && r.trim() && e.push(`[System Prompt]
${r.trim()}`), e.push(`[User Prompt]
${t.trim()}`), e.join(`

`);
}
function O(r, t) {
  const e = typeof r == "string" ? r.trim() : "";
  return e ? e.length > t ? e.slice(0, t) : e : "";
}
function Dr(r, t) {
  const e = /* @__PURE__ */ new Set(), n = [];
  for (const a of r) {
    const o = String(a || "").trim();
    if (!o)
      continue;
    const c = o.toLowerCase();
    if (!e.has(c) && (e.add(c), n.push(o), n.length >= t))
      break;
  }
  return n;
}
class Nr {
  constructor(t) {
    ee(this, "userDataPath");
    ee(this, "settingsFilePath");
    ee(this, "mapImageStatsPath");
    ee(this, "settingsCache");
    ee(this, "mapImageStatsCache");
    ee(this, "capabilityDefinitions");
    ee(this, "capabilityRegistry");
    ee(this, "contextBuilder");
    this.userDataPath = t(), this.settingsFilePath = L.join(this.userDataPath, "ai-settings.json"), this.mapImageStatsPath = L.join(this.userDataPath, "ai-map-image-stats.json"), this.settingsCache = this.loadSettings(), this.mapImageStatsCache = this.loadMapImageStats(), this.contextBuilder = new gr(), this.capabilityDefinitions = fr({
      continueWriting: (e) => this.continueWriting(e)
    }), this.capabilityRegistry = new Map(
      this.capabilityDefinitions.map((e) => [e.actionId, e.handler])
    );
  }
  listActions() {
    return this.capabilityDefinitions.map((t) => ({
      actionId: t.actionId,
      title: t.title,
      description: t.description,
      permission: t.permission,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema
    }));
  }
  getCapabilityCoverage() {
    const t = new Set(this.capabilityDefinitions.map((c) => c.actionId)), e = Cr.map((c) => {
      const i = c.requiredActions.filter((w) => !t.has(w)), l = c.requiredActions.filter((w) => t.has(w)), I = c.requiredActions.length === 0 ? 0 : Math.round(l.length / c.requiredActions.length * 100);
      return {
        moduleId: c.moduleId,
        title: c.title,
        requiredActions: [...c.requiredActions],
        supportedActions: l,
        missingActions: i,
        coverage: I
      };
    }), n = e.reduce((c, i) => c + i.requiredActions.length, 0), a = e.reduce((c, i) => c + i.supportedActions.length, 0);
    return {
      overallCoverage: n === 0 ? 0 : Math.round(a / n * 100),
      totalRequired: n,
      totalSupported: a,
      modules: e
    };
  }
  getMcpToolsManifest() {
    return { tools: this.capabilityDefinitions.map((e) => ({
      name: e.actionId,
      description: `${e.title}. ${e.description}`,
      inputSchema: e.inputSchema
    })) };
  }
  getOpenClawManifest() {
    return {
      schemaVersion: "openclaw.tool.v1",
      tools: this.capabilityDefinitions.map((e) => ({
        name: e.actionId,
        description: `${e.title}. ${e.description}`,
        parameters: e.inputSchema
      }))
    };
  }
  getOpenClawSkillManifest() {
    return {
      schemaVersion: "openclaw.skill.v1",
      skills: this.capabilityDefinitions.map((e) => ({
        name: e.actionId,
        title: e.title,
        description: e.description,
        inputSchema: e.inputSchema
      }))
    };
  }
  getSettings() {
    return this.settingsCache;
  }
  getMapImageStats() {
    return this.mapImageStatsCache;
  }
  updateSettings(t) {
    return this.settingsCache = {
      ...this.settingsCache,
      ...t,
      http: { ...this.settingsCache.http, ...t.http ?? {} },
      mcpCli: { ...this.settingsCache.mcpCli, ...t.mcpCli ?? {} },
      proxy: { ...this.settingsCache.proxy, ...t.proxy ?? {} },
      summary: { ...this.settingsCache.summary, ...t.summary ?? {} }
    }, this.persistSettings(), this.settingsCache;
  }
  async testConnection() {
    return this.getProvider().healthCheck();
  }
  async testMcp() {
    return new nt(this.settingsCache).healthCheck();
  }
  async testOpenClawMcp() {
    const t = await this.testOpenClawSmoke({ kind: "mcp" });
    return { ok: t.ok, detail: t.detail };
  }
  async testOpenClawSkill() {
    const t = await this.testOpenClawSmoke({ kind: "skill" });
    return { ok: t.ok, detail: t.detail };
  }
  async testOpenClawSmoke(t) {
    var m, u;
    const e = t.kind === "skill" ? "skill" : "mcp", n = e === "mcp" ? this.getOpenClawManifest().tools.map((s) => s.name) : this.getOpenClawSkillManifest().skills.map((s) => s.name);
    if (!n.length)
      return {
        ok: !1,
        kind: e,
        detail: e === "mcp" ? "No OpenClaw MCP tools available" : "No OpenClaw skills available",
        missingActions: [...Ue],
        checks: []
      };
    const a = Ue.filter((s) => !n.includes(s)), o = [], c = (s, d, y, v) => {
      o.push({ actionId: s, ok: d, detail: y, ...v ? { skipped: !0 } : {} });
    };
    a.length ? c("manifest.coverage", !1, `Missing required actions: ${a.join(", ")}`) : c("manifest.coverage", !0, `All required actions are covered (${Ue.length})`);
    const i = (s, d) => e === "mcp" ? this.invokeOpenClawTool({ name: s, arguments: d }) : this.invokeOpenClawSkill({ name: s, input: d }), l = await i("novel.list");
    if (!l.ok)
      return c("novel.list", !1, l.error || "invoke failed"), {
        ok: !1,
        kind: e,
        detail: `OpenClaw ${e.toUpperCase()} smoke failed at novel.list: ${l.error || "unknown error"}`,
        missingActions: a,
        checks: o
      };
    c("novel.list", !0, "invoke ok");
    const w = (m = (Array.isArray(l.data) ? l.data : []).find((s) => typeof (s == null ? void 0 : s.id) == "string")) == null ? void 0 : m.id;
    if (!w) {
      c("volume.list", !0, "no novels in database; skipped", !0), c("chapter.list", !0, "no novels in database; skipped", !0);
      const s = a.length === 0;
      return {
        ok: s,
        kind: e,
        detail: s ? `OpenClaw ${e.toUpperCase()} smoke passed (manifest coverage ok, invoke ok, nested checks skipped due to empty data)` : `OpenClaw ${e.toUpperCase()} smoke partial pass (invoke ok, but manifest missing required actions: ${a.join(", ")})`,
        missingActions: a,
        checks: o
      };
    }
    const E = await i("volume.list", { novelId: w });
    if (!E.ok)
      return c("volume.list", !1, E.error || "invoke failed"), {
        ok: !1,
        kind: e,
        detail: `OpenClaw ${e.toUpperCase()} smoke failed at volume.list: ${E.error || "unknown error"}`,
        missingActions: a,
        checks: o
      };
    c("volume.list", !0, "invoke ok");
    const p = (u = (Array.isArray(E.data) ? E.data : []).find((s) => typeof (s == null ? void 0 : s.id) == "string")) == null ? void 0 : u.id;
    if (!p) {
      c("chapter.list", !0, "no volumes under first novel; skipped", !0);
      const s = a.length === 0;
      return {
        ok: s,
        kind: e,
        detail: s ? `OpenClaw ${e.toUpperCase()} smoke passed (manifest coverage ok, read-chain invoke ok)` : `OpenClaw ${e.toUpperCase()} smoke partial pass (read-chain ok, but manifest missing required actions: ${a.join(", ")})`,
        missingActions: a,
        checks: o
      };
    }
    const g = await i("chapter.list", { volumeId: p });
    if (!g.ok)
      return c("chapter.list", !1, g.error || "invoke failed"), {
        ok: !1,
        kind: e,
        detail: `OpenClaw ${e.toUpperCase()} smoke failed at chapter.list: ${g.error || "unknown error"}`,
        missingActions: a,
        checks: o
      };
    c("chapter.list", !0, "invoke ok");
    const f = a.length === 0;
    return {
      ok: f,
      kind: e,
      detail: f ? `OpenClaw ${e.toUpperCase()} smoke passed (manifest coverage + read-chain invoke all ok)` : `OpenClaw ${e.toUpperCase()} smoke partial pass (invoke ok, but manifest missing required actions: ${a.join(", ")})`,
      missingActions: a,
      checks: o
    };
  }
  async testProxy() {
    const t = this.settingsCache.proxy;
    return t.mode !== "custom" ? { ok: !0, detail: `Proxy mode is ${t.mode}` } : !(t.httpProxy || t.httpsProxy || t.allProxy) ? { ok: !1, detail: "Custom proxy mode requires at least one proxy value" } : { ok: !0, detail: "Custom proxy configuration looks valid" };
  }
  async testGenerate(t) {
    var e;
    try {
      return { ok: !0, text: ((e = (await this.getProvider().generate({
        systemPrompt: "You are a concise assistant.",
        prompt: (t || "请用一句话回复：AI 生成测试成功").trim(),
        maxTokens: 128,
        temperature: 0.2
      })).text) == null ? void 0 : e.slice(0, 500)) || "" };
    } catch (n) {
      return { ok: !1, detail: (n == null ? void 0 : n.message) || "test generate failed" };
    }
  }
  async generateTitle(t) {
    var m, u;
    M("INFO", "AiService.generateTitle.start", "Generate title start", {
      chapterId: t.chapterId,
      novelId: t.novelId,
      providerType: this.settingsCache.providerType
    });
    const e = this.getProvider(), n = Math.max(5, Math.min(10, t.count ?? 6)), o = _r(t.content).slice(0, 4e3), c = await h.novel.findUnique({
      where: { id: t.novelId },
      select: { title: !0, description: !0 }
    }), i = await h.chapter.findUnique({
      where: { id: t.chapterId },
      select: {
        id: !0,
        title: !0,
        order: !0,
        volumeId: !0,
        volume: {
          select: {
            id: !0,
            title: !0,
            order: !0
          }
        }
      }
    }), I = (await h.chapter.findMany({
      where: {
        volume: { novelId: t.novelId },
        id: { not: t.chapterId }
      },
      select: {
        title: !0,
        order: !0,
        volume: {
          select: {
            title: !0,
            order: !0
          }
        }
      },
      orderBy: [
        { volume: { order: "desc" } },
        { order: "desc" }
      ],
      take: 30
    })).map((s, d) => {
      var y, v;
      return {
        index: d + 1,
        volumeTitle: ((y = s.volume) == null ? void 0 : y.title) || "",
        volumeOrder: ((v = s.volume) == null ? void 0 : v.order) || 0,
        chapterOrder: s.order || 0,
        title: s.title || `Chapter-${d + 1}`
      };
    }), w = [
      "You are a Chinese novel title assistant.",
      "Generate concise chapter title candidates based on provided context.",
      "Return STRICT JSON only. No markdown.",
      'JSON shape: {"candidates":[{"title":"...","styleTag":"..."}]}',
      "Each styleTag must be short Chinese phrase like: 稳健推进, 悬念强化, 意象抒情."
    ].join(" "), E = await e.generate({
      systemPrompt: w,
      prompt: JSON.stringify({
        task: "chapter_title_generation",
        count: n,
        novel: {
          title: (c == null ? void 0 : c.title) || "",
          description: (c == null ? void 0 : c.description) || ""
        },
        chapter: {
          title: (i == null ? void 0 : i.title) || "",
          order: (i == null ? void 0 : i.order) || 0,
          volumeTitle: ((m = i == null ? void 0 : i.volume) == null ? void 0 : m.title) || "",
          volumeOrder: ((u = i == null ? void 0 : i.volume) == null ? void 0 : u.order) || 0
        },
        recentChapterTitles: I,
        currentChapterFullText: o,
        constraints: [
          "title length <= 16 Chinese characters preferred",
          "avoid spoilers and proper nouns overuse",
          "output 5-10 candidates"
        ]
      }),
      maxTokens: this.settingsCache.http.maxTokens,
      temperature: this.settingsCache.http.temperature
    }), C = (() => {
      try {
        return JSON.parse(E.text);
      } catch {
        return null;
      }
    })(), p = Array.isArray(C == null ? void 0 : C.candidates) ? C.candidates.map((s) => ({
      title: String((s == null ? void 0 : s.title) || "").trim(),
      styleTag: String((s == null ? void 0 : s.styleTag) || "").trim() || "稳健推进"
    })).filter((s) => !!s.title).slice(0, n) : [];
    if (p.length > 0)
      return M("INFO", "AiService.generateTitle.success", "Generate title success", {
        chapterId: t.chapterId,
        candidateCount: p.length
      }), { candidates: p };
    const g = E.text.split(`
`).map((s) => s.replace(/^[-\d.\s]+/, "").trim()).filter(Boolean).slice(0, n).map((s) => ({ title: s, styleTag: "稳健推进" }));
    if (g.length > 0)
      return M("INFO", "AiService.generateTitle.success", "Generate title success", {
        chapterId: t.chapterId,
        candidateCount: g.length
      }), { candidates: g };
    const f = ((i == null ? void 0 : i.title) || o.slice(0, 12) || "新章节").trim();
    return M("INFO", "AiService.generateTitle.success", "Generate title success", {
      chapterId: t.chapterId,
      candidateCount: n
    }), {
      candidates: Array.from({ length: n }, (s, d) => ({
        title: `${f} · ${d + 1}`,
        styleTag: "稳健推进"
      }))
    };
  }
  async previewContinuePrompt(t) {
    M("INFO", "AiService.previewContinuePrompt.start", "Preview continue prompt start", {
      chapterId: t.chapterId,
      novelId: t.novelId,
      contextChapterCount: t.contextChapterCount
    });
    const e = await this.buildContinuePromptBundle(t);
    return M("INFO", "AiService.previewContinuePrompt.success", "Preview continue prompt success", {
      chapterId: t.chapterId
    }), {
      structured: e.structured,
      rawPrompt: st(e.systemPrompt, e.effectiveUserPrompt),
      editableUserPrompt: e.defaultUserPrompt,
      usedContext: e.usedContext,
      warnings: e.warnings
    };
  }
  async continueWriting(t) {
    M("INFO", "AiService.continueWriting.start", "Continue writing start", {
      chapterId: t.chapterId,
      novelId: t.novelId,
      providerType: this.settingsCache.providerType,
      targetLength: t.targetLength,
      contextChapterCount: t.contextChapterCount
    });
    const e = this.getProvider(), n = await this.buildContinuePromptBundle(t), a = Number.isFinite(t.temperature) ? Math.max(0, Math.min(2, Number(t.temperature))) : this.settingsCache.http.temperature, o = await e.generate({
      systemPrompt: n.systemPrompt,
      prompt: n.effectiveUserPrompt,
      maxTokens: this.settingsCache.http.maxTokens,
      temperature: a
    }), c = await this.checkConsistency({
      novelId: t.novelId,
      text: o.text
    }), i = {
      text: o.text,
      usedContext: n.usedContext,
      warnings: n.warnings,
      consistency: c
    };
    return M("INFO", "AiService.continueWriting.success", "Continue writing success", {
      chapterId: t.chapterId,
      warningCount: n.warnings.length,
      generatedLength: i.text.length
    }), i;
  }
  async checkConsistency(t) {
    const e = [];
    return (await h.worldSetting.findMany({ where: { novelId: t.novelId } })).length === 0 && e.push("No world settings found for consistency baseline."), t.text.length < 20 && e.push("Generated text is too short."), { ok: e.length === 0, issues: e };
  }
  async previewCreativeAssetsPrompt(t) {
    var n;
    M("INFO", "AiService.previewCreativeAssetsPrompt.start", "Preview creative assets prompt start", {
      novelId: t.novelId,
      briefLength: ((n = t.brief) == null ? void 0 : n.length) ?? 0,
      targetSections: t.targetSections
    });
    const e = await this.buildCreativeAssetsPromptBundle(t);
    return M("INFO", "AiService.previewCreativeAssetsPrompt.success", "Preview creative assets prompt success", {
      novelId: t.novelId
    }), {
      structured: e.structured,
      rawPrompt: st(e.systemPrompt, e.effectiveUserPrompt),
      editableUserPrompt: e.defaultUserPrompt,
      usedContext: e.usedContext
    };
  }
  inferCreativeTargetSections(t) {
    const e = String(t || "").trim().toLowerCase();
    if (!e)
      return [...Ae];
    const n = [];
    for (const a of Ae)
      Ir[a].some((c) => e.includes(c.toLowerCase())) && n.push(a);
    return n.length > 0 ? n : [...Ae];
  }
  resolveCreativeTargetSections(t) {
    const n = (Array.isArray(t.targetSections) ? t.targetSections : []).filter((a) => Ae.includes(a));
    return n.length > 0 ? n : this.inferCreativeTargetSections(t.brief);
  }
  buildEmptyCreativeDraft(t) {
    const e = {};
    for (const n of t)
      e[n] = [];
    return e;
  }
  async generateCreativeAssets(t) {
    var I, w, E, C, p, g, f, m, u, s, d, y, v;
    M("INFO", "AiService.generateCreativeAssets.start", "Generate creative assets start", {
      novelId: t.novelId,
      briefLength: ((I = t.brief) == null ? void 0 : I.length) ?? 0,
      providerType: this.settingsCache.providerType,
      targetSections: t.targetSections
    });
    const e = this.getProvider(), n = await this.buildCreativeAssetsPromptBundle(t), a = this.resolveCreativeTargetSections(t), o = await e.generate({
      systemPrompt: n.systemPrompt,
      prompt: n.effectiveUserPrompt,
      maxTokens: this.settingsCache.http.maxTokens,
      temperature: this.settingsCache.http.temperature
    });
    try {
      const _ = JSON.parse(o.text);
      if (_ && typeof _ == "object") {
        const D = this.buildEmptyCreativeDraft(a);
        for (const k of a) {
          const P = _ == null ? void 0 : _[k];
          D[k] = Array.isArray(P) ? P : [];
        }
        return M("INFO", "AiService.generateCreativeAssets.success", "Generate creative assets success", {
          novelId: t.novelId,
          counts: {
            plotLines: ((w = D.plotLines) == null ? void 0 : w.length) ?? 0,
            plotPoints: ((E = D.plotPoints) == null ? void 0 : E.length) ?? 0,
            characters: ((C = D.characters) == null ? void 0 : C.length) ?? 0,
            items: ((p = D.items) == null ? void 0 : p.length) ?? 0,
            skills: ((g = D.skills) == null ? void 0 : g.length) ?? 0,
            maps: ((f = D.maps) == null ? void 0 : f.length) ?? 0
          }
        }), { draft: D };
      }
    } catch {
    }
    const c = qt().slice(0, 6), i = {
      plotLines: [{
        name: `主线-${c}`,
        description: "AI 生成的主线草稿",
        color: "#6366f1",
        points: [{ title: "开端事件", description: "引发主线的关键事件", type: "event", status: "active" }]
      }],
      plotPoints: [{
        title: "中段转折",
        description: "推动章节冲突升级",
        type: "event",
        status: "active"
      }],
      characters: [{ name: `角色-${c}`, role: "protagonist", description: "AI 生成角色草稿", profile: { goal: "完成使命" } }],
      items: [{ name: `物品-${c}`, type: "item", description: "AI 生成物品草稿", profile: { rarity: "rare" } }],
      skills: [{ name: `技能-${c}`, description: "AI 生成技能草稿", profile: { rank: "A" } }],
      maps: [{ name: `世界地图-${c}`, type: "world", description: "AI 生成地图草稿", imagePrompt: "fantasy world map" }]
    }, l = this.buildEmptyCreativeDraft(a);
    for (const _ of a)
      l[_] = i[_] ?? [];
    return M("INFO", "AiService.generateCreativeAssets.success", "Generate creative assets success", {
      novelId: t.novelId,
      counts: {
        plotLines: ((m = l.plotLines) == null ? void 0 : m.length) ?? 0,
        plotPoints: ((u = l.plotPoints) == null ? void 0 : u.length) ?? 0,
        characters: ((s = l.characters) == null ? void 0 : s.length) ?? 0,
        items: ((d = l.items) == null ? void 0 : d.length) ?? 0,
        skills: ((y = l.skills) == null ? void 0 : y.length) ?? 0,
        maps: ((v = l.maps) == null ? void 0 : v.length) ?? 0
      }
    }), {
      draft: l
    };
  }
  async validateCreativeAssetsDraft(t) {
    var f, m;
    const e = [], n = [], a = (u) => e.push(u), o = (u, s, d = yr) => {
      const y = typeof u == "string" ? u.trim() : "";
      return y ? y.length <= d ? y : (n.push(`${s} exceeds ${d} chars and was truncated`), y.slice(0, d)) : "";
    }, c = (u, s) => {
      if (!u || typeof u != "object" || Array.isArray(u))
        return {};
      const d = {};
      for (const [y, v] of Object.entries(u)) {
        const _ = o(y, `${s}.key`, 64), D = o(v, `${s}.${y}`, 500);
        _ && D && (d[_] = D);
      }
      return d;
    }, i = {
      plotLines: (t.draft.plotLines ?? []).map((u, s) => ({
        name: o(u.name, `plotLines[${s}].name`, 120),
        description: o(u.description, `plotLines[${s}].description`),
        color: o(u.color, `plotLines[${s}].color`, 16) || "#6366f1",
        points: (u.points ?? []).map((d, y) => {
          const v = o(d.type, `plotLines[${s}].points[${y}].type`, 32) || "event", _ = o(d.status, `plotLines[${s}].points[${y}].status`, 32) || "active";
          return {
            title: o(d.title, `plotLines[${s}].points[${y}].title`, 120),
            description: o(d.description, `plotLines[${s}].points[${y}].description`),
            type: ot.has(v) ? v : "event",
            status: it.has(_) ? _ : "active"
          };
        })
      })),
      plotPoints: (t.draft.plotPoints ?? []).map((u, s) => {
        const d = o(u.type, `plotPoints[${s}].type`, 32) || "event", y = o(u.status, `plotPoints[${s}].status`, 32) || "active";
        return {
          title: o(u.title, `plotPoints[${s}].title`, 120),
          description: o(u.description, `plotPoints[${s}].description`),
          type: ot.has(d) ? d : "event",
          status: it.has(y) ? y : "active",
          plotLineName: o(u.plotLineName, `plotPoints[${s}].plotLineName`, 120)
        };
      }),
      characters: (t.draft.characters ?? []).map((u, s) => ({
        name: o(u.name, `characters[${s}].name`, 120),
        role: o(u.role, `characters[${s}].role`, 64),
        description: o(u.description, `characters[${s}].description`),
        profile: c(u.profile, `characters[${s}].profile`)
      })),
      items: (t.draft.items ?? []).map((u, s) => {
        const d = o(u.type, `items[${s}].type`, 32) || "item";
        return {
          name: o(u.name, `items[${s}].name`, 120),
          type: wr.has(d) ? d : "item",
          description: o(u.description, `items[${s}].description`),
          profile: c(u.profile, `items[${s}].profile`)
        };
      }),
      skills: (t.draft.skills ?? []).map((u, s) => ({
        name: o(u.name, `skills[${s}].name`, 120),
        description: o(u.description, `skills[${s}].description`),
        profile: c(u.profile, `skills[${s}].profile`)
      })),
      maps: (t.draft.maps ?? []).map((u, s) => {
        const d = o(u.type, `maps[${s}].type`, 32) || "world";
        return {
          name: o(u.name, `maps[${s}].name`, 120),
          type: vr.has(d) ? d : "world",
          description: o(u.description, `maps[${s}].description`),
          imagePrompt: o(u.imagePrompt, `maps[${s}].imagePrompt`),
          imageUrl: o(u.imageUrl, `maps[${s}].imageUrl`, 2048),
          imageBase64: o(u.imageBase64, `maps[${s}].imageBase64`, 4194304),
          mimeType: o(u.mimeType, `maps[${s}].mimeType`, 64)
        };
      })
    };
    for (const [u, s] of (i.plotLines ?? []).entries()) {
      s.name || a({ scope: `plotLines[${u}]`, code: "INVALID_INPUT", detail: "Plot line name is required" });
      for (const [d, y] of (s.points ?? []).entries())
        y.title || a({ scope: `plotLines[${u}].points[${d}]`, code: "INVALID_INPUT", detail: "Plot point title is required" });
    }
    for (const [u, s] of (i.plotPoints ?? []).entries())
      s.title || a({ scope: `plotPoints[${u}]`, code: "INVALID_INPUT", detail: "Plot point title is required" });
    for (const [u, s] of (i.characters ?? []).entries())
      s.name || a({ scope: `characters[${u}]`, code: "INVALID_INPUT", detail: "Character name is required" });
    for (const [u, s] of (i.items ?? []).entries())
      s.name || a({ scope: `items[${u}]`, code: "INVALID_INPUT", detail: "Item name is required" });
    for (const [u, s] of (i.skills ?? []).entries())
      s.name || a({ scope: `skills[${u}]`, code: "INVALID_INPUT", detail: "Skill name is required" });
    for (const [u, s] of (i.maps ?? []).entries())
      if (s.name || a({ scope: `maps[${u}]`, code: "INVALID_INPUT", detail: "Map name is required" }), +!!s.imageBase64 + +!!s.imageUrl + +!!s.imagePrompt > 1 && a({
        scope: `maps[${u}]`,
        name: s.name,
        code: "INVALID_INPUT",
        detail: "Map image input must use only one source: imageBase64, imageUrl, or imagePrompt"
      }), s.imageUrl && !/^https?:\/\//i.test(s.imageUrl) && a({
        scope: `maps[${u}].imageUrl`,
        name: s.name,
        code: "INVALID_INPUT",
        detail: "Map imageUrl must start with http:// or https://"
      }), s.imageBase64)
        try {
          const y = Buffer.from(s.imageBase64, "base64").length;
          y === 0 && a({
            scope: `maps[${u}].imageBase64`,
            name: s.name,
            code: "INVALID_INPUT",
            detail: "Map imageBase64 is invalid"
          }), y > Fe && a({
            scope: `maps[${u}].imageBase64`,
            name: s.name,
            code: "INVALID_INPUT",
            detail: `Map imageBase64 exceeds ${Fe} bytes`
          });
        } catch {
          a({
            scope: `maps[${u}].imageBase64`,
            name: s.name,
            code: "INVALID_INPUT",
            detail: "Map imageBase64 is invalid"
          });
        }
    const l = (u, s) => {
      const d = /* @__PURE__ */ new Set();
      for (const y of u) {
        const v = (y.name || "").trim().toLowerCase();
        if (v) {
          if (d.has(v)) {
            a({
              scope: s,
              name: y.name,
              code: "CONFLICT",
              detail: `Duplicate name in current draft: ${y.name}`
            });
            continue;
          }
          d.add(v);
        }
      }
    };
    l(i.plotLines ?? [], "plotLines"), l(i.characters ?? [], "characters"), l(i.items ?? [], "items"), l(i.skills ?? [], "skills"), l(i.maps ?? [], "maps");
    const [I, w, E, C] = await Promise.all([
      h.plotLine.findMany({ where: { novelId: t.novelId }, select: { name: !0 } }),
      h.character.findMany({ where: { novelId: t.novelId }, select: { name: !0 } }),
      h.item.findMany({ where: { novelId: t.novelId }, select: { name: !0 } }),
      h.mapCanvas.findMany({ where: { novelId: t.novelId }, select: { name: !0 } })
    ]), p = {
      plotLines: new Set(I.map((u) => u.name.trim().toLowerCase())),
      characters: new Set(w.map((u) => u.name.trim().toLowerCase())),
      items: new Set(E.map((u) => u.name.trim().toLowerCase())),
      maps: new Set(C.map((u) => u.name.trim().toLowerCase()))
    }, g = (u, s, d) => {
      for (const y of u) {
        const v = (y.name || "").trim().toLowerCase();
        v && p[s].has(v) && a({
          scope: d,
          name: y.name,
          code: "CONFLICT",
          detail: `Name already exists in novel: ${y.name}`
        });
      }
    };
    return g(i.plotLines ?? [], "plotLines", "plotLines"), g(i.characters ?? [], "characters", "characters"), g(i.items ?? [], "items", "items"), g(i.skills ?? [], "items", "skills"), g(i.maps ?? [], "maps", "maps"), (((f = i.plotPoints) == null ? void 0 : f.length) ?? 0) > 0 && (((m = i.plotLines) == null ? void 0 : m.length) ?? 0) === 0 && n.push("Draft has plotPoints but no plotLines. System will create a default plot line when persisting."), {
      ok: e.length === 0,
      errors: e,
      warnings: n,
      normalizedDraft: i
    };
  }
  async confirmCreativeAssets(t) {
    var l, I, w, E, C, p;
    M("INFO", "AiService.confirmCreativeAssets.start", "Confirm creative assets start", {
      novelId: t.novelId,
      draftCounts: oe({
        plotLines: ((l = t.draft.plotLines) == null ? void 0 : l.length) ?? 0,
        plotPoints: ((I = t.draft.plotPoints) == null ? void 0 : I.length) ?? 0,
        characters: ((w = t.draft.characters) == null ? void 0 : w.length) ?? 0,
        items: ((E = t.draft.items) == null ? void 0 : E.length) ?? 0,
        skills: ((C = t.draft.skills) == null ? void 0 : C.length) ?? 0,
        maps: ((p = t.draft.maps) == null ? void 0 : p.length) ?? 0
      })
    });
    const e = await this.validateCreativeAssetsDraft(t), n = {
      plotLines: 0,
      plotPoints: 0,
      characters: 0,
      items: 0,
      skills: 0,
      maps: 0,
      mapImages: 0
    };
    if (!e.ok)
      return M("WARN", "AiService.confirmCreativeAssets.validationFailed", "Confirm creative assets validation failed", {
        novelId: t.novelId,
        errors: e.errors,
        warnings: e.warnings
      }), {
        success: !1,
        created: n,
        warnings: e.warnings,
        errors: e.errors,
        transactionMode: "atomic"
      };
    const a = e.normalizedDraft, o = this.getProvider(), c = [];
    let i = { ...n };
    try {
      await h.$transaction(async (f) => {
        const m = { ...n }, u = /* @__PURE__ */ new Map();
        for (const d of a.plotLines ?? []) {
          const y = await f.plotLine.create({
            data: {
              novelId: t.novelId,
              name: d.name,
              description: d.description || null,
              color: d.color || "#6366f1",
              sortOrder: Date.now() + m.plotLines
            }
          });
          u.set(d.name.toLowerCase(), y.id), m.plotLines += 1;
          for (const v of d.points ?? [])
            await f.plotPoint.create({
              data: {
                novelId: t.novelId,
                plotLineId: y.id,
                title: v.title,
                description: v.description || null,
                type: v.type || "event",
                status: v.status || "active",
                order: Date.now() + m.plotPoints
              }
            }), m.plotPoints += 1;
        }
        const s = async (d) => {
          const y = (d || "").trim().toLowerCase();
          if (y && u.has(y))
            return u.get(y);
          const v = u.values().next().value;
          if (v)
            return v;
          const _ = "AI 主线", D = await f.plotLine.create({
            data: {
              novelId: t.novelId,
              name: _,
              description: "Auto-created for loose plot points",
              color: "#6366f1",
              sortOrder: Date.now() + m.plotLines
            }
          });
          return u.set(_.toLowerCase(), D.id), m.plotLines += 1, D.id;
        };
        for (const d of a.plotPoints ?? []) {
          const y = await s(d.plotLineName);
          await f.plotPoint.create({
            data: {
              novelId: t.novelId,
              plotLineId: y,
              title: d.title,
              description: d.description || null,
              type: d.type || "event",
              status: d.status || "active",
              order: Date.now() + m.plotPoints
            }
          }), m.plotPoints += 1;
        }
        for (const d of a.characters ?? [])
          await f.character.create({
            data: {
              novelId: t.novelId,
              name: d.name,
              role: d.role || null,
              description: d.description || null,
              profile: Be(d.profile),
              sortOrder: Date.now() + m.characters
            }
          }), m.characters += 1;
        for (const d of a.items ?? [])
          await f.item.create({
            data: {
              novelId: t.novelId,
              name: d.name,
              type: d.type || "item",
              description: d.description || null,
              profile: Be(d.profile),
              sortOrder: Date.now() + m.items
            }
          }), m.items += 1;
        for (const d of a.skills ?? [])
          await f.item.create({
            data: {
              novelId: t.novelId,
              name: d.name,
              type: "skill",
              description: d.description || null,
              profile: Be(d.profile),
              sortOrder: Date.now() + m.items + m.skills
            }
          }), m.skills += 1;
        for (const d of a.maps ?? []) {
          const y = await f.mapCanvas.create({
            data: {
              novelId: t.novelId,
              name: d.name,
              type: d.type || "world",
              description: d.description || null,
              sortOrder: Date.now() + m.maps
            }
          });
          m.maps += 1;
          let v = null;
          if (d.imageBase64 || d.imageUrl)
            v = {
              imageBase64: d.imageBase64,
              imageUrl: d.imageUrl,
              mimeType: d.mimeType
            };
          else if (d.imagePrompt) {
            if (!o.generateImage)
              throw new j("INVALID_INPUT", `Provider ${o.name} does not support image generation`);
            const _ = await o.generateImage({ prompt: d.imagePrompt });
            if (!(_ != null && _.imageBase64) && !(_ != null && _.imageUrl))
              throw new j("PROVIDER_UNAVAILABLE", `Map image generation returned empty data for ${d.name}`);
            v = {
              imageBase64: _.imageBase64,
              imageUrl: _.imageUrl,
              mimeType: _.mimeType
            };
          }
          if (v) {
            const _ = await this.saveImageAsset(t.novelId, y.id, v);
            c.push(_.absolutePath), await f.mapCanvas.update({
              where: { id: y.id },
              data: { background: _.relativePath }
            }), m.mapImages += 1;
          }
        }
        i = m;
      });
      const g = {
        success: !0,
        created: i,
        warnings: e.warnings,
        transactionMode: "atomic"
      };
      return M("INFO", "AiService.confirmCreativeAssets.success", "Confirm creative assets success", {
        novelId: t.novelId,
        created: i,
        warningCount: e.warnings.length
      }), g;
    } catch (g) {
      ie("AiService.confirmCreativeAssets.error", g, {
        novelId: t.novelId
      });
      for (const u of c)
        try {
          z.existsSync(u) && z.unlinkSync(u);
        } catch {
        }
      const f = te(g), m = f.code === "INVALID_INPUT" ? "INVALID_INPUT" : f.code === "CONFLICT" ? "CONFLICT" : f.code === "UNKNOWN" ? "UNKNOWN" : "PERSISTENCE_ERROR";
      return {
        success: !1,
        created: n,
        warnings: e.warnings,
        errors: [
          {
            scope: "confirmCreativeAssets",
            code: m,
            detail: f.message || "Creative assets persistence failed"
          }
        ],
        transactionMode: "atomic"
      };
    }
  }
  async previewMapPrompt(t) {
    var n;
    M("INFO", "AiService.previewMapPrompt.start", "Preview map prompt start", {
      novelId: t.novelId,
      mapId: t.mapId,
      promptLength: ((n = t.prompt) == null ? void 0 : n.length) ?? 0
    });
    const e = await this.buildMapPromptBundle(t);
    return M("INFO", "AiService.previewMapPrompt.success", "Preview map prompt success", {
      novelId: t.novelId,
      mapId: t.mapId
    }), {
      structured: e.structured,
      rawPrompt: e.effectiveUserPrompt,
      editableUserPrompt: e.defaultUserPrompt,
      usedWorldLore: e.usedWorldLore
    };
  }
  async generateMapImage(t) {
    var a, o, c, i;
    M("INFO", "AiService.generateMapImage.start", "Generate map image start", {
      novelId: t.novelId,
      mapId: t.mapId,
      promptLength: ((a = t.prompt) == null ? void 0 : a.length) ?? 0,
      providerType: this.settingsCache.providerType
    });
    const e = Date.now(), n = (l) => (this.recordMapImageCall({
      ok: l.ok,
      code: l.code,
      detail: l.detail,
      latencyMs: Date.now() - e
    }), l);
    try {
      const l = !!((o = t.prompt) != null && o.trim()), I = !!((c = t.overrideUserPrompt) != null && c.trim());
      if (!l && !I)
        return n({ ok: !1, code: "INVALID_INPUT", detail: "Map prompt is empty" });
      const w = this.getProvider();
      if (!w.generateImage)
        return n({ ok: !1, code: "INVALID_INPUT", detail: `Provider ${w.name} does not support image generation` });
      const E = await this.buildMapPromptBundle(t), C = await w.generateImage({
        prompt: E.effectiveUserPrompt,
        model: this.settingsCache.http.imageModel || void 0,
        size: t.imageSize || this.settingsCache.http.imageSize || void 0,
        outputFormat: this.settingsCache.http.imageOutputFormat || void 0,
        watermark: this.settingsCache.http.imageWatermark
      });
      if (!C.imageBase64 && !C.imageUrl)
        return n({ ok: !1, code: "PROVIDER_UNAVAILABLE", detail: "Provider did not return any image data" });
      let p = t.mapId;
      if (p || (p = (await h.mapCanvas.create({
        data: {
          novelId: t.novelId,
          name: ((i = t.mapName) == null ? void 0 : i.trim()) || `AI 地图 ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
          type: t.mapType || "world",
          description: `Generated by AI with prompt: ${t.prompt}`,
          sortOrder: Date.now()
        }
      })).id), !p)
        throw new j("PERSISTENCE_ERROR", "Map id is missing after map creation");
      const g = await this.saveImageAsset(t.novelId, p, {
        imageBase64: C.imageBase64,
        imageUrl: C.imageUrl,
        mimeType: C.mimeType
      });
      await h.mapCanvas.update({
        where: { id: p },
        data: { background: g.relativePath }
      });
      const f = n({
        ok: !0,
        detail: "Map image generated and stored successfully",
        mapId: p,
        path: g.relativePath
      });
      return M("INFO", "AiService.generateMapImage.success", "Generate map image success", {
        novelId: t.novelId,
        mapId: p,
        imagePath: g.relativePath
      }), f;
    } catch (l) {
      ie("AiService.generateMapImage.error", l, {
        novelId: t.novelId,
        mapId: t.mapId
      });
      const I = te(l);
      return n({
        ok: !1,
        code: I.code,
        detail: I.message || "Map generation failed"
      });
    }
  }
  async executeAction(t) {
    const e = this.capabilityRegistry.get(t.actionId);
    if (!e)
      throw new j("INVALID_INPUT", `Unknown actionId: ${t.actionId}`);
    try {
      return await e(t.payload);
    } catch (n) {
      throw te(n);
    }
  }
  async invokeOpenClawTool(t) {
    try {
      return { ok: !0, data: await this.executeAction({
        actionId: t.name,
        payload: t.arguments
      }) };
    } catch (e) {
      const n = te(e);
      return {
        ok: !1,
        error: ge(n.code, n.message || "OpenClaw invoke failed"),
        code: n.code
      };
    }
  }
  async invokeOpenClawSkill(t) {
    try {
      return { ok: !0, data: await this.executeAction({
        actionId: t.name,
        payload: t.input
      }) };
    } catch (e) {
      const n = te(e);
      return {
        ok: !1,
        error: ge(n.code, n.message || "OpenClaw skill invoke failed"),
        code: n.code
      };
    }
  }
  compactContinueHardContext(t) {
    const e = Array.isArray(t.worldSettings) ? t.worldSettings : [], n = Array.isArray(t.plotLines) ? t.plotLines : [], a = Array.isArray(t.characters) ? t.characters : [], o = Array.isArray(t.items) ? t.items : [], c = Array.isArray(t.maps) ? t.maps : [];
    return {
      worldSettings: e.slice(0, 60).map((i) => ({
        name: O(i == null ? void 0 : i.name, 80),
        type: O(i == null ? void 0 : i.type, 32) || "other",
        content: O(i == null ? void 0 : i.content, 300) || O(i == null ? void 0 : i.description, 300)
      })).filter((i) => i.content),
      plotLines: n.slice(0, 40).map((i) => ({
        name: O(i == null ? void 0 : i.name, 100),
        description: O(i == null ? void 0 : i.description, 260),
        points: Array.isArray(i == null ? void 0 : i.points) ? i.points.filter((l) => String((l == null ? void 0 : l.status) || "").trim().toLowerCase() !== "resolved").slice(0, 12).map((l) => ({
          title: O(l == null ? void 0 : l.title, 100),
          description: O(l == null ? void 0 : l.description, 220),
          type: O(l == null ? void 0 : l.type, 24) || "event",
          status: O(l == null ? void 0 : l.status, 24) || "active"
        })).filter((l) => l.title || l.description) : []
      })).filter((i) => {
        var l;
        return i.name || (((l = i.points) == null ? void 0 : l.length) ?? 0) > 0;
      }),
      characters: a.slice(0, 120).map((i) => ({
        name: O(i == null ? void 0 : i.name, 80),
        role: O(i == null ? void 0 : i.role, 32),
        description: O(i == null ? void 0 : i.description, 220)
      })).filter((i) => i.name && (i.role || i.description)),
      items: o.slice(0, 120).map((i) => ({
        name: O(i == null ? void 0 : i.name, 80),
        type: O(i == null ? void 0 : i.type, 32) || "item",
        description: O(i == null ? void 0 : i.description, 220)
      })).filter((i) => i.name && i.description),
      maps: c.slice(0, 60).map((i) => ({
        name: O(i == null ? void 0 : i.name, 80),
        type: O(i == null ? void 0 : i.type, 24) || "world",
        description: O(i == null ? void 0 : i.description, 220)
      })).filter((i) => i.name && i.description)
    };
  }
  compactContinueDynamicContext(t) {
    const e = Array.isArray(t.recentChapters) ? t.recentChapters : [], n = Array.isArray(t.selectedIdeas) ? t.selectedIdeas : [], a = Array.isArray(t.selectedIdeaEntities) ? t.selectedIdeaEntities : [], o = Array.isArray(t.narrativeSummaries) ? t.narrativeSummaries : [], c = O(t.currentLocation, 120);
    return {
      recentChapters: e.slice(0, 8).map((i) => ({
        title: O(i == null ? void 0 : i.title, 120),
        excerpt: O(i == null ? void 0 : i.excerpt, 1200)
      })).filter((i) => i.title || i.excerpt),
      selectedIdeas: n.slice(0, 20).map((i) => ({
        content: O(i == null ? void 0 : i.content, 800),
        quote: O(i == null ? void 0 : i.quote, 300),
        tags: Array.isArray(i == null ? void 0 : i.tags) ? i.tags.slice(0, 12).map((l) => O(l, 32)).filter(Boolean) : []
      })).filter((i) => i.content || i.quote),
      selectedIdeaEntities: a.slice(0, 20).map((i) => ({
        name: O(i == null ? void 0 : i.name, 80),
        kind: O(i == null ? void 0 : i.kind, 24)
      })).filter((i) => i.name && i.kind),
      currentChapterBeforeCursor: O(t.currentChapterBeforeCursor, 2600),
      ...c ? { currentLocation: c } : {},
      narrativeSummaries: o.slice(0, 4).map((i) => ({
        level: (i == null ? void 0 : i.level) === "volume" ? "volume" : "novel",
        title: O(i == null ? void 0 : i.title, 100),
        summaryText: O(i == null ? void 0 : i.summaryText, 1200),
        keyFacts: Array.isArray(i == null ? void 0 : i.keyFacts) ? Dr(i.keyFacts.map((l) => O(l, 160)).filter(Boolean), 5) : []
      }))
    };
  }
  async buildContinuePromptBundle(t) {
    var f;
    const e = /^zh/i.test(String(t.locale || "").trim()), n = t.mode === "new_chapter" ? "new_chapter" : "continue_chapter", a = await this.contextBuilder.buildForContinueWriting({
      ...t,
      mode: n,
      recentRawChapterCount: t.recentRawChapterCount ?? this.settingsCache.summary.recentChapterRawCount
    }), o = this.compactContinueHardContext(a.hardContext), c = this.compactContinueDynamicContext(a.dynamicContext), i = O(t.userIntent, 800), l = O(t.currentLocation, 120), I = {
      ...a.params,
      targetLength: e ? `约${Math.max(100, Math.min(4e3, Number(a.params.targetLength || 500)))}汉字` : `about ${Math.max(100, Math.min(4e3, Number(a.params.targetLength || 500)))} Chinese characters`
    }, w = e ? "你是中文小说续写助手。严格遵守世界观和大纲，不得破坏既有设定与人物行为逻辑。" : "Continue writing with strict consistency to world settings and plot outline. Do not break established lore.", C = [
      `WriteMode=${n}`,
      `HardContext=
${JSON.stringify(o, null, 2).slice(0, 18e3)}`,
      `DynamicContext=
${JSON.stringify(c, null, 2).slice(0, 12e3)}`,
      `WriteParams=
${JSON.stringify(I, null, 2)}`,
      ...i ? [`UserIntent=${i}`] : [],
      ...l ? [`CurrentLocation=${l}`] : [],
      n === "new_chapter" ? e ? "Constraint=基于大纲与世界观写出新章节开场，不得复述已有段落。" : "Constraint=Start a fresh chapter opening based on outline and world context. Do not echo prior chapter paragraphs." : e ? "Constraint=仅输出新增续写内容，不得重复当前章节或上下文已出现段落。" : "Constraint=Output must be NEW continuation content only. Do not restate prior paragraphs from current chapter or context.",
      e ? "Constraint=@实体名 表示对上下文中同名角色/物品/地点/设定的引用，续写时应保持实体设定一致。" : "Constraint=@EntityName means referencing the same named entity from context; keep entity traits consistent.",
      ...i ? [e ? "Constraint=尽量满足用户意图，但不得违反世界观与主线大纲。" : "Constraint=Prioritize the user intent when possible, but never violate established world settings and plot outline."] : [],
      e ? "Constraint=请严格遵守 HardContext 中的世界观、角色性格和物品设定；情节推进需与已有情节点保持一致。" : "Constraint=Strictly follow HardContext lore, character traits, and item settings; keep progression aligned with existing plot points.",
      e ? "Constraint=你的任务是续写光标后的新内容，不要重复 currentChapterBeforeCursor 里的任何句子。" : "Constraint=Write only the continuation after cursor; do not repeat any sentence from currentChapterBeforeCursor."
    ].join(`

`), p = (f = t.overrideUserPrompt) != null && f.trim() ? t.overrideUserPrompt.trim() : C, g = {
      ...a.params,
      ...i ? { userIntent: i } : {},
      ...l ? { currentLocation: l } : {}
    };
    return {
      systemPrompt: w,
      defaultUserPrompt: C,
      effectiveUserPrompt: p,
      structured: {
        goal: n === "new_chapter" ? e ? "生成新章节开场内容。" : "Generate opening content for a new chapter." : e ? "仅生成续写新增内容。" : "Generate continuation content only.",
        contextRefs: a.usedContext,
        params: g,
        constraints: [
          ...e ? ["严格遵守世界观与大纲一致性。"] : ["Keep strict consistency with world settings and outline."],
          ...i ? [e ? "在不冲突时优先满足用户意图。" : "Respect user intent when it does not conflict with hard context."] : [],
          ...e ? ["不得重复已有段落。", "只输出生成的续写正文。"] : ["Do not repeat existing paragraphs.", "Output only generated chapter text."]
        ]
      },
      usedContext: a.usedContext,
      warnings: a.warnings
    };
  }
  async buildCreativeAssetsPromptBundle(t) {
    var f;
    const e = this.resolveCreativeTargetSections(t), [n, a, o] = await Promise.all([
      h.novel.findUnique({
        where: { id: t.novelId },
        select: { id: !0, title: !0, description: !0 }
      }),
      h.worldSetting.findMany({
        where: { novelId: t.novelId },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { name: !0, content: !0 }
      }),
      Promise.all([
        h.plotLine.count({ where: { novelId: t.novelId } }),
        h.character.count({ where: { novelId: t.novelId } }),
        h.item.count({ where: { novelId: t.novelId } }),
        h.mapCanvas.count({ where: { novelId: t.novelId } })
      ])
    ]), [c, i, l, I] = o, w = [
      `Novel: ${(n == null ? void 0 : n.title) || t.novelId}`,
      `World settings referenced: ${a.length}`,
      `Existing entities: plotLines=${c}, characters=${i}, items=${l}, maps=${I}`
    ], E = "Generate structured creative assets in strict JSON format. Output only requested sections.", C = {
      plotLines: [{ name: "string", description: "string?" }],
      plotPoints: [{ title: "string", description: "string?", plotLineName: "string?" }],
      characters: [{ name: "string", role: "string?", description: "string?" }],
      items: [{ name: "string", type: "item|skill|location", description: "string?" }],
      skills: [{ name: "string", description: "string?" }],
      maps: [{ name: "string", type: "world|region|scene", description: "string?", imagePrompt: "string?" }]
    }, p = JSON.stringify({
      task: "creative_assets_generation",
      brief: t.brief,
      novel: {
        title: (n == null ? void 0 : n.title) || "",
        description: (n == null ? void 0 : n.description) || ""
      },
      worldSettings: a.map((m) => ({
        name: String(m.name || ""),
        description: String(m.content || "").slice(0, 180)
      })),
      targetSections: e,
      outputShape: e,
      outputSchema: C,
      constraints: [
        "return strict JSON only",
        "output only requested sections; all unrequested sections must be empty arrays",
        "avoid duplicate names against existing entities",
        "fields should be concise and directly usable"
      ]
    }), g = (f = t.overrideUserPrompt) != null && f.trim() ? t.overrideUserPrompt.trim() : p;
    return {
      systemPrompt: E,
      defaultUserPrompt: p,
      effectiveUserPrompt: g,
      structured: {
        goal: "Generate editable draft assets for outline, world and map creation.",
        contextRefs: w,
        params: {
          briefLength: t.brief.trim().length,
          sections: e
        },
        constraints: [
          "Output strict JSON.",
          "Return only selected sections.",
          "Prefer concise, production-ready fields.",
          "Avoid obvious name conflicts."
        ]
      },
      usedContext: w
    };
  }
  async buildMapPromptBundle(t) {
    var l;
    const n = (await h.worldSetting.findMany({
      where: { novelId: t.novelId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: !0, name: !0, content: !0 }
    })).map((I) => ({
      id: I.id,
      title: String(I.name || "Untitled"),
      excerpt: String(I.content || "").slice(0, 180)
    })), a = Ar(t.styleTemplate), o = n.length > 0 ? n.map((I, w) => `${w + 1}. ${I.title}: ${I.excerpt}`).join(`
`) : "No explicit world lore provided.", c = [
      a || "Style: follow user requested style.",
      `ImageSize=${t.imageSize || this.settingsCache.http.imageSize || "2K"}`,
      "Task: Generate a clean map background image.",
      `UserRequest=${t.prompt}`,
      "WorldLore:",
      o,
      "Constraints:",
      "- avoid text labels or UI marks",
      "- keep high readability for map canvas editing",
      "- preserve coherence with world lore"
    ].join(`
`), i = (l = t.overrideUserPrompt) != null && l.trim() ? t.overrideUserPrompt.trim() : c;
    return {
      defaultUserPrompt: c,
      effectiveUserPrompt: i,
      structured: {
        goal: "Generate map background image aligned with world lore.",
        contextRefs: [
          `Map type: ${t.mapType || "world"}`,
          `Map name: ${t.mapName || "(new map)"}`,
          `World lore refs: ${n.length}`
        ],
        params: {
          imageSize: t.imageSize || this.settingsCache.http.imageSize || "2K",
          styleTemplate: t.styleTemplate || "default"
        },
        constraints: [
          "No labels or UI overlays in generated image.",
          "Map should be readable for later annotation.",
          "Use world lore when available."
        ]
      },
      usedWorldLore: n
    };
  }
  getProvider() {
    return this.settingsCache.providerType === "mcp-cli" ? new nt(this.settingsCache) : new _t(this.settingsCache);
  }
  async saveImageAsset(t, e, n) {
    let a = n.mimeType || "image/png", o;
    if (n.imageBase64)
      o = Buffer.from(n.imageBase64, "base64");
    else if (n.imageUrl) {
      const w = await fetch(n.imageUrl);
      if (!w.ok)
        throw new Error(`Image download failed: ${w.status}`);
      const E = w.headers.get("content-type") || "";
      E && (a = E);
      const C = await w.arrayBuffer();
      o = Buffer.from(C);
    } else
      throw new Error("No image data provided");
    if (o.length === 0)
      throw new Error("Image data is empty");
    if (o.length > Fe)
      throw new Error("Image exceeds maximum size limit");
    if (!a.startsWith("image/"))
      throw new Error(`Invalid mime type: ${a}`);
    const c = Er(a), i = L.join(this.userDataPath, "maps", t);
    z.existsSync(i) || z.mkdirSync(i, { recursive: !0 });
    const l = Sr(`ai-${e}-${Date.now()}.${c}`), I = L.join(i, l);
    return z.writeFileSync(I, o), {
      relativePath: `maps/${t}/${l}`,
      absolutePath: I
    };
  }
  loadSettings() {
    try {
      if (!z.existsSync(this.settingsFilePath))
        return ue;
      const t = z.readFileSync(this.settingsFilePath, "utf8"), e = JSON.parse(t);
      return {
        ...ue,
        ...e,
        http: { ...ue.http, ...e.http ?? {} },
        mcpCli: { ...ue.mcpCli, ...e.mcpCli ?? {} },
        proxy: { ...ue.proxy, ...e.proxy ?? {} },
        summary: { ...ue.summary, ...e.summary ?? {} }
      };
    } catch (t) {
      return console.error("[AI] Failed to load settings, fallback to defaults:", t), ue;
    }
  }
  persistSettings() {
    try {
      const t = L.dirname(this.settingsFilePath);
      z.existsSync(t) || z.mkdirSync(t, { recursive: !0 }), z.writeFileSync(this.settingsFilePath, JSON.stringify(this.settingsCache, null, 2), "utf8");
    } catch (t) {
      console.error("[AI] Failed to persist settings:", t);
    }
  }
  loadMapImageStats() {
    const t = {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      rateLimitFailures: 0,
      updatedAt: (/* @__PURE__ */ new Date(0)).toISOString()
    };
    try {
      if (!z.existsSync(this.mapImageStatsPath))
        return t;
      const e = z.readFileSync(this.mapImageStatsPath, "utf8"), n = JSON.parse(e);
      return {
        totalCalls: n.totalCalls ?? 0,
        successCalls: n.successCalls ?? 0,
        failedCalls: n.failedCalls ?? 0,
        rateLimitFailures: n.rateLimitFailures ?? 0,
        lastFailureCode: n.lastFailureCode || void 0,
        lastFailureAt: n.lastFailureAt || void 0,
        updatedAt: n.updatedAt || t.updatedAt
      };
    } catch (e) {
      return console.warn("[AI] Failed to load map image stats, fallback to defaults:", e), t;
    }
  }
  persistMapImageStats() {
    try {
      const t = L.dirname(this.mapImageStatsPath);
      z.existsSync(t) || z.mkdirSync(t, { recursive: !0 }), z.writeFileSync(this.mapImageStatsPath, JSON.stringify(this.mapImageStatsCache, null, 2), "utf8");
    } catch (t) {
      console.warn("[AI] Failed to persist map image stats:", t);
    }
  }
  recordMapImageCall(t) {
    const e = (t.code || "").toLowerCase(), n = (t.detail || "").toLowerCase(), a = e.includes("rate") || e.includes("429") || n.includes("429") || n.includes("rate limit") || n.includes("quota");
    this.mapImageStatsCache = {
      ...this.mapImageStatsCache,
      totalCalls: this.mapImageStatsCache.totalCalls + 1,
      successCalls: this.mapImageStatsCache.successCalls + (t.ok ? 1 : 0),
      failedCalls: this.mapImageStatsCache.failedCalls + (t.ok ? 0 : 1),
      rateLimitFailures: this.mapImageStatsCache.rateLimitFailures + (!t.ok && a ? 1 : 0),
      lastFailureCode: t.ok ? this.mapImageStatsCache.lastFailureCode : t.code || "UNKNOWN",
      lastFailureAt: t.ok ? this.mapImageStatsCache.lastFailureAt : (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }, this.persistMapImageStats();
  }
}
const ct = "http://localhost:8080/api/sync";
class Lr {
  // Get the global sync cursor
  async getCursor() {
    const t = await h.syncState.findUnique({ where: { id: "global" } });
    return t ? Number(t.cursor) : 0;
  }
  async setCursor(t) {
    await h.syncState.upsert({
      where: { id: "global" },
      create: { id: "global", cursor: BigInt(t) },
      update: { cursor: BigInt(t) }
    });
  }
  async pull() {
    var e, n;
    const t = await this.getCursor();
    console.log("[Sync] Pulling from cursor:", t);
    try {
      const a = await fetch(`${ct}/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastSyncCursor: t })
      });
      if (!a.ok)
        throw new Error(`Pull failed: ${a.statusText}`);
      const o = await a.json(), { newSyncCursor: c, data: i } = o;
      return await h.$transaction(async (l) => {
        var I, w, E;
        if ((I = i.novels) != null && I.length)
          for (const C of i.novels)
            await l.novel.upsert({
              where: { id: C.id },
              create: { ...C, updatedAt: new Date(C.updatedAt), createdAt: new Date(C.createdAt) },
              update: { ...C, updatedAt: new Date(C.updatedAt), createdAt: new Date(C.createdAt) }
            });
        if ((w = i.volumes) != null && w.length)
          for (const C of i.volumes)
            await l.volume.upsert({
              where: { id: C.id },
              create: { ...C, updatedAt: new Date(C.updatedAt), createdAt: new Date(C.createdAt) },
              update: { ...C, updatedAt: new Date(C.updatedAt), createdAt: new Date(C.createdAt) }
            });
        if ((E = i.chapters) != null && E.length)
          for (const C of i.chapters)
            await l.chapter.upsert({
              where: { id: C.id },
              create: { ...C, updatedAt: new Date(C.updatedAt), createdAt: new Date(C.createdAt) },
              update: { ...C, updatedAt: new Date(C.updatedAt), createdAt: new Date(C.createdAt) }
            });
      }), await this.setCursor(c), console.log("[Sync] Pull complete. New cursor:", c), { success: !0, count: (((e = i.novels) == null ? void 0 : e.length) || 0) + (((n = i.chapters) == null ? void 0 : n.length) || 0) };
    } catch (a) {
      throw console.error("[Sync] Pull error:", a), a;
    }
  }
  async push() {
    const t = await this.getCursor(), e = {
      novels: await h.novel.findMany({ where: { updatedAt: { gt: new Date(t) } } }),
      volumes: await h.volume.findMany({ where: { updatedAt: { gt: new Date(t) } } }),
      chapters: await h.chapter.findMany({ where: { updatedAt: { gt: new Date(t) } } })
    };
    if (e.novels.length === 0 && e.volumes.length === 0 && e.chapters.length === 0)
      return { success: !0, count: 0 };
    console.log("[Sync] Pushing changes...");
    const n = JSON.stringify({
      lastSyncCursor: t,
      changes: e
    }, (o, c) => typeof c == "bigint" ? c.toString() : c), a = await fetch(`${ct}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: n
    });
    if (!a.ok)
      throw new Error(`Push failed: ${a.statusText}`);
    return console.log("[Sync] Push success"), await a.json();
  }
}
function Pr(r) {
  return r && r.__esModule && Object.prototype.hasOwnProperty.call(r, "default") ? r.default : r;
}
var ye = { exports: {} }, Nt = {
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
}, Ne = {};
(function(r) {
  const t = {
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
  function e(n) {
    return function(...a) {
      return a.length && (n = n.replace(/\{(\d)\}/g, (o, c) => a[c] || "")), new Error("ADM-ZIP: " + n);
    };
  }
  for (const n of Object.keys(t))
    r[n] = e(t[n]);
})(Ne);
const Tr = x, J = ne, lt = Nt, Mr = Ne, br = typeof process == "object" && process.platform === "win32", dt = (r) => typeof r == "object" && r !== null, Lt = new Uint32Array(256).map((r, t) => {
  for (let e = 0; e < 8; e++)
    t & 1 ? t = 3988292384 ^ t >>> 1 : t >>>= 1;
  return t >>> 0;
});
function G(r) {
  this.sep = J.sep, this.fs = Tr, dt(r) && dt(r.fs) && typeof r.fs.statSync == "function" && (this.fs = r.fs);
}
var xr = G;
G.prototype.makeDir = function(r) {
  const t = this;
  function e(n) {
    let a = n.split(t.sep)[0];
    n.split(t.sep).forEach(function(o) {
      if (!(!o || o.substr(-1, 1) === ":")) {
        a += t.sep + o;
        var c;
        try {
          c = t.fs.statSync(a);
        } catch {
          t.fs.mkdirSync(a);
        }
        if (c && c.isFile())
          throw Mr.FILE_IN_THE_WAY(`"${a}"`);
      }
    });
  }
  e(r);
};
G.prototype.writeFileTo = function(r, t, e, n) {
  const a = this;
  if (a.fs.existsSync(r)) {
    if (!e)
      return !1;
    var o = a.fs.statSync(r);
    if (o.isDirectory())
      return !1;
  }
  var c = J.dirname(r);
  a.fs.existsSync(c) || a.makeDir(c);
  var i;
  try {
    i = a.fs.openSync(r, "w", 438);
  } catch {
    a.fs.chmodSync(r, 438), i = a.fs.openSync(r, "w", 438);
  }
  if (i)
    try {
      a.fs.writeSync(i, t, 0, t.length, 0);
    } finally {
      a.fs.closeSync(i);
    }
  return a.fs.chmodSync(r, n || 438), !0;
};
G.prototype.writeFileToAsync = function(r, t, e, n, a) {
  typeof n == "function" && (a = n, n = void 0);
  const o = this;
  o.fs.exists(r, function(c) {
    if (c && !e)
      return a(!1);
    o.fs.stat(r, function(i, l) {
      if (c && l.isDirectory())
        return a(!1);
      var I = J.dirname(r);
      o.fs.exists(I, function(w) {
        w || o.makeDir(I), o.fs.open(r, "w", 438, function(E, C) {
          E ? o.fs.chmod(r, 438, function() {
            o.fs.open(r, "w", 438, function(p, g) {
              o.fs.write(g, t, 0, t.length, 0, function() {
                o.fs.close(g, function() {
                  o.fs.chmod(r, n || 438, function() {
                    a(!0);
                  });
                });
              });
            });
          }) : C ? o.fs.write(C, t, 0, t.length, 0, function() {
            o.fs.close(C, function() {
              o.fs.chmod(r, n || 438, function() {
                a(!0);
              });
            });
          }) : o.fs.chmod(r, n || 438, function() {
            a(!0);
          });
        });
      });
    });
  });
};
G.prototype.findFiles = function(r) {
  const t = this;
  function e(n, a, o) {
    let c = [];
    return t.fs.readdirSync(n).forEach(function(i) {
      const l = J.join(n, i), I = t.fs.statSync(l);
      c.push(J.normalize(l) + (I.isDirectory() ? t.sep : "")), I.isDirectory() && o && (c = c.concat(e(l, a, o)));
    }), c;
  }
  return e(r, void 0, !0);
};
G.prototype.findFilesAsync = function(r, t) {
  const e = this;
  let n = [];
  e.fs.readdir(r, function(a, o) {
    if (a)
      return t(a);
    let c = o.length;
    if (!c)
      return t(null, n);
    o.forEach(function(i) {
      i = J.join(r, i), e.fs.stat(i, function(l, I) {
        if (l)
          return t(l);
        I && (n.push(J.normalize(i) + (I.isDirectory() ? e.sep : "")), I.isDirectory() ? e.findFilesAsync(i, function(w, E) {
          if (w)
            return t(w);
          n = n.concat(E), --c || t(null, n);
        }) : --c || t(null, n));
      });
    });
  });
};
G.prototype.getAttributes = function() {
};
G.prototype.setAttributes = function() {
};
G.crc32update = function(r, t) {
  return Lt[(r ^ t) & 255] ^ r >>> 8;
};
G.crc32 = function(r) {
  typeof r == "string" && (r = Buffer.from(r, "utf8"));
  let t = r.length, e = -1;
  for (let n = 0; n < t; )
    e = G.crc32update(e, r[n++]);
  return ~e >>> 0;
};
G.methodToString = function(r) {
  switch (r) {
    case lt.STORED:
      return "STORED (" + r + ")";
    case lt.DEFLATED:
      return "DEFLATED (" + r + ")";
    default:
      return "UNSUPPORTED (" + r + ")";
  }
};
G.canonical = function(r) {
  if (!r)
    return "";
  const t = J.posix.normalize("/" + r.split("\\").join("/"));
  return J.join(".", t);
};
G.zipnamefix = function(r) {
  if (!r)
    return "";
  const t = J.posix.normalize("/" + r.split("\\").join("/"));
  return J.posix.join(".", t);
};
G.findLast = function(r, t) {
  if (!Array.isArray(r))
    throw new TypeError("arr is not array");
  const e = r.length >>> 0;
  for (let n = e - 1; n >= 0; n--)
    if (t(r[n], n, r))
      return r[n];
};
G.sanitize = function(r, t) {
  r = J.resolve(J.normalize(r));
  for (var e = t.split("/"), n = 0, a = e.length; n < a; n++) {
    var o = J.normalize(J.join(r, e.slice(n, a).join(J.sep)));
    if (o.indexOf(r) === 0)
      return o;
  }
  return J.normalize(J.join(r, J.basename(t)));
};
G.toBuffer = function(t, e) {
  return Buffer.isBuffer(t) ? t : t instanceof Uint8Array ? Buffer.from(t) : typeof t == "string" ? e(t) : Buffer.alloc(0);
};
G.readBigUInt64LE = function(r, t) {
  var e = Buffer.from(r.slice(t, t + 8));
  return e.swap64(), parseInt(`0x${e.toString("hex")}`);
};
G.fromDOS2Date = function(r) {
  return new Date((r >> 25 & 127) + 1980, Math.max((r >> 21 & 15) - 1, 0), Math.max(r >> 16 & 31, 1), r >> 11 & 31, r >> 5 & 63, (r & 31) << 1);
};
G.fromDate2DOS = function(r) {
  let t = 0, e = 0;
  return r.getFullYear() > 1979 && (t = (r.getFullYear() - 1980 & 127) << 9 | r.getMonth() + 1 << 5 | r.getDate(), e = r.getHours() << 11 | r.getMinutes() << 5 | r.getSeconds() >> 1), t << 16 | e;
};
G.isWin = br;
G.crcTable = Lt;
const kr = ne;
var Or = function(r, { fs: t }) {
  var e = r || "", n = o(), a = null;
  function o() {
    return {
      directory: !1,
      readonly: !1,
      hidden: !1,
      executable: !1,
      mtime: 0,
      atime: 0
    };
  }
  return e && t.existsSync(e) ? (a = t.statSync(e), n.directory = a.isDirectory(), n.mtime = a.mtime, n.atime = a.atime, n.executable = (73 & a.mode) !== 0, n.readonly = (128 & a.mode) === 0, n.hidden = kr.basename(e)[0] === ".") : console.warn("Invalid path: " + e), {
    get directory() {
      return n.directory;
    },
    get readOnly() {
      return n.readonly;
    },
    get hidden() {
      return n.hidden;
    },
    get mtime() {
      return n.mtime;
    },
    get atime() {
      return n.atime;
    },
    get executable() {
      return n.executable;
    },
    decodeAttributes: function() {
    },
    encodeAttributes: function() {
    },
    toJSON: function() {
      return {
        path: e,
        isDirectory: n.directory,
        isReadOnly: n.readonly,
        isHidden: n.hidden,
        isExecutable: n.executable,
        mTime: n.mtime,
        aTime: n.atime
      };
    },
    toString: function() {
      return JSON.stringify(this.toJSON(), null, "	");
    }
  };
}, $r = {
  efs: !0,
  encode: (r) => Buffer.from(r, "utf8"),
  decode: (r) => r.toString("utf8")
};
ye.exports = xr;
ye.exports.Constants = Nt;
ye.exports.Errors = Ne;
ye.exports.FileAttr = Or;
ye.exports.decoder = $r;
var Se = ye.exports, Le = {}, le = Se, A = le.Constants, Rr = function() {
  var r = 20, t = 10, e = 0, n = 0, a = 0, o = 0, c = 0, i = 0, l = 0, I = 0, w = 0, E = 0, C = 0, p = 0, g = 0;
  r |= le.isWin ? 2560 : 768, e |= A.FLG_EFS;
  const f = {
    extraLen: 0
  }, m = (s) => Math.max(0, s) >>> 0, u = (s) => Math.max(0, s) & 255;
  return a = le.fromDate2DOS(/* @__PURE__ */ new Date()), {
    get made() {
      return r;
    },
    set made(s) {
      r = s;
    },
    get version() {
      return t;
    },
    set version(s) {
      t = s;
    },
    get flags() {
      return e;
    },
    set flags(s) {
      e = s;
    },
    get flags_efs() {
      return (e & A.FLG_EFS) > 0;
    },
    set flags_efs(s) {
      s ? e |= A.FLG_EFS : e &= ~A.FLG_EFS;
    },
    get flags_desc() {
      return (e & A.FLG_DESC) > 0;
    },
    set flags_desc(s) {
      s ? e |= A.FLG_DESC : e &= ~A.FLG_DESC;
    },
    get method() {
      return n;
    },
    set method(s) {
      switch (s) {
        case A.STORED:
          this.version = 10;
        case A.DEFLATED:
        default:
          this.version = 20;
      }
      n = s;
    },
    get time() {
      return le.fromDOS2Date(this.timeval);
    },
    set time(s) {
      this.timeval = le.fromDate2DOS(s);
    },
    get timeval() {
      return a;
    },
    set timeval(s) {
      a = m(s);
    },
    get timeHighByte() {
      return u(a >>> 8);
    },
    get crc() {
      return o;
    },
    set crc(s) {
      o = m(s);
    },
    get compressedSize() {
      return c;
    },
    set compressedSize(s) {
      c = m(s);
    },
    get size() {
      return i;
    },
    set size(s) {
      i = m(s);
    },
    get fileNameLength() {
      return l;
    },
    set fileNameLength(s) {
      l = s;
    },
    get extraLength() {
      return I;
    },
    set extraLength(s) {
      I = s;
    },
    get extraLocalLength() {
      return f.extraLen;
    },
    set extraLocalLength(s) {
      f.extraLen = s;
    },
    get commentLength() {
      return w;
    },
    set commentLength(s) {
      w = s;
    },
    get diskNumStart() {
      return E;
    },
    set diskNumStart(s) {
      E = m(s);
    },
    get inAttr() {
      return C;
    },
    set inAttr(s) {
      C = m(s);
    },
    get attr() {
      return p;
    },
    set attr(s) {
      p = m(s);
    },
    // get Unix file permissions
    get fileAttr() {
      return (p || 0) >> 16 & 4095;
    },
    get offset() {
      return g;
    },
    set offset(s) {
      g = m(s);
    },
    get encrypted() {
      return (e & A.FLG_ENC) === A.FLG_ENC;
    },
    get centralHeaderSize() {
      return A.CENHDR + l + I + w;
    },
    get realDataOffset() {
      return g + A.LOCHDR + f.fnameLen + f.extraLen;
    },
    get localHeader() {
      return f;
    },
    loadLocalHeaderFromBinary: function(s) {
      var d = s.slice(g, g + A.LOCHDR);
      if (d.readUInt32LE(0) !== A.LOCSIG)
        throw le.Errors.INVALID_LOC();
      f.version = d.readUInt16LE(A.LOCVER), f.flags = d.readUInt16LE(A.LOCFLG), f.method = d.readUInt16LE(A.LOCHOW), f.time = d.readUInt32LE(A.LOCTIM), f.crc = d.readUInt32LE(A.LOCCRC), f.compressedSize = d.readUInt32LE(A.LOCSIZ), f.size = d.readUInt32LE(A.LOCLEN), f.fnameLen = d.readUInt16LE(A.LOCNAM), f.extraLen = d.readUInt16LE(A.LOCEXT);
      const y = g + A.LOCHDR + f.fnameLen, v = y + f.extraLen;
      return s.slice(y, v);
    },
    loadFromBinary: function(s) {
      if (s.length !== A.CENHDR || s.readUInt32LE(0) !== A.CENSIG)
        throw le.Errors.INVALID_CEN();
      r = s.readUInt16LE(A.CENVEM), t = s.readUInt16LE(A.CENVER), e = s.readUInt16LE(A.CENFLG), n = s.readUInt16LE(A.CENHOW), a = s.readUInt32LE(A.CENTIM), o = s.readUInt32LE(A.CENCRC), c = s.readUInt32LE(A.CENSIZ), i = s.readUInt32LE(A.CENLEN), l = s.readUInt16LE(A.CENNAM), I = s.readUInt16LE(A.CENEXT), w = s.readUInt16LE(A.CENCOM), E = s.readUInt16LE(A.CENDSK), C = s.readUInt16LE(A.CENATT), p = s.readUInt32LE(A.CENATX), g = s.readUInt32LE(A.CENOFF);
    },
    localHeaderToBinary: function() {
      var s = Buffer.alloc(A.LOCHDR);
      return s.writeUInt32LE(A.LOCSIG, 0), s.writeUInt16LE(t, A.LOCVER), s.writeUInt16LE(e, A.LOCFLG), s.writeUInt16LE(n, A.LOCHOW), s.writeUInt32LE(a, A.LOCTIM), s.writeUInt32LE(o, A.LOCCRC), s.writeUInt32LE(c, A.LOCSIZ), s.writeUInt32LE(i, A.LOCLEN), s.writeUInt16LE(l, A.LOCNAM), s.writeUInt16LE(f.extraLen, A.LOCEXT), s;
    },
    centralHeaderToBinary: function() {
      var s = Buffer.alloc(A.CENHDR + l + I + w);
      return s.writeUInt32LE(A.CENSIG, 0), s.writeUInt16LE(r, A.CENVEM), s.writeUInt16LE(t, A.CENVER), s.writeUInt16LE(e, A.CENFLG), s.writeUInt16LE(n, A.CENHOW), s.writeUInt32LE(a, A.CENTIM), s.writeUInt32LE(o, A.CENCRC), s.writeUInt32LE(c, A.CENSIZ), s.writeUInt32LE(i, A.CENLEN), s.writeUInt16LE(l, A.CENNAM), s.writeUInt16LE(I, A.CENEXT), s.writeUInt16LE(w, A.CENCOM), s.writeUInt16LE(E, A.CENDSK), s.writeUInt16LE(C, A.CENATT), s.writeUInt32LE(p, A.CENATX), s.writeUInt32LE(g, A.CENOFF), s;
    },
    toJSON: function() {
      const s = function(d) {
        return d + " bytes";
      };
      return {
        made: r,
        version: t,
        flags: e,
        method: le.methodToString(n),
        time: this.time,
        crc: "0x" + o.toString(16).toUpperCase(),
        compressedSize: s(c),
        size: s(i),
        fileNameLength: s(l),
        extraLength: s(I),
        commentLength: s(w),
        diskNumStart: E,
        inAttr: C,
        attr: p,
        offset: g,
        centralHeaderSize: s(A.CENHDR + l + I + w)
      };
    },
    toString: function() {
      return JSON.stringify(this.toJSON(), null, "	");
    }
  };
}, he = Se, H = he.Constants, Fr = function() {
  var r = 0, t = 0, e = 0, n = 0, a = 0;
  return {
    get diskEntries() {
      return r;
    },
    set diskEntries(o) {
      r = t = o;
    },
    get totalEntries() {
      return t;
    },
    set totalEntries(o) {
      t = r = o;
    },
    get size() {
      return e;
    },
    set size(o) {
      e = o;
    },
    get offset() {
      return n;
    },
    set offset(o) {
      n = o;
    },
    get commentLength() {
      return a;
    },
    set commentLength(o) {
      a = o;
    },
    get mainHeaderSize() {
      return H.ENDHDR + a;
    },
    loadFromBinary: function(o) {
      if ((o.length !== H.ENDHDR || o.readUInt32LE(0) !== H.ENDSIG) && (o.length < H.ZIP64HDR || o.readUInt32LE(0) !== H.ZIP64SIG))
        throw he.Errors.INVALID_END();
      o.readUInt32LE(0) === H.ENDSIG ? (r = o.readUInt16LE(H.ENDSUB), t = o.readUInt16LE(H.ENDTOT), e = o.readUInt32LE(H.ENDSIZ), n = o.readUInt32LE(H.ENDOFF), a = o.readUInt16LE(H.ENDCOM)) : (r = he.readBigUInt64LE(o, H.ZIP64SUB), t = he.readBigUInt64LE(o, H.ZIP64TOT), e = he.readBigUInt64LE(o, H.ZIP64SIZE), n = he.readBigUInt64LE(o, H.ZIP64OFF), a = 0);
    },
    toBinary: function() {
      var o = Buffer.alloc(H.ENDHDR + a);
      return o.writeUInt32LE(H.ENDSIG, 0), o.writeUInt32LE(0, 4), o.writeUInt16LE(r, H.ENDSUB), o.writeUInt16LE(t, H.ENDTOT), o.writeUInt32LE(e, H.ENDSIZ), o.writeUInt32LE(n, H.ENDOFF), o.writeUInt16LE(a, H.ENDCOM), o.fill(" ", H.ENDHDR), o;
    },
    toJSON: function() {
      const o = function(c, i) {
        let l = c.toString(16).toUpperCase();
        for (; l.length < i; )
          l = "0" + l;
        return "0x" + l;
      };
      return {
        diskEntries: r,
        totalEntries: t,
        size: e + " bytes",
        offset: o(n, 4),
        commentLength: a
      };
    },
    toString: function() {
      return JSON.stringify(this.toJSON(), null, "	");
    }
  };
};
Le.EntryHeader = Rr;
Le.MainHeader = Fr;
var Pe = {}, Ur = function(r) {
  var t = It, e = { chunkSize: (parseInt(r.length / 1024) + 1) * 1024 };
  return {
    deflate: function() {
      return t.deflateRawSync(r, e);
    },
    deflateAsync: function(n) {
      var a = t.createDeflateRaw(e), o = [], c = 0;
      a.on("data", function(i) {
        o.push(i), c += i.length;
      }), a.on("end", function() {
        var i = Buffer.alloc(c), l = 0;
        i.fill(0);
        for (var I = 0; I < o.length; I++) {
          var w = o[I];
          w.copy(i, l), l += w.length;
        }
        n && n(i);
      }), a.end(r);
    }
  };
};
const Br = +(process.versions ? process.versions.node : "").split(".")[0] || 0;
var zr = function(r, t) {
  var e = It;
  const n = Br >= 15 && t > 0 ? { maxOutputLength: t } : {};
  return {
    inflate: function() {
      return e.inflateRawSync(r, n);
    },
    inflateAsync: function(a) {
      var o = e.createInflateRaw(n), c = [], i = 0;
      o.on("data", function(l) {
        c.push(l), i += l.length;
      }), o.on("end", function() {
        var l = Buffer.alloc(i), I = 0;
        l.fill(0);
        for (var w = 0; w < c.length; w++) {
          var E = c[w];
          E.copy(l, I), I += E.length;
        }
        a && a(l);
      }), o.end(r);
    }
  };
};
const { randomFillSync: ut } = fe, jr = Ne, Hr = new Uint32Array(256).map((r, t) => {
  for (let e = 0; e < 8; e++)
    t & 1 ? t = t >>> 1 ^ 3988292384 : t >>>= 1;
  return t >>> 0;
}), Pt = (r, t) => Math.imul(r, t) >>> 0, mt = (r, t) => Hr[(r ^ t) & 255] ^ r >>> 8, Ie = () => typeof ut == "function" ? ut(Buffer.alloc(12)) : Ie.node();
Ie.node = () => {
  const r = Buffer.alloc(12), t = r.length;
  for (let e = 0; e < t; e++)
    r[e] = Math.random() * 256 & 255;
  return r;
};
const De = {
  genSalt: Ie
};
function Te(r) {
  const t = Buffer.isBuffer(r) ? r : Buffer.from(r);
  this.keys = new Uint32Array([305419896, 591751049, 878082192]);
  for (let e = 0; e < t.length; e++)
    this.updateKeys(t[e]);
}
Te.prototype.updateKeys = function(r) {
  const t = this.keys;
  return t[0] = mt(t[0], r), t[1] += t[0] & 255, t[1] = Pt(t[1], 134775813) + 1, t[2] = mt(t[2], t[1] >>> 24), r;
};
Te.prototype.next = function() {
  const r = (this.keys[2] | 2) >>> 0;
  return Pt(r, r ^ 1) >> 8 & 255;
};
function qr(r) {
  const t = new Te(r);
  return function(e) {
    const n = Buffer.alloc(e.length);
    let a = 0;
    for (let o of e)
      n[a++] = t.updateKeys(o ^ t.next());
    return n;
  };
}
function Vr(r) {
  const t = new Te(r);
  return function(e, n, a = 0) {
    n || (n = Buffer.alloc(e.length));
    for (let o of e) {
      const c = t.next();
      n[a++] = o ^ c, t.updateKeys(o);
    }
    return n;
  };
}
function Wr(r, t, e) {
  if (!r || !Buffer.isBuffer(r) || r.length < 12)
    return Buffer.alloc(0);
  const n = qr(e), a = n(r.slice(0, 12)), o = (t.flags & 8) === 8 ? t.timeHighByte : t.crc >>> 24;
  if (a[11] !== o)
    throw jr.WRONG_PASSWORD();
  return n(r.slice(12));
}
function Gr(r) {
  Buffer.isBuffer(r) && r.length >= 12 ? De.genSalt = function() {
    return r.slice(0, 12);
  } : r === "node" ? De.genSalt = Ie.node : De.genSalt = Ie;
}
function Zr(r, t, e, n = !1) {
  r == null && (r = Buffer.alloc(0)), Buffer.isBuffer(r) || (r = Buffer.from(r.toString()));
  const a = Vr(e), o = De.genSalt();
  o[11] = t.crc >>> 24 & 255, n && (o[10] = t.crc >>> 16 & 255);
  const c = Buffer.alloc(r.length + 12);
  return a(o, c), a(r, c, 12);
}
var Jr = { decrypt: Wr, encrypt: Zr, _salter: Gr };
Pe.Deflater = Ur;
Pe.Inflater = zr;
Pe.ZipCrypto = Jr;
var U = Se, Kr = Le, V = U.Constants, ze = Pe, Tt = function(r, t) {
  var e = new Kr.EntryHeader(), n = Buffer.alloc(0), a = Buffer.alloc(0), o = !1, c = null, i = Buffer.alloc(0), l = Buffer.alloc(0), I = !0;
  const w = r, E = typeof w.decoder == "object" ? w.decoder : U.decoder;
  I = E.hasOwnProperty("efs") ? E.efs : !1;
  function C() {
    return !t || !(t instanceof Uint8Array) ? Buffer.alloc(0) : (l = e.loadLocalHeaderFromBinary(t), t.slice(e.realDataOffset, e.realDataOffset + e.compressedSize));
  }
  function p(d) {
    if (e.flags_desc) {
      const y = {}, v = e.realDataOffset + e.compressedSize;
      if (t.readUInt32LE(v) == V.LOCSIG || t.readUInt32LE(v) == V.CENSIG)
        throw U.Errors.DESCRIPTOR_NOT_EXIST();
      if (t.readUInt32LE(v) == V.EXTSIG)
        y.crc = t.readUInt32LE(v + V.EXTCRC), y.compressedSize = t.readUInt32LE(v + V.EXTSIZ), y.size = t.readUInt32LE(v + V.EXTLEN);
      else if (t.readUInt16LE(v + 12) === 19280)
        y.crc = t.readUInt32LE(v + V.EXTCRC - 4), y.compressedSize = t.readUInt32LE(v + V.EXTSIZ - 4), y.size = t.readUInt32LE(v + V.EXTLEN - 4);
      else
        throw U.Errors.DESCRIPTOR_UNKNOWN();
      if (y.compressedSize !== e.compressedSize || y.size !== e.size || y.crc !== e.crc)
        throw U.Errors.DESCRIPTOR_FAULTY();
      if (U.crc32(d) !== y.crc)
        return !1;
    } else if (U.crc32(d) !== e.localHeader.crc)
      return !1;
    return !0;
  }
  function g(d, y, v) {
    if (typeof y > "u" && typeof d == "string" && (v = d, d = void 0), o)
      return d && y && y(Buffer.alloc(0), U.Errors.DIRECTORY_CONTENT_ERROR()), Buffer.alloc(0);
    var _ = C();
    if (_.length === 0)
      return d && y && y(_), _;
    if (e.encrypted) {
      if (typeof v != "string" && !Buffer.isBuffer(v))
        throw U.Errors.INVALID_PASS_PARAM();
      _ = ze.ZipCrypto.decrypt(_, e, v);
    }
    var D = Buffer.alloc(e.size);
    switch (e.method) {
      case U.Constants.STORED:
        if (_.copy(D), p(D))
          return d && y && y(D), D;
        throw d && y && y(D, U.Errors.BAD_CRC()), U.Errors.BAD_CRC();
      case U.Constants.DEFLATED:
        var k = new ze.Inflater(_, e.size);
        if (d)
          k.inflateAsync(function(P) {
            P.copy(P, 0), y && (p(P) ? y(P) : y(P, U.Errors.BAD_CRC()));
          });
        else {
          if (k.inflate(D).copy(D, 0), !p(D))
            throw U.Errors.BAD_CRC(`"${E.decode(n)}"`);
          return D;
        }
        break;
      default:
        throw d && y && y(Buffer.alloc(0), U.Errors.UNKNOWN_METHOD()), U.Errors.UNKNOWN_METHOD();
    }
  }
  function f(d, y) {
    if ((!c || !c.length) && Buffer.isBuffer(t))
      return d && y && y(C()), C();
    if (c.length && !o) {
      var v;
      switch (e.method) {
        case U.Constants.STORED:
          return e.compressedSize = e.size, v = Buffer.alloc(c.length), c.copy(v), d && y && y(v), v;
        default:
        case U.Constants.DEFLATED:
          var _ = new ze.Deflater(c);
          if (d)
            _.deflateAsync(function(k) {
              v = Buffer.alloc(k.length), e.compressedSize = k.length, k.copy(v), y && y(v);
            });
          else {
            var D = _.deflate();
            return e.compressedSize = D.length, D;
          }
          _ = null;
          break;
      }
    } else if (d && y)
      y(Buffer.alloc(0));
    else
      return Buffer.alloc(0);
  }
  function m(d, y) {
    return (d.readUInt32LE(y + 4) << 4) + d.readUInt32LE(y);
  }
  function u(d) {
    try {
      for (var y = 0, v, _, D; y + 4 < d.length; )
        v = d.readUInt16LE(y), y += 2, _ = d.readUInt16LE(y), y += 2, D = d.slice(y, y + _), y += _, V.ID_ZIP64 === v && s(D);
    } catch {
      throw U.Errors.EXTRA_FIELD_PARSE_ERROR();
    }
  }
  function s(d) {
    var y, v, _, D;
    d.length >= V.EF_ZIP64_SCOMP && (y = m(d, V.EF_ZIP64_SUNCOMP), e.size === V.EF_ZIP64_OR_32 && (e.size = y)), d.length >= V.EF_ZIP64_RHO && (v = m(d, V.EF_ZIP64_SCOMP), e.compressedSize === V.EF_ZIP64_OR_32 && (e.compressedSize = v)), d.length >= V.EF_ZIP64_DSN && (_ = m(d, V.EF_ZIP64_RHO), e.offset === V.EF_ZIP64_OR_32 && (e.offset = _)), d.length >= V.EF_ZIP64_DSN + 4 && (D = d.readUInt32LE(V.EF_ZIP64_DSN), e.diskNumStart === V.EF_ZIP64_OR_16 && (e.diskNumStart = D));
  }
  return {
    get entryName() {
      return E.decode(n);
    },
    get rawEntryName() {
      return n;
    },
    set entryName(d) {
      n = U.toBuffer(d, E.encode);
      var y = n[n.length - 1];
      o = y === 47 || y === 92, e.fileNameLength = n.length;
    },
    get efs() {
      return typeof I == "function" ? I(this.entryName) : I;
    },
    get extra() {
      return i;
    },
    set extra(d) {
      i = d, e.extraLength = d.length, u(d);
    },
    get comment() {
      return E.decode(a);
    },
    set comment(d) {
      if (a = U.toBuffer(d, E.encode), e.commentLength = a.length, a.length > 65535)
        throw U.Errors.COMMENT_TOO_LONG();
    },
    get name() {
      var d = E.decode(n);
      return o ? d.substr(d.length - 1).split("/").pop() : d.split("/").pop();
    },
    get isDirectory() {
      return o;
    },
    getCompressedData: function() {
      return f(!1, null);
    },
    getCompressedDataAsync: function(d) {
      f(!0, d);
    },
    setData: function(d) {
      c = U.toBuffer(d, U.decoder.encode), !o && c.length ? (e.size = c.length, e.method = U.Constants.DEFLATED, e.crc = U.crc32(d), e.changed = !0) : e.method = U.Constants.STORED;
    },
    getData: function(d) {
      return e.changed ? c : g(!1, null, d);
    },
    getDataAsync: function(d, y) {
      e.changed ? d(c) : g(!0, d, y);
    },
    set attr(d) {
      e.attr = d;
    },
    get attr() {
      return e.attr;
    },
    set header(d) {
      e.loadFromBinary(d);
    },
    get header() {
      return e;
    },
    packCentralHeader: function() {
      e.flags_efs = this.efs, e.extraLength = i.length;
      var d = e.centralHeaderToBinary(), y = U.Constants.CENHDR;
      return n.copy(d, y), y += n.length, i.copy(d, y), y += e.extraLength, a.copy(d, y), d;
    },
    packLocalHeader: function() {
      let d = 0;
      e.flags_efs = this.efs, e.extraLocalLength = l.length;
      const y = e.localHeaderToBinary(), v = Buffer.alloc(y.length + n.length + e.extraLocalLength);
      return y.copy(v, d), d += y.length, n.copy(v, d), d += n.length, l.copy(v, d), d += l.length, v;
    },
    toJSON: function() {
      const d = function(y) {
        return "<" + (y && y.length + " bytes buffer" || "null") + ">";
      };
      return {
        entryName: this.entryName,
        name: this.name,
        comment: this.comment,
        isDirectory: this.isDirectory,
        header: e.toJSON(),
        compressedData: d(t),
        data: d(c)
      };
    },
    toString: function() {
      return JSON.stringify(this.toJSON(), null, "	");
    }
  };
};
const pt = Tt, Xr = Le, Y = Se;
var Yr = function(r, t) {
  var e = [], n = {}, a = Buffer.alloc(0), o = new Xr.MainHeader(), c = !1;
  const i = /* @__PURE__ */ new Set(), l = t, { noSort: I, decoder: w } = l;
  r ? p(l.readEntries) : c = !0;
  function E() {
    const f = /* @__PURE__ */ new Set();
    for (const m of Object.keys(n)) {
      const u = m.split("/");
      if (u.pop(), !!u.length)
        for (let s = 0; s < u.length; s++) {
          const d = u.slice(0, s + 1).join("/") + "/";
          f.add(d);
        }
    }
    for (const m of f)
      if (!(m in n)) {
        const u = new pt(l);
        u.entryName = m, u.attr = 16, u.temporary = !0, e.push(u), n[u.entryName] = u, i.add(u);
      }
  }
  function C() {
    if (c = !0, n = {}, o.diskEntries > (r.length - o.offset) / Y.Constants.CENHDR)
      throw Y.Errors.DISK_ENTRY_TOO_LARGE();
    e = new Array(o.diskEntries);
    for (var f = o.offset, m = 0; m < e.length; m++) {
      var u = f, s = new pt(l, r);
      s.header = r.slice(u, u += Y.Constants.CENHDR), s.entryName = r.slice(u, u += s.header.fileNameLength), s.header.extraLength && (s.extra = r.slice(u, u += s.header.extraLength)), s.header.commentLength && (s.comment = r.slice(u, u + s.header.commentLength)), f += s.header.centralHeaderSize, e[m] = s, n[s.entryName] = s;
    }
    i.clear(), E();
  }
  function p(f) {
    var m = r.length - Y.Constants.ENDHDR, u = Math.max(0, m - 65535), s = u, d = r.length, y = -1, v = 0;
    for ((typeof l.trailingSpace == "boolean" ? l.trailingSpace : !1) && (u = 0), m; m >= s; m--)
      if (r[m] === 80) {
        if (r.readUInt32LE(m) === Y.Constants.ENDSIG) {
          y = m, v = m, d = m + Y.Constants.ENDHDR, s = m - Y.Constants.END64HDR;
          continue;
        }
        if (r.readUInt32LE(m) === Y.Constants.END64SIG) {
          s = u;
          continue;
        }
        if (r.readUInt32LE(m) === Y.Constants.ZIP64SIG) {
          y = m, d = m + Y.readBigUInt64LE(r, m + Y.Constants.ZIP64SIZE) + Y.Constants.ZIP64LEAD;
          break;
        }
      }
    if (y == -1)
      throw Y.Errors.INVALID_FORMAT();
    o.loadFromBinary(r.slice(y, d)), o.commentLength && (a = r.slice(v + Y.Constants.ENDHDR)), f && C();
  }
  function g() {
    e.length > 1 && !I && e.sort((f, m) => f.entryName.toLowerCase().localeCompare(m.entryName.toLowerCase()));
  }
  return {
    /**
     * Returns an array of ZipEntry objects existent in the current opened archive
     * @return Array
     */
    get entries() {
      return c || C(), e.filter((f) => !i.has(f));
    },
    /**
     * Archive comment
     * @return {String}
     */
    get comment() {
      return w.decode(a);
    },
    set comment(f) {
      a = Y.toBuffer(f, w.encode), o.commentLength = a.length;
    },
    getEntryCount: function() {
      return c ? e.length : o.diskEntries;
    },
    forEach: function(f) {
      this.entries.forEach(f);
    },
    /**
     * Returns a reference to the entry with the given name or null if entry is inexistent
     *
     * @param entryName
     * @return ZipEntry
     */
    getEntry: function(f) {
      return c || C(), n[f] || null;
    },
    /**
     * Adds the given entry to the entry list
     *
     * @param entry
     */
    setEntry: function(f) {
      c || C(), e.push(f), n[f.entryName] = f, o.totalEntries = e.length;
    },
    /**
     * Removes the file with the given name from the entry list.
     *
     * If the entry is a directory, then all nested files and directories will be removed
     * @param entryName
     * @returns {void}
     */
    deleteFile: function(f, m = !0) {
      c || C();
      const u = n[f];
      this.getEntryChildren(u, m).map((d) => d.entryName).forEach(this.deleteEntry);
    },
    /**
     * Removes the entry with the given name from the entry list.
     *
     * @param {string} entryName
     * @returns {void}
     */
    deleteEntry: function(f) {
      c || C();
      const m = n[f], u = e.indexOf(m);
      u >= 0 && (e.splice(u, 1), delete n[f], o.totalEntries = e.length);
    },
    /**
     *  Iterates and returns all nested files and directories of the given entry
     *
     * @param entry
     * @return Array
     */
    getEntryChildren: function(f, m = !0) {
      if (c || C(), typeof f == "object")
        if (f.isDirectory && m) {
          const u = [], s = f.entryName;
          for (const d of e)
            d.entryName.startsWith(s) && u.push(d);
          return u;
        } else
          return [f];
      return [];
    },
    /**
     *  How many child elements entry has
     *
     * @param {ZipEntry} entry
     * @return {integer}
     */
    getChildCount: function(f) {
      if (f && f.isDirectory) {
        const m = this.getEntryChildren(f);
        return m.includes(f) ? m.length - 1 : m.length;
      }
      return 0;
    },
    /**
     * Returns the zip file
     *
     * @return Buffer
     */
    compressToBuffer: function() {
      c || C(), g();
      const f = [], m = [];
      let u = 0, s = 0;
      o.size = 0, o.offset = 0;
      let d = 0;
      for (const _ of this.entries) {
        const D = _.getCompressedData();
        _.header.offset = s;
        const k = _.packLocalHeader(), P = k.length + D.length;
        s += P, f.push(k), f.push(D);
        const $ = _.packCentralHeader();
        m.push($), o.size += $.length, u += P + $.length, d++;
      }
      u += o.mainHeaderSize, o.offset = s, o.totalEntries = d, s = 0;
      const y = Buffer.alloc(u);
      for (const _ of f)
        _.copy(y, s), s += _.length;
      for (const _ of m)
        _.copy(y, s), s += _.length;
      const v = o.toBinary();
      return a && a.copy(v, Y.Constants.ENDHDR), v.copy(y, s), r = y, c = !1, y;
    },
    toAsyncBuffer: function(f, m, u, s) {
      try {
        c || C(), g();
        const d = [], y = [];
        let v = 0, _ = 0, D = 0;
        o.size = 0, o.offset = 0;
        const k = function(P) {
          if (P.length > 0) {
            const $ = P.shift(), K = $.entryName + $.extra.toString();
            u && u(K), $.getCompressedDataAsync(function(Q) {
              s && s(K), $.header.offset = _;
              const N = $.packLocalHeader(), Z = N.length + Q.length;
              _ += Z, d.push(N), d.push(Q);
              const X = $.packCentralHeader();
              y.push(X), o.size += X.length, v += Z + X.length, D++, k(P);
            });
          } else {
            v += o.mainHeaderSize, o.offset = _, o.totalEntries = D, _ = 0;
            const $ = Buffer.alloc(v);
            d.forEach(function(Q) {
              Q.copy($, _), _ += Q.length;
            }), y.forEach(function(Q) {
              Q.copy($, _), _ += Q.length;
            });
            const K = o.toBinary();
            a && a.copy(K, Y.Constants.ENDHDR), K.copy($, _), r = $, c = !1, f($);
          }
        };
        k(Array.from(this.entries));
      } catch (d) {
        m(d);
      }
    }
  };
};
const q = Se, W = ne, Qr = Tt, en = Yr, me = (...r) => q.findLast(r, (t) => typeof t == "boolean"), ft = (...r) => q.findLast(r, (t) => typeof t == "string"), tn = (...r) => q.findLast(r, (t) => typeof t == "function"), rn = {
  // option "noSort" : if true it disables files sorting
  noSort: !1,
  // read entries during load (initial loading may be slower)
  readEntries: !1,
  // default method is none
  method: q.Constants.NONE,
  // file system
  fs: null
};
var nn = function(r, t) {
  let e = null;
  const n = Object.assign(/* @__PURE__ */ Object.create(null), rn);
  r && typeof r == "object" && (r instanceof Uint8Array || (Object.assign(n, r), r = n.input ? n.input : void 0, n.input && delete n.input), Buffer.isBuffer(r) && (e = r, n.method = q.Constants.BUFFER, r = void 0)), Object.assign(n, t);
  const a = new q(n);
  if ((typeof n.decoder != "object" || typeof n.decoder.encode != "function" || typeof n.decoder.decode != "function") && (n.decoder = q.decoder), r && typeof r == "string")
    if (a.fs.existsSync(r))
      n.method = q.Constants.FILE, n.filename = r, e = a.fs.readFileSync(r);
    else
      throw q.Errors.INVALID_FILENAME();
  const o = new en(e, n), { canonical: c, sanitize: i, zipnamefix: l } = q;
  function I(p) {
    if (p && o) {
      var g;
      if (typeof p == "string" && (g = o.getEntry(W.posix.normalize(p))), typeof p == "object" && typeof p.entryName < "u" && typeof p.header < "u" && (g = o.getEntry(p.entryName)), g)
        return g;
    }
    return null;
  }
  function w(p) {
    const { join: g, normalize: f, sep: m } = W.posix;
    return g(".", f(m + p.split("\\").join(m) + m));
  }
  function E(p) {
    return p instanceof RegExp ? /* @__PURE__ */ function(g) {
      return function(f) {
        return g.test(f);
      };
    }(p) : typeof p != "function" ? () => !0 : p;
  }
  const C = (p, g) => {
    let f = g.slice(-1);
    return f = f === a.sep ? a.sep : "", W.relative(p, g) + f;
  };
  return {
    /**
     * Extracts the given entry from the archive and returns the content as a Buffer object
     * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
     * @param {Buffer|string} [pass] - password
     * @return Buffer or Null in case of error
     */
    readFile: function(p, g) {
      var f = I(p);
      return f && f.getData(g) || null;
    },
    /**
     * Returns how many child elements has on entry (directories) on files it is always 0
     * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
     * @returns {integer}
     */
    childCount: function(p) {
      const g = I(p);
      if (g)
        return o.getChildCount(g);
    },
    /**
     * Asynchronous readFile
     * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
     * @param {callback} callback
     *
     * @return Buffer or Null in case of error
     */
    readFileAsync: function(p, g) {
      var f = I(p);
      f ? f.getDataAsync(g) : g(null, "getEntry failed for:" + p);
    },
    /**
     * Extracts the given entry from the archive and returns the content as plain text in the given encoding
     * @param {ZipEntry|string} entry - ZipEntry object or String with the full path of the entry
     * @param {string} encoding - Optional. If no encoding is specified utf8 is used
     *
     * @return String
     */
    readAsText: function(p, g) {
      var f = I(p);
      if (f) {
        var m = f.getData();
        if (m && m.length)
          return m.toString(g || "utf8");
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
    readAsTextAsync: function(p, g, f) {
      var m = I(p);
      m ? m.getDataAsync(function(u, s) {
        if (s) {
          g(u, s);
          return;
        }
        u && u.length ? g(u.toString(f || "utf8")) : g("");
      }) : g("");
    },
    /**
     * Remove the entry from the file or the entry and all it's nested directories and files if the given entry is a directory
     *
     * @param {ZipEntry|string} entry
     * @returns {void}
     */
    deleteFile: function(p, g = !0) {
      var f = I(p);
      f && o.deleteFile(f.entryName, g);
    },
    /**
     * Remove the entry from the file or directory without affecting any nested entries
     *
     * @param {ZipEntry|string} entry
     * @returns {void}
     */
    deleteEntry: function(p) {
      var g = I(p);
      g && o.deleteEntry(g.entryName);
    },
    /**
     * Adds a comment to the zip. The zip must be rewritten after adding the comment.
     *
     * @param {string} comment
     */
    addZipComment: function(p) {
      o.comment = p;
    },
    /**
     * Returns the zip comment
     *
     * @return String
     */
    getZipComment: function() {
      return o.comment || "";
    },
    /**
     * Adds a comment to a specified zipEntry. The zip must be rewritten after adding the comment
     * The comment cannot exceed 65535 characters in length
     *
     * @param {ZipEntry} entry
     * @param {string} comment
     */
    addZipEntryComment: function(p, g) {
      var f = I(p);
      f && (f.comment = g);
    },
    /**
     * Returns the comment of the specified entry
     *
     * @param {ZipEntry} entry
     * @return String
     */
    getZipEntryComment: function(p) {
      var g = I(p);
      return g && g.comment || "";
    },
    /**
     * Updates the content of an existing entry inside the archive. The zip must be rewritten after updating the content
     *
     * @param {ZipEntry} entry
     * @param {Buffer} content
     */
    updateFile: function(p, g) {
      var f = I(p);
      f && f.setData(g);
    },
    /**
     * Adds a file from the disk to the archive
     *
     * @param {string} localPath File to add to zip
     * @param {string} [zipPath] Optional path inside the zip
     * @param {string} [zipName] Optional name for the file
     * @param {string} [comment] Optional file comment
     */
    addLocalFile: function(p, g, f, m) {
      if (a.fs.existsSync(p)) {
        g = g ? w(g) : "";
        const u = W.win32.basename(W.win32.normalize(p));
        g += f || u;
        const s = a.fs.statSync(p), d = s.isFile() ? a.fs.readFileSync(p) : Buffer.alloc(0);
        s.isDirectory() && (g += a.sep), this.addFile(g, d, m, s);
      } else
        throw q.Errors.FILE_NOT_FOUND(p);
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
    addLocalFileAsync: function(p, g) {
      p = typeof p == "object" ? p : { localPath: p };
      const f = W.resolve(p.localPath), { comment: m } = p;
      let { zipPath: u, zipName: s } = p;
      const d = this;
      a.fs.stat(f, function(y, v) {
        if (y)
          return g(y, !1);
        u = u ? w(u) : "";
        const _ = W.win32.basename(W.win32.normalize(f));
        if (u += s || _, v.isFile())
          a.fs.readFile(f, function(D, k) {
            return D ? g(D, !1) : (d.addFile(u, k, m, v), setImmediate(g, void 0, !0));
          });
        else if (v.isDirectory())
          return u += a.sep, d.addFile(u, Buffer.alloc(0), m, v), setImmediate(g, void 0, !0);
      });
    },
    /**
     * Adds a local directory and all its nested files and directories to the archive
     *
     * @param {string} localPath - local path to the folder
     * @param {string} [zipPath] - optional path inside zip
     * @param {(RegExp|function)} [filter] - optional RegExp or Function if files match will be included.
     */
    addLocalFolder: function(p, g, f) {
      if (f = E(f), g = g ? w(g) : "", p = W.normalize(p), a.fs.existsSync(p)) {
        const m = a.findFiles(p), u = this;
        if (m.length)
          for (const s of m) {
            const d = W.join(g, C(p, s));
            f(d) && u.addLocalFile(s, W.dirname(d));
          }
      } else
        throw q.Errors.FILE_NOT_FOUND(p);
    },
    /**
     * Asynchronous addLocalFolder
     * @param {string} localPath
     * @param {callback} callback
     * @param {string} [zipPath] optional path inside zip
     * @param {RegExp|function} [filter] optional RegExp or Function if files match will
     *               be included.
     */
    addLocalFolderAsync: function(p, g, f, m) {
      m = E(m), f = f ? w(f) : "", p = W.normalize(p);
      var u = this;
      a.fs.open(p, "r", function(s) {
        if (s && s.code === "ENOENT")
          g(void 0, q.Errors.FILE_NOT_FOUND(p));
        else if (s)
          g(void 0, s);
        else {
          var d = a.findFiles(p), y = -1, v = function() {
            if (y += 1, y < d.length) {
              var _ = d[y], D = C(p, _).split("\\").join("/");
              D = D.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, ""), m(D) ? a.fs.stat(_, function(k, P) {
                k && g(void 0, k), P.isFile() ? a.fs.readFile(_, function($, K) {
                  $ ? g(void 0, $) : (u.addFile(f + D, K, "", P), v());
                }) : (u.addFile(f + D + "/", Buffer.alloc(0), "", P), v());
              }) : process.nextTick(() => {
                v();
              });
            } else
              g(!0, void 0);
          };
          v();
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
    addLocalFolderAsync2: function(p, g) {
      const f = this;
      p = typeof p == "object" ? p : { localPath: p }, localPath = W.resolve(w(p.localPath));
      let { zipPath: m, filter: u, namefix: s } = p;
      u instanceof RegExp ? u = /* @__PURE__ */ function(v) {
        return function(_) {
          return v.test(_);
        };
      }(u) : typeof u != "function" && (u = function() {
        return !0;
      }), m = m ? w(m) : "", s == "latin1" && (s = (v) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "")), typeof s != "function" && (s = (v) => v);
      const d = (v) => W.join(m, s(C(localPath, v))), y = (v) => W.win32.basename(W.win32.normalize(s(v)));
      a.fs.open(localPath, "r", function(v) {
        v && v.code === "ENOENT" ? g(void 0, q.Errors.FILE_NOT_FOUND(localPath)) : v ? g(void 0, v) : a.findFilesAsync(localPath, function(_, D) {
          if (_)
            return g(_);
          D = D.filter((k) => u(d(k))), D.length || g(void 0, !1), setImmediate(
            D.reverse().reduce(function(k, P) {
              return function($, K) {
                if ($ || K === !1)
                  return setImmediate(k, $, !1);
                f.addLocalFileAsync(
                  {
                    localPath: P,
                    zipPath: W.dirname(d(P)),
                    zipName: y(P)
                  },
                  k
                );
              };
            }, g)
          );
        });
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
    addLocalFolderPromise: function(p, g) {
      return new Promise((f, m) => {
        this.addLocalFolderAsync2(Object.assign({ localPath: p }, g), (u, s) => {
          u && m(u), s && f(this);
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
    addFile: function(p, g, f, m) {
      p = l(p);
      let u = I(p);
      const s = u != null;
      s || (u = new Qr(n), u.entryName = p), u.comment = f || "";
      const d = typeof m == "object" && m instanceof a.fs.Stats;
      d && (u.header.time = m.mtime);
      var y = u.isDirectory ? 16 : 0;
      let v = u.isDirectory ? 16384 : 32768;
      return d ? v |= 4095 & m.mode : typeof m == "number" ? v |= 4095 & m : v |= u.isDirectory ? 493 : 420, y = (y | v << 16) >>> 0, u.attr = y, u.setData(g), s || o.setEntry(u), u;
    },
    /**
     * Returns an array of ZipEntry objects representing the files and folders inside the archive
     *
     * @param {string} [password]
     * @returns Array
     */
    getEntries: function(p) {
      return o.password = p, o ? o.entries : [];
    },
    /**
     * Returns a ZipEntry object representing the file or folder specified by ``name``.
     *
     * @param {string} name
     * @return ZipEntry
     */
    getEntry: function(p) {
      return I(p);
    },
    getEntryCount: function() {
      return o.getEntryCount();
    },
    forEach: function(p) {
      return o.forEach(p);
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
    extractEntryTo: function(p, g, f, m, u, s) {
      m = me(!1, m), u = me(!1, u), f = me(!0, f), s = ft(u, s);
      var d = I(p);
      if (!d)
        throw q.Errors.NO_ENTRY();
      var y = c(d.entryName), v = i(g, s && !d.isDirectory ? s : f ? y : W.basename(y));
      if (d.isDirectory) {
        var _ = o.getEntryChildren(d);
        return _.forEach(function(P) {
          if (P.isDirectory)
            return;
          var $ = P.getData();
          if (!$)
            throw q.Errors.CANT_EXTRACT_FILE();
          var K = c(P.entryName), Q = i(g, f ? K : W.basename(K));
          const N = u ? P.header.fileAttr : void 0;
          a.writeFileTo(Q, $, m, N);
        }), !0;
      }
      var D = d.getData(o.password);
      if (!D)
        throw q.Errors.CANT_EXTRACT_FILE();
      if (a.fs.existsSync(v) && !m)
        throw q.Errors.CANT_OVERRIDE();
      const k = u ? p.header.fileAttr : void 0;
      return a.writeFileTo(v, D, m, k), !0;
    },
    /**
     * Test the archive
     * @param {string} [pass]
     */
    test: function(p) {
      if (!o)
        return !1;
      for (var g in o.entries)
        try {
          if (g.isDirectory)
            continue;
          var f = o.entries[g].getData(p);
          if (!f)
            return !1;
        } catch {
          return !1;
        }
      return !0;
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
    extractAllTo: function(p, g, f, m) {
      if (f = me(!1, f), m = ft(f, m), g = me(!1, g), !o)
        throw q.Errors.NO_ZIP();
      o.entries.forEach(function(u) {
        var s = i(p, c(u.entryName));
        if (u.isDirectory) {
          a.makeDir(s);
          return;
        }
        var d = u.getData(m);
        if (!d)
          throw q.Errors.CANT_EXTRACT_FILE();
        const y = f ? u.header.fileAttr : void 0;
        a.writeFileTo(s, d, g, y);
        try {
          a.fs.utimesSync(s, u.header.time, u.header.time);
        } catch {
          throw q.Errors.CANT_EXTRACT_FILE();
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
    extractAllToAsync: function(p, g, f, m) {
      if (m = tn(g, f, m), f = me(!1, f), g = me(!1, g), !m)
        return new Promise((v, _) => {
          this.extractAllToAsync(p, g, f, function(D) {
            D ? _(D) : v(this);
          });
        });
      if (!o) {
        m(q.Errors.NO_ZIP());
        return;
      }
      p = W.resolve(p);
      const u = (v) => i(p, W.normalize(c(v.entryName))), s = (v, _) => new Error(v + ': "' + _ + '"'), d = [], y = [];
      o.entries.forEach((v) => {
        v.isDirectory ? d.push(v) : y.push(v);
      });
      for (const v of d) {
        const _ = u(v), D = f ? v.header.fileAttr : void 0;
        try {
          a.makeDir(_), D && a.fs.chmodSync(_, D), a.fs.utimesSync(_, v.header.time, v.header.time);
        } catch {
          m(s("Unable to create folder", _));
        }
      }
      y.reverse().reduce(function(v, _) {
        return function(D) {
          if (D)
            v(D);
          else {
            const k = W.normalize(c(_.entryName)), P = i(p, k);
            _.getDataAsync(function($, K) {
              if (K)
                v(K);
              else if (!$)
                v(q.Errors.CANT_EXTRACT_FILE());
              else {
                const Q = f ? _.header.fileAttr : void 0;
                a.writeFileToAsync(P, $, g, Q, function(N) {
                  N || v(s("Unable to write file", P)), a.fs.utimes(P, _.header.time, _.header.time, function(Z) {
                    Z ? v(s("Unable to set times", P)) : v();
                  });
                });
              }
            });
          }
        };
      }, m)();
    },
    /**
     * Writes the newly created zip file to disk at the specified location or if a zip was opened and no ``targetFileName`` is provided, it will overwrite the opened zip
     *
     * @param {string} targetFileName
     * @param {function} callback
     */
    writeZip: function(p, g) {
      if (arguments.length === 1 && typeof p == "function" && (g = p, p = ""), !p && n.filename && (p = n.filename), !!p) {
        var f = o.compressToBuffer();
        if (f) {
          var m = a.writeFileTo(p, f, !0);
          typeof g == "function" && g(m ? null : new Error("failed"), "");
        }
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
    writeZipPromise: function(p, g) {
      const { overwrite: f, perm: m } = Object.assign({ overwrite: !0 }, g);
      return new Promise((u, s) => {
        !p && n.filename && (p = n.filename), p || s("ADM-ZIP: ZIP File Name Missing"), this.toBufferPromise().then((d) => {
          const y = (v) => v ? u(v) : s("ADM-ZIP: Wasn't able to write zip file");
          a.writeFileToAsync(p, d, f, m, y);
        }, s);
      });
    },
    /**
     * @returns {Promise<Buffer>} A promise to the Buffer.
     */
    toBufferPromise: function() {
      return new Promise((p, g) => {
        o.toAsyncBuffer(p, g);
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
    toBuffer: function(p, g, f, m) {
      return typeof p == "function" ? (o.toAsyncBuffer(p, g, f, m), null) : o.compressToBuffer();
    }
  };
};
const ht = /* @__PURE__ */ Pr(nn), He = ne.join(b.getPath("userData"), "backups"), se = ne.join(He, "auto");
x.existsSync(He) || x.mkdirSync(He, { recursive: !0 });
x.existsSync(se) || x.mkdirSync(se, { recursive: !0 });
class an {
  // --- Encryption Helpers ---
  deriveKey(t, e) {
    return fe.pbkdf2Sync(t, e, 1e5, 32, "sha256");
  }
  encryptData(t, e) {
    const n = fe.randomBytes(16), a = fe.randomBytes(12), o = this.deriveKey(e, n), c = fe.createCipheriv("aes-256-gcm", o, a), i = Buffer.concat([c.update(t), c.final()]), l = c.getAuthTag();
    return {
      encryptedData: i,
      salt: n.toString("hex"),
      iv: a.toString("hex"),
      authTag: l.toString("hex")
    };
  }
  decryptData(t, e, n) {
    const a = Buffer.from(n.salt, "hex"), o = Buffer.from(n.iv, "hex"), c = Buffer.from(n.authTag, "hex"), i = this.deriveKey(e, a), l = fe.createDecipheriv("aes-256-gcm", i, o);
    return l.setAuthTag(c), Buffer.concat([l.update(t), l.final()]);
  }
  // --- Core Logic ---
  // 1. Export Data
  async exportData(t, e) {
    const [n, a, o, c, i, l] = await Promise.all([
      h.novel.findMany(),
      h.volume.findMany(),
      h.chapter.findMany(),
      h.character.findMany(),
      h.idea.findMany(),
      h.tag.findMany()
    ]), I = { novels: n, volumes: a, chapters: o, characters: c, ideas: i, tags: l }, w = Buffer.from(JSON.stringify(I)), E = new ht(), C = {
      version: 1,
      appVersion: b.getVersion(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      platform: process.platform,
      encrypted: !!e
    };
    if (e) {
      const { encryptedData: p, salt: g, iv: f, authTag: m } = this.encryptData(w, e);
      C.encryption = { algo: "aes-256-gcm", salt: g, iv: f, authTag: m }, E.addFile("data.bin", p);
    } else
      E.addFile("data.json", w);
    if (E.addFile("manifest.json", Buffer.from(JSON.stringify(C, null, 2))), !t) {
      const { filePath: p } = await Ce.showSaveDialog({
        title: "Export Backup",
        defaultPath: `NovelData_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_")}.nebak`,
        filters: [{ name: "Novel Editor Backup", extensions: ["nebak"] }]
      });
      if (!p)
        throw new Error("Export cancelled");
      t = p;
    }
    return E.writeZip(t), t;
  }
  // 2. Import Data (Restore)
  async importData(t, e) {
    const n = new ht(t), a = n.getEntry("manifest.json");
    if (!a)
      throw new Error("Invalid backup file: manifest.json missing");
    const o = JSON.parse(a.getData().toString("utf8"));
    let c;
    if (o.encrypted) {
      if (!e)
        throw new Error("PASSWORD_REQUIRED");
      const i = n.getEntry("data.bin");
      if (!i)
        throw new Error("Invalid backup file: data.bin missing");
      if (!o.encryption)
        throw new Error("Invalid backup file: encryption metadata missing");
      try {
        const l = this.decryptData(i.getData(), e, o.encryption);
        c = JSON.parse(l.toString("utf8"));
      } catch {
        throw new Error("PASSWORD_INVALID");
      }
    } else {
      const i = n.getEntry("data.json");
      if (!i)
        throw new Error("Invalid backup file: data.json missing");
      c = JSON.parse(i.getData().toString("utf8"));
    }
    await this.performRestore(c);
  }
  // Helper: Perform Restore (Transactional)
  async performRestore(t) {
    await this.createAutoBackup(), await h.$transaction(async (e) => {
      var n, a, o, c, i, l;
      if (await e.tag.deleteMany(), await e.idea.deleteMany(), await e.character.deleteMany(), await e.chapter.deleteMany(), await e.volume.deleteMany(), await e.novel.deleteMany(), (n = t.novels) != null && n.length)
        for (const I of t.novels)
          await e.novel.create({ data: I });
      if ((a = t.volumes) != null && a.length)
        for (const I of t.volumes)
          await e.volume.create({ data: I });
      if ((o = t.chapters) != null && o.length)
        for (const I of t.chapters)
          await e.chapter.create({ data: I });
      if ((c = t.characters) != null && c.length)
        for (const I of t.characters)
          await e.character.create({ data: I });
      if ((i = t.ideas) != null && i.length)
        for (const I of t.ideas)
          await e.idea.create({ data: I });
      if ((l = t.tags) != null && l.length)
        for (const I of t.tags)
          await e.tag.create({ data: I });
    }, {
      maxWait: 1e4,
      timeout: 2e4
    });
  }
  // 3. Auto Backup Logic
  async createAutoBackup() {
    try {
      const e = `auto_backup_${Date.now()}.nebak`, n = ne.join(se, e);
      await this.exportData(n), console.log("[BackupService] Auto-backup created:", e), await this.rotateAutoBackups();
    } catch (t) {
      console.error("[BackupService] Failed to create auto-backup:", t);
    }
  }
  async rotateAutoBackups() {
    const e = x.readdirSync(se).filter((n) => n.endsWith(".nebak")).map((n) => ({
      name: n,
      time: x.statSync(ne.join(se, n)).mtime.getTime()
    })).sort((n, a) => a.time - n.time).slice(3);
    for (const n of e)
      x.unlinkSync(ne.join(se, n.name)), console.log("[BackupService] Rotated auto-backup:", n.name);
  }
  // 4. List Auto Backups
  async getAutoBackups() {
    return x.readdirSync(se).filter((t) => t.endsWith(".nebak")).map((t) => {
      const e = x.statSync(ne.join(se, t));
      return {
        filename: t,
        createdAt: e.mtime.getTime(),
        size: e.size
      };
    }).sort((t, e) => e.createdAt - t.createdAt);
  }
  // 5. Restore from Auto Backup
  async restoreAutoBackup(t) {
    const e = ne.join(se, t);
    if (!x.existsSync(e))
      throw new Error("Backup file not found");
    await this.importData(e);
  }
}
const Me = new an(), ve = L.dirname(jt(import.meta.url));
process.env.APP_ROOT = L.join(ve, "..");
const qe = process.env.VITE_DEV_SERVER_URL, An = L.join(process.env.APP_ROOT, "dist-electron"), Mt = L.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = qe ? L.join(process.env.APP_ROOT, "public") : Mt;
process.on("uncaughtException", (r) => {
  ie("Main.uncaughtException", r), console.error("[Main] Uncaught Exception:", r), b.quit(), process.exit(1);
});
process.on("unhandledRejection", (r, t) => {
  ie("Main.unhandledRejection", r, { promise: String(t) }), console.error("[Main] Unhandled Rejection at:", t, "reason:", r), b.quit(), process.exit(1);
});
let T, gt = !1;
const bt = "云梦小说编辑器", on = "Novel Editor Dev";
function sn() {
  const r = b.getPath("appData");
  return b.isPackaged ? L.join(r, bt) : L.join(r, "@novel-editor", "desktop-dev");
}
function cn(r) {
  const t = r.indexOf("--ai-diag");
  if (t < 0)
    return {};
  const e = r.slice(t + 1);
  if (e.length === 0)
    return { error: "Missing diagnostic action. Use: --ai-diag smoke <mcp|skill> [--json] [--db <path>] [--user-data <path>] or --ai-diag coverage [--json] [--db <path>] [--user-data <path>]" };
  const n = [];
  let a = !1, o, c;
  for (let I = 0; I < e.length; I += 1) {
    const w = e[I];
    if (w === "--json") {
      a = !0;
      continue;
    }
    if (w === "--db") {
      const E = e[I + 1];
      if (!E)
        return { error: "Missing value for --db" };
      o = E, I += 1;
      continue;
    }
    if (w === "--user-data") {
      const E = e[I + 1];
      if (!E)
        return { error: "Missing value for --user-data" };
      c = E, I += 1;
      continue;
    }
    if (w.startsWith("--"))
      return { error: `Unknown option: ${w}` };
    n.push(w);
  }
  const [i, l] = n;
  return i === "coverage" ? { command: { action: "coverage", json: a, dbPath: o, userDataPath: c } } : i === "smoke" ? l !== "mcp" && l !== "skill" ? { error: "Smoke mode requires kind: mcp | skill" } : { command: { action: "smoke", kind: l, json: a, dbPath: o, userDataPath: c } } : { error: `Unknown diagnostic action: ${i}` };
}
function ln(r, t) {
  if (t.action === "coverage") {
    const a = r;
    return [
      `[AI-Diag] Coverage ${a.overallCoverage}% (${a.totalSupported}/${a.totalRequired})`,
      ...a.modules.map((c) => {
        const i = c.missingActions.length ? ` missing=[${c.missingActions.join(", ")}]` : "";
        return `- ${c.title}: ${c.coverage}% (${c.supportedActions.length}/${c.requiredActions.length})${i}`;
      })
    ].join(`
`);
  }
  const e = r;
  return [
    `[AI-Diag] Smoke ${e.kind.toUpperCase()} ${e.ok ? "PASSED" : "FAILED"}`,
    `detail: ${e.detail}`,
    e.missingActions.length ? `missingActions: ${e.missingActions.join(", ")}` : "missingActions: none",
    ...e.checks.map((a) => `- [${a.skipped ? "SKIPPED" : a.ok ? "OK" : "FAILED"}] ${a.actionId}: ${a.detail}`)
  ].join(`
`);
}
async function dn(r, t) {
  const e = t.action === "coverage" ? r.getCapabilityCoverage() : await r.testOpenClawSmoke({ kind: t.kind });
  return t.json ? console.log(JSON.stringify(e, null, 2)) : console.log(ln(e, t)), t.action === "smoke" && !e.ok ? 1 : 0;
}
function yt() {
  if (!We() || gt)
    return;
  gt = !0;
  const r = console.error.bind(console), t = console.warn.bind(console);
  console.error = (...e) => {
    M("ERROR", "console.error", "console.error called", { args: oe(e) }), r(...e);
  }, console.warn = (...e) => {
    M("WARN", "console.warn", "console.warn called", { args: oe(e) }), t(...e);
  };
}
function F(r, t, e) {
  const n = te(e);
  ie(`Main.${r}`, e, {
    payload: oe(t),
    normalizedError: n,
    displayMessage: ge(n.code, n.message)
  });
}
const re = cn(process.argv);
async function xt(r) {
  const t = r == null ? void 0 : r.proxy;
  if (!t || !_e.defaultSession)
    return;
  const e = () => {
    delete process.env.HTTP_PROXY, delete process.env.http_proxy, delete process.env.HTTPS_PROXY, delete process.env.https_proxy, delete process.env.ALL_PROXY, delete process.env.all_proxy, delete process.env.NO_PROXY, delete process.env.no_proxy;
  }, n = () => {
    t.httpProxy && (process.env.HTTP_PROXY = t.httpProxy, process.env.http_proxy = t.httpProxy), t.httpsProxy && (process.env.HTTPS_PROXY = t.httpsProxy, process.env.https_proxy = t.httpsProxy), t.allProxy && (process.env.ALL_PROXY = t.allProxy, process.env.all_proxy = t.allProxy), t.noProxy && (process.env.NO_PROXY = t.noProxy, process.env.no_proxy = t.noProxy);
  };
  if (t.mode === "off") {
    await _e.defaultSession.setProxy({ mode: "direct" }), e();
    return;
  }
  if (t.mode === "custom") {
    const a = [t.allProxy, t.httpsProxy, t.httpProxy].filter((o) => !!o).join(";");
    await _e.defaultSession.setProxy({
      mode: a ? "fixed_servers" : "direct",
      proxyRules: a,
      proxyBypassRules: t.noProxy || ""
    }), e(), n();
    return;
  }
  await _e.defaultSession.setProxy({ mode: "system" }), e();
}
function kt() {
  T = new wt({
    width: 1200,
    height: 800,
    icon: L.join(process.env.VITE_PUBLIC || "", "electron-vite.svg"),
    webPreferences: {
      preload: L.join(ve, "preload.mjs")
    },
    // Win11 style & White Screen Fix
    frame: !0,
    titleBarStyle: "default",
    backgroundColor: "#0a0a0f",
    // Match App Theme
    show: !1,
    // Wait for ready-to-show
    autoHideMenuBar: !0
    // Hide default menu bar
  }), T.once("ready-to-show", () => {
    T == null || T.show();
  }), T.webContents.on("did-finish-load", () => {
    T == null || T.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), T.webContents.on("before-input-event", (r, t) => {
    t.key === "F11" && (T == null || T.setFullScreen(!T.isFullScreen()), r.preventDefault()), (t.key === "F12" || t.control && t.shift && t.key.toLowerCase() === "i") && (T != null && T.webContents.isDevToolsOpened() ? T.webContents.closeDevTools() : T == null || T.webContents.openDevTools(), r.preventDefault());
  }), qe ? T.loadURL(qe) : T.loadFile(L.join(Mt, "index.html")), T.on("enter-full-screen", () => {
    T == null || T.webContents.send("app:fullscreen-change", !0);
  }), T.on("leave-full-screen", () => {
    T == null || T.webContents.send("app:fullscreen-change", !1);
  });
}
S.handle("app:toggle-fullscreen", () => {
  if (T) {
    const r = T.isFullScreen();
    return T.setFullScreen(!r), !r;
  }
  return !1;
});
S.handle("app:get-user-data-path", () => b.getPath("userData"));
S.handle("db:get-novels", async () => {
  console.log("[Main] Received db:get-novels");
  try {
    return (await h.novel.findMany({
      include: {
        volumes: {
          select: {
            chapters: { select: { wordCount: !0 } }
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    })).map((t) => {
      const e = t.volumes.reduce(
        (o, c) => o + c.chapters.reduce((i, l) => i + l.wordCount, 0),
        0
      ), { volumes: n, ...a } = t;
      return {
        ...a,
        wordCount: e
      };
    });
  } catch (r) {
    throw console.error("[Main] db:get-novels failed:", r), r;
  }
});
S.handle("db:update-novel", async (r, { id: t, data: e }) => {
  console.log("[Main] Updating novel:", t, e);
  try {
    return await h.novel.update({
      where: { id: t },
      data: {
        ...e,
        updatedAt: /* @__PURE__ */ new Date()
      }
    });
  } catch (n) {
    throw console.error("[Main] db:update-novel failed:", n), n;
  }
});
S.handle("db:upload-novel-cover", async (r, t) => {
  var e;
  try {
    const n = await Ce.showOpenDialog(T, {
      title: "Select Cover Image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
      properties: ["openFile"]
    });
    if (n.canceled || n.filePaths.length === 0)
      return null;
    const a = n.filePaths[0], o = L.extname(a), c = L.join(b.getPath("userData"), "covers");
    x.existsSync(c) || x.mkdirSync(c, { recursive: !0 });
    const i = await h.novel.findUnique({ where: { id: t }, select: { coverUrl: !0 } });
    if ((e = i == null ? void 0 : i.coverUrl) != null && e.startsWith("covers/")) {
      const E = L.join(b.getPath("userData"), i.coverUrl);
      x.existsSync(E) && x.unlinkSync(E);
    }
    const l = `${t}${o}`, I = L.join(c, l);
    x.copyFileSync(a, I);
    const w = `covers/${l}`;
    return await h.novel.update({
      where: { id: t },
      data: { coverUrl: w }
    }), { path: w };
  } catch (n) {
    throw console.error("[Main] db:upload-novel-cover failed:", n), n;
  }
});
S.handle("db:get-volumes", async (r, t) => {
  try {
    return await h.volume.findMany({
      where: { novelId: t },
      include: {
        chapters: { orderBy: { order: "asc" } }
      },
      orderBy: { order: "asc" }
    });
  } catch (e) {
    throw console.error("[Main] db:get-volumes failed:", e), e;
  }
});
S.handle("db:create-volume", async (r, { novelId: t, title: e }) => {
  try {
    const n = await h.volume.findFirst({
      where: { novelId: t },
      orderBy: { order: "desc" }
    }), a = ((n == null ? void 0 : n.order) || 0) + 1;
    return await h.volume.create({
      data: { novelId: t, title: e, order: a }
    });
  } catch (n) {
    throw console.error("[Main] db:create-volume failed:", n), n;
  }
});
S.handle("db:create-chapter", async (r, { volumeId: t, title: e, order: n }) => {
  try {
    const a = await h.chapter.create({
      data: {
        volumeId: t,
        title: e,
        order: n,
        content: "",
        wordCount: 0
      },
      include: { volume: { select: { novelId: !0 } } }
    });
    return await Ee({ ...a, novelId: a.volume.novelId }), a;
  } catch (a) {
    throw console.error("[Main] db:create-chapter failed:", a), a;
  }
});
S.handle("db:get-chapter", async (r, t) => {
  try {
    return await h.chapter.findUnique({
      where: { id: t },
      include: { volume: { select: { novelId: !0 } } }
    });
  } catch (e) {
    throw console.error("[Main] db:get-chapter failed:", e), e;
  }
});
S.handle("db:rename-volume", async (r, { volumeId: t, title: e }) => {
  try {
    const n = await h.volume.update({
      where: { id: t },
      data: { title: e }
    }), a = await h.chapter.findMany({
      where: { volumeId: t },
      include: { volume: { select: { novelId: !0, title: !0, order: !0 } } }
    });
    for (const o of a)
      await Ee({
        ...o,
        novelId: o.volume.novelId,
        volumeTitle: o.volume.title,
        volumeOrder: o.volume.order
      });
    return n;
  } catch (n) {
    throw console.error("[Main] db:rename-volume failed:", n), n;
  }
});
S.handle("db:rename-chapter", async (r, { chapterId: t, title: e }) => {
  try {
    const n = await h.chapter.update({
      where: { id: t },
      data: { title: e }
    }), a = await h.chapter.findUnique({
      where: { id: t },
      select: { id: !0, title: !0, content: !0, volumeId: !0, order: !0, volume: { select: { novelId: !0 } } }
    });
    return a && a.volume && await Ee({ ...a, novelId: a.volume.novelId }), n;
  } catch (n) {
    throw console.error("[Main] db:rename-chapter failed:", n), n;
  }
});
S.handle("db:create-novel", async (r, t) => {
  console.log("[Main] Received db:create-novel:", t);
  try {
    return await h.novel.create({
      data: {
        title: t,
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
  } catch (e) {
    throw console.error("[Main] db:create-novel failed:", e), e;
  }
});
S.handle("db:save-chapter", async (r, { chapterId: t, content: e }) => {
  try {
    console.log("[Main] Saving chapter:", t);
    const n = await h.chapter.findUnique({
      where: { id: t },
      select: {
        wordCount: !0,
        volume: { select: { novelId: !0 } }
      }
    });
    if (!n || !n.volume)
      throw new Error("Chapter or Volume not found");
    const a = n.volume.novelId, o = e.length, c = o - n.wordCount, [, i] = await h.$transaction([
      // 1. Update Novel WordCount
      h.novel.update({
        where: { id: a },
        data: {
          wordCount: { increment: c },
          updatedAt: /* @__PURE__ */ new Date()
        }
      }),
      // 2. Update Chapter
      h.chapter.update({
        where: { id: t },
        data: {
          content: e,
          wordCount: o,
          updatedAt: /* @__PURE__ */ new Date()
        }
      })
    ]), l = await h.chapter.findUnique({
      where: { id: t },
      select: { id: !0, title: !0, content: !0, volumeId: !0, order: !0 }
    });
    return l && await Ee({ ...l, novelId: a }), Ge(t), i;
  } catch (n) {
    throw console.error("[Main] db:save-chapter failed:", n), n;
  }
});
S.handle("db:create-idea", async (r, t) => {
  try {
    const { timestamp: e, tags: n, ...a } = t, o = a.novelId, c = await h.idea.create({
      data: {
        ...a,
        tags: {
          connectOrCreate: (n || []).map((l) => ({
            where: { name_novelId: { name: l, novelId: o } },
            create: { name: l, novelId: o }
          }))
        }
      },
      include: { tags: !0 }
    }), i = {
      ...c,
      tags: c.tags.map((l) => l.name),
      timestamp: c.createdAt.getTime()
    };
    return await Ve({
      id: c.id,
      content: c.content,
      quote: c.quote,
      novelId: c.novelId,
      chapterId: c.chapterId
    }), i;
  } catch (e) {
    throw console.error("[Main] db:create-idea failed:", e), e;
  }
});
S.handle("db:get-ideas", async (r, t) => {
  try {
    return (await h.idea.findMany({
      where: { novelId: t },
      include: { tags: !0 },
      orderBy: [
        { isStarred: "desc" },
        { updatedAt: "desc" }
      ]
    })).map((n) => ({
      ...n,
      tags: n.tags.map((a) => a.name),
      timestamp: n.createdAt.getTime()
    }));
  } catch (e) {
    throw console.error("[Main] db:get-ideas failed:", e), e;
  }
});
S.handle("db:update-idea", async (r, t, e) => {
  try {
    const { timestamp: n, tags: a, ...o } = e, c = { ...o };
    if (a !== void 0) {
      const I = await h.idea.findUnique({ where: { id: t }, select: { novelId: !0 } });
      if (I) {
        const w = I.novelId;
        c.tags = {
          set: [],
          // Disconnect all existing
          connectOrCreate: (a || []).map((E) => ({
            where: { name_novelId: { name: E, novelId: w } },
            create: { name: E, novelId: w }
          }))
        };
      }
    }
    const i = await h.idea.update({
      where: { id: t },
      data: {
        ...c,
        updatedAt: /* @__PURE__ */ new Date()
      },
      include: { tags: !0 }
    }), l = {
      ...i,
      tags: i.tags.map((I) => I.name),
      timestamp: i.createdAt.getTime()
    };
    return await Ve({
      id: i.id,
      content: i.content,
      quote: i.quote,
      novelId: i.novelId,
      chapterId: i.chapterId
    }), l;
  } catch (n) {
    throw console.error("[Main] db:update-idea failed:", n), n;
  }
});
S.handle("db:delete-idea", async (r, t) => {
  try {
    const e = await h.idea.delete({ where: { id: t } });
    return await Zt("idea", t), e;
  } catch (e) {
    throw console.error("[Main] db:delete-idea failed:", e), e;
  }
});
S.handle("db:check-index-status", async (r, t) => {
  try {
    const e = await Kt(t), n = await h.chapter.count({
      where: { volume: { novelId: t } }
    }), a = await h.idea.count({
      where: { novelId: t }
    });
    return {
      indexedChapters: e.chapters,
      totalChapters: n,
      indexedIdeas: e.ideas,
      totalIdeas: a
    };
  } catch (e) {
    throw console.error("[Main] db:check-index-status failed:", e), e;
  }
});
const Ot = new Lr();
let R;
S.handle("ai:get-settings", async () => {
  try {
    return R.getSettings();
  } catch (r) {
    throw F("ai:get-settings", void 0, r), console.error("[Main] ai:get-settings failed:", r), r;
  }
});
S.handle("ai:get-map-image-stats", async () => {
  try {
    return R.getMapImageStats();
  } catch (r) {
    throw F("ai:get-map-image-stats", void 0, r), console.error("[Main] ai:get-map-image-stats failed:", r), r;
  }
});
S.handle("ai:list-actions", async () => {
  try {
    return R.listActions();
  } catch (r) {
    throw F("ai:list-actions", void 0, r), console.error("[Main] ai:list-actions failed:", r), r;
  }
});
S.handle("ai:get-capability-coverage", async () => {
  try {
    return R.getCapabilityCoverage();
  } catch (r) {
    throw F("ai:get-capability-coverage", void 0, r), console.error("[Main] ai:get-capability-coverage failed:", r), r;
  }
});
S.handle("ai:get-mcp-manifest", async () => {
  try {
    return R.getMcpToolsManifest();
  } catch (r) {
    throw F("ai:get-mcp-manifest", void 0, r), console.error("[Main] ai:get-mcp-manifest failed:", r), r;
  }
});
S.handle("ai:get-openclaw-manifest", async () => {
  try {
    return R.getOpenClawManifest();
  } catch (r) {
    throw F("ai:get-openclaw-manifest", void 0, r), console.error("[Main] ai:get-openclaw-manifest failed:", r), r;
  }
});
S.handle("ai:get-openclaw-skill-manifest", async () => {
  try {
    return R.getOpenClawSkillManifest();
  } catch (r) {
    throw F("ai:get-openclaw-skill-manifest", void 0, r), console.error("[Main] ai:get-openclaw-skill-manifest failed:", r), r;
  }
});
S.handle("ai:update-settings", async (r, t) => {
  try {
    const e = R.updateSettings(t || {});
    return await xt(e), e;
  } catch (e) {
    throw F("ai:update-settings", t, e), console.error("[Main] ai:update-settings failed:", e), e;
  }
});
S.handle("ai:test-connection", async () => {
  try {
    return await R.testConnection();
  } catch (r) {
    throw F("ai:test-connection", void 0, r), console.error("[Main] ai:test-connection failed:", r), r;
  }
});
S.handle("ai:test-mcp", async () => {
  try {
    return await R.testMcp();
  } catch (r) {
    throw F("ai:test-mcp", void 0, r), console.error("[Main] ai:test-mcp failed:", r), r;
  }
});
S.handle("ai:test-openclaw-mcp", async () => {
  try {
    return await R.testOpenClawMcp();
  } catch (r) {
    throw F("ai:test-openclaw-mcp", void 0, r), console.error("[Main] ai:test-openclaw-mcp failed:", r), r;
  }
});
S.handle("ai:test-openclaw-skill", async () => {
  try {
    return await R.testOpenClawSkill();
  } catch (r) {
    throw F("ai:test-openclaw-skill", void 0, r), console.error("[Main] ai:test-openclaw-skill failed:", r), r;
  }
});
S.handle("ai:test-openclaw-smoke", async (r, t) => {
  try {
    const e = (t == null ? void 0 : t.kind) === "skill" ? "skill" : "mcp";
    return await R.testOpenClawSmoke({ kind: e });
  } catch (e) {
    throw F("ai:test-openclaw-smoke", t, e), console.error("[Main] ai:test-openclaw-smoke failed:", e), e;
  }
});
S.handle("ai:test-proxy", async () => {
  try {
    return await R.testProxy();
  } catch (r) {
    throw F("ai:test-proxy", void 0, r), console.error("[Main] ai:test-proxy failed:", r), r;
  }
});
S.handle("ai:test-generate", async (r, t) => {
  try {
    return await R.testGenerate(t == null ? void 0 : t.prompt);
  } catch (e) {
    throw F("ai:test-generate", t, e), console.error("[Main] ai:test-generate failed:", e), e;
  }
});
S.handle("ai:generate-title", async (r, t) => {
  try {
    return await R.generateTitle(t);
  } catch (e) {
    throw F("ai:generate-title", t, e), console.error("[Main] ai:generate-title failed:", e), e;
  }
});
S.handle("ai:continue-writing", async (r, t) => {
  try {
    return await R.continueWriting(t);
  } catch (e) {
    throw F("ai:continue-writing", t, e), console.error("[Main] ai:continue-writing failed:", e), e;
  }
});
S.handle("ai:preview-continue-prompt", async (r, t) => {
  try {
    return await R.previewContinuePrompt(t);
  } catch (e) {
    throw F("ai:preview-continue-prompt", t, e), console.error("[Main] ai:preview-continue-prompt failed:", e), e;
  }
});
S.handle("ai:check-consistency", async (r, t) => {
  try {
    return await R.checkConsistency(t);
  } catch (e) {
    throw F("ai:check-consistency", t, e), console.error("[Main] ai:check-consistency failed:", e), e;
  }
});
S.handle("ai:generate-creative-assets", async (r, t) => {
  try {
    return await R.generateCreativeAssets(t);
  } catch (e) {
    throw F("ai:generate-creative-assets", t, e), console.error("[Main] ai:generate-creative-assets failed:", e), e;
  }
});
S.handle("ai:preview-creative-assets-prompt", async (r, t) => {
  try {
    return await R.previewCreativeAssetsPrompt(t);
  } catch (e) {
    throw F("ai:preview-creative-assets-prompt", t, e), console.error("[Main] ai:preview-creative-assets-prompt failed:", e), e;
  }
});
S.handle("ai:validate-creative-assets", async (r, t) => {
  try {
    return await R.validateCreativeAssetsDraft(t);
  } catch (e) {
    throw F("ai:validate-creative-assets", t, e), console.error("[Main] ai:validate-creative-assets failed:", e), e;
  }
});
S.handle("ai:confirm-creative-assets", async (r, t) => {
  try {
    return await R.confirmCreativeAssets(t);
  } catch (e) {
    throw F("ai:confirm-creative-assets", t, e), console.error("[Main] ai:confirm-creative-assets failed:", e), e;
  }
});
S.handle("ai:generate-map-image", async (r, t) => {
  try {
    return await R.generateMapImage(t);
  } catch (e) {
    return F("ai:generate-map-image", t, e), console.error("[Main] ai:generate-map-image failed:", e), { ok: !1, code: "UNKNOWN", detail: e instanceof Error ? e.message : String(e) };
  }
});
S.handle("ai:preview-map-prompt", async (r, t) => {
  try {
    return await R.previewMapPrompt(t);
  } catch (e) {
    throw F("ai:preview-map-prompt", t, e), console.error("[Main] ai:preview-map-prompt failed:", e), e;
  }
});
S.handle("ai:rebuild-chapter-summary", async (r, t) => {
  try {
    return t != null && t.chapterId ? (Ge(t.chapterId, "manual"), { ok: !0, detail: "summary rebuild scheduled" }) : { ok: !1, detail: "chapterId is required" };
  } catch (e) {
    return F("ai:rebuild-chapter-summary", t, e), console.error("[Main] ai:rebuild-chapter-summary failed:", e), { ok: !1, detail: e instanceof Error ? e.message : String(e) };
  }
});
S.handle("ai:execute-action", async (r, t) => {
  try {
    return await R.executeAction(t);
  } catch (e) {
    throw F("ai:execute-action", t, e), console.error("[Main] ai:execute-action failed:", e), e;
  }
});
S.handle("ai:openclaw-invoke", async (r, t) => {
  try {
    return await R.invokeOpenClawTool(t);
  } catch (e) {
    F("ai:openclaw-invoke", t, e), console.error("[Main] ai:openclaw-invoke failed:", e);
    const n = te(e);
    return {
      ok: !1,
      code: n.code,
      error: ge(n.code, n.message)
    };
  }
});
S.handle("ai:openclaw-mcp-invoke", async (r, t) => {
  try {
    return await R.invokeOpenClawTool(t);
  } catch (e) {
    F("ai:openclaw-mcp-invoke", t, e), console.error("[Main] ai:openclaw-mcp-invoke failed:", e);
    const n = te(e);
    return {
      ok: !1,
      code: n.code,
      error: ge(n.code, n.message)
    };
  }
});
S.handle("ai:openclaw-skill-invoke", async (r, t) => {
  try {
    return await R.invokeOpenClawSkill(t);
  } catch (e) {
    F("ai:openclaw-skill-invoke", t, e), console.error("[Main] ai:openclaw-skill-invoke failed:", e);
    const n = te(e);
    return {
      ok: !1,
      code: n.code,
      error: ge(n.code, n.message)
    };
  }
});
S.handle("sync:pull", async () => {
  try {
    return await Ot.pull();
  } catch (r) {
    throw console.error("[Main] sync:pull failed:", r), r;
  }
});
S.handle("backup:export", async (r, t) => {
  try {
    return await Me.exportData(void 0, t);
  } catch (e) {
    throw console.error("[Main] backup:export failed:", e), e;
  }
});
S.handle("backup:import", async (r, { filePath: t, password: e }) => {
  try {
    if (!t) {
      const n = await Ce.showOpenDialog({
        title: "Import Backup",
        filters: [{ name: "Novel Editor Backup", extensions: ["nebak"] }],
        properties: ["openFile"]
      });
      if (n.canceled || n.filePaths.length === 0)
        return { success: !1, code: "CANCELLED" };
      t = n.filePaths[0];
    }
    return await Me.importData(t, e), { success: !0 };
  } catch (n) {
    console.error("[Main] backup:import failed:", n);
    const a = n.message || n.toString();
    return a.includes("PASSWORD_REQUIRED") ? { success: !1, code: "PASSWORD_REQUIRED", filePath: t } : a.includes("PASSWORD_INVALID") ? { success: !1, code: "PASSWORD_INVALID", filePath: t } : { success: !1, message: a };
  }
});
S.handle("backup:get-auto", async () => {
  try {
    return await Me.getAutoBackups();
  } catch (r) {
    throw console.error("[Main] backup:get-auto failed:", r), r;
  }
});
S.handle("backup:restore-auto", async (r, t) => {
  try {
    return await Me.restoreAutoBackup(t), !0;
  } catch (e) {
    throw console.error("[Main] backup:restore-auto failed:", e), e;
  }
});
S.handle("sync:push", async () => {
  try {
    return await Ot.push();
  } catch (r) {
    throw console.error("[Main] sync:push failed:", r), r;
  }
});
S.handle("db:search", async (r, { novelId: t, keyword: e, limit: n = 20, offset: a = 0 }) => {
  try {
    return await Ct(t, e, n, a);
  } catch (o) {
    throw console.error("[Main] db:search failed:", o), o;
  }
});
S.handle("db:rebuild-search-index", async (r, t) => {
  try {
    return await Jt(t);
  } catch (e) {
    throw console.error("[Main] db:rebuild-search-index failed:", e), e;
  }
});
S.handle("db:get-all-tags", async (r, t) => {
  try {
    return t ? (await h.tag.findMany({
      where: { novelId: t },
      orderBy: { name: "asc" },
      select: { name: !0 }
    })).map((n) => n.name) : [];
  } catch (e) {
    throw console.error("[Main] db:get-all-tags failed:", e), e;
  }
});
S.handle("db:get-plot-lines", async (r, t) => {
  try {
    return await h.plotLine.findMany({
      where: { novelId: t },
      include: {
        points: {
          include: { anchors: !0 },
          orderBy: { order: "asc" }
        }
      },
      orderBy: { sortOrder: "asc" }
    });
  } catch (e) {
    throw console.error("[Main] db:get-plot-lines failed:", e), e;
  }
});
S.handle("db:create-plot-line", async (r, t) => {
  try {
    const n = ((await h.plotLine.aggregate({
      where: { novelId: t.novelId },
      _max: { sortOrder: !0 }
    }))._max.sortOrder || 0) + 1;
    return await h.plotLine.create({
      data: { ...t, sortOrder: n }
    });
  } catch (e) {
    throw console.error("[Main] db:create-plot-line failed. Data:", t, "Error:", e), e;
  }
});
S.handle("db:update-plot-line", async (r, t) => {
  try {
    return await h.plotLine.update({
      where: { id: t.id },
      data: t.data
    });
  } catch (e) {
    throw console.error("[Main] db:update-plot-line failed. ID:", t.id, "Error:", e), e;
  }
});
S.handle("db:delete-plot-line", async (r, t) => {
  try {
    return await h.plotLine.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-plot-line failed. ID:", t, "Error:", e), e;
  }
});
S.handle("db:create-plot-point", async (r, t) => {
  try {
    const { plotLineId: e } = t, a = ((await h.plotPoint.aggregate({
      where: { plotLineId: e },
      _max: { order: !0 }
    }))._max.order || 0) + 1;
    return await h.plotPoint.create({
      data: { ...t, order: a }
    });
  } catch (e) {
    throw console.error("[Main] db:create-plot-point failed. Data:", t, "Error:", e), e;
  }
});
S.handle("db:update-plot-point", async (r, t) => {
  try {
    return await h.plotPoint.update({
      where: { id: t.id },
      data: t.data
    });
  } catch (e) {
    throw console.error("[Main] db:update-plot-point failed. ID:", t.id, "Error:", e), e;
  }
});
S.handle("db:delete-plot-point", async (r, t) => {
  try {
    return await h.plotPoint.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-plot-point failed. ID:", t, "Error:", e), e;
  }
});
S.handle("db:create-plot-point-anchor", async (r, t) => {
  try {
    return await h.plotPointAnchor.create({ data: t });
  } catch (e) {
    throw console.error("[Main] db:create-plot-point-anchor failed. Data:", t, "Error:", e), e;
  }
});
S.handle("db:delete-plot-point-anchor", async (r, t) => {
  try {
    return await h.plotPointAnchor.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-plot-point-anchor failed. ID:", t, "Error:", e), e;
  }
});
S.handle("db:reorder-plot-lines", async (r, { lineIds: t }) => {
  try {
    const e = t.map(
      (n, a) => h.plotLine.update({
        where: { id: n },
        data: { sortOrder: a }
      })
    );
    return await h.$transaction(e), { success: !0 };
  } catch (e) {
    throw console.error("[Main] db:reorder-plot-lines failed:", e), e;
  }
});
S.handle("db:reorder-plot-points", async (r, { plotLineId: t, pointIds: e }) => {
  try {
    const n = e.map(
      (a, o) => h.plotPoint.update({
        where: { id: a },
        data: { order: o, plotLineId: t }
      })
    );
    return await h.$transaction(n), { success: !0 };
  } catch (n) {
    throw console.error("[Main] db:reorder-plot-points failed:", n), n;
  }
});
S.handle("db:upload-character-image", async (r, { characterId: t, type: e }) => {
  try {
    const n = await Ce.showOpenDialog(T, {
      title: e === "avatar" ? "Select Avatar Image" : "Select Full Body Image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
      properties: ["openFile"]
    });
    if (n.canceled || n.filePaths.length === 0)
      return null;
    const a = n.filePaths[0], o = L.extname(a), c = L.join(b.getPath("userData"), "characters", t);
    if (x.existsSync(c) || x.mkdirSync(c, { recursive: !0 }), e === "avatar") {
      const i = `avatar${o}`, l = L.join(c, i);
      x.readdirSync(c).filter((E) => E.startsWith("avatar.")).forEach((E) => {
        try {
          x.unlinkSync(L.join(c, E));
        } catch {
        }
      }), x.copyFileSync(a, l);
      const w = `characters/${t}/${i}`;
      return await h.character.update({
        where: { id: t },
        data: { avatar: w }
      }), { path: w };
    } else {
      const l = `fullbody_${Date.now()}${o}`, I = L.join(c, l);
      x.copyFileSync(a, I);
      const w = `characters/${t}/${l}`, E = await h.character.findUnique({ where: { id: t }, select: { fullBodyImages: !0 } });
      let C = [];
      try {
        C = JSON.parse((E == null ? void 0 : E.fullBodyImages) || "[]");
      } catch {
      }
      return C.push(w), await h.character.update({
        where: { id: t },
        data: { fullBodyImages: JSON.stringify(C) }
      }), { path: w, images: C };
    }
  } catch (n) {
    throw console.error("[Main] db:upload-character-image failed:", n), n;
  }
});
S.handle("db:delete-character-image", async (r, { characterId: t, imagePath: e, type: n }) => {
  try {
    const a = L.join(b.getPath("userData"), e);
    if (x.existsSync(a) && x.unlinkSync(a), n === "avatar")
      await h.character.update({
        where: { id: t },
        data: { avatar: null }
      });
    else {
      const o = await h.character.findUnique({ where: { id: t }, select: { fullBodyImages: !0 } });
      let c = [];
      try {
        c = JSON.parse((o == null ? void 0 : o.fullBodyImages) || "[]");
      } catch {
      }
      c = c.filter((i) => i !== e), await h.character.update({
        where: { id: t },
        data: { fullBodyImages: JSON.stringify(c) }
      });
    }
  } catch (a) {
    throw console.error("[Main] db:delete-character-image failed:", a), a;
  }
});
S.handle("db:get-character-map-locations", async (r, t) => {
  try {
    return (await h.characterMapMarker.findMany({
      where: { characterId: t },
      include: {
        map: { select: { id: !0, name: !0, type: !0 } }
      }
    })).map((n) => ({
      mapId: n.map.id,
      mapName: n.map.name,
      mapType: n.map.type
    }));
  } catch (e) {
    return console.error("[Main] db:get-character-map-locations failed:", e), [];
  }
});
S.handle("db:get-characters", async (r, t) => {
  try {
    return await h.character.findMany({
      where: { novelId: t },
      include: {
        items: {
          include: { item: !0 }
        }
      },
      orderBy: [
        { isStarred: "desc" },
        { sortOrder: "asc" }
      ]
    });
  } catch (e) {
    throw console.error("[Main] db:get-characters failed:", e), e;
  }
});
S.handle("db:get-character", async (r, t) => {
  try {
    return await h.character.findUnique({
      where: { id: t },
      include: {
        items: {
          include: { item: !0 }
        }
      }
    });
  } catch (e) {
    throw console.error("[Main] db:get-character failed:", e), e;
  }
});
S.handle("db:create-character", async (r, t) => {
  try {
    const e = typeof t.profile == "object" ? JSON.stringify(t.profile) : t.profile;
    return await h.character.create({
      data: { ...t, profile: e }
    });
  } catch (e) {
    throw console.error("[Main] db:create-character failed:", e), e;
  }
});
S.handle("db:update-character", async (r, { id: t, data: e }) => {
  try {
    const n = typeof e.profile == "object" ? JSON.stringify(e.profile) : e.profile;
    return await h.character.update({
      where: { id: t },
      data: { ...e, profile: n }
    });
  } catch (n) {
    throw console.error("[Main] db:update-character failed:", n), n;
  }
});
S.handle("db:delete-character", async (r, t) => {
  try {
    await h.character.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-character failed:", e), e;
  }
});
S.handle("db:get-items", async (r, t) => {
  try {
    return await h.item.findMany({
      where: { novelId: t },
      orderBy: { sortOrder: "asc" }
    });
  } catch (e) {
    throw console.error("[Main] db:get-items failed:", e), e;
  }
});
S.handle("db:get-item", async (r, t) => {
  try {
    return await h.item.findUnique({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:get-item failed:", e), e;
  }
});
S.handle("db:create-item", async (r, t) => {
  try {
    const n = ((await h.item.aggregate({
      where: { novelId: t.novelId },
      _max: { sortOrder: !0 }
    }))._max.sortOrder || 0) + 1;
    return await h.item.create({
      data: { ...t, sortOrder: n }
    });
  } catch (e) {
    throw console.error("[Main] db:create-item failed:", e), e;
  }
});
S.handle("db:update-item", async (r, { id: t, data: e }) => {
  try {
    return await h.item.update({
      where: { id: t },
      data: { ...e, updatedAt: /* @__PURE__ */ new Date() }
    });
  } catch (n) {
    throw console.error("[Main] db:update-item failed:", n), n;
  }
});
S.handle("db:delete-item", async (r, t) => {
  try {
    return await h.item.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-item failed:", e), e;
  }
});
S.handle("db:get-mentionables", async (r, t) => {
  try {
    const [e, n, a, o] = await Promise.all([
      h.character.findMany({
        where: { novelId: t },
        select: { id: !0, name: !0, avatar: !0, role: !0, isStarred: !0 },
        orderBy: [
          { isStarred: "desc" },
          { name: "asc" }
        ]
      }),
      h.item.findMany({
        where: { novelId: t },
        select: { id: !0, name: !0, icon: !0 },
        orderBy: { name: "asc" }
      }),
      h.worldSetting.findMany({
        where: { novelId: t },
        select: { id: !0, name: !0, icon: !0, type: !0 },
        orderBy: { name: "asc" }
      }),
      h.mapCanvas.findMany({
        where: { novelId: t },
        select: { id: !0, name: !0, type: !0 },
        orderBy: { name: "asc" }
      })
    ]);
    return [
      ...e.map((c) => ({ ...c, type: "character" })),
      ...n.map((c) => ({ ...c, type: "item" })),
      ...a.map((c) => ({ id: c.id, name: c.name, icon: c.icon, type: "world", role: c.type })),
      ...o.map((c) => ({ id: c.id, name: c.name, type: "map", role: c.type }))
    ];
  } catch (e) {
    throw console.error("[Main] db:get-mentionables failed:", e), e;
  }
});
S.handle("db:get-world-settings", async (r, t) => {
  try {
    return await h.worldSetting.findMany({
      where: { novelId: t },
      orderBy: { sortOrder: "asc" }
    });
  } catch (e) {
    throw console.error("[Main] db:get-world-settings failed:", e), e;
  }
});
S.handle("db:create-world-setting", async (r, t) => {
  try {
    const e = await h.worldSetting.findFirst({
      where: { novelId: t.novelId },
      orderBy: { sortOrder: "desc" }
    });
    return await h.worldSetting.create({
      data: {
        novelId: t.novelId,
        name: t.name,
        type: t.type || "other",
        sortOrder: ((e == null ? void 0 : e.sortOrder) || 0) + 1
      }
    });
  } catch (e) {
    throw console.error("[Main] db:create-world-setting failed:", e), e;
  }
});
S.handle("db:update-world-setting", async (r, t, e) => {
  try {
    return await h.worldSetting.update({
      where: { id: t },
      data: e
    });
  } catch (n) {
    throw console.error("[Main] db:update-world-setting failed:", n), n;
  }
});
S.handle("db:delete-world-setting", async (r, t) => {
  try {
    return await h.worldSetting.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-world-setting failed:", e), e;
  }
});
S.handle("db:get-maps", async (r, t) => {
  try {
    return await h.mapCanvas.findMany({
      where: { novelId: t },
      orderBy: { sortOrder: "asc" }
    });
  } catch (e) {
    throw console.error("[Main] db:get-maps failed:", e), e;
  }
});
S.handle("db:get-map", async (r, t) => {
  try {
    return await h.mapCanvas.findUnique({
      where: { id: t },
      include: {
        markers: { include: { character: { select: { id: !0, name: !0, avatar: !0, role: !0 } } } },
        elements: { orderBy: { z: "asc" } }
      }
    });
  } catch (e) {
    throw console.error("[Main] db:get-map failed:", e), e;
  }
});
S.handle("db:create-map", async (r, t) => {
  try {
    return await h.mapCanvas.create({ data: t });
  } catch (e) {
    throw console.error("[Main] db:create-map failed:", e), e;
  }
});
S.handle("db:update-map", async (r, { id: t, data: e }) => {
  try {
    const { markers: n, elements: a, createdAt: o, updatedAt: c, ...i } = e;
    return await h.mapCanvas.update({ where: { id: t }, data: i });
  } catch (n) {
    throw console.error("[Main] db:update-map failed:", n), n;
  }
});
S.handle("db:delete-map", async (r, t) => {
  try {
    const e = await h.mapCanvas.findUnique({ where: { id: t }, select: { background: !0, novelId: !0 } });
    if (e != null && e.background) {
      const n = L.join(b.getPath("userData"), e.background);
      x.existsSync(n) && x.unlinkSync(n);
    }
    return await h.mapCanvas.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-map failed:", e), e;
  }
});
S.handle("db:upload-map-bg", async (r, t) => {
  try {
    const e = await h.mapCanvas.findUnique({ where: { id: t }, select: { novelId: !0, background: !0 } });
    if (!e)
      return null;
    const n = await Ce.showOpenDialog(T, {
      title: "Select Map Image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
      properties: ["openFile"]
    });
    if (n.canceled || n.filePaths.length === 0)
      return null;
    const a = n.filePaths[0], o = L.extname(a), c = L.join(b.getPath("userData"), "maps", e.novelId);
    if (x.existsSync(c) || x.mkdirSync(c, { recursive: !0 }), e.background) {
      const g = L.join(b.getPath("userData"), e.background);
      x.existsSync(g) && x.unlinkSync(g);
    }
    const i = `${t}${o}`, l = L.join(c, i);
    x.copyFileSync(a, l);
    const I = `maps/${e.novelId}/${i}`, E = Ft.createFromPath(l).getSize(), C = E.width || 1200, p = E.height || 800;
    return await h.mapCanvas.update({
      where: { id: t },
      data: { background: I, width: C, height: p }
    }), { path: I, width: C, height: p };
  } catch (e) {
    throw console.error("[Main] db:upload-map-bg failed:", e), e;
  }
});
S.handle("db:get-map-markers", async (r, t) => {
  try {
    return await h.characterMapMarker.findMany({
      where: { mapId: t },
      include: { character: { select: { id: !0, name: !0, avatar: !0, role: !0 } } }
    });
  } catch (e) {
    throw console.error("[Main] db:get-map-markers failed:", e), e;
  }
});
S.handle("db:create-map-marker", async (r, t) => {
  try {
    return await h.characterMapMarker.create({
      data: t,
      include: { character: { select: { id: !0, name: !0, avatar: !0, role: !0 } } }
    });
  } catch (e) {
    throw console.error("[Main] db:create-map-marker failed:", e), e;
  }
});
S.handle("db:update-map-marker", async (r, { id: t, data: e }) => {
  try {
    return await h.characterMapMarker.update({
      where: { id: t },
      data: e,
      include: { character: { select: { id: !0, name: !0, avatar: !0, role: !0 } } }
    });
  } catch (n) {
    throw console.error("[Main] db:update-map-marker failed:", n), n;
  }
});
S.handle("db:delete-map-marker", async (r, t) => {
  try {
    return await h.characterMapMarker.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-map-marker failed:", e), e;
  }
});
S.handle("db:get-map-elements", async (r, t) => {
  try {
    return await h.mapElement.findMany({
      where: { mapId: t },
      orderBy: { z: "asc" }
    });
  } catch (e) {
    throw console.error("[Main] db:get-map-elements failed:", e), e;
  }
});
S.handle("db:create-map-element", async (r, t) => {
  try {
    return await h.mapElement.create({ data: t });
  } catch (e) {
    throw console.error("[Main] db:create-map-element failed:", e), e;
  }
});
S.handle("db:update-map-element", async (r, { id: t, data: e }) => {
  try {
    const { createdAt: n, updatedAt: a, map: o, ...c } = e;
    return await h.mapElement.update({ where: { id: t }, data: c });
  } catch (n) {
    throw console.error("[Main] db:update-map-element failed:", n), n;
  }
});
S.handle("db:delete-map-element", async (r, t) => {
  try {
    return await h.mapElement.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-map-element failed:", e), e;
  }
});
S.handle("db:get-relationships", async (r, t) => {
  try {
    const [e, n] = await Promise.all([
      h.relationship.findMany({
        where: { sourceId: t },
        include: { target: { select: { id: !0, name: !0, avatar: !0, role: !0 } } }
      }),
      h.relationship.findMany({
        where: { targetId: t },
        include: { source: { select: { id: !0, name: !0, avatar: !0, role: !0 } } }
      })
    ]);
    return [...e, ...n];
  } catch (e) {
    throw console.error("[Main] db:get-relationships failed:", e), e;
  }
});
S.handle("db:create-relationship", async (r, t) => {
  try {
    return await h.relationship.create({
      data: t,
      include: {
        source: { select: { id: !0, name: !0, avatar: !0, role: !0 } },
        target: { select: { id: !0, name: !0, avatar: !0, role: !0 } }
      }
    });
  } catch (e) {
    throw console.error("[Main] db:create-relationship failed:", e), e;
  }
});
S.handle("db:delete-relationship", async (r, t) => {
  try {
    return await h.relationship.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-relationship failed:", e), e;
  }
});
S.handle("db:get-character-items", async (r, t) => {
  try {
    return await h.itemOwnership.findMany({
      where: { characterId: t },
      include: { item: !0 }
    });
  } catch (e) {
    throw console.error("[Main] db:get-character-items failed:", e), e;
  }
});
S.handle("db:add-item-to-character", async (r, t) => {
  try {
    return await h.itemOwnership.create({
      data: t,
      include: { item: !0 }
    });
  } catch (e) {
    throw console.error("[Main] db:add-item-to-character failed:", e), e;
  }
});
S.handle("db:remove-item-from-character", async (r, t) => {
  try {
    return await h.itemOwnership.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:remove-item-from-character failed:", e), e;
  }
});
S.handle("db:update-item-ownership", async (r, t, e) => {
  try {
    return await h.itemOwnership.update({
      where: { id: t },
      data: e,
      include: { item: !0 }
    });
  } catch (n) {
    throw console.error("[Main] db:update-item-ownership failed:", n), n;
  }
});
S.handle("db:get-character-timeline", async (r, t) => {
  try {
    const e = await h.character.findUnique({ where: { id: t }, select: { name: !0, novelId: !0 } });
    if (!e)
      return [];
    const n = await h.plotPointAnchor.findMany({
      where: {
        plotPoint: {
          novelId: e.novelId,
          description: { contains: `@${e.name}` }
        }
      },
      include: {
        plotPoint: { select: { title: !0, description: !0, plotLine: { select: { name: !0 } } } },
        chapter: { select: { id: !0, title: !0, order: !0, volume: { select: { title: !0, order: !0 } } } }
      },
      orderBy: [{ chapter: { volume: { order: "asc" } } }, { chapter: { order: "asc" } }]
    }), a = /* @__PURE__ */ new Set();
    return n.filter((o) => o.chapter && !a.has(o.chapter.id) && a.add(o.chapter.id)).map((o) => {
      var c;
      return {
        chapterId: o.chapter.id,
        chapterTitle: o.chapter.title,
        volumeTitle: o.chapter.volume.title,
        order: o.chapter.order,
        volumeOrder: o.chapter.volume.order,
        snippet: ((c = o.plotPoint.description) == null ? void 0 : c.substring(0, 100)) || o.plotPoint.title
      };
    });
  } catch (e) {
    throw console.error("[Main] db:get-character-timeline failed:", e), e;
  }
});
function un(r) {
  if (!r)
    return "";
  try {
    const t = JSON.parse(r);
    if (!t.root)
      return r;
    const e = [], n = (a) => {
      a.text && e.push(a.text), a.children && Array.isArray(a.children) && a.children.forEach(n), (a.type === "paragraph" || a.type === "heading" || a.type === "quote") && e.push(" ");
    };
    return n(t.root), e.join("").replace(/\s+/g, " ").trim();
  } catch {
    return r;
  }
}
S.handle("db:get-character-chapter-appearances", async (r, t) => {
  try {
    const e = await h.character.findUnique({ where: { id: t }, select: { name: !0, novelId: !0 } });
    return e ? (await h.chapter.findMany({
      where: {
        volume: { novelId: e.novelId },
        // Use LIKE for rough match on JSON string (imperfect but fast first filter)
        content: { contains: e.name }
      },
      select: {
        id: !0,
        title: !0,
        order: !0,
        content: !0,
        volume: { select: { title: !0, order: !0 } }
      },
      orderBy: [{ volume: { order: "asc" } }, { order: "asc" }]
    })).map((a) => {
      const o = un(a.content || "");
      let c = "";
      const i = o.indexOf(e.name);
      if (i >= 0) {
        const l = Math.max(0, i - 30), I = Math.min(o.length, i + e.name.length + 50);
        c = (l > 0 ? "..." : "") + o.substring(l, I) + (I < o.length ? "..." : "");
      }
      return {
        chapterId: a.id,
        chapterTitle: a.title,
        volumeTitle: a.volume.title,
        order: a.order,
        volumeOrder: a.volume.order,
        snippet: c
      };
    }).filter((a) => a.snippet !== "") : [];
  } catch (e) {
    throw console.error("[Main] db:get-character-chapter-appearances failed:", e), e;
  }
});
S.handle("db:get-recent-chapters", async (r, t, e, n = 5) => {
  try {
    return await h.chapter.findMany({
      where: {
        volume: { novelId: e },
        content: { contains: `@${t}` }
      },
      select: {
        id: !0,
        title: !0,
        order: !0,
        wordCount: !0,
        updatedAt: !0
      },
      orderBy: { updatedAt: "desc" },
      take: n
    });
  } catch (a) {
    throw console.error("[Main] db:get-recent-chapters failed:", a), a;
  }
});
b.on("window-all-closed", () => {
  process.platform !== "darwin" && (b.quit(), T = null);
});
b.on("activate", () => {
  wt.getAllWindows().length === 0 && kt();
});
b.whenReady().then(async () => {
  var a, o, c;
  if (re.error) {
    Ke(b.getPath("userData")), yt(), console.error(`[AI-Diag] Invalid arguments: ${re.error}`), b.exit(2);
    return;
  }
  b.setAppUserModelId("com.noveleditor.app"), b.setName(b.isPackaged ? bt : on);
  const r = (a = re.command) != null && a.userDataPath ? L.resolve(re.command.userDataPath) : sn();
  if (b.setPath("userData", r), Ke(b.getPath("userData")), yt(), console.log("[Main] App Ready. Starting DB Setup..."), console.log("[Main] User Data Path:", b.getPath("userData")), re.command && b.isPackaged) {
    console.error("[AI-Diag] --ai-diag is only available in development mode."), b.exit(1);
    return;
  }
  (o = re.command) != null && o.userDataPath && console.log("[AI-Diag] userData override:", r), Ut.handle("local-resource", (i) => {
    const l = decodeURIComponent(i.url.replace("local-resource://", "")), I = L.join(b.getPath("userData"), l);
    return Bt.fetch("file:///" + I.replace(/\\/g, "/"));
  });
  let t;
  if (b.isPackaged) {
    const i = L.dirname(b.getPath("exe"));
    t = L.join(i, "data");
  } else
    t = b.getPath("userData");
  const e = (c = re.command) != null && c.dbPath ? L.resolve(re.command.dbPath) : L.join(t, "novel_editor.db"), n = `file:${e}`;
  if (console.log("[Main] Database Path:", e), x.existsSync(L.dirname(e)) || x.mkdirSync(L.dirname(e), { recursive: !0 }), !b.isPackaged) {
    const i = L.resolve(ve, "../../../packages/core/prisma/schema.prisma");
    if (console.log("[Main] Development mode detected (unpackaged). Checking schema at:", i), x.existsSync(i)) {
      const l = L.dirname(e);
      x.existsSync(l) || x.mkdirSync(l, { recursive: !0 }), console.log("[Main] Schema found."), console.log("[Main] Cleaning up FTS tables before migration..."), Ze(n);
      try {
        await h.$executeRawUnsafe("DROP TABLE IF EXISTS search_index;"), console.log("[Main] FTS tables dropped successfully.");
      } catch (w) {
        console.warn("[Main] Failed to drop FTS table (non-critical):", w);
      }
      await h.$disconnect(), console.log("[Main] Attempting synchronous DB push to:", e);
      const I = L.resolve(ve, "../../../packages/core/node_modules/.bin/prisma.cmd");
      if (console.log("[Main] Using Prisma binary at:", I), !x.existsSync(I))
        console.error("[Main] Prisma binary NOT found at:", I);
      else
        try {
          const w = `"${I}" db push --schema="${i}" --accept-data-loss`;
          console.log("[Main] Executing command:", w);
          const E = Ht(w, {
            env: { ...process.env, DATABASE_URL: n },
            cwd: L.resolve(ve, "../../../packages/core"),
            stdio: "pipe",
            // Avoid inherit to prevent encoding issues
            windowsHide: !0
          });
          console.log("[Main] DB Push output:", E.toString()), console.log("[Main] DB Push completed successfully.");
        } catch (w) {
          console.error("[Main] DB Push failed."), w.stdout && console.log("[Main] stdout:", w.stdout.toString()), w.stderr && console.error("[Main] stderr:", w.stderr.toString());
        }
    } else
      console.warn("[Main] Schema file NOT found at:", i);
  }
  Ze(n);
  try {
    await zt() && console.log("[Main] Bundled database schema applied successfully.");
  } catch (i) {
    throw console.error("[Main] Failed to ensure bundled database schema:", i), i;
  }
  if (R = new Nr(() => b.getPath("userData")), re.command)
    try {
      const i = await dn(R, re.command);
      await h.$disconnect(), b.exit(i);
      return;
    } catch (i) {
      console.error("[AI-Diag] Execution failed:", i), await h.$disconnect(), b.exit(1);
      return;
    }
  await Wt(), console.log("[Main] Search index initialized");
  try {
    await xt(R.getSettings());
  } catch (i) {
    console.warn("[Main] Failed to apply AI proxy settings:", i);
  }
  kt();
});
export {
  An as MAIN_DIST,
  Mt as RENDERER_DIST,
  qe as VITE_DEV_SERVER_URL
};
