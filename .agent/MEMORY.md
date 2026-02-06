# 🧠 Project Memory & Development Log (项目记忆与开发日志)

此文件用于记录跨会话的项目记忆、关键决策、已知问题和解决方案。每次会话结束或达成重要里程碑时，请考虑更新此文件。

## 📅 最新状态 (Latest Status)
> 最近更新时间: 2026-02-06
> 当前焦点: 备份恢复错误处理优化 (Backup Restore Error Handling)、移除原生 prompt 依赖。

## 🏛️ 关键架构决策 (Architecture Decisions)
- **双数据库架构**: 桌面端使用 SQLite (离线优先)，服务端使用 MariaDB (云同步)。
- **UI 框架**: React + TailwindCSS + Radix UI (计划中)。
- **编辑器核心**: Meta Lexical (支持插件化、Markdown快捷键)。
- **构建系统**: Electron + Vite + React (纯 ESM 模式)。
- **文本标记方案**: 弃用自定义 `IdeaMarkNode`，迁移至官方 `@lexical/mark` 插件，利用 `MarkNode` 处理高亮与关联 ID。
- **搜索跳转机制**: 为了实现精准跳转，`SearchSidebar` 传递 `snippet` 上下文给 `Editor`。`Editor` 使用 Context-aware 搜索，在多个相同关键词匹配中定位到被该上下文包围的特定匹配项。
- **字数统计策略**: 为避免打字卡顿，字数统计插件 (`WordCountPlugin`) 使用了 1.5s 的防抖 (Debounce) 机制。仅计算非空白字符 (CJK场景适配)。
- **功能侧边栏分离**: 弃用通用的 `UnifiedSearchWorkbench` 切换模式，将“灵感”拆分为独立的灵感工作台（Idea Sidebar），“搜索”使用独立的 `SearchSidebar`，以保持交互单一职责。
- **代码类型规范**: 建立 `src/types.ts` 集中管理核心接口（如 `Idea`），解决跨组件引用循环依赖问题。
- **主题双向适配**: 核心 UI（Settings, Editor, Home）均采用动态着色方案。背景色不再硬编码，而是通过检查 `useEditorPreferences().preferences.theme` 动态切换类名 (如 `isDark ? "bg-[#0a0a0f]" : "bg-gray-50"`)。
- **版本控制规范**: 建立了严格的 `.gitignore` 规则，强制排除 `release/`, `dist/`, `target/` 及日志文件，确保仓库轻量化。
- **备份系统 (Backup System)**:
  - **格式**: `.nebak` (ZIP Archive)，包含 `manifest.json` (元数据/加密参数) 和 `data.json`/`data.bin` (核心数据，支持 AES-256-GCM 加密)。文件名格式优化为 `NovelData_YYYYMMDD_HHMMSS.nebak`。
  - **策略**: 每次恢复前强制创建自动备份 (Auto Snapshot)，并按时间保留最新的 3 份自动备份，防止误操作导致数据丢失。
  - **错误处理**: IPC 接口 (`backup:import`) 必须返回结构化结果 (`{ success, code }`) 而非抛出异常，以便前端准确处理业务错误 (如 `PASSWORD_REQUIRED`)。
  - **交互流程**: 鉴于 Electron 环境对原生 `prompt()` 的支持限制及用户体验考量，采用“主动式输入”策略——用户需在恢复前主动输入密码，而非失败后弹窗。这避免了复杂的重新选文件流程。

