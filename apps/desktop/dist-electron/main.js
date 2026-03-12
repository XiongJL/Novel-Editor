var Ut = Object.defineProperty;
var Bt = (r, t, e) => t in r ? Ut(r, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : r[t] = e;
var ee = (r, t, e) => (Bt(r, typeof t != "symbol" ? t + "" : t, e), e);
import { app as b, dialog as Ie, ipcMain as A, nativeImage as jt, BrowserWindow as wt, protocol as zt, net as Ht, session as Ee } from "electron";
import { db as h, initDb as Ge, ensureDbSchema as qt } from "@novel-editor/core";
import { fileURLToPath as Vt } from "node:url";
import N from "node:path";
import { execSync as Wt } from "child_process";
import P from "fs";
import j from "node:fs";
import { createHash as vt, randomUUID as Gt } from "node:crypto";
import { spawn as Zt } from "node:child_process";
import ne from "path";
import It from "zlib";
import pe from "crypto";
const Jt = [
  "content",
  "entity_type",
  "entity_id",
  "novel_id",
  "chapter_id",
  "title",
  "volume_title",
  "chapter_order",
  "volume_order",
  "volume_id"
];
async function Ze() {
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
    `;
}
async function Kt() {
  return (await h.$queryRawUnsafe("PRAGMA table_info(search_index);")).map((t) => t.name);
}
async function Je() {
  const r = await h.novel.findMany({
    where: { deleted: !1 },
    select: { id: !0 }
  });
  for (const t of r)
    await Ct(t.id);
}
async function Xt() {
  try {
    if ((await h.$queryRaw`
            SELECT name FROM sqlite_master WHERE type='table' AND name='search_index';
        `).length === 0)
      await Ze(), console.log("[SearchIndex] FTS5 table created successfully"), await Je(), console.log("[SearchIndex] FTS5 index rebuilt from source data");
    else {
      const t = await Kt(), e = Jt.filter((n) => !t.includes(n));
      e.length > 0 && (console.warn(`[SearchIndex] Schema mismatch detected. Rebuilding FTS5 table. Missing columns: ${e.join(", ")}`), await h.$executeRawUnsafe("DROP TABLE IF EXISTS search_index;"), await Ze(), await Je(), console.log("[SearchIndex] FTS5 table rebuilt successfully"));
    }
  } catch (r) {
    console.error("[SearchIndex] Failed to initialize FTS5 table:", r);
  }
}
function Yt(r) {
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
async function Se(r) {
  const t = Yt(r.content);
  let e = r.novelId, n = r.volumeTitle, a = r.order, i = r.volumeOrder;
  if (!e || !n || a === void 0 || i === void 0) {
    const c = await h.chapter.findUnique({
      where: { id: r.id },
      select: {
        order: !0,
        volume: { select: { id: !0, novelId: !0, title: !0, order: !0 } }
      }
    });
    c && (a === void 0 && (a = c.order), c.volume && (e || (e = c.volume.novelId), n || (n = c.volume.title), i === void 0 && (i = c.volume.order)));
  }
  if (e)
    try {
      await h.$executeRaw`
            DELETE FROM search_index WHERE entity_type = 'chapter' AND entity_id = ${r.id};
        `, await h.$executeRaw`
            INSERT INTO search_index (content, entity_type, entity_id, novel_id, chapter_id, title, volume_title, chapter_order, volume_order, volume_id)
            VALUES (${t}, 'chapter', ${r.id}, ${e}, ${r.id}, ${r.title}, ${n || ""}, ${a || 0}, ${i || 0}, ${r.volumeId});
        `;
    } catch (c) {
      console.error("[SearchIndex] Failed to index chapter:", c);
    }
}
async function qe(r) {
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
async function Qt(r, t) {
  try {
    await h.$executeRaw`
            DELETE FROM search_index WHERE entity_type = ${r} AND entity_id = ${t};
        `;
  } catch (e) {
    console.error("[SearchIndex] Failed to remove from index:", e);
  }
}
async function St(r, t, e = 20, n = 0) {
  if (!t.trim())
    return [];
  try {
    const i = `%${t.replace(/[%_]/g, "\\$&")}%`, c = await h.$queryRaw`
            SELECT entity_type, entity_id, chapter_id, novel_id, title, volume_title, content, chapter_order, volume_order, volume_id
            FROM search_index
            WHERE novel_id = ${r} 
            AND (content LIKE ${i} OR title LIKE ${i} OR volume_title LIKE ${i})
            ORDER BY volume_order ASC, chapter_order ASC
            LIMIT ${e} OFFSET ${n};
        `, s = [], d = t.toLowerCase(), v = /* @__PURE__ */ new Set();
    for (const w of c) {
      const C = w.content || "", S = w.title || "", p = w.volume_title || "", g = Number(w.chapter_order || 0), f = Number(w.volume_order || 0);
      w.entity_type === "chapter" && p && p.toLowerCase().includes(d) && (v.has(p) || (s.push({
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
      }), v.add(p))), w.entity_type === "chapter" && S.toLowerCase().includes(d) && s.push({
        entityType: "chapter",
        entityId: w.entity_id,
        chapterId: w.chapter_id,
        novelId: w.novel_id,
        title: w.title,
        snippet: `Title match: <mark>${S}</mark>`,
        preview: `Found in Title: ${S}`,
        keyword: t,
        matchType: "title",
        chapterOrder: g,
        volumeTitle: p,
        volumeOrder: f,
        volumeId: w.volume_id
      });
      const m = C.toLowerCase(), u = [];
      let o = 0;
      for (; o < m.length && u.length < 200; ) {
        const I = m.indexOf(d, o);
        if (I === -1)
          break;
        u.push(I), o = I + d.length;
      }
      const l = 60, y = [];
      for (const I of u)
        (y.length === 0 || I - y[y.length - 1] > l) && y.push(I);
      for (const I of y)
        s.push({
          entityType: w.entity_type,
          entityId: w.entity_id,
          chapterId: w.chapter_id,
          novelId: w.novel_id,
          title: w.title,
          snippet: Ke(C, t, I, 10, !0),
          preview: Ke(C, t, I, 25, !1),
          keyword: t,
          matchType: "content",
          chapterOrder: g,
          volumeTitle: p,
          volumeOrder: f,
          volumeId: w.volume_id
        });
    }
    return s;
  } catch (a) {
    return console.error("[SearchIndex] Search failed:", a), [];
  }
}
function Ke(r, t, e, n = 30, a = !0) {
  if (!r)
    return "";
  const i = Math.max(0, e - n), c = Math.min(r.length, e + t.length + n * 2);
  let s = "";
  i > 0 && (s += "...");
  const d = r.substring(i, e), v = r.substring(e, e + t.length), w = r.substring(e + t.length, c);
  return a ? s += d + "<mark>" + v + "</mark>" + w : s += d + v + w, c < r.length && (s += "..."), s;
}
async function Ct(r) {
  var n, a;
  let t = 0, e = 0;
  try {
    await h.$executeRaw`DELETE FROM search_index WHERE novel_id = ${r};`;
    const i = await h.chapter.findMany({
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
    for (const s of i)
      await Se({
        ...s,
        novelId: r,
        volumeTitle: (n = s.volume) == null ? void 0 : n.title,
        volumeOrder: (a = s.volume) == null ? void 0 : a.order
      }), t++;
    const c = await h.idea.findMany({
      where: { novelId: r },
      select: { id: !0, content: !0, quote: !0, novelId: !0, chapterId: !0 }
    });
    for (const s of c)
      await qe(s), e++;
  } catch (i) {
    console.error("[SearchIndex] Rebuild failed:", i);
  }
  return { chapters: t, ideas: e };
}
async function er(r) {
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
class z extends Error {
  constructor(e, n, a) {
    super(n);
    ee(this, "code");
    ee(this, "detail");
    this.code = e, this.detail = a, this.name = "AiActionError";
  }
}
function tr(r) {
  const t = r.toLowerCase();
  return t.includes("timed out") || t.includes("timeout") || t.includes("aborterror") || t.includes("aborted") ? new z("PROVIDER_TIMEOUT", r) : t.includes("401") || t.includes("403") || t.includes("unauthorized") || t.includes("forbidden") || t.includes("api key") ? new z("PROVIDER_AUTH", r) : t.includes("content_filter") || t.includes("safety") || t.includes("filtered") ? new z("PROVIDER_FILTERED", r) : t.includes("429") || t.includes("503") || t.includes("model") || t.includes("unavailable") ? new z("PROVIDER_UNAVAILABLE", r) : t.includes("fetch") || t.includes("network") || t.includes("econn") ? new z("NETWORK_ERROR", r) : new z("UNKNOWN", r);
}
function te(r) {
  if (r instanceof z)
    return r;
  const t = r instanceof Error ? r.message : String(r ?? "unknown error");
  return tr(t);
}
function he(r, t) {
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
const rr = "debug-dev.log", nr = 15 * 1024 * 1024, ar = "***REDACTED***", ir = /* @__PURE__ */ new Set([
  "authorization",
  "apikey",
  "api_key",
  "api key",
  "token",
  "access_token",
  "refresh_token"
]);
let ae = null;
function Ve() {
  return process.env.NODE_ENV !== "production";
}
function Xe(r) {
  Ve() && (ae = N.join(r, rr), Et());
}
function ie(r) {
  return ze(r, /* @__PURE__ */ new WeakSet());
}
function O(r, t, e, n) {
  if (!Ve())
    return;
  const a = [
    `[${(/* @__PURE__ */ new Date()).toISOString()}] [${r}] [${t}]`,
    `message=${e}`,
    n === void 0 ? "" : `extra=${or(ie(n))}`,
    ""
  ].filter(Boolean);
  sr(a.join(`
`));
}
function se(r, t, e) {
  const n = _t(t);
  O("ERROR", r, n.message, {
    error: n,
    ...e === void 0 ? {} : { extra: e }
  });
}
function Et() {
  if (!ae)
    return;
  const r = N.dirname(ae);
  j.existsSync(r) || j.mkdirSync(r, { recursive: !0 }), j.existsSync(ae) || j.writeFileSync(ae, "", "utf8");
}
function sr(r) {
  if (ae)
    try {
      Et(), (j.existsSync(ae) ? j.statSync(ae).size : 0) >= nr && j.writeFileSync(ae, "", "utf8"), j.appendFileSync(ae, `${r}
`, "utf8");
    } catch {
    }
}
function or(r) {
  try {
    return JSON.stringify(r, null, 2);
  } catch {
    return String(r);
  }
}
function _t(r) {
  return r instanceof Error ? {
    name: r.name,
    message: r.message,
    stack: r.stack
  } : {
    name: typeof r,
    message: String(r)
  };
}
function ze(r, t) {
  if (r == null || typeof r == "string" || typeof r == "number" || typeof r == "boolean")
    return r;
  if (typeof r == "bigint")
    return r.toString();
  if (r instanceof Error)
    return _t(r);
  if (Array.isArray(r))
    return r.map((e) => ze(e, t));
  if (typeof r == "object") {
    const e = r;
    if (t.has(e))
      return "[Circular]";
    t.add(e);
    const n = {};
    for (const [a, i] of Object.entries(e)) {
      if (ir.has(a.toLowerCase())) {
        n[a] = ar;
        continue;
      }
      n[a] = ze(i, t);
    }
    return t.delete(e), n;
  }
  return String(r);
}
function be(r, t) {
  return `${r.replace(/\/+$/, "")}/${t.replace(/^\/+/, "")}`;
}
function Ye(r) {
  try {
    return JSON.parse(r);
  } catch {
    return null;
  }
}
class At {
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
    let i = !1;
    const c = Math.max(1e3, n), s = setTimeout(() => {
      i = !0, a.abort();
    }, c), d = be(t, "models"), v = Date.now();
    try {
      O("INFO", "HttpProvider.healthCheck.request", "HTTP health check request", {
        url: d,
        timeoutMs: c,
        headers: { Authorization: `Bearer ${e}` }
      });
      const w = await fetch(d, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${e}`
        },
        signal: a.signal
      });
      return w.ok ? (O("INFO", "HttpProvider.healthCheck.response", "HTTP health check ok", {
        url: d,
        status: w.status,
        elapsedMs: Date.now() - v
      }), { ok: !0, detail: "HTTP provider is reachable" }) : (O("WARN", "HttpProvider.healthCheck.response", "HTTP health check rejected", {
        url: d,
        status: w.status,
        elapsedMs: Date.now() - v
      }), { ok: !1, detail: `HTTP provider rejected: ${w.status}` });
    } catch (w) {
      return se("HttpProvider.healthCheck.error", w, {
        url: d,
        elapsedMs: Date.now() - v,
        didTimeout: i
      }), i ? { ok: !1, detail: `HTTP health check timed out after ${c}ms` } : { ok: !1, detail: `HTTP health check failed: ${(w == null ? void 0 : w.message) || "unknown error"}` };
    } finally {
      clearTimeout(s);
    }
  }
  async generate(t) {
    var w, C, S, p, g, f;
    const e = t.prompt.trim();
    if (!e)
      return { text: "", model: this.settings.http.model };
    const n = new AbortController();
    let a = !1;
    const i = Math.max(1e3, t.timeoutMs ?? this.settings.http.timeoutMs), c = setTimeout(() => {
      a = !0, n.abort();
    }, i), s = {
      model: this.settings.http.model,
      messages: [
        ...t.systemPrompt ? [{ role: "system", content: t.systemPrompt }] : [],
        { role: "user", content: e }
      ],
      max_tokens: t.maxTokens ?? this.settings.http.maxTokens,
      temperature: t.temperature ?? this.settings.http.temperature
    }, d = be(this.settings.http.baseUrl, "chat/completions"), v = Date.now();
    try {
      O("INFO", "HttpProvider.generate.request", "AI text generation request", {
        url: d,
        timeoutMs: i,
        body: ie(s)
      });
      const m = await fetch(d, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.http.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(s),
        signal: n.signal
      }), u = await m.text(), o = Ye(u);
      if (O("INFO", "HttpProvider.generate.response", "AI text generation response", {
        url: d,
        status: m.status,
        elapsedMs: Date.now() - v,
        text: u
      }), !m.ok)
        throw new Error(((w = o == null ? void 0 : o.error) == null ? void 0 : w.message) || `HTTP ${m.status}: ${u.slice(0, 300)}`);
      const l = ((p = (S = (C = o == null ? void 0 : o.choices) == null ? void 0 : C[0]) == null ? void 0 : S.message) == null ? void 0 : p.content) || (o == null ? void 0 : o.output_text) || ((f = (g = o == null ? void 0 : o.content) == null ? void 0 : g[0]) == null ? void 0 : f.text) || "";
      return {
        text: typeof l == "string" ? l : JSON.stringify(l),
        model: (o == null ? void 0 : o.model) || this.settings.http.model
      };
    } catch (m) {
      throw se("HttpProvider.generate.error", m, {
        url: d,
        elapsedMs: Date.now() - v,
        didTimeout: a,
        requestBody: ie(s)
      }), a || (m == null ? void 0 : m.name) === "AbortError" ? new Error(`HTTP request timeout after ${i}ms`) : m;
    } finally {
      clearTimeout(c);
    }
  }
  async generateImage(t) {
    var w, C;
    const e = t.prompt.trim();
    if (!e)
      return {};
    const n = new AbortController();
    let a = !1;
    const i = Math.max(1e3, this.settings.http.timeoutMs), c = setTimeout(() => {
      a = !0, n.abort();
    }, i), s = {
      model: t.model || this.settings.http.model,
      prompt: e,
      size: t.size || "1024x1024",
      output_format: t.outputFormat || "png",
      watermark: t.watermark ?? !0
    }, d = be(this.settings.http.baseUrl, "images/generations"), v = Date.now();
    try {
      O("INFO", "HttpProvider.generateImage.request", "AI image generation request", {
        url: d,
        timeoutMs: i,
        body: ie(s)
      });
      const S = await fetch(d, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.http.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(s),
        signal: n.signal
      }), p = await S.text(), g = Ye(p);
      if (O("INFO", "HttpProvider.generateImage.response", "AI image generation response", {
        url: d,
        status: S.status,
        elapsedMs: Date.now() - v,
        text: p
      }), !S.ok)
        throw new Error(((w = g == null ? void 0 : g.error) == null ? void 0 : w.message) || `HTTP ${S.status}: ${p.slice(0, 300)}`);
      const f = ((C = g == null ? void 0 : g.data) == null ? void 0 : C[0]) || {};
      return {
        imageUrl: f.url,
        imageBase64: f.b64_json,
        mimeType: "image/png"
      };
    } catch (S) {
      throw se("HttpProvider.generateImage.error", S, {
        url: d,
        elapsedMs: Date.now() - v,
        didTimeout: a,
        requestBody: ie(s)
      }), a || (S == null ? void 0 : S.name) === "AbortError" ? new Error(`HTTP request timeout after ${i}ms`) : S;
    } finally {
      clearTimeout(c);
    }
  }
}
const B = "[Summary]", Dt = {
  summaryMode: "local",
  summaryTriggerPolicy: "manual",
  summaryDebounceMs: 3e4,
  summaryMinIntervalMs: 18e4,
  summaryMinWordDelta: 120,
  summaryFinalizeStableMs: 6e5,
  summaryFinalizeMinWords: 1200,
  recentChapterRawCount: 2
}, me = {
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
    maxTokens: 4096,
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
  summary: Dt
}, ke = /* @__PURE__ */ new Map(), ye = /* @__PURE__ */ new Map(), Me = /* @__PURE__ */ new Map(), Oe = /* @__PURE__ */ new Map();
let Qe = !1;
function cr(r) {
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
function lr(r) {
  return r ? r.split(/[。！？!?]/).map((e) => e.trim()).filter(Boolean).slice(0, 5).map((e, n) => `fact_${n + 1}: ${e.slice(0, 80)}`) : [];
}
function dr(r) {
  return r ? r.split(/[。！？!?]/).map((t) => t.trim()).filter((t) => t.includes("？") || t.includes("?")).slice(0, 5) : [];
}
function ur(r, t, e, n) {
  const a = Number.isFinite(t) ? `第${t}章` : "章节", i = n.length > 0 ? n.join(" | ") : "无明显关键事实";
  return `${a}《${r || "未命名章节"}》摘要：${e}
关键事实：${i}`;
}
function et(r) {
  if (typeof r != "string" || !r.trim())
    return [];
  try {
    const t = JSON.parse(r);
    return Array.isArray(t) ? t.map((e) => String(e || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}
function mr(r) {
  return vt("sha256").update(r.join("|")).digest("hex");
}
function pr(r, t, e) {
  const n = r === "volume" ? `卷级摘要（覆盖${t}章）` : `全书摘要（覆盖${t}章）`, a = e.map((i, c) => `${c + 1}. ${i}`).join(`
`);
  return `${n}
${a}`.slice(0, 2400);
}
function fr() {
  return N.join(b.getPath("userData"), "ai-settings.json");
}
function Lt() {
  try {
    const r = fr();
    if (!j.existsSync(r))
      return me;
    const t = j.readFileSync(r, "utf8"), e = JSON.parse(t);
    return {
      ...me,
      ...e,
      http: { ...me.http, ...e.http ?? {} },
      mcpCli: { ...me.mcpCli, ...e.mcpCli ?? {} },
      proxy: { ...me.proxy, ...e.proxy ?? {} },
      summary: { ...Dt, ...e.summary ?? {} }
    };
  } catch (r) {
    return console.warn(`${B} failed to load ai-settings.json, fallback to defaults:`, r), me;
  }
}
async function tt(r, t) {
  return {
    summaryText: r.slice(0, 220) || "章节内容为空，暂无可提炼摘要。",
    keyFacts: lr(r),
    openQuestions: dr(r),
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
async function hr(r, t, e, n) {
  var C, S;
  if (!(e.providerType === "http" && !!((C = e.http.baseUrl) != null && C.trim()) && !!((S = e.http.apiKey) != null && S.trim())))
    throw new Error("AI summary mode requires HTTP provider with baseUrl and apiKey");
  console.log(`${B} [${r}] AI summary start (model=${e.http.model})`);
  const i = new At(e), c = Date.now(), s = await i.generate({
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
  }), d = JSON.parse(s.text || "{}"), v = String(d.summaryText || "").trim();
  if (!v)
    throw new Error("AI summary returned empty summaryText");
  const w = Date.now() - c;
  return console.log(`${B} [${r}] AI summary success (${w}ms)`), {
    summaryText: v.slice(0, 400),
    keyFacts: Array.isArray(d.keyFacts) ? d.keyFacts.map((p) => String(p).trim()).filter(Boolean).slice(0, 6) : [],
    openQuestions: Array.isArray(d.openQuestions) ? d.openQuestions.map((p) => String(p).trim()).filter(Boolean).slice(0, 4) : [],
    timelineHints: Array.isArray(d.timelineHints) ? d.timelineHints.map((p) => String(p).trim()).filter(Boolean).slice(0, 6) : [`chapter_order:${n ?? "unknown"}`],
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
async function rt(r, t, e) {
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
  const i = a.map((m) => m.chapterId), c = a.map((m) => Number(m.chapterOrder)).filter((m) => Number.isFinite(m)), s = c.length > 0 ? Math.min(...c) : null, d = c.length > 0 ? Math.max(...c) : null, v = a.map((m) => String(m.summaryText || "").trim()).filter(Boolean).slice(-10), w = [...new Set(
    a.flatMap((m) => et(m.keyFacts))
  )].map((m) => String(m || "").slice(0, 120)).filter(Boolean).slice(0, 24), C = [...new Set(
    a.flatMap((m) => et(m.openQuestions))
  )].map((m) => String(m || "").slice(0, 120)).filter(Boolean).slice(0, 20), S = [
    r === "volume" ? "保持本卷叙事风格一致" : "保持全书叙事风格一致",
    "优先遵循现有大纲与关键事实"
  ], p = [
    "不得与已确认关键事实冲突",
    "保持角色动机与关系连续"
  ], g = mr(
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
    summaryText: pr(r, i.length, v),
    keyFacts: w,
    unresolvedThreads: C,
    styleGuide: S,
    hardConstraints: p,
    coverageChapterIds: i,
    chapterRangeStart: s,
    chapterRangeEnd: d,
    sourceFingerprint: g
  };
}
async function nt(r, t, e, n) {
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
    const i = await a.narrativeSummary.findFirst({
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
    i != null && i.id ? await a.narrativeSummary.update({
      where: { id: i.id },
      data: c
    }) : await a.narrativeSummary.create({ data: c });
  });
}
async function gr(r, t) {
  try {
    const [e, n] = await Promise.all([
      rt("volume", r, t),
      rt("novel", r, null)
    ]);
    e && (await nt("volume", r, e, t), console.log(`${B} [novel=${r}] narrative summary updated (level=volume, volume=${t})`)), n && (await nt("novel", r, n, null), console.log(`${B} [novel=${r}] narrative summary updated (level=novel)`));
  } catch (e) {
    console.error(`${B} [novel=${r}] narrative summary rebuild failed:`, e);
  }
}
function yr(r, t) {
  const e = `${r}:${t}`, n = Oe.get(e);
  n && clearTimeout(n);
  const a = setTimeout(() => {
    Oe.delete(e), gr(r, t);
  }, 15e3);
  Oe.set(e, a);
}
async function Re(r, t) {
  var o;
  const e = Lt(), n = !!(t != null && t.force), a = (t == null ? void 0 : t.reason) || "save", i = e.summary.summaryMode === "ai", c = i ? Math.max(18e5, e.summary.summaryMinIntervalMs) : e.summary.summaryMinIntervalMs, s = i ? Math.max(800, e.summary.summaryMinWordDelta) : e.summary.summaryMinWordDelta, d = await h.chapter.findUnique({
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
  if (!((o = d == null ? void 0 : d.volume) != null && o.novelId)) {
    console.log(`${B} [${r}] skip: chapter or novel relation missing`);
    return;
  }
  if (!Qe)
    try {
      const l = await h.$queryRawUnsafe("PRAGMA database_list;"), y = Array.isArray(l) ? l.find((I) => (I == null ? void 0 : I.name) === "main") : null;
      console.log(`${B} sqlite main db path: ${(y == null ? void 0 : y.file) || "unknown"}`);
    } catch {
      console.warn(`${B} failed to read sqlite db path via PRAGMA database_list`);
    } finally {
      Qe = !0;
    }
  const v = d.content || "", w = vt("sha256").update(v).digest("hex"), C = Date.now(), S = await h.chapterSummary.findFirst({
    where: {
      chapterId: d.id,
      isLatest: !0,
      status: "active",
      summaryType: "standard"
    },
    orderBy: { updatedAt: "desc" }
  });
  if (!n && (S == null ? void 0 : S.sourceContentHash) === w) {
    console.log(`${B} [${r}] skip: same content hash`);
    return;
  }
  const p = Math.abs((d.wordCount || 0) - Number((S == null ? void 0 : S.sourceWordCount) || 0)), g = S != null && S.updatedAt ? new Date(S.updatedAt).getTime() : 0, f = g > 0 ? C - g : Number.MAX_SAFE_INTEGER;
  if (!n && g > 0 && f < c && p < s) {
    console.log(
      `${B} [${r}] skip: throttled (deltaWords=${p}, sinceLastMs=${f}, minIntervalMs=${c}, minWordDelta=${s})`
    );
    return;
  }
  const m = cr(v);
  console.log(
    `${B} [${r}] start rebuild (reason=${a}, mode=${e.summary.summaryMode}, words=${d.wordCount || m.length}, deltaWords=${p}, force=${n})`
  );
  let u = await tt(m, d.order ?? null);
  if (e.summary.summaryMode === "ai")
    try {
      u = await hr(r, m, e, d.order ?? null);
    } catch (l) {
      console.warn(`${B} [${r}] AI summary failed, fallback to local: ${(l == null ? void 0 : l.message) || "unknown error"}`), u = {
        ...await tt(m, d.order ?? null),
        errorCode: "AI_SUMMARY_FALLBACK",
        errorDetail: (l == null ? void 0 : l.message) || "unknown ai summary error"
      };
    }
  await h.$transaction(async (l) => {
    await l.chapterSummary.updateMany({
      where: { chapterId: d.id, isLatest: !0 },
      data: { isLatest: !1, status: "stale" }
    });
    const y = await l.chapterSummary.findFirst({
      where: {
        chapterId: d.id,
        sourceContentHash: w,
        summaryType: "standard"
      }
    }), I = {
      novelId: d.volume.novelId,
      volumeId: d.volumeId,
      chapterId: d.id,
      summaryType: "standard",
      summaryText: u.summaryText,
      compressedMemory: ur(d.title || "", d.order ?? null, u.summaryText, u.keyFacts),
      keyFacts: JSON.stringify(u.keyFacts),
      entitiesSnapshot: JSON.stringify({}),
      timelineHints: JSON.stringify(u.timelineHints),
      openQuestions: JSON.stringify(u.openQuestions),
      sourceContentHash: w,
      sourceWordCount: d.wordCount || m.length,
      sourceUpdatedAt: d.updatedAt,
      chapterOrder: d.order ?? null,
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
      await l.chapterSummary.update({
        where: { id: y.id },
        data: I
      }), console.log(`${B} [${r}] done: updated existing summary`);
      return;
    }
    await l.chapterSummary.create({
      data: I
    }), console.log(`${B} [${r}] done: created new summary`);
  }), yr(d.volume.novelId, d.volumeId);
}
function We(r, t = "save") {
  const e = Lt();
  if (t === "manual") {
    console.log(`${B} [${r}] manual trigger received`), Re(r, { force: !0, reason: "manual" }).catch((s) => {
      console.error(`${B} [${r}] manual rebuild failed:`, s);
    });
    return;
  }
  if (e.summary.summaryMode === "ai" && e.summary.summaryTriggerPolicy === "manual") {
    console.log(`${B} [${r}] skip scheduling: ai mode manual-only policy`);
    return;
  }
  if (e.summary.summaryMode === "ai" && e.summary.summaryTriggerPolicy === "finalized") {
    const s = Math.max(6e4, e.summary.summaryFinalizeStableMs), d = Me.get(r);
    d && clearTimeout(d);
    const v = setTimeout(async () => {
      Me.delete(r);
      const w = await h.chapter.findUnique({
        where: { id: r },
        select: { wordCount: !0 }
      }), C = (w == null ? void 0 : w.wordCount) || 0;
      if (C < e.summary.summaryFinalizeMinWords) {
        console.log(
          `${B} [${r}] finalized trigger skipped (wordCount=${C}, min=${e.summary.summaryFinalizeMinWords})`
        );
        return;
      }
      console.log(`${B} [${r}] finalized trigger fired after stable window ${s}ms`), Re(r, { force: !0, reason: "finalized" }).catch((S) => {
        console.error(`${B} [${r}] finalized rebuild failed:`, S);
      });
    }, s);
    Me.set(r, v), console.log(`${B} [${r}] finalized trigger scheduled (${s}ms stable window)`);
    return;
  }
  const n = e.summary.summaryMode === "ai", a = Math.max(n ? 3e5 : 1e3, e.summary.summaryDebounceMs), i = ke.get(r);
  if (n) {
    if (i) {
      const s = (ye.get(r) || 0) + 1;
      ye.set(r, s), s % 10 === 0 && console.log(`${B} [${r}] ai mode coalescing saves (${s} updates queued, timer unchanged)`);
      return;
    }
    ye.set(r, 1), console.log(`${B} [${r}] ai mode scheduled (${a}ms, fixed window)`);
  } else
    i ? (clearTimeout(i), console.log(`${B} [${r}] debounce reset (${a}ms)`)) : console.log(`${B} [${r}] debounce scheduled (${a}ms)`);
  const c = setTimeout(() => {
    ke.delete(r);
    const s = ye.get(r) || 0;
    ye.delete(r), console.log(n ? `${B} [${r}] ai mode fired after coalescing ${s} saves` : `${B} [${r}] debounce fired, evaluating rebuild`), Re(r).catch((d) => {
      console.error(`${B} [${r}] rebuild failed:`, d);
    });
  }, a);
  ke.set(r, c);
}
function wr(r) {
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
          throw new z("INVALID_INPUT", "novelId is required");
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
          throw new z("INVALID_INPUT", "volumeId is required");
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
          throw new z("INVALID_INPUT", "volumeId is required");
        let n = e.order;
        if (!Number.isFinite(n)) {
          const i = await h.chapter.findFirst({
            where: { volumeId: e.volumeId },
            orderBy: { order: "desc" }
          });
          n = ((i == null ? void 0 : i.order) || 0) + 1;
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
          throw new z("INVALID_INPUT", "chapterId is required");
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
          throw new z("INVALID_INPUT", "chapterId is required");
        if (typeof e.content != "string")
          throw new z("INVALID_INPUT", "content is required");
        const n = e.source === "ai_ui" ? "ai_ui" : "ai_agent", a = await h.chapter.findUnique({
          where: { id: e.chapterId },
          select: { id: !0, content: !0, updatedAt: !0, wordCount: !0, volume: { select: { novelId: !0 } } }
        });
        if (!a || !a.volume)
          throw new z("NOT_FOUND", "Chapter or volume not found");
        const i = e.content.length, c = i - a.wordCount;
        try {
          const [, s] = await h.$transaction([
            h.novel.update({
              where: { id: a.volume.novelId },
              data: { wordCount: { increment: c }, updatedAt: /* @__PURE__ */ new Date() }
            }),
            h.chapter.update({
              where: { id: e.chapterId },
              data: { content: e.content, wordCount: i, updatedAt: /* @__PURE__ */ new Date() }
            })
          ]);
          return We(e.chapterId), {
            chapter: s,
            saveMeta: {
              source: n,
              rollbackPoint: {
                chapterId: a.id,
                content: a.content,
                updatedAt: a.updatedAt
              }
            }
          };
        } catch (s) {
          const d = te(s);
          throw new z("PERSISTENCE_ERROR", d.message);
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
          throw new z("INVALID_INPUT", "novelId, chapterId, currentContent are required");
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
          throw new z("INVALID_INPUT", "novelId is required");
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
          throw new z("INVALID_INPUT", "novelId is required");
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
          throw new z("INVALID_INPUT", "novelId is required");
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
          throw new z("INVALID_INPUT", "novelId is required");
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
          throw new z("INVALID_INPUT", "novelId and keyword are required");
        return St(e.novelId, e.keyword, e.limit ?? 20, e.offset ?? 0);
      }
    }
  ];
}
function vr(r) {
  return r.trim() ? (r.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((e) => e.replace(/^['"]|['"]$/g, "")) : [];
}
class at {
  constructor(t) {
    ee(this, "name", "mcp-cli");
    this.settings = t;
  }
  async healthCheck() {
    const { cliPath: t } = this.settings.mcpCli;
    if (!t.trim())
      return { ok: !1, detail: "MCP CLI path is empty" };
    if (!j.existsSync(t))
      return { ok: !1, detail: "MCP CLI path does not exist" };
    try {
      O("INFO", "McpCliProvider.healthCheck.request", "MCP CLI health check request", {
        cliPath: t,
        timeoutMs: this.settings.mcpCli.startupTimeoutMs
      });
      const { stdout: e } = await this.runProcess(["--version"], "", this.settings.mcpCli.startupTimeoutMs);
      return O("INFO", "McpCliProvider.healthCheck.response", "MCP CLI health check response", {
        cliPath: t,
        stdout: e
      }), { ok: !0, detail: (e || "MCP CLI is executable").slice(0, 200) };
    } catch (e) {
      return se("McpCliProvider.healthCheck.error", e, { cliPath: t }), { ok: !1, detail: `MCP CLI check failed: ${(e == null ? void 0 : e.message) || "unknown error"}` };
    }
  }
  async generate(t) {
    const e = t.prompt.trim();
    if (!e)
      return { text: "", model: "mcp-cli" };
    const n = this.settings.mcpCli.argsTemplate || "", a = n.includes("{prompt}"), i = vr(n.replace("{prompt}", e));
    O("INFO", "McpCliProvider.generate.request", "MCP CLI generate request", {
      cliPath: this.settings.mcpCli.cliPath,
      args: i,
      prompt: a ? "" : e,
      promptEmbeddedInArgs: a
    });
    const { stdout: c } = await this.runProcess(i, a ? "" : e, this.settings.mcpCli.startupTimeoutMs);
    return O("INFO", "McpCliProvider.generate.response", "MCP CLI generate response", {
      cliPath: this.settings.mcpCli.cliPath,
      stdout: c
    }), {
      text: c.trim(),
      model: "mcp-cli"
    };
  }
  async runProcess(t, e, n) {
    const { cliPath: a, workingDir: i, envJson: c } = this.settings.mcpCli, s = this.parseEnvJson(c), d = Date.now();
    return new Promise((v, w) => {
      const C = Zt(a, t, {
        cwd: i || process.cwd(),
        env: { ...process.env, ...s },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: !0
      });
      let S = "", p = "", g = !1;
      const f = setTimeout(() => {
        g || (g = !0, C.kill("SIGTERM"), O("ERROR", "McpCliProvider.runProcess.timeout", "MCP CLI process timeout", {
          cliPath: a,
          args: t,
          elapsedMs: Date.now() - d
        }), w(new Error("MCP CLI process timeout")));
      }, Math.max(1e3, n));
      C.stdout.on("data", (m) => {
        S += m.toString();
      }), C.stderr.on("data", (m) => {
        p += m.toString();
      }), C.on("error", (m) => {
        g || (g = !0, clearTimeout(f), se("McpCliProvider.runProcess.error", m, {
          cliPath: a,
          args: t,
          elapsedMs: Date.now() - d,
          env: ie(s)
        }), w(m));
      }), C.on("close", (m) => {
        if (!g) {
          if (g = !0, clearTimeout(f), m !== 0) {
            O("ERROR", "McpCliProvider.runProcess.exit", "MCP CLI exited with non-zero code", {
              cliPath: a,
              args: t,
              code: m,
              elapsedMs: Date.now() - d,
              stderr: p
            }), w(new Error(`MCP CLI exited with code ${m}: ${p.slice(0, 300)}`));
            return;
          }
          O("INFO", "McpCliProvider.runProcess.exit", "MCP CLI process completed", {
            cliPath: a,
            args: t,
            code: m,
            elapsedMs: Date.now() - d,
            stderr: p
          }), v({ stdout: S, stderr: p });
        }
      }), e && C.stdin.write(e), C.stdin.end();
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
      for (const [a, i] of Object.entries(e))
        n[a] = String(i ?? "");
      return n;
    } catch {
      return {};
    }
  }
}
function $e(r) {
  const t = /* @__PURE__ */ new Set(), e = [];
  for (const n of r) {
    const a = String(n || "").trim();
    if (!a)
      continue;
    const i = a.toLowerCase();
    t.has(i) || (t.add(i), e.push(a));
  }
  return e;
}
function _e(r) {
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
function Ir(r) {
  const t = (r.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length, e = r.length - t;
  return Math.ceil(t * 1.5 + e * 0.4);
}
class Sr {
  async buildForCreativeAssets(t) {
    const e = t.includeExistingEntities !== !1, n = Math.max(0, Math.min(8, t.contextChapterCount ?? 0)), a = t.filterCompletedPlotLines !== !1, i = [], [c, s, d, v, w, C] = await Promise.all([
      e ? h.character.findMany({
        where: { novelId: t.novelId },
        select: { name: !0, role: !0, description: !0 },
        orderBy: { updatedAt: "desc" },
        take: 30
      }) : [],
      e ? h.item.findMany({
        where: { novelId: t.novelId },
        select: { name: !0, type: !0, description: !0 },
        orderBy: { updatedAt: "desc" },
        take: 30
      }) : [],
      e ? h.plotLine.findMany({
        where: { novelId: t.novelId },
        include: {
          points: {
            select: { title: !0, status: !0, description: !0 },
            orderBy: { order: "asc" }
          }
        },
        orderBy: { sortOrder: "asc" }
      }) : [],
      // 世界观始终全量传递
      h.worldSetting.findMany({
        where: { novelId: t.novelId },
        select: { name: !0, content: !0, type: !0 },
        orderBy: { sortOrder: "asc" }
      }),
      n > 0 ? h.chapter.findMany({
        where: { volume: { novelId: t.novelId } },
        select: { id: !0, title: !0, content: !0, updatedAt: !0 },
        orderBy: { updatedAt: "desc" },
        take: n
      }) : [],
      h.narrativeSummary.findMany({
        where: {
          novelId: t.novelId,
          isLatest: !0,
          status: "active",
          level: "novel"
        },
        orderBy: { updatedAt: "desc" },
        take: 1
      })
    ]), S = d.map((_) => {
      const x = Array.isArray(_.points) ? _.points : [], T = a ? x.filter((M) => M.status !== "resolved") : x;
      return {
        name: String(_.name || ""),
        description: _.description ? String(_.description) : void 0,
        points: T.map((M) => ({
          title: String(M.title || ""),
          status: String(M.status || "active")
        }))
      };
    }), p = w.map((_) => _.id), g = p.length > 0 ? await h.chapterSummary.findMany({
      where: {
        chapterId: { in: p },
        isLatest: !0,
        status: "active"
      },
      orderBy: { updatedAt: "desc" }
    }) : [], f = /* @__PURE__ */ new Map();
    for (const _ of g)
      f.has(_.chapterId) || f.set(_.chapterId, _);
    let m = 0;
    const u = w.map((_) => {
      const x = f.get(_.id), T = (x == null ? void 0 : x.compressedMemory) || (x == null ? void 0 : x.summaryText);
      return typeof T == "string" && T.trim() ? { chapterId: _.id, title: _.title || "", summary: T.slice(0, 800) } : (m++, {
        chapterId: _.id,
        title: _.title || "",
        summary: _e(_.content || "").slice(0, 600)
      });
    });
    m > 0 && i.push(`${m} 个章节缺少摘要，已使用原文摘录替代。`);
    const o = C.map((_) => {
      let x = [];
      if (typeof _.keyFacts == "string" && _.keyFacts.trim())
        try {
          const T = JSON.parse(_.keyFacts);
          Array.isArray(T) && (x = $e(
            T.map((M) => String(M || "").trim()).filter(Boolean).slice(0, 12)
          ).slice(0, 8));
        } catch {
        }
      return {
        level: _.level === "volume" ? "volume" : "novel",
        title: String(_.title || ""),
        summaryText: String(_.summaryText || "").slice(0, 1500),
        keyFacts: x
      };
    }), l = {
      characters: c.map((_) => ({
        name: String(_.name || ""),
        role: _.role ? String(_.role) : void 0,
        description: _.description ? String(_.description).slice(0, 200) : void 0
      })),
      items: s.map((_) => ({
        name: String(_.name || ""),
        type: _.type ? String(_.type) : void 0,
        description: _.description ? String(_.description).slice(0, 200) : void 0
      })),
      plotLines: S,
      worldSettings: v.map((_) => ({
        name: String(_.name || ""),
        content: String(_.content || ""),
        type: String(_.type || "other")
      }))
    }, y = JSON.stringify({ existingEntities: l, recentSummaries: u, narrativeSummaries: o }), I = Ir(y), E = [];
    return l.characters.length > 0 && E.push(`characters_${l.characters.length}`), l.items.length > 0 && E.push(`items_${l.items.length}`), l.plotLines.length > 0 && E.push(`plotLines_${l.plotLines.length}`), E.push(`worldSettings_${l.worldSettings.length}`), u.length > 0 && E.push(`recentChapterSummaries_${u.length}`), o.length > 0 && E.push(`narrativeSummaries_${o.length}`), E.push(`estimatedTokens_${I}`), {
      existingEntities: l,
      recentSummaries: u,
      narrativeSummaries: o,
      usedContext: E,
      warnings: i,
      estimatedTokens: I
    };
  }
  async buildForContinueWriting(t) {
    const e = Math.max(1, Math.min(8, t.contextChapterCount ?? 3)), n = Math.max(0, Math.min(e, t.recentRawChapterCount ?? 2)), [a, i, c, s, d, v, w] = await Promise.all([
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
    ]), C = Array.isArray(t.ideaIds) ? t.ideaIds.map((L) => String(L)).filter(Boolean) : [], S = C.length > 0 ? await h.idea.findMany({
      where: {
        novelId: t.novelId,
        id: { in: C }
      },
      include: { tags: !0 },
      orderBy: { updatedAt: "desc" },
      take: 20
    }) : [], p = v.map((L) => L.id), g = p.length > 0 ? await h.chapterSummary.findMany({
      where: {
        chapterId: { in: p },
        isLatest: !0,
        status: "active"
      },
      orderBy: { updatedAt: "desc" }
    }) : [], f = /* @__PURE__ */ new Map();
    for (const L of g)
      f.has(L.chapterId) || f.set(L.chapterId, L);
    const m = { value: 0 }, o = (await h.narrativeSummary.findMany({
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
    })).map((L) => {
      let Z = [];
      if (typeof L.keyFacts == "string" && L.keyFacts.trim())
        try {
          const X = JSON.parse(L.keyFacts);
          Array.isArray(X) && (Z = $e(
            X.map((oe) => String(oe || "").trim()).filter(Boolean).slice(0, 12)
          ).slice(0, 5));
        } catch {
          Z = [];
        }
      return {
        level: L.level === "volume" ? "volume" : "novel",
        title: String(L.title || ""),
        summaryText: String(L.summaryText || "").slice(0, 1200),
        keyFacts: Z
      };
    }), l = v.map((L, Z) => ({
      chapterId: L.id,
      title: L.title || "",
      excerpt: (() => {
        if (Z < n)
          return _e(L.content || "").slice(-1200);
        const X = f.get(L.id), oe = (X == null ? void 0 : X.compressedMemory) || (X == null ? void 0 : X.summaryText);
        return typeof oe == "string" && oe.trim() ? oe.slice(-1200) : (m.value += 1, _e(L.content || "").slice(-1200));
      })()
    })), y = _e(t.currentContent || "").slice(-2400), I = S.map((L) => ({
      ideaId: L.id,
      content: (L.content || "").slice(0, 800),
      quote: typeof L.quote == "string" ? L.quote.slice(0, 300) : void 0,
      tags: Array.isArray(L.tags) ? L.tags.map((Z) => String(Z.name || "").trim()).filter(Boolean).slice(0, 12) : []
    })), E = {
      characters: new Set(
        c.map((L) => String((L == null ? void 0 : L.name) || "").trim()).filter(Boolean)
      ),
      items: new Set(
        s.map((L) => String((L == null ? void 0 : L.name) || "").trim()).filter(Boolean)
      ),
      worldSettings: new Set(
        a.map((L) => String((L == null ? void 0 : L.name) || "").trim()).filter(Boolean)
      )
    }, _ = [], x = /@([^\s@，。！？,!.;；:："'""''()\[\]{}<>]+)/g;
    for (const L of I) {
      const Z = `${L.content || ""}
${L.quote || ""}`, X = Array.from(Z.matchAll(x));
      for (const oe of X) {
        const le = String(oe[1] || "").trim();
        le && (E.characters.has(le) ? _.push({ name: le, kind: "character" }) : E.items.has(le) ? _.push({ name: le, kind: "item" }) : E.worldSettings.has(le) && _.push({ name: le, kind: "worldSetting" }));
      }
    }
    const T = $e(_.map((L) => `${L.kind}:${L.name}`)).map((L) => {
      const [Z, ...X] = L.split(":");
      return {
        name: X.join(":"),
        kind: Z === "character" || Z === "item" || Z === "worldSetting" ? Z : "character"
      };
    }).slice(0, 20), M = String(t.currentLocation || "").trim().slice(0, 120), K = Math.max(0, C.length - I.length), Q = [];
    return m.value > 0 && Q.push(`${m.value} chapter summaries missing; fell back to chapter text excerpts.`), K > 0 && Q.push(`${K} selected ideas not found; ignored.`), {
      hardContext: {
        worldSettings: a,
        plotLines: i,
        characters: c,
        items: s,
        maps: d
      },
      dynamicContext: {
        recentChapters: l,
        selectedIdeas: I,
        selectedIdeaEntities: T,
        currentChapterBeforeCursor: y,
        ...M ? { currentLocation: M } : {},
        narrativeSummaries: o
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
        o.length > 0 ? `narrative_summaries_${o.length}` : "narrative_summaries_0",
        I.length > 0 ? `selected_ideas_${I.length}` : "selected_ideas_0",
        T.length > 0 ? `selected_idea_entities_${T.length}` : "selected_idea_entities_0",
        ...M ? ["current_location"] : [],
        "current_chapter_before_cursor"
      ],
      warnings: Q
    };
  }
}
const Fe = 10 * 1024 * 1024, Cr = 2e3, it = /* @__PURE__ */ new Set(["foreshadowing", "mystery", "promise", "event"]), st = /* @__PURE__ */ new Set(["active", "resolved"]), Er = /* @__PURE__ */ new Set(["item", "skill", "location"]), _r = /* @__PURE__ */ new Set(["world", "region", "scene"]), Ae = ["plotLines", "plotPoints", "characters", "items", "skills", "maps"], Ar = {
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
], Dr = [
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
], de = {
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
    maxTokens: 4096,
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
function Lr(r) {
  const t = (r || "").toLowerCase();
  return t.includes("jpeg") || t.includes("jpg") ? "jpg" : t.includes("webp") ? "webp" : t.includes("gif") ? "gif" : t.includes("bmp") ? "bmp" : "png";
}
function Nr(r) {
  return r.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function Pr(r) {
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
function Tr(r) {
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
function ot(r, t) {
  const e = [];
  return r != null && r.trim() && e.push(`[System Prompt]
${r.trim()}`), e.push(`[User Prompt]
${t.trim()}`), e.join(`

`);
}
function R(r, t) {
  const e = typeof r == "string" ? r.trim() : "";
  return e ? e.length > t ? e.slice(0, t) : e : "";
}
function xr(r, t) {
  const e = /* @__PURE__ */ new Set(), n = [];
  for (const a of r) {
    const i = String(a || "").trim();
    if (!i)
      continue;
    const c = i.toLowerCase();
    if (!e.has(c) && (e.add(c), n.push(i), n.length >= t))
      break;
  }
  return n;
}
class br {
  constructor(t) {
    ee(this, "userDataPath");
    ee(this, "settingsFilePath");
    ee(this, "mapImageStatsPath");
    ee(this, "settingsCache");
    ee(this, "mapImageStatsCache");
    ee(this, "capabilityDefinitions");
    ee(this, "capabilityRegistry");
    ee(this, "contextBuilder");
    this.userDataPath = t(), this.settingsFilePath = N.join(this.userDataPath, "ai-settings.json"), this.mapImageStatsPath = N.join(this.userDataPath, "ai-map-image-stats.json"), this.settingsCache = this.loadSettings(), this.mapImageStatsCache = this.loadMapImageStats(), this.contextBuilder = new Sr(), this.capabilityDefinitions = wr({
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
    const t = new Set(this.capabilityDefinitions.map((c) => c.actionId)), e = Dr.map((c) => {
      const s = c.requiredActions.filter((w) => !t.has(w)), d = c.requiredActions.filter((w) => t.has(w)), v = c.requiredActions.length === 0 ? 0 : Math.round(d.length / c.requiredActions.length * 100);
      return {
        moduleId: c.moduleId,
        title: c.title,
        requiredActions: [...c.requiredActions],
        supportedActions: d,
        missingActions: s,
        coverage: v
      };
    }), n = e.reduce((c, s) => c + s.requiredActions.length, 0), a = e.reduce((c, s) => c + s.supportedActions.length, 0);
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
    return new at(this.settingsCache).healthCheck();
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
    const e = t.kind === "skill" ? "skill" : "mcp", n = e === "mcp" ? this.getOpenClawManifest().tools.map((o) => o.name) : this.getOpenClawSkillManifest().skills.map((o) => o.name);
    if (!n.length)
      return {
        ok: !1,
        kind: e,
        detail: e === "mcp" ? "No OpenClaw MCP tools available" : "No OpenClaw skills available",
        missingActions: [...Ue],
        checks: []
      };
    const a = Ue.filter((o) => !n.includes(o)), i = [], c = (o, l, y, I) => {
      i.push({ actionId: o, ok: l, detail: y, ...I ? { skipped: !0 } : {} });
    };
    a.length ? c("manifest.coverage", !1, `Missing required actions: ${a.join(", ")}`) : c("manifest.coverage", !0, `All required actions are covered (${Ue.length})`);
    const s = (o, l) => e === "mcp" ? this.invokeOpenClawTool({ name: o, arguments: l }) : this.invokeOpenClawSkill({ name: o, input: l }), d = await s("novel.list");
    if (!d.ok)
      return c("novel.list", !1, d.error || "invoke failed"), {
        ok: !1,
        kind: e,
        detail: `OpenClaw ${e.toUpperCase()} smoke failed at novel.list: ${d.error || "unknown error"}`,
        missingActions: a,
        checks: i
      };
    c("novel.list", !0, "invoke ok");
    const w = (m = (Array.isArray(d.data) ? d.data : []).find((o) => typeof (o == null ? void 0 : o.id) == "string")) == null ? void 0 : m.id;
    if (!w) {
      c("volume.list", !0, "no novels in database; skipped", !0), c("chapter.list", !0, "no novels in database; skipped", !0);
      const o = a.length === 0;
      return {
        ok: o,
        kind: e,
        detail: o ? `OpenClaw ${e.toUpperCase()} smoke passed (manifest coverage ok, invoke ok, nested checks skipped due to empty data)` : `OpenClaw ${e.toUpperCase()} smoke partial pass (invoke ok, but manifest missing required actions: ${a.join(", ")})`,
        missingActions: a,
        checks: i
      };
    }
    const C = await s("volume.list", { novelId: w });
    if (!C.ok)
      return c("volume.list", !1, C.error || "invoke failed"), {
        ok: !1,
        kind: e,
        detail: `OpenClaw ${e.toUpperCase()} smoke failed at volume.list: ${C.error || "unknown error"}`,
        missingActions: a,
        checks: i
      };
    c("volume.list", !0, "invoke ok");
    const p = (u = (Array.isArray(C.data) ? C.data : []).find((o) => typeof (o == null ? void 0 : o.id) == "string")) == null ? void 0 : u.id;
    if (!p) {
      c("chapter.list", !0, "no volumes under first novel; skipped", !0);
      const o = a.length === 0;
      return {
        ok: o,
        kind: e,
        detail: o ? `OpenClaw ${e.toUpperCase()} smoke passed (manifest coverage ok, read-chain invoke ok)` : `OpenClaw ${e.toUpperCase()} smoke partial pass (read-chain ok, but manifest missing required actions: ${a.join(", ")})`,
        missingActions: a,
        checks: i
      };
    }
    const g = await s("chapter.list", { volumeId: p });
    if (!g.ok)
      return c("chapter.list", !1, g.error || "invoke failed"), {
        ok: !1,
        kind: e,
        detail: `OpenClaw ${e.toUpperCase()} smoke failed at chapter.list: ${g.error || "unknown error"}`,
        missingActions: a,
        checks: i
      };
    c("chapter.list", !0, "invoke ok");
    const f = a.length === 0;
    return {
      ok: f,
      kind: e,
      detail: f ? `OpenClaw ${e.toUpperCase()} smoke passed (manifest coverage + read-chain invoke all ok)` : `OpenClaw ${e.toUpperCase()} smoke partial pass (invoke ok, but manifest missing required actions: ${a.join(", ")})`,
      missingActions: a,
      checks: i
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
    O("INFO", "AiService.generateTitle.start", "Generate title start", {
      chapterId: t.chapterId,
      novelId: t.novelId,
      providerType: this.settingsCache.providerType
    });
    const e = this.getProvider(), n = Math.max(5, Math.min(10, t.count ?? 6)), i = Pr(t.content).slice(0, 4e3), c = await h.novel.findUnique({
      where: { id: t.novelId },
      select: { title: !0, description: !0 }
    }), s = await h.chapter.findUnique({
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
    }), v = (await h.chapter.findMany({
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
    })).map((o, l) => {
      var y, I;
      return {
        index: l + 1,
        volumeTitle: ((y = o.volume) == null ? void 0 : y.title) || "",
        volumeOrder: ((I = o.volume) == null ? void 0 : I.order) || 0,
        chapterOrder: o.order || 0,
        title: o.title || `Chapter-${l + 1}`
      };
    }), w = [
      "You are a Chinese novel title assistant.",
      "Generate concise chapter title candidates based on provided context.",
      "Return STRICT JSON only. No markdown.",
      'JSON shape: {"candidates":[{"title":"...","styleTag":"..."}]}',
      "Each styleTag must be short Chinese phrase like: 稳健推进, 悬念强化, 意象抒情."
    ].join(" "), C = await e.generate({
      systemPrompt: w,
      prompt: JSON.stringify({
        task: "chapter_title_generation",
        count: n,
        novel: {
          title: (c == null ? void 0 : c.title) || "",
          description: (c == null ? void 0 : c.description) || ""
        },
        chapter: {
          title: (s == null ? void 0 : s.title) || "",
          order: (s == null ? void 0 : s.order) || 0,
          volumeTitle: ((m = s == null ? void 0 : s.volume) == null ? void 0 : m.title) || "",
          volumeOrder: ((u = s == null ? void 0 : s.volume) == null ? void 0 : u.order) || 0
        },
        recentChapterTitles: v,
        currentChapterFullText: i,
        constraints: [
          "title length <= 16 Chinese characters preferred",
          "avoid spoilers and proper nouns overuse",
          "output 5-10 candidates"
        ]
      }),
      maxTokens: this.settingsCache.http.maxTokens,
      temperature: this.settingsCache.http.temperature
    }), S = (() => {
      try {
        return JSON.parse(C.text);
      } catch {
        return null;
      }
    })(), p = Array.isArray(S == null ? void 0 : S.candidates) ? S.candidates.map((o) => ({
      title: String((o == null ? void 0 : o.title) || "").trim(),
      styleTag: String((o == null ? void 0 : o.styleTag) || "").trim() || "稳健推进"
    })).filter((o) => !!o.title).slice(0, n) : [];
    if (p.length > 0)
      return O("INFO", "AiService.generateTitle.success", "Generate title success", {
        chapterId: t.chapterId,
        candidateCount: p.length
      }), { candidates: p };
    const g = C.text.split(`
`).map((o) => o.replace(/^[-\d.\s]+/, "").trim()).filter(Boolean).slice(0, n).map((o) => ({ title: o, styleTag: "稳健推进" }));
    if (g.length > 0)
      return O("INFO", "AiService.generateTitle.success", "Generate title success", {
        chapterId: t.chapterId,
        candidateCount: g.length
      }), { candidates: g };
    const f = ((s == null ? void 0 : s.title) || i.slice(0, 12) || "新章节").trim();
    return O("INFO", "AiService.generateTitle.success", "Generate title success", {
      chapterId: t.chapterId,
      candidateCount: n
    }), {
      candidates: Array.from({ length: n }, (o, l) => ({
        title: `${f} · ${l + 1}`,
        styleTag: "稳健推进"
      }))
    };
  }
  async previewContinuePrompt(t) {
    O("INFO", "AiService.previewContinuePrompt.start", "Preview continue prompt start", {
      chapterId: t.chapterId,
      novelId: t.novelId,
      contextChapterCount: t.contextChapterCount
    });
    const e = await this.buildContinuePromptBundle(t);
    return O("INFO", "AiService.previewContinuePrompt.success", "Preview continue prompt success", {
      chapterId: t.chapterId
    }), {
      structured: e.structured,
      rawPrompt: ot(e.systemPrompt, e.effectiveUserPrompt),
      editableUserPrompt: e.defaultUserPrompt,
      usedContext: e.usedContext,
      warnings: e.warnings
    };
  }
  async continueWriting(t) {
    O("INFO", "AiService.continueWriting.start", "Continue writing start", {
      chapterId: t.chapterId,
      novelId: t.novelId,
      providerType: this.settingsCache.providerType,
      targetLength: t.targetLength,
      contextChapterCount: t.contextChapterCount
    });
    const e = this.getProvider(), n = await this.buildContinuePromptBundle(t), a = Number.isFinite(t.temperature) ? Math.max(0, Math.min(2, Number(t.temperature))) : this.settingsCache.http.temperature, i = await e.generate({
      systemPrompt: n.systemPrompt,
      prompt: n.effectiveUserPrompt,
      maxTokens: this.settingsCache.http.maxTokens,
      temperature: a
    }), c = await this.checkConsistency({
      novelId: t.novelId,
      text: i.text
    }), s = {
      text: i.text,
      usedContext: n.usedContext,
      warnings: n.warnings,
      consistency: c
    };
    return O("INFO", "AiService.continueWriting.success", "Continue writing success", {
      chapterId: t.chapterId,
      warningCount: n.warnings.length,
      generatedLength: s.text.length
    }), s;
  }
  async checkConsistency(t) {
    const e = [];
    return (await h.worldSetting.findMany({ where: { novelId: t.novelId } })).length === 0 && e.push("No world settings found for consistency baseline."), t.text.length < 20 && e.push("Generated text is too short."), { ok: e.length === 0, issues: e };
  }
  async previewCreativeAssetsPrompt(t) {
    var n;
    O("INFO", "AiService.previewCreativeAssetsPrompt.start", "Preview creative assets prompt start", {
      novelId: t.novelId,
      briefLength: ((n = t.brief) == null ? void 0 : n.length) ?? 0,
      targetSections: t.targetSections
    });
    const e = await this.buildCreativeAssetsPromptBundle(t);
    return O("INFO", "AiService.previewCreativeAssetsPrompt.success", "Preview creative assets prompt success", {
      novelId: t.novelId
    }), {
      structured: e.structured,
      rawPrompt: ot(e.systemPrompt, e.effectiveUserPrompt),
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
      Ar[a].some((c) => e.includes(c.toLowerCase())) && n.push(a);
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
    var v, w, C, S, p, g, f, m, u, o, l, y, I;
    O("INFO", "AiService.generateCreativeAssets.start", "Generate creative assets start", {
      novelId: t.novelId,
      briefLength: ((v = t.brief) == null ? void 0 : v.length) ?? 0,
      providerType: this.settingsCache.providerType,
      targetSections: t.targetSections
    });
    const e = this.getProvider(), n = await this.buildCreativeAssetsPromptBundle(t), a = this.resolveCreativeTargetSections(t), i = await e.generate({
      systemPrompt: n.systemPrompt,
      prompt: n.effectiveUserPrompt,
      maxTokens: this.settingsCache.http.maxTokens,
      temperature: this.settingsCache.http.temperature,
      // 创作工坊需要生成多个板块的结构化 JSON，内容量大，使用更宽裕的超时
      timeoutMs: Math.max(this.settingsCache.http.timeoutMs, 18e4)
    });
    try {
      const E = JSON.parse(i.text);
      if (E && typeof E == "object") {
        const _ = this.buildEmptyCreativeDraft(a);
        for (const x of a) {
          const T = E == null ? void 0 : E[x];
          _[x] = Array.isArray(T) ? T : [];
        }
        return O("INFO", "AiService.generateCreativeAssets.success", "Generate creative assets success", {
          novelId: t.novelId,
          counts: {
            plotLines: ((w = _.plotLines) == null ? void 0 : w.length) ?? 0,
            plotPoints: ((C = _.plotPoints) == null ? void 0 : C.length) ?? 0,
            characters: ((S = _.characters) == null ? void 0 : S.length) ?? 0,
            items: ((p = _.items) == null ? void 0 : p.length) ?? 0,
            skills: ((g = _.skills) == null ? void 0 : g.length) ?? 0,
            maps: ((f = _.maps) == null ? void 0 : f.length) ?? 0
          }
        }), { draft: _ };
      }
    } catch {
    }
    const c = Gt().slice(0, 6), s = {
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
    }, d = this.buildEmptyCreativeDraft(a);
    for (const E of a)
      d[E] = s[E] ?? [];
    return O("INFO", "AiService.generateCreativeAssets.success", "Generate creative assets success", {
      novelId: t.novelId,
      counts: {
        plotLines: ((m = d.plotLines) == null ? void 0 : m.length) ?? 0,
        plotPoints: ((u = d.plotPoints) == null ? void 0 : u.length) ?? 0,
        characters: ((o = d.characters) == null ? void 0 : o.length) ?? 0,
        items: ((l = d.items) == null ? void 0 : l.length) ?? 0,
        skills: ((y = d.skills) == null ? void 0 : y.length) ?? 0,
        maps: ((I = d.maps) == null ? void 0 : I.length) ?? 0
      }
    }), {
      draft: d
    };
  }
  async validateCreativeAssetsDraft(t) {
    var f, m;
    const e = [], n = [], a = (u) => e.push(u), i = (u, o, l = Cr) => {
      const y = typeof u == "string" ? u.trim() : "";
      return y ? y.length <= l ? y : (n.push(`${o} exceeds ${l} chars and was truncated`), y.slice(0, l)) : "";
    }, c = (u, o) => {
      if (!u || typeof u != "object" || Array.isArray(u))
        return {};
      const l = {};
      for (const [y, I] of Object.entries(u)) {
        const E = i(y, `${o}.key`, 64), _ = i(I, `${o}.${y}`, 500);
        E && _ && (l[E] = _);
      }
      return l;
    }, s = {
      plotLines: (t.draft.plotLines ?? []).map((u, o) => ({
        name: i(u.name, `plotLines[${o}].name`, 120),
        description: i(u.description, `plotLines[${o}].description`),
        color: i(u.color, `plotLines[${o}].color`, 16) || "#6366f1",
        points: (u.points ?? []).map((l, y) => {
          const I = i(l.type, `plotLines[${o}].points[${y}].type`, 32) || "event", E = i(l.status, `plotLines[${o}].points[${y}].status`, 32) || "active";
          return {
            title: i(l.title, `plotLines[${o}].points[${y}].title`, 120),
            description: i(l.description, `plotLines[${o}].points[${y}].description`),
            type: it.has(I) ? I : "event",
            status: st.has(E) ? E : "active"
          };
        })
      })),
      plotPoints: (t.draft.plotPoints ?? []).map((u, o) => {
        const l = i(u.type, `plotPoints[${o}].type`, 32) || "event", y = i(u.status, `plotPoints[${o}].status`, 32) || "active";
        return {
          title: i(u.title, `plotPoints[${o}].title`, 120),
          description: i(u.description, `plotPoints[${o}].description`),
          type: it.has(l) ? l : "event",
          status: st.has(y) ? y : "active",
          plotLineName: i(u.plotLineName, `plotPoints[${o}].plotLineName`, 120)
        };
      }),
      characters: (t.draft.characters ?? []).map((u, o) => ({
        name: i(u.name, `characters[${o}].name`, 120),
        role: i(u.role, `characters[${o}].role`, 64),
        description: i(u.description, `characters[${o}].description`),
        profile: c(u.profile, `characters[${o}].profile`)
      })),
      items: (t.draft.items ?? []).map((u, o) => {
        const l = i(u.type, `items[${o}].type`, 32) || "item";
        return {
          name: i(u.name, `items[${o}].name`, 120),
          type: Er.has(l) ? l : "item",
          description: i(u.description, `items[${o}].description`),
          profile: c(u.profile, `items[${o}].profile`)
        };
      }),
      skills: (t.draft.skills ?? []).map((u, o) => ({
        name: i(u.name, `skills[${o}].name`, 120),
        description: i(u.description, `skills[${o}].description`),
        profile: c(u.profile, `skills[${o}].profile`)
      })),
      maps: (t.draft.maps ?? []).map((u, o) => {
        const l = i(u.type, `maps[${o}].type`, 32) || "world";
        return {
          name: i(u.name, `maps[${o}].name`, 120),
          type: _r.has(l) ? l : "world",
          description: i(u.description, `maps[${o}].description`),
          imagePrompt: i(u.imagePrompt, `maps[${o}].imagePrompt`),
          imageUrl: i(u.imageUrl, `maps[${o}].imageUrl`, 2048),
          imageBase64: i(u.imageBase64, `maps[${o}].imageBase64`, 4194304),
          mimeType: i(u.mimeType, `maps[${o}].mimeType`, 64)
        };
      })
    };
    for (const [u, o] of (s.plotLines ?? []).entries()) {
      o.name || a({ scope: `plotLines[${u}]`, code: "INVALID_INPUT", detail: "Plot line name is required" });
      for (const [l, y] of (o.points ?? []).entries())
        y.title || a({ scope: `plotLines[${u}].points[${l}]`, code: "INVALID_INPUT", detail: "Plot point title is required" });
    }
    for (const [u, o] of (s.plotPoints ?? []).entries())
      o.title || a({ scope: `plotPoints[${u}]`, code: "INVALID_INPUT", detail: "Plot point title is required" });
    for (const [u, o] of (s.characters ?? []).entries())
      o.name || a({ scope: `characters[${u}]`, code: "INVALID_INPUT", detail: "Character name is required" });
    for (const [u, o] of (s.items ?? []).entries())
      o.name || a({ scope: `items[${u}]`, code: "INVALID_INPUT", detail: "Item name is required" });
    for (const [u, o] of (s.skills ?? []).entries())
      o.name || a({ scope: `skills[${u}]`, code: "INVALID_INPUT", detail: "Skill name is required" });
    for (const [u, o] of (s.maps ?? []).entries())
      if (o.name || a({ scope: `maps[${u}]`, code: "INVALID_INPUT", detail: "Map name is required" }), +!!o.imageBase64 + +!!o.imageUrl + +!!o.imagePrompt > 1 && a({
        scope: `maps[${u}]`,
        name: o.name,
        code: "INVALID_INPUT",
        detail: "Map image input must use only one source: imageBase64, imageUrl, or imagePrompt"
      }), o.imageUrl && !/^https?:\/\//i.test(o.imageUrl) && a({
        scope: `maps[${u}].imageUrl`,
        name: o.name,
        code: "INVALID_INPUT",
        detail: "Map imageUrl must start with http:// or https://"
      }), o.imageBase64)
        try {
          const y = Buffer.from(o.imageBase64, "base64").length;
          y === 0 && a({
            scope: `maps[${u}].imageBase64`,
            name: o.name,
            code: "INVALID_INPUT",
            detail: "Map imageBase64 is invalid"
          }), y > Fe && a({
            scope: `maps[${u}].imageBase64`,
            name: o.name,
            code: "INVALID_INPUT",
            detail: `Map imageBase64 exceeds ${Fe} bytes`
          });
        } catch {
          a({
            scope: `maps[${u}].imageBase64`,
            name: o.name,
            code: "INVALID_INPUT",
            detail: "Map imageBase64 is invalid"
          });
        }
    const d = (u, o) => {
      const l = /* @__PURE__ */ new Set();
      for (const y of u) {
        const I = (y.name || "").trim().toLowerCase();
        if (I) {
          if (l.has(I)) {
            a({
              scope: o,
              name: y.name,
              code: "CONFLICT",
              detail: `Duplicate name in current draft: ${y.name}`
            });
            continue;
          }
          l.add(I);
        }
      }
    };
    d(s.plotLines ?? [], "plotLines"), d(s.characters ?? [], "characters"), d(s.items ?? [], "items"), d(s.skills ?? [], "skills"), d(s.maps ?? [], "maps");
    const [v, w, C, S] = await Promise.all([
      h.plotLine.findMany({ where: { novelId: t.novelId }, select: { name: !0 } }),
      h.character.findMany({ where: { novelId: t.novelId }, select: { name: !0 } }),
      h.item.findMany({ where: { novelId: t.novelId }, select: { name: !0 } }),
      h.mapCanvas.findMany({ where: { novelId: t.novelId }, select: { name: !0 } })
    ]), p = {
      plotLines: new Set(v.map((u) => u.name.trim().toLowerCase())),
      characters: new Set(w.map((u) => u.name.trim().toLowerCase())),
      items: new Set(C.map((u) => u.name.trim().toLowerCase())),
      maps: new Set(S.map((u) => u.name.trim().toLowerCase()))
    }, g = (u, o, l) => {
      for (const y of u) {
        const I = (y.name || "").trim().toLowerCase();
        I && p[o].has(I) && a({
          scope: l,
          name: y.name,
          code: "CONFLICT",
          detail: `Name already exists in novel: ${y.name}`
        });
      }
    };
    return g(s.plotLines ?? [], "plotLines", "plotLines"), g(s.characters ?? [], "characters", "characters"), g(s.items ?? [], "items", "items"), g(s.skills ?? [], "items", "skills"), g(s.maps ?? [], "maps", "maps"), (((f = s.plotPoints) == null ? void 0 : f.length) ?? 0) > 0 && (((m = s.plotLines) == null ? void 0 : m.length) ?? 0) === 0 && n.push("Draft has plotPoints but no plotLines. System will create a default plot line when persisting."), {
      ok: e.length === 0,
      errors: e,
      warnings: n,
      normalizedDraft: s
    };
  }
  async confirmCreativeAssets(t) {
    var d, v, w, C, S, p;
    O("INFO", "AiService.confirmCreativeAssets.start", "Confirm creative assets start", {
      novelId: t.novelId,
      draftCounts: ie({
        plotLines: ((d = t.draft.plotLines) == null ? void 0 : d.length) ?? 0,
        plotPoints: ((v = t.draft.plotPoints) == null ? void 0 : v.length) ?? 0,
        characters: ((w = t.draft.characters) == null ? void 0 : w.length) ?? 0,
        items: ((C = t.draft.items) == null ? void 0 : C.length) ?? 0,
        skills: ((S = t.draft.skills) == null ? void 0 : S.length) ?? 0,
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
      return O("WARN", "AiService.confirmCreativeAssets.validationFailed", "Confirm creative assets validation failed", {
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
    const a = e.normalizedDraft, i = this.getProvider(), c = [];
    let s = { ...n };
    try {
      await h.$transaction(async (f) => {
        const m = { ...n }, u = /* @__PURE__ */ new Map();
        for (const l of a.plotLines ?? []) {
          const y = await f.plotLine.create({
            data: {
              novelId: t.novelId,
              name: l.name,
              description: l.description || null,
              color: l.color || "#6366f1",
              sortOrder: Date.now() + m.plotLines
            }
          });
          u.set(l.name.toLowerCase(), y.id), m.plotLines += 1;
          for (const I of l.points ?? [])
            await f.plotPoint.create({
              data: {
                novelId: t.novelId,
                plotLineId: y.id,
                title: I.title,
                description: I.description || null,
                type: I.type || "event",
                status: I.status || "active",
                order: Date.now() + m.plotPoints
              }
            }), m.plotPoints += 1;
        }
        const o = async (l) => {
          const y = (l || "").trim().toLowerCase();
          if (y && u.has(y))
            return u.get(y);
          const I = u.values().next().value;
          if (I)
            return I;
          const E = "AI 主线", _ = await f.plotLine.create({
            data: {
              novelId: t.novelId,
              name: E,
              description: "Auto-created for loose plot points",
              color: "#6366f1",
              sortOrder: Date.now() + m.plotLines
            }
          });
          return u.set(E.toLowerCase(), _.id), m.plotLines += 1, _.id;
        };
        for (const l of a.plotPoints ?? []) {
          const y = await o(l.plotLineName);
          await f.plotPoint.create({
            data: {
              novelId: t.novelId,
              plotLineId: y,
              title: l.title,
              description: l.description || null,
              type: l.type || "event",
              status: l.status || "active",
              order: Date.now() + m.plotPoints
            }
          }), m.plotPoints += 1;
        }
        for (const l of a.characters ?? [])
          await f.character.create({
            data: {
              novelId: t.novelId,
              name: l.name,
              role: l.role || null,
              description: l.description || null,
              profile: Be(l.profile),
              sortOrder: Date.now() + m.characters
            }
          }), m.characters += 1;
        for (const l of a.items ?? [])
          await f.item.create({
            data: {
              novelId: t.novelId,
              name: l.name,
              type: l.type || "item",
              description: l.description || null,
              profile: Be(l.profile),
              sortOrder: Date.now() + m.items
            }
          }), m.items += 1;
        for (const l of a.skills ?? [])
          await f.item.create({
            data: {
              novelId: t.novelId,
              name: l.name,
              type: "skill",
              description: l.description || null,
              profile: Be(l.profile),
              sortOrder: Date.now() + m.items + m.skills
            }
          }), m.skills += 1;
        for (const l of a.maps ?? []) {
          const y = await f.mapCanvas.create({
            data: {
              novelId: t.novelId,
              name: l.name,
              type: l.type || "world",
              description: l.description || null,
              sortOrder: Date.now() + m.maps
            }
          });
          m.maps += 1;
          let I = null;
          if (l.imageBase64 || l.imageUrl)
            I = {
              imageBase64: l.imageBase64,
              imageUrl: l.imageUrl,
              mimeType: l.mimeType
            };
          else if (l.imagePrompt) {
            if (!i.generateImage)
              throw new z("INVALID_INPUT", `Provider ${i.name} does not support image generation`);
            const E = await i.generateImage({ prompt: l.imagePrompt });
            if (!(E != null && E.imageBase64) && !(E != null && E.imageUrl))
              throw new z("PROVIDER_UNAVAILABLE", `Map image generation returned empty data for ${l.name}`);
            I = {
              imageBase64: E.imageBase64,
              imageUrl: E.imageUrl,
              mimeType: E.mimeType
            };
          }
          if (I) {
            const E = await this.saveImageAsset(t.novelId, y.id, I);
            c.push(E.absolutePath), await f.mapCanvas.update({
              where: { id: y.id },
              data: { background: E.relativePath }
            }), m.mapImages += 1;
          }
        }
        s = m;
      });
      const g = {
        success: !0,
        created: s,
        warnings: e.warnings,
        transactionMode: "atomic"
      };
      return O("INFO", "AiService.confirmCreativeAssets.success", "Confirm creative assets success", {
        novelId: t.novelId,
        created: s,
        warningCount: e.warnings.length
      }), g;
    } catch (g) {
      se("AiService.confirmCreativeAssets.error", g, {
        novelId: t.novelId
      });
      for (const u of c)
        try {
          j.existsSync(u) && j.unlinkSync(u);
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
    O("INFO", "AiService.previewMapPrompt.start", "Preview map prompt start", {
      novelId: t.novelId,
      mapId: t.mapId,
      promptLength: ((n = t.prompt) == null ? void 0 : n.length) ?? 0
    });
    const e = await this.buildMapPromptBundle(t);
    return O("INFO", "AiService.previewMapPrompt.success", "Preview map prompt success", {
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
    var a, i, c, s;
    O("INFO", "AiService.generateMapImage.start", "Generate map image start", {
      novelId: t.novelId,
      mapId: t.mapId,
      promptLength: ((a = t.prompt) == null ? void 0 : a.length) ?? 0,
      providerType: this.settingsCache.providerType
    });
    const e = Date.now(), n = (d) => (this.recordMapImageCall({
      ok: d.ok,
      code: d.code,
      detail: d.detail,
      latencyMs: Date.now() - e
    }), d);
    try {
      const d = !!((i = t.prompt) != null && i.trim()), v = !!((c = t.overrideUserPrompt) != null && c.trim());
      if (!d && !v)
        return n({ ok: !1, code: "INVALID_INPUT", detail: "Map prompt is empty" });
      const w = this.getProvider();
      if (!w.generateImage)
        return n({ ok: !1, code: "INVALID_INPUT", detail: `Provider ${w.name} does not support image generation` });
      const C = await this.buildMapPromptBundle(t), S = await w.generateImage({
        prompt: C.effectiveUserPrompt,
        model: this.settingsCache.http.imageModel || void 0,
        size: t.imageSize || this.settingsCache.http.imageSize || void 0,
        outputFormat: this.settingsCache.http.imageOutputFormat || void 0,
        watermark: this.settingsCache.http.imageWatermark
      });
      if (!S.imageBase64 && !S.imageUrl)
        return n({ ok: !1, code: "PROVIDER_UNAVAILABLE", detail: "Provider did not return any image data" });
      let p = t.mapId;
      if (p || (p = (await h.mapCanvas.create({
        data: {
          novelId: t.novelId,
          name: ((s = t.mapName) == null ? void 0 : s.trim()) || `AI 地图 ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
          type: t.mapType || "world",
          description: `Generated by AI with prompt: ${t.prompt}`,
          sortOrder: Date.now()
        }
      })).id), !p)
        throw new z("PERSISTENCE_ERROR", "Map id is missing after map creation");
      const g = await this.saveImageAsset(t.novelId, p, {
        imageBase64: S.imageBase64,
        imageUrl: S.imageUrl,
        mimeType: S.mimeType
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
      return O("INFO", "AiService.generateMapImage.success", "Generate map image success", {
        novelId: t.novelId,
        mapId: p,
        imagePath: g.relativePath
      }), f;
    } catch (d) {
      se("AiService.generateMapImage.error", d, {
        novelId: t.novelId,
        mapId: t.mapId
      });
      const v = te(d);
      return n({
        ok: !1,
        code: v.code,
        detail: v.message || "Map generation failed"
      });
    }
  }
  async executeAction(t) {
    const e = this.capabilityRegistry.get(t.actionId);
    if (!e)
      throw new z("INVALID_INPUT", `Unknown actionId: ${t.actionId}`);
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
        error: he(n.code, n.message || "OpenClaw invoke failed"),
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
        error: he(n.code, n.message || "OpenClaw skill invoke failed"),
        code: n.code
      };
    }
  }
  compactContinueHardContext(t) {
    const e = Array.isArray(t.worldSettings) ? t.worldSettings : [], n = Array.isArray(t.plotLines) ? t.plotLines : [], a = Array.isArray(t.characters) ? t.characters : [], i = Array.isArray(t.items) ? t.items : [], c = Array.isArray(t.maps) ? t.maps : [];
    return {
      worldSettings: e.slice(0, 60).map((s) => ({
        name: R(s == null ? void 0 : s.name, 80),
        type: R(s == null ? void 0 : s.type, 32) || "other",
        content: R(s == null ? void 0 : s.content, 300) || R(s == null ? void 0 : s.description, 300)
      })).filter((s) => s.content),
      plotLines: n.slice(0, 40).map((s) => ({
        name: R(s == null ? void 0 : s.name, 100),
        description: R(s == null ? void 0 : s.description, 260),
        points: Array.isArray(s == null ? void 0 : s.points) ? s.points.filter((d) => String((d == null ? void 0 : d.status) || "").trim().toLowerCase() !== "resolved").slice(0, 12).map((d) => ({
          title: R(d == null ? void 0 : d.title, 100),
          description: R(d == null ? void 0 : d.description, 220),
          type: R(d == null ? void 0 : d.type, 24) || "event",
          status: R(d == null ? void 0 : d.status, 24) || "active"
        })).filter((d) => d.title || d.description) : []
      })).filter((s) => {
        var d;
        return s.name || (((d = s.points) == null ? void 0 : d.length) ?? 0) > 0;
      }),
      characters: a.slice(0, 120).map((s) => ({
        name: R(s == null ? void 0 : s.name, 80),
        role: R(s == null ? void 0 : s.role, 32),
        description: R(s == null ? void 0 : s.description, 220)
      })).filter((s) => s.name && (s.role || s.description)),
      items: i.slice(0, 120).map((s) => ({
        name: R(s == null ? void 0 : s.name, 80),
        type: R(s == null ? void 0 : s.type, 32) || "item",
        description: R(s == null ? void 0 : s.description, 220)
      })).filter((s) => s.name && s.description),
      maps: c.slice(0, 60).map((s) => ({
        name: R(s == null ? void 0 : s.name, 80),
        type: R(s == null ? void 0 : s.type, 24) || "world",
        description: R(s == null ? void 0 : s.description, 220)
      })).filter((s) => s.name && s.description)
    };
  }
  compactContinueDynamicContext(t) {
    const e = Array.isArray(t.recentChapters) ? t.recentChapters : [], n = Array.isArray(t.selectedIdeas) ? t.selectedIdeas : [], a = Array.isArray(t.selectedIdeaEntities) ? t.selectedIdeaEntities : [], i = Array.isArray(t.narrativeSummaries) ? t.narrativeSummaries : [], c = R(t.currentLocation, 120);
    return {
      recentChapters: e.slice(0, 8).map((s) => ({
        title: R(s == null ? void 0 : s.title, 120),
        excerpt: R(s == null ? void 0 : s.excerpt, 1200)
      })).filter((s) => s.title || s.excerpt),
      selectedIdeas: n.slice(0, 20).map((s) => ({
        content: R(s == null ? void 0 : s.content, 800),
        quote: R(s == null ? void 0 : s.quote, 300),
        tags: Array.isArray(s == null ? void 0 : s.tags) ? s.tags.slice(0, 12).map((d) => R(d, 32)).filter(Boolean) : []
      })).filter((s) => s.content || s.quote),
      selectedIdeaEntities: a.slice(0, 20).map((s) => ({
        name: R(s == null ? void 0 : s.name, 80),
        kind: R(s == null ? void 0 : s.kind, 24)
      })).filter((s) => s.name && s.kind),
      currentChapterBeforeCursor: R(t.currentChapterBeforeCursor, 2600),
      ...c ? { currentLocation: c } : {},
      narrativeSummaries: i.slice(0, 4).map((s) => ({
        level: (s == null ? void 0 : s.level) === "volume" ? "volume" : "novel",
        title: R(s == null ? void 0 : s.title, 100),
        summaryText: R(s == null ? void 0 : s.summaryText, 1200),
        keyFacts: Array.isArray(s == null ? void 0 : s.keyFacts) ? xr(s.keyFacts.map((d) => R(d, 160)).filter(Boolean), 5) : []
      }))
    };
  }
  async buildContinuePromptBundle(t) {
    var f;
    const e = /^zh/i.test(String(t.locale || "").trim()), n = t.mode === "new_chapter" ? "new_chapter" : "continue_chapter", a = await this.contextBuilder.buildForContinueWriting({
      ...t,
      mode: n,
      recentRawChapterCount: t.recentRawChapterCount ?? this.settingsCache.summary.recentChapterRawCount
    }), i = this.compactContinueHardContext(a.hardContext), c = this.compactContinueDynamicContext(a.dynamicContext), s = R(t.userIntent, 800), d = R(t.currentLocation, 120), v = {
      ...a.params,
      targetLength: e ? `约${Math.max(100, Math.min(4e3, Number(a.params.targetLength || 500)))}汉字` : `about ${Math.max(100, Math.min(4e3, Number(a.params.targetLength || 500)))} Chinese characters`
    }, w = e ? "你是中文小说续写助手。严格遵守世界观和大纲，不得破坏既有设定与人物行为逻辑。" : "Continue writing with strict consistency to world settings and plot outline. Do not break established lore.", S = [
      `WriteMode=${n}`,
      `HardContext=
${JSON.stringify(i, null, 2).slice(0, 18e3)}`,
      `DynamicContext=
${JSON.stringify(c, null, 2).slice(0, 12e3)}`,
      `WriteParams=
${JSON.stringify(v, null, 2)}`,
      ...s ? [`UserIntent=${s}`] : [],
      ...d ? [`CurrentLocation=${d}`] : [],
      n === "new_chapter" ? e ? "Constraint=基于大纲与世界观写出新章节开场，不得复述已有段落。" : "Constraint=Start a fresh chapter opening based on outline and world context. Do not echo prior chapter paragraphs." : e ? "Constraint=仅输出新增续写内容，不得重复当前章节或上下文已出现段落。" : "Constraint=Output must be NEW continuation content only. Do not restate prior paragraphs from current chapter or context.",
      e ? "Constraint=@实体名 表示对上下文中同名角色/物品/地点/设定的引用，续写时应保持实体设定一致。" : "Constraint=@EntityName means referencing the same named entity from context; keep entity traits consistent.",
      ...s ? [e ? "Constraint=尽量满足用户意图，但不得违反世界观与主线大纲。" : "Constraint=Prioritize the user intent when possible, but never violate established world settings and plot outline."] : [],
      e ? "Constraint=请严格遵守 HardContext 中的世界观、角色性格和物品设定；情节推进需与已有情节点保持一致。" : "Constraint=Strictly follow HardContext lore, character traits, and item settings; keep progression aligned with existing plot points.",
      e ? "Constraint=你的任务是续写光标后的新内容，不要重复 currentChapterBeforeCursor 里的任何句子。" : "Constraint=Write only the continuation after cursor; do not repeat any sentence from currentChapterBeforeCursor."
    ].join(`

`), p = (f = t.overrideUserPrompt) != null && f.trim() ? t.overrideUserPrompt.trim() : S, g = {
      ...a.params,
      ...s ? { userIntent: s } : {},
      ...d ? { currentLocation: d } : {}
    };
    return {
      systemPrompt: w,
      defaultUserPrompt: S,
      effectiveUserPrompt: p,
      structured: {
        goal: n === "new_chapter" ? e ? "生成新章节开场内容。" : "Generate opening content for a new chapter." : e ? "仅生成续写新增内容。" : "Generate continuation content only.",
        contextRefs: a.usedContext,
        params: g,
        constraints: [
          ...e ? ["严格遵守世界观与大纲一致性。"] : ["Keep strict consistency with world settings and outline."],
          ...s ? [e ? "在不冲突时优先满足用户意图。" : "Respect user intent when it does not conflict with hard context."] : [],
          ...e ? ["不得重复已有段落。", "只输出生成的续写正文。"] : ["Do not repeat existing paragraphs.", "Output only generated chapter text."]
        ]
      },
      usedContext: a.usedContext,
      warnings: a.warnings
    };
  }
  async buildCreativeAssetsPromptBundle(t) {
    var f;
    const e = this.resolveCreativeTargetSections(t), n = (t.locale || "zh").startsWith("zh"), a = await h.novel.findUnique({
      where: { id: t.novelId },
      select: { id: !0, title: !0, description: !0 }
    }), i = await this.contextBuilder.buildForCreativeAssets(t), c = n ? "你是一位小说创作助手，擅长根据用户的创意需求和已有小说内容生成结构化的创作素材。请严格以 JSON 格式输出，只输出 JSON，不要添加任何其他文字。所有生成的名称、描述等文本内容必须使用中文。生成的内容应与小说已有的角色、情节、世界观保持一致和关联。" : "You are a novel creation assistant. Generate structured creative assets in strict JSON format based on existing novel content. Output only JSON, no extra text. Generated content should be consistent with existing characters, plot, and world settings.", s = {
      plotLines: [{ name: "string", description: "string?" }],
      plotPoints: [{ title: "string", description: "string?", plotLineName: "string?" }],
      characters: [{ name: "string", role: "string?", description: "string?" }],
      items: [{ name: "string", type: "item|skill|location", description: "string?" }],
      skills: [{ name: "string", description: "string?" }],
      maps: [{ name: "string", type: "world|region|scene", description: "string?", imagePrompt: "string?" }]
    }, d = n ? [
      "仅返回严格的 JSON，不要包含 markdown 代码块标记或其他文字",
      "必须为所有请求的 section 生成内容，不得遗漏任何一个板块",
      `请求的 section 列表: ${e.join(", ")}`,
      "未请求的 section 必须设为空数组",
      "生成内容必须与已有小说内容（角色、情节、世界观）保持一致和关联",
      "避免与已存在的实体重名",
      "所有字段内容简洁、可直接使用",
      "所有名称和描述必须使用中文"
    ] : [
      "return strict JSON only, no markdown code fences or extra text",
      "generate content for ALL requested sections, do not leave any empty",
      `requested sections: ${e.join(", ")}`,
      "all unrequested sections must be empty arrays",
      "generated content must be consistent and related to existing novel content",
      "avoid duplicate names against existing entities",
      "fields should be concise and directly usable"
    ], v = {
      task: "creative_assets_generation",
      language: n ? "Chinese" : "English",
      brief: t.brief,
      novel: {
        title: (a == null ? void 0 : a.title) || "",
        description: (a == null ? void 0 : a.description) || ""
      },
      targetSections: e,
      outputShape: e,
      outputSchema: s,
      constraints: d
    };
    i.existingEntities.characters.length > 0 && (v.existingCharacters = i.existingEntities.characters), i.existingEntities.items.length > 0 && (v.existingItems = i.existingEntities.items), i.existingEntities.plotLines.length > 0 && (v.existingPlotLines = i.existingEntities.plotLines), i.existingEntities.worldSettings.length > 0 && (v.worldSettings = i.existingEntities.worldSettings), i.recentSummaries.length > 0 && (v.recentChapterSummaries = i.recentSummaries), i.narrativeSummaries.length > 0 && (v.narrativeSummary = i.narrativeSummaries[0]);
    const w = JSON.stringify(v), C = (f = t.overrideUserPrompt) != null && f.trim() ? t.overrideUserPrompt.trim() : w, S = [
      `Novel: ${(a == null ? void 0 : a.title) || t.novelId}`,
      ...i.usedContext
    ], p = n ? "根据用户创意简述和已有小说内容，生成可编辑的草稿素材。" : "Generate editable draft assets based on user brief and existing novel content.", g = n ? ["仅输出严格 JSON", "返回所有请求的板块", "与已有内容关联", "内容简洁可用", "避免重名", "使用中文"] : ["Output strict JSON.", "Return ALL selected sections.", "Stay consistent with existing content.", "Prefer concise fields.", "Avoid name conflicts."];
    return {
      systemPrompt: c,
      defaultUserPrompt: w,
      effectiveUserPrompt: C,
      structured: {
        goal: p,
        contextRefs: S,
        params: {
          briefLength: t.brief.trim().length,
          sections: e,
          locale: t.locale || "zh",
          estimatedContextTokens: i.estimatedTokens
        },
        constraints: g
      },
      usedContext: S,
      estimatedTokens: i.estimatedTokens
    };
  }
  async buildMapPromptBundle(t) {
    var d;
    const n = (await h.worldSetting.findMany({
      where: { novelId: t.novelId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: !0, name: !0, content: !0 }
    })).map((v) => ({
      id: v.id,
      title: String(v.name || "Untitled"),
      excerpt: String(v.content || "").slice(0, 180)
    })), a = Tr(t.styleTemplate), i = n.length > 0 ? n.map((v, w) => `${w + 1}. ${v.title}: ${v.excerpt}`).join(`
`) : "No explicit world lore provided.", c = [
      a || "Style: follow user requested style.",
      `ImageSize=${t.imageSize || this.settingsCache.http.imageSize || "2K"}`,
      "Task: Generate a clean map background image.",
      `UserRequest=${t.prompt}`,
      "WorldLore:",
      i,
      "Constraints:",
      "- avoid text labels or UI marks",
      "- keep high readability for map canvas editing",
      "- preserve coherence with world lore"
    ].join(`
`), s = (d = t.overrideUserPrompt) != null && d.trim() ? t.overrideUserPrompt.trim() : c;
    return {
      defaultUserPrompt: c,
      effectiveUserPrompt: s,
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
    return this.settingsCache.providerType === "mcp-cli" ? new at(this.settingsCache) : new At(this.settingsCache);
  }
  async saveImageAsset(t, e, n) {
    let a = n.mimeType || "image/png", i;
    if (n.imageBase64)
      i = Buffer.from(n.imageBase64, "base64");
    else if (n.imageUrl) {
      const w = await fetch(n.imageUrl);
      if (!w.ok)
        throw new Error(`Image download failed: ${w.status}`);
      const C = w.headers.get("content-type") || "";
      C && (a = C);
      const S = await w.arrayBuffer();
      i = Buffer.from(S);
    } else
      throw new Error("No image data provided");
    if (i.length === 0)
      throw new Error("Image data is empty");
    if (i.length > Fe)
      throw new Error("Image exceeds maximum size limit");
    if (!a.startsWith("image/"))
      throw new Error(`Invalid mime type: ${a}`);
    const c = Lr(a), s = N.join(this.userDataPath, "maps", t);
    j.existsSync(s) || j.mkdirSync(s, { recursive: !0 });
    const d = Nr(`ai-${e}-${Date.now()}.${c}`), v = N.join(s, d);
    return j.writeFileSync(v, i), {
      relativePath: `maps/${t}/${d}`,
      absolutePath: v
    };
  }
  loadSettings() {
    try {
      if (!j.existsSync(this.settingsFilePath))
        return de;
      const t = j.readFileSync(this.settingsFilePath, "utf8"), e = JSON.parse(t);
      return {
        ...de,
        ...e,
        http: { ...de.http, ...e.http ?? {} },
        mcpCli: { ...de.mcpCli, ...e.mcpCli ?? {} },
        proxy: { ...de.proxy, ...e.proxy ?? {} },
        summary: { ...de.summary, ...e.summary ?? {} }
      };
    } catch (t) {
      return console.error("[AI] Failed to load settings, fallback to defaults:", t), de;
    }
  }
  persistSettings() {
    try {
      const t = N.dirname(this.settingsFilePath);
      j.existsSync(t) || j.mkdirSync(t, { recursive: !0 }), j.writeFileSync(this.settingsFilePath, JSON.stringify(this.settingsCache, null, 2), "utf8");
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
      if (!j.existsSync(this.mapImageStatsPath))
        return t;
      const e = j.readFileSync(this.mapImageStatsPath, "utf8"), n = JSON.parse(e);
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
      const t = N.dirname(this.mapImageStatsPath);
      j.existsSync(t) || j.mkdirSync(t, { recursive: !0 }), j.writeFileSync(this.mapImageStatsPath, JSON.stringify(this.mapImageStatsCache, null, 2), "utf8");
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
class kr {
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
      const i = await a.json(), { newSyncCursor: c, data: s } = i;
      return await h.$transaction(async (d) => {
        var v, w, C;
        if ((v = s.novels) != null && v.length)
          for (const S of s.novels)
            await d.novel.upsert({
              where: { id: S.id },
              create: { ...S, updatedAt: new Date(S.updatedAt), createdAt: new Date(S.createdAt) },
              update: { ...S, updatedAt: new Date(S.updatedAt), createdAt: new Date(S.createdAt) }
            });
        if ((w = s.volumes) != null && w.length)
          for (const S of s.volumes)
            await d.volume.upsert({
              where: { id: S.id },
              create: { ...S, updatedAt: new Date(S.updatedAt), createdAt: new Date(S.createdAt) },
              update: { ...S, updatedAt: new Date(S.updatedAt), createdAt: new Date(S.createdAt) }
            });
        if ((C = s.chapters) != null && C.length)
          for (const S of s.chapters)
            await d.chapter.upsert({
              where: { id: S.id },
              create: { ...S, updatedAt: new Date(S.updatedAt), createdAt: new Date(S.createdAt) },
              update: { ...S, updatedAt: new Date(S.updatedAt), createdAt: new Date(S.createdAt) }
            });
      }), await this.setCursor(c), console.log("[Sync] Pull complete. New cursor:", c), { success: !0, count: (((e = s.novels) == null ? void 0 : e.length) || 0) + (((n = s.chapters) == null ? void 0 : n.length) || 0) };
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
    }, (i, c) => typeof c == "bigint" ? c.toString() : c), a = await fetch(`${ct}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: n
    });
    if (!a.ok)
      throw new Error(`Push failed: ${a.statusText}`);
    return console.log("[Sync] Push success"), await a.json();
  }
}
function Mr(r) {
  return r && r.__esModule && Object.prototype.hasOwnProperty.call(r, "default") ? r.default : r;
}
var ge = { exports: {} }, Nt = {
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
}, Le = {};
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
      return a.length && (n = n.replace(/\{(\d)\}/g, (i, c) => a[c] || "")), new Error("ADM-ZIP: " + n);
    };
  }
  for (const n of Object.keys(t))
    r[n] = e(t[n]);
})(Le);
const Or = P, J = ne, lt = Nt, Rr = Le, $r = typeof process == "object" && process.platform === "win32", dt = (r) => typeof r == "object" && r !== null, Pt = new Uint32Array(256).map((r, t) => {
  for (let e = 0; e < 8; e++)
    t & 1 ? t = 3988292384 ^ t >>> 1 : t >>>= 1;
  return t >>> 0;
});
function G(r) {
  this.sep = J.sep, this.fs = Or, dt(r) && dt(r.fs) && typeof r.fs.statSync == "function" && (this.fs = r.fs);
}
var Fr = G;
G.prototype.makeDir = function(r) {
  const t = this;
  function e(n) {
    let a = n.split(t.sep)[0];
    n.split(t.sep).forEach(function(i) {
      if (!(!i || i.substr(-1, 1) === ":")) {
        a += t.sep + i;
        var c;
        try {
          c = t.fs.statSync(a);
        } catch {
          t.fs.mkdirSync(a);
        }
        if (c && c.isFile())
          throw Rr.FILE_IN_THE_WAY(`"${a}"`);
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
    var i = a.fs.statSync(r);
    if (i.isDirectory())
      return !1;
  }
  var c = J.dirname(r);
  a.fs.existsSync(c) || a.makeDir(c);
  var s;
  try {
    s = a.fs.openSync(r, "w", 438);
  } catch {
    a.fs.chmodSync(r, 438), s = a.fs.openSync(r, "w", 438);
  }
  if (s)
    try {
      a.fs.writeSync(s, t, 0, t.length, 0);
    } finally {
      a.fs.closeSync(s);
    }
  return a.fs.chmodSync(r, n || 438), !0;
};
G.prototype.writeFileToAsync = function(r, t, e, n, a) {
  typeof n == "function" && (a = n, n = void 0);
  const i = this;
  i.fs.exists(r, function(c) {
    if (c && !e)
      return a(!1);
    i.fs.stat(r, function(s, d) {
      if (c && d.isDirectory())
        return a(!1);
      var v = J.dirname(r);
      i.fs.exists(v, function(w) {
        w || i.makeDir(v), i.fs.open(r, "w", 438, function(C, S) {
          C ? i.fs.chmod(r, 438, function() {
            i.fs.open(r, "w", 438, function(p, g) {
              i.fs.write(g, t, 0, t.length, 0, function() {
                i.fs.close(g, function() {
                  i.fs.chmod(r, n || 438, function() {
                    a(!0);
                  });
                });
              });
            });
          }) : S ? i.fs.write(S, t, 0, t.length, 0, function() {
            i.fs.close(S, function() {
              i.fs.chmod(r, n || 438, function() {
                a(!0);
              });
            });
          }) : i.fs.chmod(r, n || 438, function() {
            a(!0);
          });
        });
      });
    });
  });
};
G.prototype.findFiles = function(r) {
  const t = this;
  function e(n, a, i) {
    let c = [];
    return t.fs.readdirSync(n).forEach(function(s) {
      const d = J.join(n, s), v = t.fs.statSync(d);
      c.push(J.normalize(d) + (v.isDirectory() ? t.sep : "")), v.isDirectory() && i && (c = c.concat(e(d, a, i)));
    }), c;
  }
  return e(r, void 0, !0);
};
G.prototype.findFilesAsync = function(r, t) {
  const e = this;
  let n = [];
  e.fs.readdir(r, function(a, i) {
    if (a)
      return t(a);
    let c = i.length;
    if (!c)
      return t(null, n);
    i.forEach(function(s) {
      s = J.join(r, s), e.fs.stat(s, function(d, v) {
        if (d)
          return t(d);
        v && (n.push(J.normalize(s) + (v.isDirectory() ? e.sep : "")), v.isDirectory() ? e.findFilesAsync(s, function(w, C) {
          if (w)
            return t(w);
          n = n.concat(C), --c || t(null, n);
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
  return Pt[(r ^ t) & 255] ^ r >>> 8;
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
    var i = J.normalize(J.join(r, e.slice(n, a).join(J.sep)));
    if (i.indexOf(r) === 0)
      return i;
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
G.isWin = $r;
G.crcTable = Pt;
const Ur = ne;
var Br = function(r, { fs: t }) {
  var e = r || "", n = i(), a = null;
  function i() {
    return {
      directory: !1,
      readonly: !1,
      hidden: !1,
      executable: !1,
      mtime: 0,
      atime: 0
    };
  }
  return e && t.existsSync(e) ? (a = t.statSync(e), n.directory = a.isDirectory(), n.mtime = a.mtime, n.atime = a.atime, n.executable = (73 & a.mode) !== 0, n.readonly = (128 & a.mode) === 0, n.hidden = Ur.basename(e)[0] === ".") : console.warn("Invalid path: " + e), {
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
}, jr = {
  efs: !0,
  encode: (r) => Buffer.from(r, "utf8"),
  decode: (r) => r.toString("utf8")
};
ge.exports = Fr;
ge.exports.Constants = Nt;
ge.exports.Errors = Le;
ge.exports.FileAttr = Br;
ge.exports.decoder = jr;
var Ce = ge.exports, Ne = {}, ce = Ce, D = ce.Constants, zr = function() {
  var r = 20, t = 10, e = 0, n = 0, a = 0, i = 0, c = 0, s = 0, d = 0, v = 0, w = 0, C = 0, S = 0, p = 0, g = 0;
  r |= ce.isWin ? 2560 : 768, e |= D.FLG_EFS;
  const f = {
    extraLen: 0
  }, m = (o) => Math.max(0, o) >>> 0, u = (o) => Math.max(0, o) & 255;
  return a = ce.fromDate2DOS(/* @__PURE__ */ new Date()), {
    get made() {
      return r;
    },
    set made(o) {
      r = o;
    },
    get version() {
      return t;
    },
    set version(o) {
      t = o;
    },
    get flags() {
      return e;
    },
    set flags(o) {
      e = o;
    },
    get flags_efs() {
      return (e & D.FLG_EFS) > 0;
    },
    set flags_efs(o) {
      o ? e |= D.FLG_EFS : e &= ~D.FLG_EFS;
    },
    get flags_desc() {
      return (e & D.FLG_DESC) > 0;
    },
    set flags_desc(o) {
      o ? e |= D.FLG_DESC : e &= ~D.FLG_DESC;
    },
    get method() {
      return n;
    },
    set method(o) {
      switch (o) {
        case D.STORED:
          this.version = 10;
        case D.DEFLATED:
        default:
          this.version = 20;
      }
      n = o;
    },
    get time() {
      return ce.fromDOS2Date(this.timeval);
    },
    set time(o) {
      this.timeval = ce.fromDate2DOS(o);
    },
    get timeval() {
      return a;
    },
    set timeval(o) {
      a = m(o);
    },
    get timeHighByte() {
      return u(a >>> 8);
    },
    get crc() {
      return i;
    },
    set crc(o) {
      i = m(o);
    },
    get compressedSize() {
      return c;
    },
    set compressedSize(o) {
      c = m(o);
    },
    get size() {
      return s;
    },
    set size(o) {
      s = m(o);
    },
    get fileNameLength() {
      return d;
    },
    set fileNameLength(o) {
      d = o;
    },
    get extraLength() {
      return v;
    },
    set extraLength(o) {
      v = o;
    },
    get extraLocalLength() {
      return f.extraLen;
    },
    set extraLocalLength(o) {
      f.extraLen = o;
    },
    get commentLength() {
      return w;
    },
    set commentLength(o) {
      w = o;
    },
    get diskNumStart() {
      return C;
    },
    set diskNumStart(o) {
      C = m(o);
    },
    get inAttr() {
      return S;
    },
    set inAttr(o) {
      S = m(o);
    },
    get attr() {
      return p;
    },
    set attr(o) {
      p = m(o);
    },
    // get Unix file permissions
    get fileAttr() {
      return (p || 0) >> 16 & 4095;
    },
    get offset() {
      return g;
    },
    set offset(o) {
      g = m(o);
    },
    get encrypted() {
      return (e & D.FLG_ENC) === D.FLG_ENC;
    },
    get centralHeaderSize() {
      return D.CENHDR + d + v + w;
    },
    get realDataOffset() {
      return g + D.LOCHDR + f.fnameLen + f.extraLen;
    },
    get localHeader() {
      return f;
    },
    loadLocalHeaderFromBinary: function(o) {
      var l = o.slice(g, g + D.LOCHDR);
      if (l.readUInt32LE(0) !== D.LOCSIG)
        throw ce.Errors.INVALID_LOC();
      f.version = l.readUInt16LE(D.LOCVER), f.flags = l.readUInt16LE(D.LOCFLG), f.method = l.readUInt16LE(D.LOCHOW), f.time = l.readUInt32LE(D.LOCTIM), f.crc = l.readUInt32LE(D.LOCCRC), f.compressedSize = l.readUInt32LE(D.LOCSIZ), f.size = l.readUInt32LE(D.LOCLEN), f.fnameLen = l.readUInt16LE(D.LOCNAM), f.extraLen = l.readUInt16LE(D.LOCEXT);
      const y = g + D.LOCHDR + f.fnameLen, I = y + f.extraLen;
      return o.slice(y, I);
    },
    loadFromBinary: function(o) {
      if (o.length !== D.CENHDR || o.readUInt32LE(0) !== D.CENSIG)
        throw ce.Errors.INVALID_CEN();
      r = o.readUInt16LE(D.CENVEM), t = o.readUInt16LE(D.CENVER), e = o.readUInt16LE(D.CENFLG), n = o.readUInt16LE(D.CENHOW), a = o.readUInt32LE(D.CENTIM), i = o.readUInt32LE(D.CENCRC), c = o.readUInt32LE(D.CENSIZ), s = o.readUInt32LE(D.CENLEN), d = o.readUInt16LE(D.CENNAM), v = o.readUInt16LE(D.CENEXT), w = o.readUInt16LE(D.CENCOM), C = o.readUInt16LE(D.CENDSK), S = o.readUInt16LE(D.CENATT), p = o.readUInt32LE(D.CENATX), g = o.readUInt32LE(D.CENOFF);
    },
    localHeaderToBinary: function() {
      var o = Buffer.alloc(D.LOCHDR);
      return o.writeUInt32LE(D.LOCSIG, 0), o.writeUInt16LE(t, D.LOCVER), o.writeUInt16LE(e, D.LOCFLG), o.writeUInt16LE(n, D.LOCHOW), o.writeUInt32LE(a, D.LOCTIM), o.writeUInt32LE(i, D.LOCCRC), o.writeUInt32LE(c, D.LOCSIZ), o.writeUInt32LE(s, D.LOCLEN), o.writeUInt16LE(d, D.LOCNAM), o.writeUInt16LE(f.extraLen, D.LOCEXT), o;
    },
    centralHeaderToBinary: function() {
      var o = Buffer.alloc(D.CENHDR + d + v + w);
      return o.writeUInt32LE(D.CENSIG, 0), o.writeUInt16LE(r, D.CENVEM), o.writeUInt16LE(t, D.CENVER), o.writeUInt16LE(e, D.CENFLG), o.writeUInt16LE(n, D.CENHOW), o.writeUInt32LE(a, D.CENTIM), o.writeUInt32LE(i, D.CENCRC), o.writeUInt32LE(c, D.CENSIZ), o.writeUInt32LE(s, D.CENLEN), o.writeUInt16LE(d, D.CENNAM), o.writeUInt16LE(v, D.CENEXT), o.writeUInt16LE(w, D.CENCOM), o.writeUInt16LE(C, D.CENDSK), o.writeUInt16LE(S, D.CENATT), o.writeUInt32LE(p, D.CENATX), o.writeUInt32LE(g, D.CENOFF), o;
    },
    toJSON: function() {
      const o = function(l) {
        return l + " bytes";
      };
      return {
        made: r,
        version: t,
        flags: e,
        method: ce.methodToString(n),
        time: this.time,
        crc: "0x" + i.toString(16).toUpperCase(),
        compressedSize: o(c),
        size: o(s),
        fileNameLength: o(d),
        extraLength: o(v),
        commentLength: o(w),
        diskNumStart: C,
        inAttr: S,
        attr: p,
        offset: g,
        centralHeaderSize: o(D.CENHDR + d + v + w)
      };
    },
    toString: function() {
      return JSON.stringify(this.toJSON(), null, "	");
    }
  };
}, fe = Ce, H = fe.Constants, Hr = function() {
  var r = 0, t = 0, e = 0, n = 0, a = 0;
  return {
    get diskEntries() {
      return r;
    },
    set diskEntries(i) {
      r = t = i;
    },
    get totalEntries() {
      return t;
    },
    set totalEntries(i) {
      t = r = i;
    },
    get size() {
      return e;
    },
    set size(i) {
      e = i;
    },
    get offset() {
      return n;
    },
    set offset(i) {
      n = i;
    },
    get commentLength() {
      return a;
    },
    set commentLength(i) {
      a = i;
    },
    get mainHeaderSize() {
      return H.ENDHDR + a;
    },
    loadFromBinary: function(i) {
      if ((i.length !== H.ENDHDR || i.readUInt32LE(0) !== H.ENDSIG) && (i.length < H.ZIP64HDR || i.readUInt32LE(0) !== H.ZIP64SIG))
        throw fe.Errors.INVALID_END();
      i.readUInt32LE(0) === H.ENDSIG ? (r = i.readUInt16LE(H.ENDSUB), t = i.readUInt16LE(H.ENDTOT), e = i.readUInt32LE(H.ENDSIZ), n = i.readUInt32LE(H.ENDOFF), a = i.readUInt16LE(H.ENDCOM)) : (r = fe.readBigUInt64LE(i, H.ZIP64SUB), t = fe.readBigUInt64LE(i, H.ZIP64TOT), e = fe.readBigUInt64LE(i, H.ZIP64SIZE), n = fe.readBigUInt64LE(i, H.ZIP64OFF), a = 0);
    },
    toBinary: function() {
      var i = Buffer.alloc(H.ENDHDR + a);
      return i.writeUInt32LE(H.ENDSIG, 0), i.writeUInt32LE(0, 4), i.writeUInt16LE(r, H.ENDSUB), i.writeUInt16LE(t, H.ENDTOT), i.writeUInt32LE(e, H.ENDSIZ), i.writeUInt32LE(n, H.ENDOFF), i.writeUInt16LE(a, H.ENDCOM), i.fill(" ", H.ENDHDR), i;
    },
    toJSON: function() {
      const i = function(c, s) {
        let d = c.toString(16).toUpperCase();
        for (; d.length < s; )
          d = "0" + d;
        return "0x" + d;
      };
      return {
        diskEntries: r,
        totalEntries: t,
        size: e + " bytes",
        offset: i(n, 4),
        commentLength: a
      };
    },
    toString: function() {
      return JSON.stringify(this.toJSON(), null, "	");
    }
  };
};
Ne.EntryHeader = zr;
Ne.MainHeader = Hr;
var Pe = {}, qr = function(r) {
  var t = It, e = { chunkSize: (parseInt(r.length / 1024) + 1) * 1024 };
  return {
    deflate: function() {
      return t.deflateRawSync(r, e);
    },
    deflateAsync: function(n) {
      var a = t.createDeflateRaw(e), i = [], c = 0;
      a.on("data", function(s) {
        i.push(s), c += s.length;
      }), a.on("end", function() {
        var s = Buffer.alloc(c), d = 0;
        s.fill(0);
        for (var v = 0; v < i.length; v++) {
          var w = i[v];
          w.copy(s, d), d += w.length;
        }
        n && n(s);
      }), a.end(r);
    }
  };
};
const Vr = +(process.versions ? process.versions.node : "").split(".")[0] || 0;
var Wr = function(r, t) {
  var e = It;
  const n = Vr >= 15 && t > 0 ? { maxOutputLength: t } : {};
  return {
    inflate: function() {
      return e.inflateRawSync(r, n);
    },
    inflateAsync: function(a) {
      var i = e.createInflateRaw(n), c = [], s = 0;
      i.on("data", function(d) {
        c.push(d), s += d.length;
      }), i.on("end", function() {
        var d = Buffer.alloc(s), v = 0;
        d.fill(0);
        for (var w = 0; w < c.length; w++) {
          var C = c[w];
          C.copy(d, v), v += C.length;
        }
        a && a(d);
      }), i.end(r);
    }
  };
};
const { randomFillSync: ut } = pe, Gr = Le, Zr = new Uint32Array(256).map((r, t) => {
  for (let e = 0; e < 8; e++)
    t & 1 ? t = t >>> 1 ^ 3988292384 : t >>>= 1;
  return t >>> 0;
}), Tt = (r, t) => Math.imul(r, t) >>> 0, mt = (r, t) => Zr[(r ^ t) & 255] ^ r >>> 8, ve = () => typeof ut == "function" ? ut(Buffer.alloc(12)) : ve.node();
ve.node = () => {
  const r = Buffer.alloc(12), t = r.length;
  for (let e = 0; e < t; e++)
    r[e] = Math.random() * 256 & 255;
  return r;
};
const De = {
  genSalt: ve
};
function Te(r) {
  const t = Buffer.isBuffer(r) ? r : Buffer.from(r);
  this.keys = new Uint32Array([305419896, 591751049, 878082192]);
  for (let e = 0; e < t.length; e++)
    this.updateKeys(t[e]);
}
Te.prototype.updateKeys = function(r) {
  const t = this.keys;
  return t[0] = mt(t[0], r), t[1] += t[0] & 255, t[1] = Tt(t[1], 134775813) + 1, t[2] = mt(t[2], t[1] >>> 24), r;
};
Te.prototype.next = function() {
  const r = (this.keys[2] | 2) >>> 0;
  return Tt(r, r ^ 1) >> 8 & 255;
};
function Jr(r) {
  const t = new Te(r);
  return function(e) {
    const n = Buffer.alloc(e.length);
    let a = 0;
    for (let i of e)
      n[a++] = t.updateKeys(i ^ t.next());
    return n;
  };
}
function Kr(r) {
  const t = new Te(r);
  return function(e, n, a = 0) {
    n || (n = Buffer.alloc(e.length));
    for (let i of e) {
      const c = t.next();
      n[a++] = i ^ c, t.updateKeys(i);
    }
    return n;
  };
}
function Xr(r, t, e) {
  if (!r || !Buffer.isBuffer(r) || r.length < 12)
    return Buffer.alloc(0);
  const n = Jr(e), a = n(r.slice(0, 12)), i = (t.flags & 8) === 8 ? t.timeHighByte : t.crc >>> 24;
  if (a[11] !== i)
    throw Gr.WRONG_PASSWORD();
  return n(r.slice(12));
}
function Yr(r) {
  Buffer.isBuffer(r) && r.length >= 12 ? De.genSalt = function() {
    return r.slice(0, 12);
  } : r === "node" ? De.genSalt = ve.node : De.genSalt = ve;
}
function Qr(r, t, e, n = !1) {
  r == null && (r = Buffer.alloc(0)), Buffer.isBuffer(r) || (r = Buffer.from(r.toString()));
  const a = Kr(e), i = De.genSalt();
  i[11] = t.crc >>> 24 & 255, n && (i[10] = t.crc >>> 16 & 255);
  const c = Buffer.alloc(r.length + 12);
  return a(i, c), a(r, c, 12);
}
var en = { decrypt: Xr, encrypt: Qr, _salter: Yr };
Pe.Deflater = qr;
Pe.Inflater = Wr;
Pe.ZipCrypto = en;
var U = Ce, tn = Ne, V = U.Constants, je = Pe, xt = function(r, t) {
  var e = new tn.EntryHeader(), n = Buffer.alloc(0), a = Buffer.alloc(0), i = !1, c = null, s = Buffer.alloc(0), d = Buffer.alloc(0), v = !0;
  const w = r, C = typeof w.decoder == "object" ? w.decoder : U.decoder;
  v = C.hasOwnProperty("efs") ? C.efs : !1;
  function S() {
    return !t || !(t instanceof Uint8Array) ? Buffer.alloc(0) : (d = e.loadLocalHeaderFromBinary(t), t.slice(e.realDataOffset, e.realDataOffset + e.compressedSize));
  }
  function p(l) {
    if (e.flags_desc) {
      const y = {}, I = e.realDataOffset + e.compressedSize;
      if (t.readUInt32LE(I) == V.LOCSIG || t.readUInt32LE(I) == V.CENSIG)
        throw U.Errors.DESCRIPTOR_NOT_EXIST();
      if (t.readUInt32LE(I) == V.EXTSIG)
        y.crc = t.readUInt32LE(I + V.EXTCRC), y.compressedSize = t.readUInt32LE(I + V.EXTSIZ), y.size = t.readUInt32LE(I + V.EXTLEN);
      else if (t.readUInt16LE(I + 12) === 19280)
        y.crc = t.readUInt32LE(I + V.EXTCRC - 4), y.compressedSize = t.readUInt32LE(I + V.EXTSIZ - 4), y.size = t.readUInt32LE(I + V.EXTLEN - 4);
      else
        throw U.Errors.DESCRIPTOR_UNKNOWN();
      if (y.compressedSize !== e.compressedSize || y.size !== e.size || y.crc !== e.crc)
        throw U.Errors.DESCRIPTOR_FAULTY();
      if (U.crc32(l) !== y.crc)
        return !1;
    } else if (U.crc32(l) !== e.localHeader.crc)
      return !1;
    return !0;
  }
  function g(l, y, I) {
    if (typeof y > "u" && typeof l == "string" && (I = l, l = void 0), i)
      return l && y && y(Buffer.alloc(0), U.Errors.DIRECTORY_CONTENT_ERROR()), Buffer.alloc(0);
    var E = S();
    if (E.length === 0)
      return l && y && y(E), E;
    if (e.encrypted) {
      if (typeof I != "string" && !Buffer.isBuffer(I))
        throw U.Errors.INVALID_PASS_PARAM();
      E = je.ZipCrypto.decrypt(E, e, I);
    }
    var _ = Buffer.alloc(e.size);
    switch (e.method) {
      case U.Constants.STORED:
        if (E.copy(_), p(_))
          return l && y && y(_), _;
        throw l && y && y(_, U.Errors.BAD_CRC()), U.Errors.BAD_CRC();
      case U.Constants.DEFLATED:
        var x = new je.Inflater(E, e.size);
        if (l)
          x.inflateAsync(function(T) {
            T.copy(T, 0), y && (p(T) ? y(T) : y(T, U.Errors.BAD_CRC()));
          });
        else {
          if (x.inflate(_).copy(_, 0), !p(_))
            throw U.Errors.BAD_CRC(`"${C.decode(n)}"`);
          return _;
        }
        break;
      default:
        throw l && y && y(Buffer.alloc(0), U.Errors.UNKNOWN_METHOD()), U.Errors.UNKNOWN_METHOD();
    }
  }
  function f(l, y) {
    if ((!c || !c.length) && Buffer.isBuffer(t))
      return l && y && y(S()), S();
    if (c.length && !i) {
      var I;
      switch (e.method) {
        case U.Constants.STORED:
          return e.compressedSize = e.size, I = Buffer.alloc(c.length), c.copy(I), l && y && y(I), I;
        default:
        case U.Constants.DEFLATED:
          var E = new je.Deflater(c);
          if (l)
            E.deflateAsync(function(x) {
              I = Buffer.alloc(x.length), e.compressedSize = x.length, x.copy(I), y && y(I);
            });
          else {
            var _ = E.deflate();
            return e.compressedSize = _.length, _;
          }
          E = null;
          break;
      }
    } else if (l && y)
      y(Buffer.alloc(0));
    else
      return Buffer.alloc(0);
  }
  function m(l, y) {
    return (l.readUInt32LE(y + 4) << 4) + l.readUInt32LE(y);
  }
  function u(l) {
    try {
      for (var y = 0, I, E, _; y + 4 < l.length; )
        I = l.readUInt16LE(y), y += 2, E = l.readUInt16LE(y), y += 2, _ = l.slice(y, y + E), y += E, V.ID_ZIP64 === I && o(_);
    } catch {
      throw U.Errors.EXTRA_FIELD_PARSE_ERROR();
    }
  }
  function o(l) {
    var y, I, E, _;
    l.length >= V.EF_ZIP64_SCOMP && (y = m(l, V.EF_ZIP64_SUNCOMP), e.size === V.EF_ZIP64_OR_32 && (e.size = y)), l.length >= V.EF_ZIP64_RHO && (I = m(l, V.EF_ZIP64_SCOMP), e.compressedSize === V.EF_ZIP64_OR_32 && (e.compressedSize = I)), l.length >= V.EF_ZIP64_DSN && (E = m(l, V.EF_ZIP64_RHO), e.offset === V.EF_ZIP64_OR_32 && (e.offset = E)), l.length >= V.EF_ZIP64_DSN + 4 && (_ = l.readUInt32LE(V.EF_ZIP64_DSN), e.diskNumStart === V.EF_ZIP64_OR_16 && (e.diskNumStart = _));
  }
  return {
    get entryName() {
      return C.decode(n);
    },
    get rawEntryName() {
      return n;
    },
    set entryName(l) {
      n = U.toBuffer(l, C.encode);
      var y = n[n.length - 1];
      i = y === 47 || y === 92, e.fileNameLength = n.length;
    },
    get efs() {
      return typeof v == "function" ? v(this.entryName) : v;
    },
    get extra() {
      return s;
    },
    set extra(l) {
      s = l, e.extraLength = l.length, u(l);
    },
    get comment() {
      return C.decode(a);
    },
    set comment(l) {
      if (a = U.toBuffer(l, C.encode), e.commentLength = a.length, a.length > 65535)
        throw U.Errors.COMMENT_TOO_LONG();
    },
    get name() {
      var l = C.decode(n);
      return i ? l.substr(l.length - 1).split("/").pop() : l.split("/").pop();
    },
    get isDirectory() {
      return i;
    },
    getCompressedData: function() {
      return f(!1, null);
    },
    getCompressedDataAsync: function(l) {
      f(!0, l);
    },
    setData: function(l) {
      c = U.toBuffer(l, U.decoder.encode), !i && c.length ? (e.size = c.length, e.method = U.Constants.DEFLATED, e.crc = U.crc32(l), e.changed = !0) : e.method = U.Constants.STORED;
    },
    getData: function(l) {
      return e.changed ? c : g(!1, null, l);
    },
    getDataAsync: function(l, y) {
      e.changed ? l(c) : g(!0, l, y);
    },
    set attr(l) {
      e.attr = l;
    },
    get attr() {
      return e.attr;
    },
    set header(l) {
      e.loadFromBinary(l);
    },
    get header() {
      return e;
    },
    packCentralHeader: function() {
      e.flags_efs = this.efs, e.extraLength = s.length;
      var l = e.centralHeaderToBinary(), y = U.Constants.CENHDR;
      return n.copy(l, y), y += n.length, s.copy(l, y), y += e.extraLength, a.copy(l, y), l;
    },
    packLocalHeader: function() {
      let l = 0;
      e.flags_efs = this.efs, e.extraLocalLength = d.length;
      const y = e.localHeaderToBinary(), I = Buffer.alloc(y.length + n.length + e.extraLocalLength);
      return y.copy(I, l), l += y.length, n.copy(I, l), l += n.length, d.copy(I, l), l += d.length, I;
    },
    toJSON: function() {
      const l = function(y) {
        return "<" + (y && y.length + " bytes buffer" || "null") + ">";
      };
      return {
        entryName: this.entryName,
        name: this.name,
        comment: this.comment,
        isDirectory: this.isDirectory,
        header: e.toJSON(),
        compressedData: l(t),
        data: l(c)
      };
    },
    toString: function() {
      return JSON.stringify(this.toJSON(), null, "	");
    }
  };
};
const pt = xt, rn = Ne, Y = Ce;
var nn = function(r, t) {
  var e = [], n = {}, a = Buffer.alloc(0), i = new rn.MainHeader(), c = !1;
  const s = /* @__PURE__ */ new Set(), d = t, { noSort: v, decoder: w } = d;
  r ? p(d.readEntries) : c = !0;
  function C() {
    const f = /* @__PURE__ */ new Set();
    for (const m of Object.keys(n)) {
      const u = m.split("/");
      if (u.pop(), !!u.length)
        for (let o = 0; o < u.length; o++) {
          const l = u.slice(0, o + 1).join("/") + "/";
          f.add(l);
        }
    }
    for (const m of f)
      if (!(m in n)) {
        const u = new pt(d);
        u.entryName = m, u.attr = 16, u.temporary = !0, e.push(u), n[u.entryName] = u, s.add(u);
      }
  }
  function S() {
    if (c = !0, n = {}, i.diskEntries > (r.length - i.offset) / Y.Constants.CENHDR)
      throw Y.Errors.DISK_ENTRY_TOO_LARGE();
    e = new Array(i.diskEntries);
    for (var f = i.offset, m = 0; m < e.length; m++) {
      var u = f, o = new pt(d, r);
      o.header = r.slice(u, u += Y.Constants.CENHDR), o.entryName = r.slice(u, u += o.header.fileNameLength), o.header.extraLength && (o.extra = r.slice(u, u += o.header.extraLength)), o.header.commentLength && (o.comment = r.slice(u, u + o.header.commentLength)), f += o.header.centralHeaderSize, e[m] = o, n[o.entryName] = o;
    }
    s.clear(), C();
  }
  function p(f) {
    var m = r.length - Y.Constants.ENDHDR, u = Math.max(0, m - 65535), o = u, l = r.length, y = -1, I = 0;
    for ((typeof d.trailingSpace == "boolean" ? d.trailingSpace : !1) && (u = 0), m; m >= o; m--)
      if (r[m] === 80) {
        if (r.readUInt32LE(m) === Y.Constants.ENDSIG) {
          y = m, I = m, l = m + Y.Constants.ENDHDR, o = m - Y.Constants.END64HDR;
          continue;
        }
        if (r.readUInt32LE(m) === Y.Constants.END64SIG) {
          o = u;
          continue;
        }
        if (r.readUInt32LE(m) === Y.Constants.ZIP64SIG) {
          y = m, l = m + Y.readBigUInt64LE(r, m + Y.Constants.ZIP64SIZE) + Y.Constants.ZIP64LEAD;
          break;
        }
      }
    if (y == -1)
      throw Y.Errors.INVALID_FORMAT();
    i.loadFromBinary(r.slice(y, l)), i.commentLength && (a = r.slice(I + Y.Constants.ENDHDR)), f && S();
  }
  function g() {
    e.length > 1 && !v && e.sort((f, m) => f.entryName.toLowerCase().localeCompare(m.entryName.toLowerCase()));
  }
  return {
    /**
     * Returns an array of ZipEntry objects existent in the current opened archive
     * @return Array
     */
    get entries() {
      return c || S(), e.filter((f) => !s.has(f));
    },
    /**
     * Archive comment
     * @return {String}
     */
    get comment() {
      return w.decode(a);
    },
    set comment(f) {
      a = Y.toBuffer(f, w.encode), i.commentLength = a.length;
    },
    getEntryCount: function() {
      return c ? e.length : i.diskEntries;
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
      return c || S(), n[f] || null;
    },
    /**
     * Adds the given entry to the entry list
     *
     * @param entry
     */
    setEntry: function(f) {
      c || S(), e.push(f), n[f.entryName] = f, i.totalEntries = e.length;
    },
    /**
     * Removes the file with the given name from the entry list.
     *
     * If the entry is a directory, then all nested files and directories will be removed
     * @param entryName
     * @returns {void}
     */
    deleteFile: function(f, m = !0) {
      c || S();
      const u = n[f];
      this.getEntryChildren(u, m).map((l) => l.entryName).forEach(this.deleteEntry);
    },
    /**
     * Removes the entry with the given name from the entry list.
     *
     * @param {string} entryName
     * @returns {void}
     */
    deleteEntry: function(f) {
      c || S();
      const m = n[f], u = e.indexOf(m);
      u >= 0 && (e.splice(u, 1), delete n[f], i.totalEntries = e.length);
    },
    /**
     *  Iterates and returns all nested files and directories of the given entry
     *
     * @param entry
     * @return Array
     */
    getEntryChildren: function(f, m = !0) {
      if (c || S(), typeof f == "object")
        if (f.isDirectory && m) {
          const u = [], o = f.entryName;
          for (const l of e)
            l.entryName.startsWith(o) && u.push(l);
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
      c || S(), g();
      const f = [], m = [];
      let u = 0, o = 0;
      i.size = 0, i.offset = 0;
      let l = 0;
      for (const E of this.entries) {
        const _ = E.getCompressedData();
        E.header.offset = o;
        const x = E.packLocalHeader(), T = x.length + _.length;
        o += T, f.push(x), f.push(_);
        const M = E.packCentralHeader();
        m.push(M), i.size += M.length, u += T + M.length, l++;
      }
      u += i.mainHeaderSize, i.offset = o, i.totalEntries = l, o = 0;
      const y = Buffer.alloc(u);
      for (const E of f)
        E.copy(y, o), o += E.length;
      for (const E of m)
        E.copy(y, o), o += E.length;
      const I = i.toBinary();
      return a && a.copy(I, Y.Constants.ENDHDR), I.copy(y, o), r = y, c = !1, y;
    },
    toAsyncBuffer: function(f, m, u, o) {
      try {
        c || S(), g();
        const l = [], y = [];
        let I = 0, E = 0, _ = 0;
        i.size = 0, i.offset = 0;
        const x = function(T) {
          if (T.length > 0) {
            const M = T.shift(), K = M.entryName + M.extra.toString();
            u && u(K), M.getCompressedDataAsync(function(Q) {
              o && o(K), M.header.offset = E;
              const L = M.packLocalHeader(), Z = L.length + Q.length;
              E += Z, l.push(L), l.push(Q);
              const X = M.packCentralHeader();
              y.push(X), i.size += X.length, I += Z + X.length, _++, x(T);
            });
          } else {
            I += i.mainHeaderSize, i.offset = E, i.totalEntries = _, E = 0;
            const M = Buffer.alloc(I);
            l.forEach(function(Q) {
              Q.copy(M, E), E += Q.length;
            }), y.forEach(function(Q) {
              Q.copy(M, E), E += Q.length;
            });
            const K = i.toBinary();
            a && a.copy(K, Y.Constants.ENDHDR), K.copy(M, E), r = M, c = !1, f(M);
          }
        };
        x(Array.from(this.entries));
      } catch (l) {
        m(l);
      }
    }
  };
};
const q = Ce, W = ne, an = xt, sn = nn, ue = (...r) => q.findLast(r, (t) => typeof t == "boolean"), ft = (...r) => q.findLast(r, (t) => typeof t == "string"), on = (...r) => q.findLast(r, (t) => typeof t == "function"), cn = {
  // option "noSort" : if true it disables files sorting
  noSort: !1,
  // read entries during load (initial loading may be slower)
  readEntries: !1,
  // default method is none
  method: q.Constants.NONE,
  // file system
  fs: null
};
var ln = function(r, t) {
  let e = null;
  const n = Object.assign(/* @__PURE__ */ Object.create(null), cn);
  r && typeof r == "object" && (r instanceof Uint8Array || (Object.assign(n, r), r = n.input ? n.input : void 0, n.input && delete n.input), Buffer.isBuffer(r) && (e = r, n.method = q.Constants.BUFFER, r = void 0)), Object.assign(n, t);
  const a = new q(n);
  if ((typeof n.decoder != "object" || typeof n.decoder.encode != "function" || typeof n.decoder.decode != "function") && (n.decoder = q.decoder), r && typeof r == "string")
    if (a.fs.existsSync(r))
      n.method = q.Constants.FILE, n.filename = r, e = a.fs.readFileSync(r);
    else
      throw q.Errors.INVALID_FILENAME();
  const i = new sn(e, n), { canonical: c, sanitize: s, zipnamefix: d } = q;
  function v(p) {
    if (p && i) {
      var g;
      if (typeof p == "string" && (g = i.getEntry(W.posix.normalize(p))), typeof p == "object" && typeof p.entryName < "u" && typeof p.header < "u" && (g = i.getEntry(p.entryName)), g)
        return g;
    }
    return null;
  }
  function w(p) {
    const { join: g, normalize: f, sep: m } = W.posix;
    return g(".", f(m + p.split("\\").join(m) + m));
  }
  function C(p) {
    return p instanceof RegExp ? /* @__PURE__ */ function(g) {
      return function(f) {
        return g.test(f);
      };
    }(p) : typeof p != "function" ? () => !0 : p;
  }
  const S = (p, g) => {
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
      var f = v(p);
      return f && f.getData(g) || null;
    },
    /**
     * Returns how many child elements has on entry (directories) on files it is always 0
     * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
     * @returns {integer}
     */
    childCount: function(p) {
      const g = v(p);
      if (g)
        return i.getChildCount(g);
    },
    /**
     * Asynchronous readFile
     * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
     * @param {callback} callback
     *
     * @return Buffer or Null in case of error
     */
    readFileAsync: function(p, g) {
      var f = v(p);
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
      var f = v(p);
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
      var m = v(p);
      m ? m.getDataAsync(function(u, o) {
        if (o) {
          g(u, o);
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
      var f = v(p);
      f && i.deleteFile(f.entryName, g);
    },
    /**
     * Remove the entry from the file or directory without affecting any nested entries
     *
     * @param {ZipEntry|string} entry
     * @returns {void}
     */
    deleteEntry: function(p) {
      var g = v(p);
      g && i.deleteEntry(g.entryName);
    },
    /**
     * Adds a comment to the zip. The zip must be rewritten after adding the comment.
     *
     * @param {string} comment
     */
    addZipComment: function(p) {
      i.comment = p;
    },
    /**
     * Returns the zip comment
     *
     * @return String
     */
    getZipComment: function() {
      return i.comment || "";
    },
    /**
     * Adds a comment to a specified zipEntry. The zip must be rewritten after adding the comment
     * The comment cannot exceed 65535 characters in length
     *
     * @param {ZipEntry} entry
     * @param {string} comment
     */
    addZipEntryComment: function(p, g) {
      var f = v(p);
      f && (f.comment = g);
    },
    /**
     * Returns the comment of the specified entry
     *
     * @param {ZipEntry} entry
     * @return String
     */
    getZipEntryComment: function(p) {
      var g = v(p);
      return g && g.comment || "";
    },
    /**
     * Updates the content of an existing entry inside the archive. The zip must be rewritten after updating the content
     *
     * @param {ZipEntry} entry
     * @param {Buffer} content
     */
    updateFile: function(p, g) {
      var f = v(p);
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
        const o = a.fs.statSync(p), l = o.isFile() ? a.fs.readFileSync(p) : Buffer.alloc(0);
        o.isDirectory() && (g += a.sep), this.addFile(g, l, m, o);
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
      let { zipPath: u, zipName: o } = p;
      const l = this;
      a.fs.stat(f, function(y, I) {
        if (y)
          return g(y, !1);
        u = u ? w(u) : "";
        const E = W.win32.basename(W.win32.normalize(f));
        if (u += o || E, I.isFile())
          a.fs.readFile(f, function(_, x) {
            return _ ? g(_, !1) : (l.addFile(u, x, m, I), setImmediate(g, void 0, !0));
          });
        else if (I.isDirectory())
          return u += a.sep, l.addFile(u, Buffer.alloc(0), m, I), setImmediate(g, void 0, !0);
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
      if (f = C(f), g = g ? w(g) : "", p = W.normalize(p), a.fs.existsSync(p)) {
        const m = a.findFiles(p), u = this;
        if (m.length)
          for (const o of m) {
            const l = W.join(g, S(p, o));
            f(l) && u.addLocalFile(o, W.dirname(l));
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
      m = C(m), f = f ? w(f) : "", p = W.normalize(p);
      var u = this;
      a.fs.open(p, "r", function(o) {
        if (o && o.code === "ENOENT")
          g(void 0, q.Errors.FILE_NOT_FOUND(p));
        else if (o)
          g(void 0, o);
        else {
          var l = a.findFiles(p), y = -1, I = function() {
            if (y += 1, y < l.length) {
              var E = l[y], _ = S(p, E).split("\\").join("/");
              _ = _.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, ""), m(_) ? a.fs.stat(E, function(x, T) {
                x && g(void 0, x), T.isFile() ? a.fs.readFile(E, function(M, K) {
                  M ? g(void 0, M) : (u.addFile(f + _, K, "", T), I());
                }) : (u.addFile(f + _ + "/", Buffer.alloc(0), "", T), I());
              }) : process.nextTick(() => {
                I();
              });
            } else
              g(!0, void 0);
          };
          I();
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
      let { zipPath: m, filter: u, namefix: o } = p;
      u instanceof RegExp ? u = /* @__PURE__ */ function(I) {
        return function(E) {
          return I.test(E);
        };
      }(u) : typeof u != "function" && (u = function() {
        return !0;
      }), m = m ? w(m) : "", o == "latin1" && (o = (I) => I.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "")), typeof o != "function" && (o = (I) => I);
      const l = (I) => W.join(m, o(S(localPath, I))), y = (I) => W.win32.basename(W.win32.normalize(o(I)));
      a.fs.open(localPath, "r", function(I) {
        I && I.code === "ENOENT" ? g(void 0, q.Errors.FILE_NOT_FOUND(localPath)) : I ? g(void 0, I) : a.findFilesAsync(localPath, function(E, _) {
          if (E)
            return g(E);
          _ = _.filter((x) => u(l(x))), _.length || g(void 0, !1), setImmediate(
            _.reverse().reduce(function(x, T) {
              return function(M, K) {
                if (M || K === !1)
                  return setImmediate(x, M, !1);
                f.addLocalFileAsync(
                  {
                    localPath: T,
                    zipPath: W.dirname(l(T)),
                    zipName: y(T)
                  },
                  x
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
        this.addLocalFolderAsync2(Object.assign({ localPath: p }, g), (u, o) => {
          u && m(u), o && f(this);
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
      p = d(p);
      let u = v(p);
      const o = u != null;
      o || (u = new an(n), u.entryName = p), u.comment = f || "";
      const l = typeof m == "object" && m instanceof a.fs.Stats;
      l && (u.header.time = m.mtime);
      var y = u.isDirectory ? 16 : 0;
      let I = u.isDirectory ? 16384 : 32768;
      return l ? I |= 4095 & m.mode : typeof m == "number" ? I |= 4095 & m : I |= u.isDirectory ? 493 : 420, y = (y | I << 16) >>> 0, u.attr = y, u.setData(g), o || i.setEntry(u), u;
    },
    /**
     * Returns an array of ZipEntry objects representing the files and folders inside the archive
     *
     * @param {string} [password]
     * @returns Array
     */
    getEntries: function(p) {
      return i.password = p, i ? i.entries : [];
    },
    /**
     * Returns a ZipEntry object representing the file or folder specified by ``name``.
     *
     * @param {string} name
     * @return ZipEntry
     */
    getEntry: function(p) {
      return v(p);
    },
    getEntryCount: function() {
      return i.getEntryCount();
    },
    forEach: function(p) {
      return i.forEach(p);
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
    extractEntryTo: function(p, g, f, m, u, o) {
      m = ue(!1, m), u = ue(!1, u), f = ue(!0, f), o = ft(u, o);
      var l = v(p);
      if (!l)
        throw q.Errors.NO_ENTRY();
      var y = c(l.entryName), I = s(g, o && !l.isDirectory ? o : f ? y : W.basename(y));
      if (l.isDirectory) {
        var E = i.getEntryChildren(l);
        return E.forEach(function(T) {
          if (T.isDirectory)
            return;
          var M = T.getData();
          if (!M)
            throw q.Errors.CANT_EXTRACT_FILE();
          var K = c(T.entryName), Q = s(g, f ? K : W.basename(K));
          const L = u ? T.header.fileAttr : void 0;
          a.writeFileTo(Q, M, m, L);
        }), !0;
      }
      var _ = l.getData(i.password);
      if (!_)
        throw q.Errors.CANT_EXTRACT_FILE();
      if (a.fs.existsSync(I) && !m)
        throw q.Errors.CANT_OVERRIDE();
      const x = u ? p.header.fileAttr : void 0;
      return a.writeFileTo(I, _, m, x), !0;
    },
    /**
     * Test the archive
     * @param {string} [pass]
     */
    test: function(p) {
      if (!i)
        return !1;
      for (var g in i.entries)
        try {
          if (g.isDirectory)
            continue;
          var f = i.entries[g].getData(p);
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
      if (f = ue(!1, f), m = ft(f, m), g = ue(!1, g), !i)
        throw q.Errors.NO_ZIP();
      i.entries.forEach(function(u) {
        var o = s(p, c(u.entryName));
        if (u.isDirectory) {
          a.makeDir(o);
          return;
        }
        var l = u.getData(m);
        if (!l)
          throw q.Errors.CANT_EXTRACT_FILE();
        const y = f ? u.header.fileAttr : void 0;
        a.writeFileTo(o, l, g, y);
        try {
          a.fs.utimesSync(o, u.header.time, u.header.time);
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
      if (m = on(g, f, m), f = ue(!1, f), g = ue(!1, g), !m)
        return new Promise((I, E) => {
          this.extractAllToAsync(p, g, f, function(_) {
            _ ? E(_) : I(this);
          });
        });
      if (!i) {
        m(q.Errors.NO_ZIP());
        return;
      }
      p = W.resolve(p);
      const u = (I) => s(p, W.normalize(c(I.entryName))), o = (I, E) => new Error(I + ': "' + E + '"'), l = [], y = [];
      i.entries.forEach((I) => {
        I.isDirectory ? l.push(I) : y.push(I);
      });
      for (const I of l) {
        const E = u(I), _ = f ? I.header.fileAttr : void 0;
        try {
          a.makeDir(E), _ && a.fs.chmodSync(E, _), a.fs.utimesSync(E, I.header.time, I.header.time);
        } catch {
          m(o("Unable to create folder", E));
        }
      }
      y.reverse().reduce(function(I, E) {
        return function(_) {
          if (_)
            I(_);
          else {
            const x = W.normalize(c(E.entryName)), T = s(p, x);
            E.getDataAsync(function(M, K) {
              if (K)
                I(K);
              else if (!M)
                I(q.Errors.CANT_EXTRACT_FILE());
              else {
                const Q = f ? E.header.fileAttr : void 0;
                a.writeFileToAsync(T, M, g, Q, function(L) {
                  L || I(o("Unable to write file", T)), a.fs.utimes(T, E.header.time, E.header.time, function(Z) {
                    Z ? I(o("Unable to set times", T)) : I();
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
        var f = i.compressToBuffer();
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
      return new Promise((u, o) => {
        !p && n.filename && (p = n.filename), p || o("ADM-ZIP: ZIP File Name Missing"), this.toBufferPromise().then((l) => {
          const y = (I) => I ? u(I) : o("ADM-ZIP: Wasn't able to write zip file");
          a.writeFileToAsync(p, l, f, m, y);
        }, o);
      });
    },
    /**
     * @returns {Promise<Buffer>} A promise to the Buffer.
     */
    toBufferPromise: function() {
      return new Promise((p, g) => {
        i.toAsyncBuffer(p, g);
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
      return typeof p == "function" ? (i.toAsyncBuffer(p, g, f, m), null) : i.compressToBuffer();
    }
  };
};
const ht = /* @__PURE__ */ Mr(ln);
class dn {
  getBackupDir() {
    return ne.join(b.getPath("userData"), "backups");
  }
  getAutoBackupDir() {
    return ne.join(this.getBackupDir(), "auto");
  }
  ensureBackupDirs() {
    const t = this.getBackupDir(), e = this.getAutoBackupDir();
    P.existsSync(t) || P.mkdirSync(t, { recursive: !0 }), P.existsSync(e) || P.mkdirSync(e, { recursive: !0 });
  }
  // --- Encryption Helpers ---
  deriveKey(t, e) {
    return pe.pbkdf2Sync(t, e, 1e5, 32, "sha256");
  }
  encryptData(t, e) {
    const n = pe.randomBytes(16), a = pe.randomBytes(12), i = this.deriveKey(e, n), c = pe.createCipheriv("aes-256-gcm", i, a), s = Buffer.concat([c.update(t), c.final()]), d = c.getAuthTag();
    return {
      encryptedData: s,
      salt: n.toString("hex"),
      iv: a.toString("hex"),
      authTag: d.toString("hex")
    };
  }
  decryptData(t, e, n) {
    const a = Buffer.from(n.salt, "hex"), i = Buffer.from(n.iv, "hex"), c = Buffer.from(n.authTag, "hex"), s = this.deriveKey(e, a), d = pe.createDecipheriv("aes-256-gcm", s, i);
    return d.setAuthTag(c), Buffer.concat([d.update(t), d.final()]);
  }
  // --- Core Logic ---
  // 1. Export Data
  async exportData(t, e) {
    const [n, a, i, c, s, d] = await Promise.all([
      h.novel.findMany(),
      h.volume.findMany(),
      h.chapter.findMany(),
      h.character.findMany(),
      h.idea.findMany(),
      h.tag.findMany()
    ]), v = { novels: n, volumes: a, chapters: i, characters: c, ideas: s, tags: d }, w = Buffer.from(JSON.stringify(v)), C = new ht(), S = {
      version: 1,
      appVersion: b.getVersion(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      platform: process.platform,
      encrypted: !!e
    };
    if (e) {
      const { encryptedData: p, salt: g, iv: f, authTag: m } = this.encryptData(w, e);
      S.encryption = { algo: "aes-256-gcm", salt: g, iv: f, authTag: m }, C.addFile("data.bin", p);
    } else
      C.addFile("data.json", w);
    if (C.addFile("manifest.json", Buffer.from(JSON.stringify(S, null, 2))), !t) {
      const { filePath: p } = await Ie.showSaveDialog({
        title: "Export Backup",
        defaultPath: `NovelData_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_")}.nebak`,
        filters: [{ name: "Novel Editor Backup", extensions: ["nebak"] }]
      });
      if (!p)
        throw new Error("Export cancelled");
      t = p;
    }
    return C.writeZip(t), t;
  }
  // 2. Import Data (Restore)
  async importData(t, e) {
    const n = new ht(t), a = n.getEntry("manifest.json");
    if (!a)
      throw new Error("Invalid backup file: manifest.json missing");
    const i = JSON.parse(a.getData().toString("utf8"));
    let c;
    if (i.encrypted) {
      if (!e)
        throw new Error("PASSWORD_REQUIRED");
      const s = n.getEntry("data.bin");
      if (!s)
        throw new Error("Invalid backup file: data.bin missing");
      if (!i.encryption)
        throw new Error("Invalid backup file: encryption metadata missing");
      try {
        const d = this.decryptData(s.getData(), e, i.encryption);
        c = JSON.parse(d.toString("utf8"));
      } catch {
        throw new Error("PASSWORD_INVALID");
      }
    } else {
      const s = n.getEntry("data.json");
      if (!s)
        throw new Error("Invalid backup file: data.json missing");
      c = JSON.parse(s.getData().toString("utf8"));
    }
    await this.performRestore(c);
  }
  // Helper: Perform Restore (Transactional)
  async performRestore(t) {
    await this.createAutoBackup(), await h.$transaction(async (e) => {
      var n, a, i, c, s, d;
      if (await e.tag.deleteMany(), await e.idea.deleteMany(), await e.character.deleteMany(), await e.chapter.deleteMany(), await e.volume.deleteMany(), await e.novel.deleteMany(), (n = t.novels) != null && n.length)
        for (const v of t.novels)
          await e.novel.create({ data: v });
      if ((a = t.volumes) != null && a.length)
        for (const v of t.volumes)
          await e.volume.create({ data: v });
      if ((i = t.chapters) != null && i.length)
        for (const v of t.chapters)
          await e.chapter.create({ data: v });
      if ((c = t.characters) != null && c.length)
        for (const v of t.characters)
          await e.character.create({ data: v });
      if ((s = t.ideas) != null && s.length)
        for (const v of t.ideas)
          await e.idea.create({ data: v });
      if ((d = t.tags) != null && d.length)
        for (const v of t.tags)
          await e.tag.create({ data: v });
    }, {
      maxWait: 1e4,
      timeout: 2e4
    });
  }
  // 3. Auto Backup Logic
  async createAutoBackup() {
    try {
      this.ensureBackupDirs();
      const e = `auto_backup_${Date.now()}.nebak`, n = ne.join(this.getAutoBackupDir(), e);
      await this.exportData(n), console.log("[BackupService] Auto-backup created:", e), await this.rotateAutoBackups();
    } catch (t) {
      console.error("[BackupService] Failed to create auto-backup:", t);
    }
  }
  async rotateAutoBackups() {
    this.ensureBackupDirs();
    const t = this.getAutoBackupDir(), n = P.readdirSync(t).filter((a) => a.endsWith(".nebak")).map((a) => ({
      name: a,
      time: P.statSync(ne.join(t, a)).mtime.getTime()
    })).sort((a, i) => i.time - a.time).slice(3);
    for (const a of n)
      P.unlinkSync(ne.join(t, a.name)), console.log("[BackupService] Rotated auto-backup:", a.name);
  }
  // 4. List Auto Backups
  async getAutoBackups() {
    this.ensureBackupDirs();
    const t = this.getAutoBackupDir();
    return P.readdirSync(t).filter((e) => e.endsWith(".nebak")).map((e) => {
      const n = P.statSync(ne.join(t, e));
      return {
        filename: e,
        createdAt: n.mtime.getTime(),
        size: n.size
      };
    }).sort((e, n) => n.createdAt - e.createdAt);
  }
  // 5. Restore from Auto Backup
  async restoreAutoBackup(t) {
    this.ensureBackupDirs();
    const e = ne.join(this.getAutoBackupDir(), t);
    if (!P.existsSync(e))
      throw new Error("Backup file not found");
    await this.importData(e);
  }
}
const xe = new dn(), we = N.dirname(Vt(import.meta.url));
process.env.APP_ROOT = N.join(we, "..");
const He = process.env.VITE_DEV_SERVER_URL, On = N.join(process.env.APP_ROOT, "dist-electron"), bt = N.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = He ? N.join(process.env.APP_ROOT, "public") : bt;
process.on("uncaughtException", (r) => {
  se("Main.uncaughtException", r), console.error("[Main] Uncaught Exception:", r), b.quit(), process.exit(1);
});
process.on("unhandledRejection", (r, t) => {
  se("Main.unhandledRejection", r, { promise: String(t) }), console.error("[Main] Unhandled Rejection at:", t, "reason:", r), b.quit(), process.exit(1);
});
let k, gt = !1;
const kt = "云梦小说编辑器", un = "Novel Editor Dev";
function mn() {
  return b.isPackaged && process.platform === "win32" ? process.execPath : "com.noveleditor.app";
}
function Mt() {
  return b.isPackaged && typeof process.env.PORTABLE_EXECUTABLE_DIR == "string" && process.env.PORTABLE_EXECUTABLE_DIR.length > 0;
}
function Ot() {
  return N.join(N.dirname(b.getPath("exe")), "data");
}
function pn() {
  const r = process.env.PORTABLE_EXECUTABLE_DIR;
  return r ? N.join(r, "data") : Ot();
}
function fn(r, t) {
  if (!P.existsSync(r))
    return;
  P.existsSync(t) || P.mkdirSync(t, { recursive: !0 });
  const e = P.readdirSync(r, { withFileTypes: !0 });
  for (const n of e) {
    const a = N.join(r, n.name), i = N.join(t, n.name);
    if (!P.existsSync(i)) {
      if (n.isDirectory()) {
        P.cpSync(a, i, { recursive: !0 });
        continue;
      }
      P.copyFileSync(a, i);
    }
  }
}
function hn() {
  if (!b.isPackaged || Mt())
    return;
  const r = Ot(), t = b.getPath("userData"), e = N.join(r, "novel_editor.db"), n = N.join(t, "novel_editor.db");
  !P.existsSync(e) || P.existsSync(n) || (fn(r, t), console.log("[Main] Migrated legacy packaged data from exe/data to userData."));
}
function gn() {
  if (b.isPackaged) {
    const e = N.join(process.resourcesPath, "icon_ink_pen_256.ico");
    return P.existsSync(e) ? e : void 0;
  }
  const r = N.join(process.env.APP_ROOT || "", "build", "icon_ink_pen_256.ico");
  if (P.existsSync(r))
    return r;
  const t = N.join(process.env.VITE_PUBLIC || "", "electron-vite.svg");
  return P.existsSync(t) ? t : void 0;
}
function yn() {
  const r = b.getPath("appData");
  return b.isPackaged ? N.join(r, kt) : N.join(r, "@novel-editor", "desktop-dev");
}
function wn(r) {
  const t = r.indexOf("--ai-diag");
  if (t < 0)
    return {};
  const e = r.slice(t + 1);
  if (e.length === 0)
    return { error: "Missing diagnostic action. Use: --ai-diag smoke <mcp|skill> [--json] [--db <path>] [--user-data <path>] or --ai-diag coverage [--json] [--db <path>] [--user-data <path>]" };
  const n = [];
  let a = !1, i, c;
  for (let v = 0; v < e.length; v += 1) {
    const w = e[v];
    if (w === "--json") {
      a = !0;
      continue;
    }
    if (w === "--db") {
      const C = e[v + 1];
      if (!C)
        return { error: "Missing value for --db" };
      i = C, v += 1;
      continue;
    }
    if (w === "--user-data") {
      const C = e[v + 1];
      if (!C)
        return { error: "Missing value for --user-data" };
      c = C, v += 1;
      continue;
    }
    if (w.startsWith("--"))
      return { error: `Unknown option: ${w}` };
    n.push(w);
  }
  const [s, d] = n;
  return s === "coverage" ? { command: { action: "coverage", json: a, dbPath: i, userDataPath: c } } : s === "smoke" ? d !== "mcp" && d !== "skill" ? { error: "Smoke mode requires kind: mcp | skill" } : { command: { action: "smoke", kind: d, json: a, dbPath: i, userDataPath: c } } : { error: `Unknown diagnostic action: ${s}` };
}
function vn(r, t) {
  if (t.action === "coverage") {
    const a = r;
    return [
      `[AI-Diag] Coverage ${a.overallCoverage}% (${a.totalSupported}/${a.totalRequired})`,
      ...a.modules.map((c) => {
        const s = c.missingActions.length ? ` missing=[${c.missingActions.join(", ")}]` : "";
        return `- ${c.title}: ${c.coverage}% (${c.supportedActions.length}/${c.requiredActions.length})${s}`;
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
async function In(r, t) {
  const e = t.action === "coverage" ? r.getCapabilityCoverage() : await r.testOpenClawSmoke({ kind: t.kind });
  return t.json ? console.log(JSON.stringify(e, null, 2)) : console.log(vn(e, t)), t.action === "smoke" && !e.ok ? 1 : 0;
}
function yt() {
  if (!Ve() || gt)
    return;
  gt = !0;
  const r = console.error.bind(console), t = console.warn.bind(console);
  console.error = (...e) => {
    O("ERROR", "console.error", "console.error called", { args: ie(e) }), r(...e);
  }, console.warn = (...e) => {
    O("WARN", "console.warn", "console.warn called", { args: ie(e) }), t(...e);
  };
}
function F(r, t, e) {
  const n = te(e);
  se(`Main.${r}`, e, {
    payload: ie(t),
    normalizedError: n,
    displayMessage: he(n.code, n.message)
  });
}
const re = wn(process.argv);
async function Rt(r) {
  const t = r == null ? void 0 : r.proxy;
  if (!t || !Ee.defaultSession)
    return;
  const e = () => {
    delete process.env.HTTP_PROXY, delete process.env.http_proxy, delete process.env.HTTPS_PROXY, delete process.env.https_proxy, delete process.env.ALL_PROXY, delete process.env.all_proxy, delete process.env.NO_PROXY, delete process.env.no_proxy;
  }, n = () => {
    t.httpProxy && (process.env.HTTP_PROXY = t.httpProxy, process.env.http_proxy = t.httpProxy), t.httpsProxy && (process.env.HTTPS_PROXY = t.httpsProxy, process.env.https_proxy = t.httpsProxy), t.allProxy && (process.env.ALL_PROXY = t.allProxy, process.env.all_proxy = t.allProxy), t.noProxy && (process.env.NO_PROXY = t.noProxy, process.env.no_proxy = t.noProxy);
  };
  if (t.mode === "off") {
    await Ee.defaultSession.setProxy({ mode: "direct" }), e();
    return;
  }
  if (t.mode === "custom") {
    const a = [t.allProxy, t.httpsProxy, t.httpProxy].filter((i) => !!i).join(";");
    await Ee.defaultSession.setProxy({
      mode: a ? "fixed_servers" : "direct",
      proxyRules: a,
      proxyBypassRules: t.noProxy || ""
    }), e(), n();
    return;
  }
  await Ee.defaultSession.setProxy({ mode: "system" }), e();
}
function $t() {
  const r = !b.isPackaged, t = gn();
  k = new wt({
    width: 1200,
    height: 800,
    ...t ? { icon: t } : {},
    webPreferences: {
      preload: N.join(we, "preload.mjs"),
      devTools: r
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
  }), k.once("ready-to-show", () => {
    k == null || k.show();
  }), k.webContents.on("did-finish-load", () => {
    k == null || k.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), k.webContents.on("devtools-opened", () => {
    r || k == null || k.webContents.closeDevTools();
  }), k.webContents.on("before-input-event", (e, n) => {
    n.key === "F11" && (k == null || k.setFullScreen(!k.isFullScreen()), e.preventDefault()), r && (n.key === "F12" || n.control && n.shift && n.key.toLowerCase() === "i") && (k != null && k.webContents.isDevToolsOpened() ? k.webContents.closeDevTools() : k == null || k.webContents.openDevTools(), e.preventDefault());
  }), He ? k.loadURL(He) : k.loadFile(N.join(bt, "index.html")), k.on("enter-full-screen", () => {
    k == null || k.webContents.send("app:fullscreen-change", !0);
  }), k.on("leave-full-screen", () => {
    k == null || k.webContents.send("app:fullscreen-change", !1);
  });
}
A.handle("app:toggle-fullscreen", () => {
  if (k) {
    const r = k.isFullScreen();
    return k.setFullScreen(!r), !r;
  }
  return !1;
});
A.handle("app:get-user-data-path", () => b.getPath("userData"));
A.handle("db:get-novels", async () => {
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
        (i, c) => i + c.chapters.reduce((s, d) => s + d.wordCount, 0),
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
A.handle("db:update-novel", async (r, { id: t, data: e }) => {
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
A.handle("db:upload-novel-cover", async (r, t) => {
  var e;
  try {
    const n = await Ie.showOpenDialog(k, {
      title: "Select Cover Image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
      properties: ["openFile"]
    });
    if (n.canceled || n.filePaths.length === 0)
      return null;
    const a = n.filePaths[0], i = N.extname(a), c = N.join(b.getPath("userData"), "covers");
    P.existsSync(c) || P.mkdirSync(c, { recursive: !0 });
    const s = await h.novel.findUnique({ where: { id: t }, select: { coverUrl: !0 } });
    if ((e = s == null ? void 0 : s.coverUrl) != null && e.startsWith("covers/")) {
      const C = N.join(b.getPath("userData"), s.coverUrl);
      P.existsSync(C) && P.unlinkSync(C);
    }
    const d = `${t}${i}`, v = N.join(c, d);
    P.copyFileSync(a, v);
    const w = `covers/${d}`;
    return await h.novel.update({
      where: { id: t },
      data: { coverUrl: w }
    }), { path: w };
  } catch (n) {
    throw console.error("[Main] db:upload-novel-cover failed:", n), n;
  }
});
A.handle("db:get-volumes", async (r, t) => {
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
A.handle("db:create-volume", async (r, { novelId: t, title: e }) => {
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
A.handle("db:create-chapter", async (r, { volumeId: t, title: e, order: n }) => {
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
    return await Se({ ...a, novelId: a.volume.novelId }), a;
  } catch (a) {
    throw console.error("[Main] db:create-chapter failed:", a), a;
  }
});
A.handle("db:get-chapter", async (r, t) => {
  try {
    return await h.chapter.findUnique({
      where: { id: t },
      include: { volume: { select: { novelId: !0 } } }
    });
  } catch (e) {
    throw console.error("[Main] db:get-chapter failed:", e), e;
  }
});
A.handle("db:rename-volume", async (r, { volumeId: t, title: e }) => {
  try {
    const n = await h.volume.update({
      where: { id: t },
      data: { title: e }
    }), a = await h.chapter.findMany({
      where: { volumeId: t },
      include: { volume: { select: { novelId: !0, title: !0, order: !0 } } }
    });
    for (const i of a)
      await Se({
        ...i,
        novelId: i.volume.novelId,
        volumeTitle: i.volume.title,
        volumeOrder: i.volume.order
      });
    return n;
  } catch (n) {
    throw console.error("[Main] db:rename-volume failed:", n), n;
  }
});
A.handle("db:rename-chapter", async (r, { chapterId: t, title: e }) => {
  try {
    const n = await h.chapter.update({
      where: { id: t },
      data: { title: e }
    }), a = await h.chapter.findUnique({
      where: { id: t },
      select: { id: !0, title: !0, content: !0, volumeId: !0, order: !0, volume: { select: { novelId: !0 } } }
    });
    return a && a.volume && await Se({ ...a, novelId: a.volume.novelId }), n;
  } catch (n) {
    throw console.error("[Main] db:rename-chapter failed:", n), n;
  }
});
A.handle("db:create-novel", async (r, t) => {
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
A.handle("db:save-chapter", async (r, { chapterId: t, content: e }) => {
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
    const a = n.volume.novelId, i = e.length, c = i - n.wordCount, [, s] = await h.$transaction([
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
          wordCount: i,
          updatedAt: /* @__PURE__ */ new Date()
        }
      })
    ]), d = await h.chapter.findUnique({
      where: { id: t },
      select: { id: !0, title: !0, content: !0, volumeId: !0, order: !0 }
    });
    return d && await Se({ ...d, novelId: a }), We(t), s;
  } catch (n) {
    throw console.error("[Main] db:save-chapter failed:", n), n;
  }
});
A.handle("db:create-idea", async (r, t) => {
  try {
    const { timestamp: e, tags: n, ...a } = t, i = a.novelId, c = await h.idea.create({
      data: {
        ...a,
        tags: {
          connectOrCreate: (n || []).map((d) => ({
            where: { name_novelId: { name: d, novelId: i } },
            create: { name: d, novelId: i }
          }))
        }
      },
      include: { tags: !0 }
    }), s = {
      ...c,
      tags: c.tags.map((d) => d.name),
      timestamp: c.createdAt.getTime()
    };
    return await qe({
      id: c.id,
      content: c.content,
      quote: c.quote,
      novelId: c.novelId,
      chapterId: c.chapterId
    }), s;
  } catch (e) {
    throw console.error("[Main] db:create-idea failed:", e), e;
  }
});
A.handle("db:get-ideas", async (r, t) => {
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
A.handle("db:update-idea", async (r, t, e) => {
  try {
    const { timestamp: n, tags: a, ...i } = e, c = { ...i };
    if (a !== void 0) {
      const v = await h.idea.findUnique({ where: { id: t }, select: { novelId: !0 } });
      if (v) {
        const w = v.novelId;
        c.tags = {
          set: [],
          // Disconnect all existing
          connectOrCreate: (a || []).map((C) => ({
            where: { name_novelId: { name: C, novelId: w } },
            create: { name: C, novelId: w }
          }))
        };
      }
    }
    const s = await h.idea.update({
      where: { id: t },
      data: {
        ...c,
        updatedAt: /* @__PURE__ */ new Date()
      },
      include: { tags: !0 }
    }), d = {
      ...s,
      tags: s.tags.map((v) => v.name),
      timestamp: s.createdAt.getTime()
    };
    return await qe({
      id: s.id,
      content: s.content,
      quote: s.quote,
      novelId: s.novelId,
      chapterId: s.chapterId
    }), d;
  } catch (n) {
    throw console.error("[Main] db:update-idea failed:", n), n;
  }
});
A.handle("db:delete-idea", async (r, t) => {
  try {
    const e = await h.idea.delete({ where: { id: t } });
    return await Qt("idea", t), e;
  } catch (e) {
    throw console.error("[Main] db:delete-idea failed:", e), e;
  }
});
A.handle("db:check-index-status", async (r, t) => {
  try {
    const e = await er(t), n = await h.chapter.count({
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
const Ft = new kr();
let $;
A.handle("ai:get-settings", async () => {
  try {
    return $.getSettings();
  } catch (r) {
    throw F("ai:get-settings", void 0, r), console.error("[Main] ai:get-settings failed:", r), r;
  }
});
A.handle("ai:get-map-image-stats", async () => {
  try {
    return $.getMapImageStats();
  } catch (r) {
    throw F("ai:get-map-image-stats", void 0, r), console.error("[Main] ai:get-map-image-stats failed:", r), r;
  }
});
A.handle("ai:list-actions", async () => {
  try {
    return $.listActions();
  } catch (r) {
    throw F("ai:list-actions", void 0, r), console.error("[Main] ai:list-actions failed:", r), r;
  }
});
A.handle("ai:get-capability-coverage", async () => {
  try {
    return $.getCapabilityCoverage();
  } catch (r) {
    throw F("ai:get-capability-coverage", void 0, r), console.error("[Main] ai:get-capability-coverage failed:", r), r;
  }
});
A.handle("ai:get-mcp-manifest", async () => {
  try {
    return $.getMcpToolsManifest();
  } catch (r) {
    throw F("ai:get-mcp-manifest", void 0, r), console.error("[Main] ai:get-mcp-manifest failed:", r), r;
  }
});
A.handle("ai:get-openclaw-manifest", async () => {
  try {
    return $.getOpenClawManifest();
  } catch (r) {
    throw F("ai:get-openclaw-manifest", void 0, r), console.error("[Main] ai:get-openclaw-manifest failed:", r), r;
  }
});
A.handle("ai:get-openclaw-skill-manifest", async () => {
  try {
    return $.getOpenClawSkillManifest();
  } catch (r) {
    throw F("ai:get-openclaw-skill-manifest", void 0, r), console.error("[Main] ai:get-openclaw-skill-manifest failed:", r), r;
  }
});
A.handle("ai:update-settings", async (r, t) => {
  try {
    const e = $.updateSettings(t || {});
    return await Rt(e), e;
  } catch (e) {
    throw F("ai:update-settings", t, e), console.error("[Main] ai:update-settings failed:", e), e;
  }
});
A.handle("ai:test-connection", async () => {
  try {
    return await $.testConnection();
  } catch (r) {
    throw F("ai:test-connection", void 0, r), console.error("[Main] ai:test-connection failed:", r), r;
  }
});
A.handle("ai:test-mcp", async () => {
  try {
    return await $.testMcp();
  } catch (r) {
    throw F("ai:test-mcp", void 0, r), console.error("[Main] ai:test-mcp failed:", r), r;
  }
});
A.handle("ai:test-openclaw-mcp", async () => {
  try {
    return await $.testOpenClawMcp();
  } catch (r) {
    throw F("ai:test-openclaw-mcp", void 0, r), console.error("[Main] ai:test-openclaw-mcp failed:", r), r;
  }
});
A.handle("ai:test-openclaw-skill", async () => {
  try {
    return await $.testOpenClawSkill();
  } catch (r) {
    throw F("ai:test-openclaw-skill", void 0, r), console.error("[Main] ai:test-openclaw-skill failed:", r), r;
  }
});
A.handle("ai:test-openclaw-smoke", async (r, t) => {
  try {
    const e = (t == null ? void 0 : t.kind) === "skill" ? "skill" : "mcp";
    return await $.testOpenClawSmoke({ kind: e });
  } catch (e) {
    throw F("ai:test-openclaw-smoke", t, e), console.error("[Main] ai:test-openclaw-smoke failed:", e), e;
  }
});
A.handle("ai:test-proxy", async () => {
  try {
    return await $.testProxy();
  } catch (r) {
    throw F("ai:test-proxy", void 0, r), console.error("[Main] ai:test-proxy failed:", r), r;
  }
});
A.handle("ai:test-generate", async (r, t) => {
  try {
    return await $.testGenerate(t == null ? void 0 : t.prompt);
  } catch (e) {
    throw F("ai:test-generate", t, e), console.error("[Main] ai:test-generate failed:", e), e;
  }
});
A.handle("ai:generate-title", async (r, t) => {
  try {
    return await $.generateTitle(t);
  } catch (e) {
    throw F("ai:generate-title", t, e), console.error("[Main] ai:generate-title failed:", e), e;
  }
});
A.handle("ai:continue-writing", async (r, t) => {
  try {
    return await $.continueWriting(t);
  } catch (e) {
    throw F("ai:continue-writing", t, e), console.error("[Main] ai:continue-writing failed:", e), e;
  }
});
A.handle("ai:preview-continue-prompt", async (r, t) => {
  try {
    return await $.previewContinuePrompt(t);
  } catch (e) {
    throw F("ai:preview-continue-prompt", t, e), console.error("[Main] ai:preview-continue-prompt failed:", e), e;
  }
});
A.handle("ai:check-consistency", async (r, t) => {
  try {
    return await $.checkConsistency(t);
  } catch (e) {
    throw F("ai:check-consistency", t, e), console.error("[Main] ai:check-consistency failed:", e), e;
  }
});
A.handle("ai:generate-creative-assets", async (r, t) => {
  try {
    return await $.generateCreativeAssets(t);
  } catch (e) {
    throw F("ai:generate-creative-assets", t, e), console.error("[Main] ai:generate-creative-assets failed:", e), e;
  }
});
A.handle("ai:preview-creative-assets-prompt", async (r, t) => {
  try {
    return await $.previewCreativeAssetsPrompt(t);
  } catch (e) {
    throw F("ai:preview-creative-assets-prompt", t, e), console.error("[Main] ai:preview-creative-assets-prompt failed:", e), e;
  }
});
A.handle("ai:validate-creative-assets", async (r, t) => {
  try {
    return await $.validateCreativeAssetsDraft(t);
  } catch (e) {
    throw F("ai:validate-creative-assets", t, e), console.error("[Main] ai:validate-creative-assets failed:", e), e;
  }
});
A.handle("ai:confirm-creative-assets", async (r, t) => {
  try {
    return await $.confirmCreativeAssets(t);
  } catch (e) {
    throw F("ai:confirm-creative-assets", t, e), console.error("[Main] ai:confirm-creative-assets failed:", e), e;
  }
});
A.handle("ai:generate-map-image", async (r, t) => {
  try {
    return await $.generateMapImage(t);
  } catch (e) {
    return F("ai:generate-map-image", t, e), console.error("[Main] ai:generate-map-image failed:", e), { ok: !1, code: "UNKNOWN", detail: e instanceof Error ? e.message : String(e) };
  }
});
A.handle("ai:preview-map-prompt", async (r, t) => {
  try {
    return await $.previewMapPrompt(t);
  } catch (e) {
    throw F("ai:preview-map-prompt", t, e), console.error("[Main] ai:preview-map-prompt failed:", e), e;
  }
});
A.handle("ai:rebuild-chapter-summary", async (r, t) => {
  try {
    return t != null && t.chapterId ? (We(t.chapterId, "manual"), { ok: !0, detail: "summary rebuild scheduled" }) : { ok: !1, detail: "chapterId is required" };
  } catch (e) {
    return F("ai:rebuild-chapter-summary", t, e), console.error("[Main] ai:rebuild-chapter-summary failed:", e), { ok: !1, detail: e instanceof Error ? e.message : String(e) };
  }
});
A.handle("ai:execute-action", async (r, t) => {
  try {
    return await $.executeAction(t);
  } catch (e) {
    throw F("ai:execute-action", t, e), console.error("[Main] ai:execute-action failed:", e), e;
  }
});
A.handle("ai:openclaw-invoke", async (r, t) => {
  try {
    return await $.invokeOpenClawTool(t);
  } catch (e) {
    F("ai:openclaw-invoke", t, e), console.error("[Main] ai:openclaw-invoke failed:", e);
    const n = te(e);
    return {
      ok: !1,
      code: n.code,
      error: he(n.code, n.message)
    };
  }
});
A.handle("ai:openclaw-mcp-invoke", async (r, t) => {
  try {
    return await $.invokeOpenClawTool(t);
  } catch (e) {
    F("ai:openclaw-mcp-invoke", t, e), console.error("[Main] ai:openclaw-mcp-invoke failed:", e);
    const n = te(e);
    return {
      ok: !1,
      code: n.code,
      error: he(n.code, n.message)
    };
  }
});
A.handle("ai:openclaw-skill-invoke", async (r, t) => {
  try {
    return await $.invokeOpenClawSkill(t);
  } catch (e) {
    F("ai:openclaw-skill-invoke", t, e), console.error("[Main] ai:openclaw-skill-invoke failed:", e);
    const n = te(e);
    return {
      ok: !1,
      code: n.code,
      error: he(n.code, n.message)
    };
  }
});
A.handle("sync:pull", async () => {
  try {
    return await Ft.pull();
  } catch (r) {
    throw console.error("[Main] sync:pull failed:", r), r;
  }
});
A.handle("backup:export", async (r, t) => {
  try {
    return await xe.exportData(void 0, t);
  } catch (e) {
    throw console.error("[Main] backup:export failed:", e), e;
  }
});
A.handle("backup:import", async (r, { filePath: t, password: e }) => {
  try {
    if (!t) {
      const n = await Ie.showOpenDialog({
        title: "Import Backup",
        filters: [{ name: "Novel Editor Backup", extensions: ["nebak"] }],
        properties: ["openFile"]
      });
      if (n.canceled || n.filePaths.length === 0)
        return { success: !1, code: "CANCELLED" };
      t = n.filePaths[0];
    }
    return await xe.importData(t, e), { success: !0 };
  } catch (n) {
    console.error("[Main] backup:import failed:", n);
    const a = n.message || n.toString();
    return a.includes("PASSWORD_REQUIRED") ? { success: !1, code: "PASSWORD_REQUIRED", filePath: t } : a.includes("PASSWORD_INVALID") ? { success: !1, code: "PASSWORD_INVALID", filePath: t } : { success: !1, message: a };
  }
});
A.handle("backup:get-auto", async () => {
  try {
    return await xe.getAutoBackups();
  } catch (r) {
    throw console.error("[Main] backup:get-auto failed:", r), r;
  }
});
A.handle("backup:restore-auto", async (r, t) => {
  try {
    return await xe.restoreAutoBackup(t), !0;
  } catch (e) {
    throw console.error("[Main] backup:restore-auto failed:", e), e;
  }
});
A.handle("sync:push", async () => {
  try {
    return await Ft.push();
  } catch (r) {
    throw console.error("[Main] sync:push failed:", r), r;
  }
});
A.handle("db:search", async (r, { novelId: t, keyword: e, limit: n = 20, offset: a = 0 }) => {
  try {
    return await St(t, e, n, a);
  } catch (i) {
    throw console.error("[Main] db:search failed:", i), i;
  }
});
A.handle("db:rebuild-search-index", async (r, t) => {
  try {
    return await Ct(t);
  } catch (e) {
    throw console.error("[Main] db:rebuild-search-index failed:", e), e;
  }
});
A.handle("db:get-all-tags", async (r, t) => {
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
A.handle("db:get-plot-lines", async (r, t) => {
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
A.handle("db:create-plot-line", async (r, t) => {
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
A.handle("db:update-plot-line", async (r, t) => {
  try {
    return await h.plotLine.update({
      where: { id: t.id },
      data: t.data
    });
  } catch (e) {
    throw console.error("[Main] db:update-plot-line failed. ID:", t.id, "Error:", e), e;
  }
});
A.handle("db:delete-plot-line", async (r, t) => {
  try {
    return await h.plotLine.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-plot-line failed. ID:", t, "Error:", e), e;
  }
});
A.handle("db:create-plot-point", async (r, t) => {
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
A.handle("db:update-plot-point", async (r, t) => {
  try {
    return await h.plotPoint.update({
      where: { id: t.id },
      data: t.data
    });
  } catch (e) {
    throw console.error("[Main] db:update-plot-point failed. ID:", t.id, "Error:", e), e;
  }
});
A.handle("db:delete-plot-point", async (r, t) => {
  try {
    return await h.plotPoint.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-plot-point failed. ID:", t, "Error:", e), e;
  }
});
A.handle("db:create-plot-point-anchor", async (r, t) => {
  try {
    return await h.plotPointAnchor.create({ data: t });
  } catch (e) {
    throw console.error("[Main] db:create-plot-point-anchor failed. Data:", t, "Error:", e), e;
  }
});
A.handle("db:delete-plot-point-anchor", async (r, t) => {
  try {
    return await h.plotPointAnchor.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-plot-point-anchor failed. ID:", t, "Error:", e), e;
  }
});
A.handle("db:reorder-plot-lines", async (r, { lineIds: t }) => {
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
A.handle("db:reorder-plot-points", async (r, { plotLineId: t, pointIds: e }) => {
  try {
    const n = e.map(
      (a, i) => h.plotPoint.update({
        where: { id: a },
        data: { order: i, plotLineId: t }
      })
    );
    return await h.$transaction(n), { success: !0 };
  } catch (n) {
    throw console.error("[Main] db:reorder-plot-points failed:", n), n;
  }
});
A.handle("db:upload-character-image", async (r, { characterId: t, type: e }) => {
  try {
    const n = await Ie.showOpenDialog(k, {
      title: e === "avatar" ? "Select Avatar Image" : "Select Full Body Image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
      properties: ["openFile"]
    });
    if (n.canceled || n.filePaths.length === 0)
      return null;
    const a = n.filePaths[0], i = N.extname(a), c = N.join(b.getPath("userData"), "characters", t);
    if (P.existsSync(c) || P.mkdirSync(c, { recursive: !0 }), e === "avatar") {
      const s = `avatar${i}`, d = N.join(c, s);
      P.readdirSync(c).filter((C) => C.startsWith("avatar.")).forEach((C) => {
        try {
          P.unlinkSync(N.join(c, C));
        } catch {
        }
      }), P.copyFileSync(a, d);
      const w = `characters/${t}/${s}`;
      return await h.character.update({
        where: { id: t },
        data: { avatar: w }
      }), { path: w };
    } else {
      const d = `fullbody_${Date.now()}${i}`, v = N.join(c, d);
      P.copyFileSync(a, v);
      const w = `characters/${t}/${d}`, C = await h.character.findUnique({ where: { id: t }, select: { fullBodyImages: !0 } });
      let S = [];
      try {
        S = JSON.parse((C == null ? void 0 : C.fullBodyImages) || "[]");
      } catch {
      }
      return S.push(w), await h.character.update({
        where: { id: t },
        data: { fullBodyImages: JSON.stringify(S) }
      }), { path: w, images: S };
    }
  } catch (n) {
    throw console.error("[Main] db:upload-character-image failed:", n), n;
  }
});
A.handle("db:delete-character-image", async (r, { characterId: t, imagePath: e, type: n }) => {
  try {
    const a = N.join(b.getPath("userData"), e);
    if (P.existsSync(a) && P.unlinkSync(a), n === "avatar")
      await h.character.update({
        where: { id: t },
        data: { avatar: null }
      });
    else {
      const i = await h.character.findUnique({ where: { id: t }, select: { fullBodyImages: !0 } });
      let c = [];
      try {
        c = JSON.parse((i == null ? void 0 : i.fullBodyImages) || "[]");
      } catch {
      }
      c = c.filter((s) => s !== e), await h.character.update({
        where: { id: t },
        data: { fullBodyImages: JSON.stringify(c) }
      });
    }
  } catch (a) {
    throw console.error("[Main] db:delete-character-image failed:", a), a;
  }
});
A.handle("db:get-character-map-locations", async (r, t) => {
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
A.handle("db:get-characters", async (r, t) => {
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
A.handle("db:get-character", async (r, t) => {
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
A.handle("db:create-character", async (r, t) => {
  try {
    const e = typeof t.profile == "object" ? JSON.stringify(t.profile) : t.profile;
    return await h.character.create({
      data: { ...t, profile: e }
    });
  } catch (e) {
    throw console.error("[Main] db:create-character failed:", e), e;
  }
});
A.handle("db:update-character", async (r, { id: t, data: e }) => {
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
A.handle("db:delete-character", async (r, t) => {
  try {
    await h.character.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-character failed:", e), e;
  }
});
A.handle("db:get-items", async (r, t) => {
  try {
    return await h.item.findMany({
      where: { novelId: t },
      orderBy: { sortOrder: "asc" }
    });
  } catch (e) {
    throw console.error("[Main] db:get-items failed:", e), e;
  }
});
A.handle("db:get-item", async (r, t) => {
  try {
    return await h.item.findUnique({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:get-item failed:", e), e;
  }
});
A.handle("db:create-item", async (r, t) => {
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
A.handle("db:update-item", async (r, { id: t, data: e }) => {
  try {
    return await h.item.update({
      where: { id: t },
      data: { ...e, updatedAt: /* @__PURE__ */ new Date() }
    });
  } catch (n) {
    throw console.error("[Main] db:update-item failed:", n), n;
  }
});
A.handle("db:delete-item", async (r, t) => {
  try {
    return await h.item.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-item failed:", e), e;
  }
});
A.handle("db:get-mentionables", async (r, t) => {
  try {
    const [e, n, a, i] = await Promise.all([
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
      ...i.map((c) => ({ id: c.id, name: c.name, type: "map", role: c.type }))
    ];
  } catch (e) {
    throw console.error("[Main] db:get-mentionables failed:", e), e;
  }
});
A.handle("db:get-world-settings", async (r, t) => {
  try {
    return await h.worldSetting.findMany({
      where: { novelId: t },
      orderBy: { sortOrder: "asc" }
    });
  } catch (e) {
    throw console.error("[Main] db:get-world-settings failed:", e), e;
  }
});
A.handle("db:create-world-setting", async (r, t) => {
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
A.handle("db:update-world-setting", async (r, t, e) => {
  try {
    return await h.worldSetting.update({
      where: { id: t },
      data: e
    });
  } catch (n) {
    throw console.error("[Main] db:update-world-setting failed:", n), n;
  }
});
A.handle("db:delete-world-setting", async (r, t) => {
  try {
    return await h.worldSetting.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-world-setting failed:", e), e;
  }
});
A.handle("db:get-maps", async (r, t) => {
  try {
    return await h.mapCanvas.findMany({
      where: { novelId: t },
      orderBy: { sortOrder: "asc" }
    });
  } catch (e) {
    throw console.error("[Main] db:get-maps failed:", e), e;
  }
});
A.handle("db:get-map", async (r, t) => {
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
A.handle("db:create-map", async (r, t) => {
  try {
    return await h.mapCanvas.create({ data: t });
  } catch (e) {
    throw console.error("[Main] db:create-map failed:", e), e;
  }
});
A.handle("db:update-map", async (r, { id: t, data: e }) => {
  try {
    const { markers: n, elements: a, createdAt: i, updatedAt: c, ...s } = e;
    return await h.mapCanvas.update({ where: { id: t }, data: s });
  } catch (n) {
    throw console.error("[Main] db:update-map failed:", n), n;
  }
});
A.handle("db:delete-map", async (r, t) => {
  try {
    const e = await h.mapCanvas.findUnique({ where: { id: t }, select: { background: !0, novelId: !0 } });
    if (e != null && e.background) {
      const n = N.join(b.getPath("userData"), e.background);
      P.existsSync(n) && P.unlinkSync(n);
    }
    return await h.mapCanvas.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-map failed:", e), e;
  }
});
A.handle("db:upload-map-bg", async (r, t) => {
  try {
    const e = await h.mapCanvas.findUnique({ where: { id: t }, select: { novelId: !0, background: !0 } });
    if (!e)
      return null;
    const n = await Ie.showOpenDialog(k, {
      title: "Select Map Image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
      properties: ["openFile"]
    });
    if (n.canceled || n.filePaths.length === 0)
      return null;
    const a = n.filePaths[0], i = N.extname(a), c = N.join(b.getPath("userData"), "maps", e.novelId);
    if (P.existsSync(c) || P.mkdirSync(c, { recursive: !0 }), e.background) {
      const g = N.join(b.getPath("userData"), e.background);
      P.existsSync(g) && P.unlinkSync(g);
    }
    const s = `${t}${i}`, d = N.join(c, s);
    P.copyFileSync(a, d);
    const v = `maps/${e.novelId}/${s}`, C = jt.createFromPath(d).getSize(), S = C.width || 1200, p = C.height || 800;
    return await h.mapCanvas.update({
      where: { id: t },
      data: { background: v, width: S, height: p }
    }), { path: v, width: S, height: p };
  } catch (e) {
    throw console.error("[Main] db:upload-map-bg failed:", e), e;
  }
});
A.handle("db:get-map-markers", async (r, t) => {
  try {
    return await h.characterMapMarker.findMany({
      where: { mapId: t },
      include: { character: { select: { id: !0, name: !0, avatar: !0, role: !0 } } }
    });
  } catch (e) {
    throw console.error("[Main] db:get-map-markers failed:", e), e;
  }
});
A.handle("db:create-map-marker", async (r, t) => {
  try {
    return await h.characterMapMarker.create({
      data: t,
      include: { character: { select: { id: !0, name: !0, avatar: !0, role: !0 } } }
    });
  } catch (e) {
    throw console.error("[Main] db:create-map-marker failed:", e), e;
  }
});
A.handle("db:update-map-marker", async (r, { id: t, data: e }) => {
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
A.handle("db:delete-map-marker", async (r, t) => {
  try {
    return await h.characterMapMarker.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-map-marker failed:", e), e;
  }
});
A.handle("db:get-map-elements", async (r, t) => {
  try {
    return await h.mapElement.findMany({
      where: { mapId: t },
      orderBy: { z: "asc" }
    });
  } catch (e) {
    throw console.error("[Main] db:get-map-elements failed:", e), e;
  }
});
A.handle("db:create-map-element", async (r, t) => {
  try {
    return await h.mapElement.create({ data: t });
  } catch (e) {
    throw console.error("[Main] db:create-map-element failed:", e), e;
  }
});
A.handle("db:update-map-element", async (r, { id: t, data: e }) => {
  try {
    const { createdAt: n, updatedAt: a, map: i, ...c } = e;
    return await h.mapElement.update({ where: { id: t }, data: c });
  } catch (n) {
    throw console.error("[Main] db:update-map-element failed:", n), n;
  }
});
A.handle("db:delete-map-element", async (r, t) => {
  try {
    return await h.mapElement.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-map-element failed:", e), e;
  }
});
A.handle("db:get-relationships", async (r, t) => {
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
A.handle("db:create-relationship", async (r, t) => {
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
A.handle("db:delete-relationship", async (r, t) => {
  try {
    return await h.relationship.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:delete-relationship failed:", e), e;
  }
});
A.handle("db:get-character-items", async (r, t) => {
  try {
    return await h.itemOwnership.findMany({
      where: { characterId: t },
      include: { item: !0 }
    });
  } catch (e) {
    throw console.error("[Main] db:get-character-items failed:", e), e;
  }
});
A.handle("db:add-item-to-character", async (r, t) => {
  try {
    return await h.itemOwnership.create({
      data: t,
      include: { item: !0 }
    });
  } catch (e) {
    throw console.error("[Main] db:add-item-to-character failed:", e), e;
  }
});
A.handle("db:remove-item-from-character", async (r, t) => {
  try {
    return await h.itemOwnership.delete({ where: { id: t } });
  } catch (e) {
    throw console.error("[Main] db:remove-item-from-character failed:", e), e;
  }
});
A.handle("db:update-item-ownership", async (r, t, e) => {
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
A.handle("db:get-character-timeline", async (r, t) => {
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
    return n.filter((i) => i.chapter && !a.has(i.chapter.id) && a.add(i.chapter.id)).map((i) => {
      var c;
      return {
        chapterId: i.chapter.id,
        chapterTitle: i.chapter.title,
        volumeTitle: i.chapter.volume.title,
        order: i.chapter.order,
        volumeOrder: i.chapter.volume.order,
        snippet: ((c = i.plotPoint.description) == null ? void 0 : c.substring(0, 100)) || i.plotPoint.title
      };
    });
  } catch (e) {
    throw console.error("[Main] db:get-character-timeline failed:", e), e;
  }
});
function Sn(r) {
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
A.handle("db:get-character-chapter-appearances", async (r, t) => {
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
      const i = Sn(a.content || "");
      let c = "";
      const s = i.indexOf(e.name);
      if (s >= 0) {
        const d = Math.max(0, s - 30), v = Math.min(i.length, s + e.name.length + 50);
        c = (d > 0 ? "..." : "") + i.substring(d, v) + (v < i.length ? "..." : "");
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
A.handle("db:get-recent-chapters", async (r, t, e, n = 5) => {
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
  process.platform !== "darwin" && (b.quit(), k = null);
});
b.on("activate", () => {
  wt.getAllWindows().length === 0 && $t();
});
b.whenReady().then(async () => {
  var a, i, c;
  if (re.error) {
    Xe(b.getPath("userData")), yt(), console.error(`[AI-Diag] Invalid arguments: ${re.error}`), b.exit(2);
    return;
  }
  b.setAppUserModelId(mn()), b.setName(b.isPackaged ? kt : un);
  const r = (a = re.command) != null && a.userDataPath ? N.resolve(re.command.userDataPath) : yn();
  if (b.setPath("userData", r), Xe(b.getPath("userData")), yt(), console.log("[Main] App Ready. Starting DB Setup..."), console.log("[Main] User Data Path:", b.getPath("userData")), re.command && b.isPackaged) {
    console.error("[AI-Diag] --ai-diag is only available in development mode."), b.exit(1);
    return;
  }
  (i = re.command) != null && i.userDataPath && console.log("[AI-Diag] userData override:", r), zt.handle("local-resource", (s) => {
    const d = decodeURIComponent(s.url.replace("local-resource://", "")), v = N.join(b.getPath("userData"), d);
    return Ht.fetch("file:///" + v.replace(/\\/g, "/"));
  });
  let t;
  b.isPackaged && Mt() ? t = pn() : t = b.getPath("userData"), hn();
  const e = (c = re.command) != null && c.dbPath ? N.resolve(re.command.dbPath) : N.join(t, "novel_editor.db"), n = `file:${e}`;
  if (console.log("[Main] Database Path:", e), P.existsSync(N.dirname(e)) || P.mkdirSync(N.dirname(e), { recursive: !0 }), !b.isPackaged) {
    const s = N.resolve(we, "../../../packages/core/prisma/schema.prisma");
    if (console.log("[Main] Development mode detected (unpackaged). Checking schema at:", s), P.existsSync(s)) {
      const d = N.dirname(e);
      P.existsSync(d) || P.mkdirSync(d, { recursive: !0 }), console.log("[Main] Schema found."), console.log("[Main] Cleaning up FTS tables before migration..."), Ge(n);
      try {
        await h.$executeRawUnsafe("DROP TABLE IF EXISTS search_index;"), console.log("[Main] FTS tables dropped successfully.");
      } catch (w) {
        console.warn("[Main] Failed to drop FTS table (non-critical):", w);
      }
      await h.$disconnect(), console.log("[Main] Attempting synchronous DB push to:", e);
      const v = N.resolve(we, "../../../packages/core/node_modules/.bin/prisma.cmd");
      if (console.log("[Main] Using Prisma binary at:", v), !P.existsSync(v))
        console.error("[Main] Prisma binary NOT found at:", v);
      else
        try {
          const w = `"${v}" db push --schema="${s}" --accept-data-loss`;
          console.log("[Main] Executing command:", w);
          const C = Wt(w, {
            env: { ...process.env, DATABASE_URL: n },
            cwd: N.resolve(we, "../../../packages/core"),
            stdio: "pipe",
            // Avoid inherit to prevent encoding issues
            windowsHide: !0
          });
          console.log("[Main] DB Push output:", C.toString()), console.log("[Main] DB Push completed successfully.");
        } catch (w) {
          console.error("[Main] DB Push failed."), w.stdout && console.log("[Main] stdout:", w.stdout.toString()), w.stderr && console.error("[Main] stderr:", w.stderr.toString());
        }
    } else
      console.warn("[Main] Schema file NOT found at:", s);
  }
  Ge(n);
  try {
    await qt() && console.log("[Main] Bundled database schema applied successfully.");
  } catch (s) {
    throw console.error("[Main] Failed to ensure bundled database schema:", s), s;
  }
  if ($ = new br(() => b.getPath("userData")), re.command)
    try {
      const s = await In($, re.command);
      await h.$disconnect(), b.exit(s);
      return;
    } catch (s) {
      console.error("[AI-Diag] Execution failed:", s), await h.$disconnect(), b.exit(1);
      return;
    }
  await Xt(), console.log("[Main] Search index initialized");
  try {
    await Rt($.getSettings());
  } catch (s) {
    console.warn("[Main] Failed to apply AI proxy settings:", s);
  }
  $t();
});
export {
  On as MAIN_DIST,
  bt as RENDERER_DIST,
  He as VITE_DEV_SERVER_URL
};
