# 小说编辑器 (Novel Editor)

一个现代化、跨平台的小说创作工具。基于 Monorepo 架构，优先支持 Windows 桌面端。

## 🚀 快速开始 (Quick Start)

### 1. 环境准备
*   **Node.js**: v18+
*   **包管理器**: pnpm (`npm install -g pnpm`)
*   **数据库**: MariaDB (推荐 WSL2 环境，仅后端同步需要)

### 2. 数据库配置
1.  确保 MariaDB 服务已启动（仅云同步功能需要）。
2.  检查 `packages/core/.env` 中的连接字符串：
    ```bash
    DATABASE_URL="mysql://dev:dev123@localhost:3306/novel_editor"
    ```
    *(请根据实际情况修改用户名密码)*
3.  初始化数据库表结构：
    ```bash
    # 在根目录执行
    pnpm db:push
    ```
    *(注: `db:push` 是 `turbo run db:push` 的简写，实际执行的是 `packages/core` 下的 `prisma db push`)*

### 3. 启动开发环境
```bash
# 安装依赖
pnpm install

# 启动所有应用 (Desktop Core + UI)
pnpm dev
```

### 4. 常见问题
*   **Prisma Client Error**: 如果遇到 `PrismaClient` 未初始化，请运行 `pnpm db:generate`。
*   **Electron 弹窗无反应**: 检查终端是否有数据库连接报错。

## 📂 项目结构 (Monorepo)
*   **`apps/desktop`**: Electron + Vite + React 桌面端应用。
    *   `electron/`: 主进程 (Main Process)，负责系统交互和数据库通信 (IPC)。
    *   `src/`: 渲染进程 (Renderer)，基于 TailwindCSS + Framer Motion 的现代化 UI。
    *   `src/components/LexicalEditor/`: **Lexical 富文本编辑器**及其插件。
*   **`apps/backend`**: Spring Boot 云同步服务端。
    *   提供增量数据同步 API (Push/Pull)。
    *   基于 MariaDB 存储。
*   **`packages/core`**: 核心数据层。
    *   `prisma/`: 客户端数据库 Schema 定义 (SQLite)。
    *   `dist/`: 编译后的 ESM 模块 (供 Desktop 引用)。

## ✨ 功能特性

### 编辑器功能 (基于 Meta Lexical)
- [x] 富文本编辑 (加粗、斜体、下划线、删除线)
- [x] 文字对齐 (左对齐、居中、右对齐、两端对齐)
- [x] 字体设置 (宋体、黑体、楷体)
- [x] 字号调节 (滑块控制)
- [x] 首行缩进 (2字符，适配中文排版)
- [x] 一键排版 (删除多余空格、智能标点转换、句首大写)
- [x] 手机预览模式 (iPhone 15 风格外框)
- [x] 宽屏/窄屏切换
- [x] 国际化 (中英文切换)

### 核心功能
- [x] Monorepo 架构初始化 (Turbo)
- [x] 本地数据库集成 (SQLite + Prisma)
- [x] 桌面端基础框架 (Electron + Vite ESM)
- [x] 主页 UI (Glassmorphism 风格)
- [x] 小说创建流程 (IPC 通信打通)
- [x] 应用打包 (支持安装版 Setup.exe 和 便携版 Portable.exe)
- [x] 云同步后端基础 (Spring Boot)
- [x] 章节编辑器 (Lexical 集成完成)
- [x] 章节编辑器开发 (基础功能可用，字数统计已修复)
- [ ] 小说、卷和章节要支持删除--注意删除逻辑。最好用逻辑删除，提供恢复功能（优先级不高）。
- [ ] 增加手机排版格式预览
- [ ] 导出功能，方便发表到各个小说平台
- [ ] 导入功能
- [ ] 角色卡片功能，在正文中增加角色下划线，可以快速查看角色信息
- [ ] 批注功能
- [x] 灵感系统 (选中文字创建、Ctrl+I 全局创建、收藏、跳转)
- [x] 全局搜索 (FTS5 全文索引、章节/灵感搜索、跳转高亮)
- [ ] 灵感搜索与过滤 (章节过滤、内容搜索、时间区间)
- [x] 灵感搜索与过滤 (章节过滤、内容搜索、时间区间)
- [x] 章节大纲
- [x] 交互优化 (ESC 关闭弹窗、侧边栏键盘导航)

### 进行中
- [ ] 云端同步功能对接
- [ ] 导出功能 (TXT/EPUB/PDF)
- [ ] AI 写作辅助

## 📖 开发文档
*   **架构设计**: 参见 `SyncDesign.md`
*   **搜索设计**: 参见 `searchDesign.md`
*   **开发指南**: 参见 `DEVELOPMENT.md`
*   **后端说明**: 参见 `apps/backend/README.md`