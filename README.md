# 小说编辑器（Novel Editor）

一个面向长篇创作的桌面写作工具，支持离线写作、结构化创作管理与 AI 辅助。

## 下载

- 发布版本统一放在 GitHub 仓库的 `Releases` 页面：
  - https://github.com/XiongJL/Novel-Editor/releases
- Windows：
  - 安装版：`云梦小说编辑器-Setup-<version>.exe`
  - 便携版：`云梦小说编辑器-Portable-<version>.exe`
- macOS：
  - 安装包：`云梦小说编辑器-mac-<version>.dmg`

可直接在仓库顶部 `Releases` 或上方链接下载对应平台安装包。

## 快速开始

### 环境
- Node.js 18+
- pnpm 8.15.9+

### 初始化
```bash
pnpm install
pnpm run setup
```

### 启动桌面端
```bash
pnpm dev
```

### 常用命令
```bash
pnpm db:push
pnpm db:generate
pnpm dev:desktop
pnpm build:desktop:win
pnpm build:desktop:mac
pnpm build:core
pnpm build:desktop
pnpm build
```

说明：
- `pnpm run setup` 会先生成 `packages/core` 的 Prisma Client 与编译产物，适合作为首次拉取后的初始化步骤。
- `pnpm dev` 会通过 Turbo 启动工作区里的 `dev` 任务；当前主要入口是桌面端。
- 如果只想启动桌面端，直接使用 `pnpm dev:desktop`。
- `pnpm build:desktop:win` 会先生成并修正 `win-unpacked` 主程序图标，再基于该目录打包 Windows 安装版与便携版。
- `pnpm build:desktop:mac` 用于在 macOS 环境构建 universal DMG。

## 发布流程

### GitHub Releases
1. 确认 `package.json` 与 `apps/desktop/package.json` 版本号一致。
2. 提交代码并推送到默认分支。
3. 创建并推送版本标签：
```bash
git tag v0.1.3
git push origin v0.1.3
```
4. GitHub Actions 会自动：
   - 构建 Windows 安装包与便携版
   - 构建 macOS DMG
   - 创建 GitHub Release
   - 上传安装包到 Release Assets

说明：
- 自动发布工作流位于 `.github/workflows/release.yml`。
- Release 文案模板位于 `.github/RELEASE_TEMPLATE.md`。
- 当前版本发布草稿位于 `docs/releases/v0.1.3.md`。
- macOS 构建由 GitHub 的 macOS runner 执行；本地 Windows 机器不负责产出正式 DMG。

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
