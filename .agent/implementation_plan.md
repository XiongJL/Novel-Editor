# AI 集成实施计划（2026-03-04 同步版）

## 1. 决策基线（已锁定）
- 开发诊断仅终端可用，用户界面不暴露。
- 设置页保留 4 个基础测试：`Test Connection` / `Test MCP` / `Test Proxy` / `Test Generate`。
- 终端诊断统一使用：`pnpm --filter @novel-editor/desktop run ai:diag -- ...`，支持默认可读输出与 `--json`。
- 诊断主进程入口 `--ai-diag` 仅开发环境可用，打包环境拒绝。
- Phase E 按“生成 -> 预览编辑 -> 入库前校验 -> 原子事务入库”闭环推进。
- 入库事务默认 `atomic`（任一失败整批回滚）。

## 2. 当前实现状态（按阶段）

### Phase C：标题 AI 生成
已完成：
- 标题生成入口与候选替换。
- 标题上下文注入（章节正文 + 摘要 + 小说信息）。

进行中：
- 标题生成进度反馈（与续写一致）：`请求中 -> 生成中 -> 解析中`。
- 标题生成状态文案统一 i18n（zh/en）。

### Phase D / D.1：续写闭环
已完成：
- `ContextBuilder` 强制注入世界观/大纲/关键实体。
- 新建章节与已有章节续写分流。
- 首章无大纲阻断 + 行动引导。
- 续写配置（灵感、字数、参考范围、风格语气、创意程度）。
- 续写预览确认后写入 `chapter.save`。
- 续写配置模态框内提示词可视化（结构化/原文）与本次临时提示词覆盖。
- `chapter.generate` 支持 `new_chapter` / `continue_chapter`。

### Phase E：AI 创作工坊（主线）
已完成：
- ActivityBar 新增 `ai_workbench` 入口。
- `generateCreativeAssets` 生成结构化草稿。
- 草稿列表支持编辑、删除、勾选。
- 入库前校验：`validateCreativeAssetsDraft`（必填、类型、重名、地图输入关系、标准化）。
- 入库确认：`confirmCreativeAssets` 走原子事务。
- 返回增强：`success/created/warnings/errors?/transactionMode:'atomic'`。
- 地图资产纳入同一事务链路。
- AI 工坊提示词可视化（结构化/原文）+ 本次临时提示词覆盖。
- 地图生成模态框可查看引用世界观与最终提示词（结构化/原文）+ 本次临时提示词覆盖。

### Phase F：摘要与记忆压缩
已完成：
- `ChapterSummary` 数据表与异步更新流程。
- 摘要策略：本地启发式 / AI 摘要。
- 触发策略：自动 / 仅手动 / 完稿触发（AI 默认非自动）。
- ContextBuilder 优先摘要、缺失回退正文；最近几章优先正文保障文风一致。

## 3. 诊断能力（Terminal Only）

### 3.1 命令
```bash
pnpm --filter @novel-editor/desktop run ai:diag -- smoke mcp
pnpm --filter @novel-editor/desktop run ai:diag -- smoke skill --json
pnpm --filter @novel-editor/desktop run ai:diag -- coverage
```

可选参数：
- `--json`
- `--db <path>`
- `--user-data <path>`

退出码：
- `0` 成功
- `1` 运行失败
- `2` 参数错误

### 3.2 UI 约束
- 设置页不展示 smoke/coverage/list actions/manifest 等开发诊断入口。
- 用户文档不出现开发诊断细节。

## 4. Phase E 闭环规格（执行标准）

### 4.1 前端流程
1. 在 `ai_workbench` 输入 brief。
2. 调用 `generateCreativeAssets` 获取草稿。
3. 用户在草稿区编辑、删除、勾选。
4. 提交前调用 `validateCreativeAssetsDraft`。
5. 校验通过后调用 `confirmCreativeAssets`。
6. 展示入库结果（成功数量、warnings、errors）。

### 4.2 服务端流程
1. 规范化输入与冲突检查。
2. 开启事务（atomic）。
3. 执行各实体创建（plot/character/item/skill/map）。
4. 任一失败回滚全事务。
5. 返回结构化错误明细。

## 5. 标题生成进度反馈规格（新增）
- 触发：点击标题生成/再生成按钮。
- 状态：
  - `requesting`（请求中）
  - `generating`（生成中）
  - `parsing`（解析中）
- 表现：
  - 按钮 loading + 禁用重复点击。
  - 阶段提示（可映射进度条 33/66/100）。
- 收敛：
  - 成功：展示候选并清理状态。
  - 失败：展示可读错误并清理状态。
- 文案：全部 i18n，禁止硬编码。

## 6. 接口与类型变更（说明层）

### Renderer 可见
新增：
- `window.ai.validateCreativeAssetsDraft(payload)`

变更：
- `window.ai.confirmCreativeAssets(payload)` 返回：
  - `success`
  - `created`
  - `warnings`
  - `errors?`
  - `transactionMode: 'atomic'`

收口（不在 UI 暴露）：
- `listActions`
- `getMcpManifest`
- `getOpenClawManifest`
- `getOpenClawSkillManifest`
- `testOpenClawMcp`
- `testOpenClawSkill`
- `testOpenClawSmoke`
- `getCapabilityCoverage`

## 7. 验收标准

### A. 诊断收口
- 设置页不再展示 smoke/coverage 相关入口。
- 终端 `ai:diag` 三类命令可用。
- 打包环境拒绝 `--ai-diag`。

### B. 工坊闭环
- 可从 ActivityBar 进入 AI 工坊。
- 草稿可编辑/删除/勾选。
- 非法草稿被校验阻断并显示明确错误。
- 原子事务生效：失败不产生部分落库。

### C. 标题生成进度
- 进度阶段按状态推进。
- 成功/失败都能正确清理 loading 状态。

### D. 文档一致性
- 内部文档与用户文档状态一致。
- 用户文档中英结构一致。
- 用户文档不暴露开发诊断细节。

## 8. Future UX（已登记）
- 新增“AI 启用式输入”交互方案（参考图）：
  - 当前版本不启用 `Space -> Chat` 入口，统一放入 2.0 版本规划。
  - 空白态提示：`按 Space（空格）以启用 AI，或按 / 启用命令`。
  - `Space` 激活 AI 输入条；`/` 打开 AI 命令面板。
  - 输入条具备发送按钮与键盘交互（Enter/Shift+Enter/ESC）。
  - 样式方向：暗色半透明面板、圆角边框、左侧能力图标、右侧发送按钮。
- 该方案已进入待办，排期在 Phase E 收尾之后执行。
