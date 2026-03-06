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
