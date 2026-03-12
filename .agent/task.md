# Tasks

## AI 能力主线（2026-03-04）

- [ ] **Phase C: 标题 AI 生成体验收尾**
  - [ ] 标题生成阶段进度（请求中/生成中/解析中）
  - [ ] 标题生成状态与失败提示 i18n 统一

- [ ] **Phase D: 续写能力稳态化**
  - [x] 统一入口：UI 续写 + `chapter.generate`
  - [x] 新建章节与现有章节分流
  - [x] 续写预览后确认写入
  - [ ] 续写重复段落控制策略继续优化（仅处理 AI 新增段，不影响用户原文）

- [ ] **Phase E: AI 创作工坊入库闭环**
  - [x] ActivityBar 入口：`ai_workbench`
  - [x] 草稿编辑/删除/勾选
  - [x] 入库前校验：`validateCreativeAssetsDraft`
  - [x] 原子事务入库：`confirmCreativeAssets`（失败整批回滚）
  - [x] 工坊成功/失败态文案补齐与交互细节优化

- [ ] **Phase F: 摘要与上下文策略**
  - [x] `ChapterSummary` 异步更新流程
  - [x] 本地摘要/AI 摘要双模式
  - [x] AI 摘要默认非自动触发（手动或完稿）
  - [x] ContextBuilder 摘要优先 + 正文回退
  - [x] 卷级/全书级摘要聚合落地

- [ ] **Phase H: AI 全域能力平台**
  - [x] 统一动作总线与能力注册基础
  - [x] MCP/Skill 通道与 manifest 导出
  - [x] 开发诊断收口至终端 `ai:diag`
  - [ ] 覆盖矩阵缺口补齐（搜索、备份恢复等）

- [ ] **Phase I: AI 启用式输入入口（未来）**
  - [ ] 首屏提示：`Space` 启用 AI 输入、`/` 打开命令
  - [ ] 编辑器快捷键触发 AI 输入条与命令面板
  - [ ] 输入条发送与关闭交互（Enter/Shift+Enter/ESC）
  - [ ] 样式按参考图落地（暗色、圆角、左右图标）
  - [ ] i18n 与主题适配

## 文档同步任务（本批）
- [x] 内部文档一致：`.agent/*` 与 `DEVELOPMENT.md` 状态对齐
- [x] 用户文档中英一致：`README.md`、`USER_GUIDE.md`、`USER_GUIDE_EN.md`
- [x] 用户文档不包含开发诊断细节（smoke/coverage/list actions 等）
- [x] 文档中的 `ai:diag` 命令与参数、退出码说明一致
- [x] 开发文档补充 debug 日志方案（`debug-dev.log`）
- [x] 开发文档补充 Prisma 打包初始化方案（生成 client + schema-init.sql + 首启建表）

## 打包与数据库后续
- [x] `packages/core` 构建期生成 Prisma Client 到 `generated/client`
- [x] 同步生成 `schema-init.sql`
- [x] 打包版首启自动建表逻辑接入
- [ ] 验证打包版“创建小说”链路无报错
- [ ] 设计并实现版本化 migration runner（替代用户机运行时 `db push`）

## 打包发布收尾
- [ ] 图标链路修复
  - [ ] `win.icon` 产物图标生效
  - [ ] 运行时窗口图标不再使用 `electron-vite.svg`
  - [ ] 安装后桌面/开始菜单/任务栏/资源管理器图标统一
- [ ] 安装目录命名清理
  - [ ] 避免用户侧出现 `@novel-editor/desktop` 风格路径
  - [ ] 明确内部包名与安装目录命名的边界
- [ ] 备份缓存隔离
  - [ ] 备份目录确认：`userData/backups/auto`
  - [ ] 排查并切断打包版对历史开发备份的读取
- [ ] 默认主题切浅色
  - [ ] 首次启动默认 `light`
  - [ ] 老用户已有偏好不被误覆盖
- [ ] AI 设置页优化
  - [ ] 说明文案中文化
  - [ ] 表单层级、分组、提示优化
