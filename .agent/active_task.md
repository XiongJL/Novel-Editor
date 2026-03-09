# Active Tasks

## 当前目标
- [ ] 聚焦主线：完成 Phase G 验收收尾 + Phase H 覆盖矩阵补缺
- [x] 文档同步：AI `apiKey/apiToken` 仅本地保存，不写入数据库，也不参与备份恢复
- [x] 文档同步：开发模式 debug 日志与 Prisma 打包初始化方案已写入开发文档

## 执行清单（按顺序）

### Phase A: 配置与基础设施
- [x] 新增 `ai:*` IPC 命名空间（main/preload/types）
- [x] 新增 `AiProvider` 抽象与 Provider 工厂
- [x] 实现 HTTP Provider（支持 OpenAI/Anthropic 兼容接口）
- [x] 实现 MCP CLI Provider（stdio 通信）
- [x] 开发模式 Debug 日志：AI 请求/响应 + 主进程错误写入 `debug-dev.log`（15MB 覆盖，仅开发模式）
- [x] Prisma 打包初始化：构建期生成 `packages/core/generated/client` + `schema-init.sql`，打包版首启自动建表

### Phase B: AI 设置界面（已验收）
- [x] 在 `SettingsModal` 新增 `AI` 分页
- [x] API 配置表单：`baseUrl` `apiKey` `model` `timeoutMs`
- [x] 多模型可选：支持 OpenAI/Gemini/豆包预设，文本模型与生图模型分离配置
- [x] MCP 配置表单：`cliPath` `argsTemplate` `workingDir` `envJson` `startupTimeoutMs`
- [x] 代理配置表单：`mode` `httpProxy` `httpsProxy` `allProxy` `noProxy`
- [x] “测试连接”按钮：HTTP 连通测试
- [x] “测试 MCP”按钮：CLI 可执行与握手测试
- [x] “测试代理”按钮：代理路径连通测试
- [x] 直连模式验收：不依赖 OpenClaw，仅通过软件 UI + 豆包模型完成“生成->确认->入库”

### Phase C: 标题 AI 生成（已完成）
- [x] 在章节标题输入区域新增“AI 生成标题”入口
- [x] 输入上下文：当前章节正文 + 最近章节摘要 + 小说基础信息
- [x] 输出 5-10 个候选标题 + 风格标签
- [x] 支持一键替换/再生成
- [x] 标题生成过程可视化进度（与续写一致）：按钮 loading + 阶段提示/进度条（请求中/生成中/解析中）
- [x] 标题生成状态提示文案与失败提示统一（i18n）

### Phase D: 自动续写（强约束，已完成）
- [x] 新建 `ContextBuilder`：统一组装续写上下文
- [x] 续写前强制读取并注入：
    - [x] 全量世界观（`WorldSetting`）
    - [x] 全量大纲（`PlotLine + PlotPoint + Anchor`）
    - [x] 关键实体（角色/物品/地图）
- [x] 注入最近 N 章正文与当前章节光标前文本
- [x] 支持参数：目标字数、上下文章数、风格、温度
- [x] 生成后执行一致性检查并返回冲突提示

### Phase D.1: 续写触发与交互分流（新增，已完成）
- [x] 统一触发入口：UI “续写”按钮 + `chapter.generate` action
- [x] 新建章节（空章）续写资格校验：
    - [x] 判断是否第一章
    - [x] 判断是否存在大纲（PlotLine/PlotPoint）
    - [x] 第一章且无大纲时阻断并提供三路径引导（去大纲/先手写/去 AI 大纲生成）
- [x] 现有章节续写配置弹窗：
    - [x] 灵感选择（支持多选已有灵感）
    - [x] 长度（短/中/长）映射 `targetLength`
    - [x] 创意程度（稳妥/平衡/创意）映射 `temperature`
    - [x] 上下文章数映射 `contextChapterCount`
    - [x] 风格语气（`style/tone`）
    - [x] 首章无大纲阻断弹窗增加“去 AI 大纲生成器”入口（跳转设置-AI页）
- [x] 续写结果采用追加预览（diff）+ 用户确认后写入 `chapter.save`
- [x] 续写配置模态框内新增“提示词预览”（结构化/原文）+ 本次临时提示词覆盖（仅本次生效）
- [x] OpenClaw/智能体支持 `chapter.generate` 两种模式：`new_chapter` / `continue_chapter`
- [x] `chapter.generate` / `continueWriting` 已接入 `ideaIds`，并注入 `ContextBuilder` 动态上下文（缺失灵感返回 warnings）
- [x] OpenClaw 写入审计：`chapter.save` 保留来源 `ai_agent` 与 rollback point

