# 小说编辑器（Novel Editor）

一个面向长篇创作的桌面写作工具，支持离线写作、结构化创作管理与 AI 辅助。

## 快速开始

### 环境
- Node.js 18+
- pnpm

### 启动
```bash
pnpm install
pnpm dev
```

### 常用命令
```bash
pnpm db:push
pnpm db:generate
pnpm build
```

## 项目结构
- `apps/desktop`：Electron 桌面端（主应用）
- `apps/backend`：Spring Boot 同步服务
- `packages/core`：Prisma 数据模型与核心逻辑

## 当前功能

### 编辑器与结构化创作
- Lexical 富文本编辑（常用格式、排版、快捷键）
- 卷/章管理
- 灵感系统（标注、跳转、收藏）
- 故事线/情节点/锚点
- 叙事矩阵（章节 × 情节线）
- 全局搜索（章节、灵感、角色、物品、世界观、地图）

### AI 能力（用户可见）
- 标题生成：基于当前章节上下文生成候选标题并可一键替换
- 章节续写：支持参数配置与预览确认后插入
- AI 创作工坊：生成大纲/角色/物品/技能/地图草稿，编辑勾选后确认入库
- 地图 AI 生成：支持提示词生成图片并关联地图资产
- 摘要策略：支持本地摘要与 AI 摘要；AI 摘要建议手动或完稿时触发
- AI 密钥本地保存：`API Key` / `API Token` 仅保存在当前设备本地，不写入小说数据库，也不进入备份恢复

## 开发进度（摘要）
- [x] AI 创作工坊入口与草稿编辑流程
- [x] 创作资产入库前校验 + 原子事务写入
- [x] 续写配置 + 预览确认写入
- [x] 章节摘要更新与上下文回填
- [ ] 标题生成进度条（与续写一致的阶段反馈）
- [ ] 云同步完整对接

## 文档
- 开发文档：`DEVELOPMENT.md`
- 用户指南（中文）：`USER_GUIDE.md`
- User Guide (English)：`USER_GUIDE_EN.md`
- 后端说明：`apps/backend/README.md`
