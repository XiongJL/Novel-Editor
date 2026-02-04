# 开发指南 (Development Guide)

欢迎参与小说编辑器项目的开发。本文档规定了项目的编码规范以及与 AI 助手 (Antigravity) 的协作方式。

## 1. 核心原则
*   **Win11+ 优先**: PC 端目前专注于 Windows 11 风格体验。
*   **纯 ESM 架构**: 所有包（`apps/desktop`, `packages/core`）必须配置为 ESM 模块 (`type: "module"`). 不要混用 CJS。
*   **注意使用国际化**：所有界面文案必须使用国际化，不要直接使用中文。

## 2. 数据库工作流 (Database Workflow)
本项目采用双数据库架构：
*   **客户端 (Desktop)**: 使用 **SQLite** (嵌入式，离线使用)，通过 `packages/core` 管理。
*   **服务端 (Backend)**: 使用 **MariaDB** (云端存储)，通过 `apps/backend` 管理。

*   **修改客户端 Schema** (`packages/core/prisma/schema.prisma`):
    1. 编辑 Schema 文件。
    2. 运行 `pnpm db:push` 同步到本地 SQLite 开发库。
    3. 运行 `pnpm db:generate` 更新 TypeScript 类型定义。

## 3. Electron 开发 (Desktop)
*   **IPC 通信规范**:
    1.  **Main (`electron/main.ts`)**: 使用 `ipcMain.handle('namespace:action')` 处理请求。
    2.  **Preload (`electron/preload.ts`)**: 通过 `contextBridge.exposeInMainWorld` 暴露为 `window.db.action()`。
    3.  **Renderer (`src/pages/*.tsx`)**: 调用 `window.db.action()` 并处理 Promise。

*   **调试**:
    *   **前端日志**: 查看 Electron 窗口的开发者工具 (F12) -> Console。
    *   **后端日志**: 查看启动 `pnpm dev` 的终端输出。

## 4. 目录规范
*   `apps/desktop`: 桌面端主入口。
*   `apps/backend`: 云同步后端服务。
*   `packages/core`: 核心业务逻辑、数据库模型 (SQLite)。**禁止**包含任何 UI 代码。
*   `packages/ui`: (计划中) 纯 UI 组件库。

## 5. AI 协作
*   使用 `task.md` 跟踪任务进度。
*   复杂逻辑前先更新 `implementation_plan.md`。
*   **新会话启动**: 请首先阅读 `.agent/OVERVIEW.md` 以获取项目上下文。

## 6. 后端开发环境 (Backend)
*   **Java Version**: 17+
*   **Maven Repository**: `D:\.m2\repository`
*   **Running**: `apps/backend` 目录下执行:
    ```powershell
    # 推荐使用 settings.xml (如有配置国内镜像)
    mvn spring-boot:run -s settings.xml
    
    # 或者直接运行
    mvn spring-boot:run
    ```

## 7. 桌面端打包 (Desktop Build)

### 7.1 打包命令
```powershell
cd apps/desktop
pnpm build
```

### 7.2 输出文件
打包后的文件位于 `apps/desktop/release/` 目录：
- `小说编辑器-Setup-x.x.x.exe` - 安装版 (NSIS)
- `小说编辑器-Portable-x.x.x.exe` - 便携版 (免安装)

### 7.3 配置文件
打包配置位于 `apps/desktop/electron-builder.yml`，支持：
- 安装版：允许用户选择安装目录
- 便携版：解压即用
- 代码签名：默认禁用（需要证书时启用）

### 7.4 数据库路径
- **开发环境**: 数据库存放在 `%APPDATA%/novel-editor/`
- **生产环境**: 数据库存放在安装目录下的 `data/` 文件夹（便携式）

### 7.5 注意事项
- 打包前确保 `packages/core` 已构建：`cd packages/core && pnpm build`
- 如遇网络问题，可清理 electron-builder 缓存：
  ```powershell
  rmdir /s /q %LOCALAPPDATA%\electron-builder\Cache
  ```