### Phase E: AI 快速创建创作资产（新增，功能已完成）
- [x] 新增“AI 创作工坊”入口（ActivityBar: `ai_workbench`）
- [x] AI 输出结构化草稿（JSON schema 约束）
- [x] 预览区支持编辑、删除、勾选
- [x] 入库前校验：`validateCreativeAssetsDraft`（必填/类型/重名/地图资产关系/标准化）
- [x] 地图生成支持：
    - [x] 文本描述生成地图图片
    - [x] 图片下载与本地保存（`userData/maps/<novelId>/`）
    - [x] 图片路径关联到 `MapCanvas.background`
    - [x] 地图 AI 生成参数支持：尺寸（如 1024x1024 / 1536x1024）与风格模板（写实/奇幻/古风/科技）
    - [x] 地图 AI 生成失败原因在 UI 明确展示（网络错误/鉴权失败/模型不可用/超时/内容过滤）
    - [x] 地图 AI 生成过程可视化进度：进度条或阶段提示（请求中/生成中/下载中/入库中），并显示预计耗时或已耗时
    - [x] 生成按钮交互优化：禁用期间显示明确状态与原因，避免“无反馈等待”
    - [x] 配额保护（Doubao-Seedream-5.0-lite）：默认低成本参数 + 429 明确提示 + 调用统计
- [x] 用户确认后执行入库：
    - [x] 大纲 -> `PlotLine/PlotPoint`
    - [x] 角色 -> `Character`
    - [x] 物品/技能 -> `Item`（type 区分）
    - [x] 世界地图 -> `MapCanvas` + 背景图片资产
- [x] 批量入库使用事务（原子回滚）+ 失败明细返回
- [x] 重名与关联冲突校验（入库前）
- [x] `confirmCreativeAssets` 返回增强：`success/created/warnings/errors?/transactionMode:'atomic'`
- [x] 工坊状态机与反馈收尾：生成/校验/入库阶段化 + 用户化错误摘要 + 详细错误折叠 + 原子回滚提示 + i18n
- [x] AI 工坊内新增“提示词预览”（结构化/原文）+ 本次临时提示词覆盖（仅本次生效）
- [x] 地图 AI 生成模态框新增“引用世界观 + 提示词预览”（结构化/原文）+ 本次临时提示词覆盖（仅本次生效）

### Phase F: 记忆压缩与 RAG（已完成）
- [x] 新增章节摘要表与更新流程
    - [x] Prisma schema 已新增 `ChapterSummary`（含内容指纹、事实JSON、模型元数据、状态与错误信息、索引）
    - [x] 章节保存后异步更新 `ChapterSummary`（`db:save-chapter` 与 `chapter.save` action 双路径）
    - [x] 摘要更新节流策略：保存后防抖 + 最小间隔 + 最小字数变化阈值
    - [x] 摘要模式可配置：本地启发式 / AI 摘要（AI 失败自动回退本地）
    - [x] 摘要触发策略可配置：自动 / 仅手动 / 章节完稿后触发（AI 默认仅手动）
    - [x] 编辑器章节页已提供“手动生成摘要”按钮（调用 `ai:rebuild-chapter-summary`）
- [x] 新增卷摘要/全书摘要聚合
    - [x] Prisma schema 已新增 `NarrativeSummary`（volume/novel 聚合层，含覆盖范围、约束与元数据）
    - [x] `chapterSummary` 完成后异步触发聚合更新（volume + novel）
    - [x] ContextBuilder 已接入最新 `NarrativeSummary`（续写上下文注入）
- [x] 续写时检索“关键事实 + 摘要片段”注入 Prompt
    - [x] ContextBuilder 优先读取最新 `ChapterSummary`，缺失时回退章节正文片段
    - [x] 续写时最近几章优先正文片段（用于贴近文风），其余章节走摘要优先策略

### Phase G: 验收
- [ ] 手工测试：无代理/系统代理/v2ray 自定义代理
- [ ] 手工测试：HTTP Provider 与 MCP CLI Provider
- [ ] 手工测试：标题生成过程显示进度（loading/阶段提示），成功与失败状态可正确收敛
- [ ] 手工测试：标题生成进度条在“请求中/生成中/解析中”阶段正确推进，失败后状态清理
- [ ] 手工测试：续写是否遵循世界观与大纲
- [ ] 手工测试：AI 资产生成确认后是否正确入库
- [ ] 手工测试：AI 工坊入库前校验可阻断非法草稿并返回可读错误
- [ ] 手工测试：AI 工坊原子事务生效（任一失败时整批回滚）
- [ ] 手工测试：AI 地图图片是否成功落盘并可在地图工作台打开
- [ ] 手工测试：打包版首启自动建库 + 创建小说成功
- [ ] 手工测试：打包版升级路径设计评审（migration runner，不依赖运行时 `db push`）
- [ ] 终端验收：`ai:diag smoke mcp|skill|coverage` 与 `--json` 输出符合预期
- [ ] 补充用户文档（AI 设置与故障排查）
- [x] 文档同步：`.agent/*`、`DEVELOPMENT.md`、`README.md`、`USER_GUIDE*.md`、`apps/backend/README.md`

