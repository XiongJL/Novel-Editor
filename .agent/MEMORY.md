# 🧠 Project Memory & Development Log (项目记忆与开发日志)

此文件用于记录跨会话的项目记忆、关键决策、已知问题和解决方案。每次会话结束或达成重要里程碑时，请考虑更新此文件。

## 📅 最新状态 (Latest Status)
> 最近更新时间: 2026-02-11
> 当前焦点: 提及系统稳定性增强 (Mention Stability) 与 全系统交互一致性 (UI Unification)。

## 🏛️ 关键架构决策 (Architecture Decisions)
- **双数据库架构**: 桌面端使用 SQLite (离线优先)，服务端使用 MariaDB (云同步)。
- **UI 框架**: React + TailwindCSS + Radix UI (计划中)。
- **编辑器核心**: Meta Lexical (支持插件化、Markdown快捷键)。
- **构建系统**: Electron + Vite + React (纯 ESM 模式)。
- **文本标记方案**: 弃用自定义 `IdeaMarkNode`，迁移至官方 `@lexical/mark` 插件，利用 `MarkNode` 处理高亮与关联 ID。
- **提及重叠解决方案 (Transparent Textarea)**: 针对 Mention 文本在输入框中与背景重叠模糊的问题，决定采取“全透明 Textarea”方案。通过将原生 textarea 的颜色设为透明并移除 border/padding 干扰，仅保留光标。文字渲染由底层的 Backdrop 层负责，确保与 Mention 高亮块完美对齐且无视觉重影。
- **UI 统一交互规范 (Unified Modals)**: 全系统新模态框必须继承 `BaseModal`，且所有删除操作强制使用 `ConfirmModal` 替代 `confirm()`。页脚布局规范化：左侧放置删除按钮（如有），右侧放置取消与保存按钮。按钮统一使用 `text-xs`。
- **档案卡自动关闭 (Click-outside)**: 实现了全局点击检测逻辑，确保 `EntityInfoCard` 在点击非活性区域时自动收起，提升了多层级浮窗下的操作流畅度。

## 🐛 踩坑与解决方案 (Troubleshooting Log)
- **Modal Footer Desynchronization**: 
    - **问题**: 在重构 `CharacterEditor.tsx` 页脚以适配删除按钮时，因 JSX 块合并错误导致页脚按钮丢失或语法错误。
    - **解决**: 恢复了完整的页脚 Flex 布局，并确保 `ConfirmModal` 嵌套在 `BaseModal` 内部但处于 DOM 流之外。
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
- **Editor Root Access**: 在 `Editor.tsx` 中，`editorRoot` 不是一个可以直接访问的状态变量。要获取编辑器根元素（用于 `querySelector` 等 DOM 操作），必须通过 `editorRef.current?.getRootElement()` 获取。

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
