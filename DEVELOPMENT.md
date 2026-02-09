为你优化了这份开发指南，使其更结构化、清晰，并强化了对AI协同开发的指导性。

---

# 项目开发与AI协作规范

## 📜 核心规范与原则

1.  **技术栈与风格**：专注 Windows 11 风格，采用纯 ESM 架构（`type: “module”`），所有包配置必须一致。
2.  **国际化 (i18n)**：**禁止**在代码中直接使用中文等硬编码文案，所有面向用户的文本必须通过国际化系统调用。
3.  **架构隔离**：`packages/core` 为纯逻辑层，**严禁**包含任何UI组件或前端框架依赖。

## 🗃️ 数据库架构与工作流

本项目采用客户端-服务端双数据库模型：
*   **客户端**：`packages/core` 管理 **SQLite**（嵌入式，供离线使用）。
*   **服务端**：`apps/backend` 管理 **MariaDB**（云端同步）。

### 客户端数据模型变更流程
修改 `packages/core/prisma/schema.prisma` 后，必须按序执行：
```bash
pnpm db:push    # 同步结构至本地开发数据库
pnpm db:generate # 更新Prisma Client类型定义
```
如果出现Push失败，则尝试Kill electron进程后重新Push。

## 🖥️ Electron桌面端开发规范

### IPC通信
必须遵循三层架构，确保安全与清晰：
1.  **Main Process (`electron/main.ts`)**：使用 `ipcMain.handle(‘namespace:action’)` 注册处理程序。
2.  **Preload Script (`electron/preload.ts`)**：通过 `contextBridge.exposeInMainWorld` 安全地暴露 `window.db` 等API。
3.  **Renderer Process (React组件)**：调用 `window.db.action()`，并妥善处理返回的Promise。

### 调试指引
*   **前端问题**：查看Electron窗口开发者工具（Console）。
*   **主进程/后端问题**：查看启动 `pnpm dev` 的终端输出。

## 📁 项目目录结构约定

*   `apps/desktop`：Electron桌面应用入口。
*   `apps/backend`：Spring Boot后端服务。
*   `packages/core`：**核心业务逻辑、数据模型与Prisma Client**。职责必须单一。
*   `packages/ui`：（规划中）共享UI组件库。

## 🤖 AI助手（Antigravity）协作协议

为保障任务连续性，AI在介入开发时必须遵守以下协作纪律：

### 上下文准备
*   **新会话启动时，必须先阅读 `.agent/OVERVIEW.md`**，获取项目全貌，避免重复询问基础信息。

### 任务推进
*   使用 `task.md` 跟踪任务清单、进度与阻塞项。任何进展或变更需实时更新此文件。
*   在实施**复杂逻辑或新功能**前，必须先在 `implementation_plan.md` 中编写实现方案，明确技术路径、接口变更及影响范围，经确认后方可编码。

### 编码纪律
*   **严格遵守本指南**中的所有技术栈、架构与代码规范要求。
*   对不确定的代码决策（如包引入、状态管理方式），需主动查阅现有代码库模式并保持统一，或发起讨论。

## ⚙️ 后端开发环境 (Java)

*   **JDK版本**：17 或更高。
*   **仓库路径**：本地Maven仓库位于 `D:\.m2\repository`。
*   **启动命令**：在 `apps/backend` 目录下执行：
    ```powershell
    # 推荐使用配置了镜像的settings.xml加速
    mvn spring-boot:run -s settings.xml
    # 或直接运行
    mvn spring-boot:run
    ```

## 📦 桌面端打包与发布

### 打包流程
1.  确保 `packages/core` 已构建：`cd packages/core && pnpm build`
2.  进入桌面应用目录构建：`cd apps/desktop && pnpm build`

### 输出与部署
*   产物位于 `apps/desktop/release/`：
    *   `小说编辑器-Setup-x.x.x.exe`：NSIS安装版。
    *   `小说编辑器-Portable-x.x.x.exe`：便携版（免安装）。
*   配置：打包行为由 `electron-builder.yml` 定义，默认禁用代码签名。
*   数据库路径：
    *   **开发环境**：`%APPDATA%/novel-editor/`
    *   **生产环境（便携版）**：安装目录下的 `data/` 文件夹。