### Phase H: AI 全域操作平台（新增）
- [x] 设计 Capability Registry：`feature -> actions -> input schema -> output schema -> permissions`
- [x] 新增统一入口 `ai:execute-action`（按 actionId 调度到既有业务能力）
- [x] OpenClaw 工具通道（MCP）适配：`ai:get-openclaw-manifest` + `ai:openclaw-mcp-invoke`
- [x] OpenClaw Skill 通道适配：`ai:get-openclaw-skill-manifest` + `ai:openclaw-skill-invoke`
- [x] OpenClaw 双通道健康检查：`ai:test-openclaw-mcp` + `ai:test-openclaw-skill`
- [ ] 建立现有功能 AI 覆盖矩阵并补齐缺口：
    - [x] 新增能力覆盖矩阵查询：`ai:get-capability-coverage`（主进程 + 终端 `ai:diag coverage`）
    - [ ] 小说/卷章管理
    - [ ] 编辑器操作（标题/续写/改写/总结）
    - [ ] 全局搜索与跳转
    - [ ] 大纲/故事线/锚点
    - [ ] 角色/物品/世界观/地图
    - [ ] 备份恢复
- [x] MCP Tool Manifest 自动导出（供 Claude Code 等 CLI 直接发现能力）- 已提供 `ai:get-mcp-manifest`
- [ ] 新功能接入门禁：PR 必须包含对应 AI action 定义与最小测试

### Phase H.1: OpenClaw 对话式章节生成闭环（新增）
- [x] 新增章节定位动作：`volume.list` `chapter.list`
- [x] 新增章节写入动作：`chapter.create` `chapter.save`
- [x] 新增生成动作：`chapter.generate`（内部调用 doubao，支持方向/长度/语气参数）
- [x] `chapter.generate` 强制上下文注入：世界观 + 大纲 + 关键实体 + 最近 N 章
- [ ] 边界校正：对话确认由 OpenClaw 编排；软件侧仅做参数校验与写入护栏
- [x] 统一错误码（基础层）：`INVALID_INPUT/NOT_FOUND/PROVIDER_*/NETWORK_ERROR/PERSISTENCE_ERROR`
- [x] 统一错误码（展示层）：UI 与聊天侧映射为可读失败原因
    - [x] UI 侧已接入可读错误映射（Editor 续写/摘要触发、AI 设置页测试入口）
    - [x] 聊天/OpenClaw 返回层已接入可读错误映射（`ai:openclaw-*` 返回中文错误 + code）
    - [x] 修复主进程 AI 错误文案乱码（`electron/ai/errors.ts`）
    - [x] 补齐续写/标题生成相关 i18n 键（`zh.json`/`en.json`），避免回退文案导致乱码与不一致
- [x] OpenClaw Skill Manifest 覆盖上述 action 并通过 smoke test
- [x] OpenClaw MCP Manifest 覆盖上述 action 并通过 smoke test
    - [x] 新增 `ai:test-openclaw-smoke`：校验 manifest 关键 action 覆盖 + 读链路冒烟（`novel.list -> volume.list -> chapter.list`）
    - [x] 开发诊断收口：设置页移除 smoke/coverage 可视化，仅保留终端 `ai:diag` 输出

### Phase I: AI 启用式输入入口（未来计划）
- [x] 当前版本策略：`Space` 启用 Chat 模式暂不开放，已屏蔽入口与触发；统一延后至 2.0
- [ ] 空白态/章节顶部提示文案：`按 Space（空格）以启用 AI，或按 / 启用命令`
- [ ] `Space` 快捷触发：在编辑器可输入区域激活 AI 输入条（不打断现有内容）
- [ ] `/` 快捷触发：打开 AI 命令面板（续写/改写/总结/生成标题等）
- [ ] AI 输入条交互：发送按钮 + Enter 发送 + Shift+Enter 换行 + ESC 关闭
- [ ] 输入条视觉样式按参考图实现（暗色玻璃面板、圆角边框、左侧图标、右侧发送）
- [ ] 状态反馈：请求中/执行中/完成/失败 的轻量进度提示
- [ ] 完整 i18n（zh/en）与主题适配（light/dark）
