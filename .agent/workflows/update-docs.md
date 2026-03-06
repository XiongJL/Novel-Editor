---
description: 更新项目相关文档，保持实现状态、开发文档与用户文档一致
---

# 更新相关文档

当项目有阶段性变更时，使用此工作流同步文档，避免“代码状态与文档状态分叉”。

## 需要更新的文档集合

### 内部文档
1. `.agent/active_task.md`
2. `.agent/implementation_plan.md`
3. `.agent/OVERVIEW.md`
4. `.agent/MEMORY.md`
5. `.agent/task.md`
6. `.agent/workflows/update-docs.md`
7. `DEVELOPMENT.md`

### 用户文档
1. `README.md`
2. `USER_GUIDE.md`
3. `USER_GUIDE_EN.md`

### 后端文档
1. `apps/backend/README.md`

## 执行步骤

1. 先做一致性检索（旧术语/旧入口）
   - 检索是否仍存在过时描述（如“设置页 smoke/coverage”当前态）。
2. 更新内部文档
   - 先更新 `.agent/*` 的状态与阶段。
   - 再更新 `DEVELOPMENT.md` 的开发规范与命令。
3. 更新用户文档
   - 仅写用户可见功能，不暴露开发诊断实现细节。
   - `USER_GUIDE.md` 与 `USER_GUIDE_EN.md` 保持章节结构一一对应。
4. 更新后端文档
   - 若本批变更主要在 desktop，明确写出“后端接口无新增要求”。
5. 最终复核
   - 交叉检查 `active_task.md` 与 `implementation_plan.md` 是否冲突。
   - 复核中英用户文档功能点是否对齐。

## 验收清单

- 文档日期、阶段状态与实现一致。
- 用户文档不出现开发专用诊断细节。
- 终端命令示例可直接执行，参数与退出码说明一致。
- Markdown 结构清晰，无明显重复或互相矛盾描述。

## 注意事项

- 终端乱码显示不等于文件编码损坏，未确认前不要做批量转码。
- 若涉及功能未上线，文档应标记“计划中/即将支持”，不要伪造已完成状态。
