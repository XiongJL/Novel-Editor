---
description: 初始化项目上下文，自动读取记忆、任务和核心文档
---

# 初始化项目上下文 (Initialize Context)

此工作流用于在新会话开始时快速建立项目上下文，确保 AI 代理了解项目架构、当前进度和历史决策。

1.  **读取项目记忆与状态**
    - 读取 `.agent/MEMORY.md` 了解架构决策和踩坑记录。
    - 读取 `.agent/active_task.md` 获取当前正在进行的任务列表。
    - 读取 `.agent/OVERVIEW.md` 获取项目高层概览。

2.  **读取核心开发文档**
    - 读取 `DEVELOPMENT.md` 复习开发规范和命令。
    - 读取 `README.md` 查看项目通用信息。
    - (可选) 如果涉及同步功能，读取 `SyncDesign.md`。

3.  **确认并报告**
    - 基于 `active_task.md` 的内容，向用户汇报当前应该继续的任务。
    - 如果发现 `active_task.md` 为空或已完成，询问用户下一步指示。

## 推荐对 AI 说的话 (Prompt Example)
"运行初始化上下文工作流 /init-context，并告诉我接下来该做什么。"