## 🐛 踩坑与解决方案 (Troubleshooting Log)
- **Electron Builder**: 打包时需确保 `packages/core` 已编译且 `node_modules` 正确包含 Prisma Client。
- **Prisma Client**: 在 Electron 主进程中使用时，需确保 schema.prisma 已生成且路径配置正确。
- **Lexical 选区还原**: 当焦点从编辑器移动到外部输入框（如灵感备注）时，`$getSelection()` 会返回 null。需在失去焦点前 `clone()` 并在 `editor.update` 中手动恢复。
- **MarkNode 点击检测**: `$getNearestNodeFromDOMNode` 往往返回 TextNode。检测关联 ID 时需递归检查父节点（是否为 `MarkNode`）。
- **构建崩溃 (Turbo/ESM)**: 多次自动化代码合并可能导致 import 语法错误（如重复块或缺失括号），导致渲染进程白屏。需人工复读 imports。
- **TSC 类型定义冲突**: `preload.ts` 中的数据库方法实现与 `vite-env.d.ts` 中的手动补充定义可能不一致（如 `updateIdea` 参数格式）。`tsc` 报错时应优先检查 `.d.ts` 文件。
- **未使用的变量报错**: `tsc` 在生产模式下对未使用的变量（特别是 Props 或 回调参数）非常敏感。如果变量暂不使用但需声明，建议移除或使用下划线前缀。
- **大文件编辑损坏**: 在对 `Editor.tsx` 等大型组件进行大规模替换操作时，由于正则匹配或行号偏移可能导致组件定义（`export default function...`）意外丢失。建议操作后立即运行类型检查。
- **Git 忽略规则滞后**: 更新 `.gitignore` 并不会自动从 Git 索引中移除已被跟踪的文件（如 `target/`, `node_modules/`）。必须显式运行 `git rm -r --cached .` 清理索引后重新 `add`，否则忽略规则无效。
- **进程锁定文件**: 当文件被 `pnpm dev` 或其他进程占用导致操作失败（如 Prisma generate 提示 `EPERM: operation not permitted`），可直接使用 `taskkill /F /IM node.exe` 或 `Stop-Process` 杀掉占用进程后重试。
- **Lexical Listener 性能**: `editor.registerUpdateListener` 触发频率极高（每次 keystroke）。若在此回调中执行繁重计算（如全文扫描计数），会导致严重输入卡顿。必须配合 `setTimeout` 防抖处理。
- **搜索结果滚动**: `Element.scrollIntoView()` 只能滚动到第一个匹配项。若搜索结果在同一章节有多次匹配，需结合 TreeWalker 遍历和上下文匹配 (Snippet Matching) 来定位具体 Range 后再滚动。
- **ESM 脚本兼容性**: `apps/desktop/scripts/copy-prisma.js` 原为 CommonJS 写法 (`require`)，但项目配置为了 `"type": "module"`，导致 `node` 执行时报错 `ERR_REQUIRE_ESM`。解决方案：重写为 ESM 语法 (`import`) 并使用 `createRequire` 来兼容旧模块解析。
- **Main Process Snytax Error**: `electron/main.ts` 中的 `try-catch` 块因为编辑错误导致多余的 closing brace (`TS1005: ',' expected`)。修复时需仔细检查大括号匹配，特别是在深层回调嵌套中。
- **Electron prompt() 不支持**: 浏览器原生的 `prompt()` 方法在 Electron 的渲染进程中（特别是开启 contextIsolation 后）通常无法正常工作或被禁用。解决方案：使用 React 自定义 Modal 组件或重构交互流程（如改为主动输入）。

## 📝 长期待办 (Backlog)
- [ ] 完善云同步的冲突解决策略 (CRDT 或 Last-Write-Wins)。
- [ ] 增加端到端测试 (E2E Tests)。
- [ ] 优化移动端预览样式的准确性。

## 🌍 全局开发规范 (Global Requirements)
> **⚠️ 重要**: 所有新组件和功能必须遵循以下规范：

1.  **主题适配 (Theme Adaptation)**:
    *   所有 UI 组件必须同时支持 **Light Mode** 和 **Dark Mode**。
    *   严禁使用硬编码颜色（如 `#000` 或 `#fff`），应使用 Tailwind 的 `neutral-900/white` 或基于 `isDark` 状态动态切换的颜色类。
    *   始终检查 `useEditorPreferences().preferences.theme`。

2.  **国际化 (Internationalization / i18n)**:
    *   界面上显示的所有文字 **必须** 使用 `i18n` 键值，禁止直接写死中文字符串。
    *   确保在 `apps/desktop/src/i18n/locales/zh.json` 和 `en.json` 中添加对应翻译。
    *   **文档语言**: `implementation_plan.md` 和 `walkthrough.md` 的内容必须使用中文。

## 💻 开发环境配置 (Development Environment)
- **操作系统**: Windows
- **终端**: PowerShell（默认）
- **WSL**: 如果连接了 WSL2，则使用 Linux/Bash 命令
- **命令生成规则**:
  - 对于 Windows 本地操作：生成 PowerShell 语法命令
  - 对于 WSL 相关操作：生成 Linux/Bash 语法命令
