# Tasks

- [ ] 灵感搜索与过滤功能 (Idea Search & Filtering)
    - [x] **Phase 1: 统一搜索工作台基础框架**
    - [x] **Phase 2: 灵感工作台深度功能**
    - [x] **Phase 2.5: 功能整合 (IdeaList -> UnifiedSearchWorkbench)**
    - [x] **Git 初始化与备份 (Git Init)**
    - [x] **Phase 3: 全局搜索集成**
- [x] **数据备份与恢复 (Backup & Restore System)**
    - [x] 核心功能实现
    - [x] 备份设置面板
- [x] **Bug Fix: 备份恢复错误处理 (Backup Restore Error Handling)**
    - [x] **IPC Refactoring**: 重构 `backup:import` IPC 接口，使其返回结构化结果对象 (`{ success, code }`) 而非抛出异常。
    - [x] **Frontend Update**: 更新 `BackupRestorePanel.tsx` 适配新的返回值，修复密码弹窗逻辑。
    - [x] **Type Definition**: 更新 `vite-env.d.ts` 类型定义。
- [ ] 云同步功能开发
