# DEVELOPMENT.md

项目开发与 AI 协作规范（开发者向）。

## 1. 基本原则
- 架构：Electron + React + TypeScript（ESM）。
- i18n：用户可见文案必须走国际化键，不直接硬编码。
- 分层：`packages/core` 保持纯逻辑/数据层，不引入 UI 依赖。

## 2. 数据库与模型变更流程
修改 `packages/core/prisma/schema.prisma` 后按顺序执行：

```bash
pnpm db:push
pnpm db:generate
```

如被 Electron 进程占用导致失败，先结束相关进程再重试。

## 3. Electron IPC 约定
- Main：`ipcMain.handle('namespace:action')`
- Preload：`contextBridge.exposeInMainWorld`
- Renderer：仅通过 `window.xxx` 调用，不直连 Node API

## 4. 调试方式
- 前端问题：Electron DevTools Console。
- 主进程问题：`pnpm dev` 终端输出。
- 类型问题：`pnpm --filter @novel-editor/desktop exec tsc --noEmit --pretty false`。

### Desktop Dev Server 可选启动配置
默认开发命令不变：

```bash
pnpm --filter @novel-editor/desktop run dev
```

如需固定到本机 `localhost:8080` 供 Cloudflare Tunnel 转发，使用：

```bash
pnpm --filter @novel-editor/desktop run dev:8080
```

说明：
- `dev`：保持默认端口（当前由 Vite 默认或环境变量决定）。
- `dev:8080`：固定绑定 `127.0.0.1:8080`，仅本机监听，不直接对外暴露。
- `dev:local`：固定绑定 `127.0.0.1`，端口仍走默认值。

也可手动通过环境变量覆盖：

```bash
VITE_DEV_HOST=127.0.0.1
VITE_DEV_PORT=8080
pnpm --filter @novel-editor/desktop run dev
```

## 5. Dev Diagnostics（Terminal Only）
开发诊断不在用户界面暴露，只通过终端命令执行。

```bash
pnpm --filter @novel-editor/desktop run ai:diag -- smoke mcp
pnpm --filter @novel-editor/desktop run ai:diag -- smoke skill --json
pnpm --filter @novel-editor/desktop run ai:diag -- coverage
```

可选参数：
- `--json`: JSON 输出
- `--db <path>`: 指定 SQLite 文件
- `--user-data <path>`: 按 `<path>/novel_editor.db` 推导数据库

退出码：
- `0`: 成功
- `1`: 运行失败
- `2`: 参数错误

## 6. 打包与发布注意事项
- 诊断脚本放在 `apps/desktop/scripts`，不作为用户可见功能入口。
- 打包前确认 `packages/core` 已可用，避免 Prisma Client 缺失。
- 开发诊断参数（如 `--ai-diag`）仅开发环境可用，打包环境应拒绝。

## 7. 文档更新原则
- 用户文档（`README.md` / `USER_GUIDE*.md`）仅描述用户可见能力。
- 开发诊断、覆盖矩阵、smoke 细节仅保留在开发文档。
- 每次阶段更新需同步 `.agent/*` 与用户文档，避免状态不一致。

## 8. 参考路径
- 桌面端：`apps/desktop`
- AI 主进程：`apps/desktop/electron/ai`
- AI 工坊 UI：`apps/desktop/src/components/AIWorkbench`
- 诊断脚本：`apps/desktop/scripts/ai-dev-diagnostics.mjs`
