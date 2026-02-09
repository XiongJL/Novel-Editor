# 🧠 Project Memory & Development Log (项目记忆与开发日志)

此文件用于记录跨会话的项目记忆、关键决策、已知问题和解决方案。每次会话结束或达成重要里程碑时，请考虑更新此文件。

## 📅 最新状态 (Latest Status)
> 最近更新时间: 2026-02-09
> 当前焦点: 叙事矩阵 (Narrative Matrix) 交互增强与 UI 稳定性修复。

## 🏛️ 关键架构决策 (Architecture Decisions)
- **双数据库架构**: 桌面端使用 SQLite (离线优先)，服务端使用 MariaDB (云同步)。
- **UI 框架**: React + TailwindCSS + Radix UI (计划中)。
- **编辑器核心**: Meta Lexical (支持插件化、Markdown快捷键)。
- **构建系统**: Electron + Vite + React (纯 ESM 模式)。
- **文本标记方案**: 弃用自定义 `IdeaMarkNode`，迁移至官方 `@lexical/mark` 插件，利用 `MarkNode` 处理高亮与关联 ID。
- **搜索跳转机制**: 为了实现精准跳转，`SearchSidebar` 传递 `snippet` 上下文给 `Editor`。`Editor` 使用 Context-aware 搜索，在多个相同关键词匹配中定位到被该上下文包围的特定匹配项。
- **字数统计策略**: 为避免打字卡顿，字数统计插件 (`WordCountPlugin`) 使用了 1.5s 的防抖 (Debounce) 机制。仅计算非空白字符 (CJK场景适配)。
- **功能侧边栏分离**: 弃用通用的 `UnifiedSearchWorkbench` 切换模式，将“灵感”拆分为独立的灵感工作台（Idea Sidebar），“搜索”使用独立的 `SearchSidebar`，以保持交互单一职责。
- **代码类型规范**: 建立了 `src/types.ts` 集中管理核心接口，解决依赖循环。
- **主题双向适配**: 核心 UI 动态切换类名适配 Light/Dark 模式。
- **版本控制规范**: 强制排除 `release/`, `dist/` 等目录。
- **备份系统**: 采用 .nebak 格式，强制自动备份，交互式密码输入。
- **IPC 错误处理**: 在 `main.ts` 中严格捕获数据库异常并输出详细日志，禁用 `// @ts-ignore` 掩盖类型问题。
- **叙事矩阵 (Narrative Matrix)**: 实现为“章节 x 情节线”的二维网格，支持跨章节查看伏笔/兑现点的全局分布。
- **类型同步协议**: 强制要求 `src/types.ts` (前端内部类型) 与 `src/vite-env.d.ts` (IPC/全局定义) 保持同步，防止在重构过程中出现 assignment mismatch。
- **布局稳定性 (Layout Stability)**: Editor 头部导航栏采用 **3-Column Flex** + **Z-Index 50** + **Relative** 定位策略，确保在 Matrix 等复杂子视图下始终可见。

## 🐛 踩坑与解决方案 (Troubleshooting Log)
- **Header Visibility in Matrix View**: 
    - **问题**: 在 Matrix 视图下，Editor 头部导航栏被遮挡或消失。
    - **原因**: `absolute` 居中定位在复杂层级下失效，且 `top-nav` CSS 类可能触发了隐藏逻辑。
    - **解决**: 移除 `top-nav`，改用 Flex 布局，强制提升 `z-index`。
- **TypeScript Runtime Error**: `LayoutGrid is not defined`。即便 TS 编译通过，运行时仍可能因缺少 import 而崩溃。务必检查图标库引用。
- **Prisma Monorepo Sync**: 在 Electron 主进程中调用 `@novel-editor/core` 的 Prisma Client 时，若修改了 `schema.prisma`，必须在 `packages/core` 下先运行 `prisma generate` 再运行 `tsc` (Build)，否则主进程会因读取到旧的构建产物而报错（如 `db.model` undefined）。
- **Editor Refactoring Risks**: 对 `Editor.tsx` 等数千行的大型组件进行正则/全文替换时，极易因匹配失误导致 `export default` 或核心状态声明丢失。建议分块重构，并在此类操作后立即进行编译检查。
- **TS Ignore 隐患**: 在 IPC Handler 中使用 `// @ts-ignore` 绕过类型检查（如 `db.plotLine`）会导致运行时静默失败。应优先修复类型定义（如重新生成 Client），或使用 `(db as any)` 配合详细的 `try-catch` 日志来排查问题。
- **Electron Builder**: 打包时需确保 `packages/core` 已编译且 `node_modules` 正确包含 Prisma Client。
- **Lexical 选区还原**: 焦点移动到外部输入框时需手动 `clone` 和恢复选区。
- **MarkNode 点击检测**: 需递归检查父节点以识别 `MarkNode`。
- **Build Crash**: 自动化合并代码需人工复查 import 语法。
- **TSC Console Output**: `tsc` 输出在某些终端可能被截断，调试编译错误时建议重定向输出到文件 (`tsc > log.txt`) 或指定具体文件编译。
- **Git 忽略规则滞后**: 更新 `.gitignore` 后需运行 `git rm -r --cached .`。
- **进程锁定文件**: `EPERM` 错误时通过 `taskkill` 释放进程。
- **Lexical Listener 性能**: `registerUpdateListener` 必须防抖。
- **搜索结果滚动**: `scrollIntoView` 需配合 TreeWalker 定位。
- **ESM 脚本兼容性**: 脚本需使用 `import` 或 `createRequire`。
- **Main Process Syntax**: 注意 `try-catch`块的括号匹配。
- **Electron prompt()**: 使用自定义 React Modal 代替原生 prompt。
- **Editor Corruption (文件损坏防御)**: 在对 `Editor.tsx` 等数千行的巨型文件执行复杂合并或多次 `replace` 操作时，若发现语法突然崩溃（如 state 重复或 export 丢失），应立即停止自动化修改，读取文件的分段内容手动拼合。
- **Type Desynchronization (类型不同步)**: 在向 Prisma Schema 添加字段后，若仅运行 `db:push` 而未同步更新 `types.ts` 或 `vite-env.d.ts` 的接口，会导致 `tsc` 报出大量“属性缺失”或“类型不兼容”错误。必须确保三方同步。

## 📝 长期待办 (Backlog)
- [ ] 完善云同步的冲突解决策略 (CRDT 或 Last-Write-Wins)。
- [ ] 增加端到端测试 (E2E Tests)。。

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
