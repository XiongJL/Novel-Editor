# for-cli TODO

## MCP 功能约束与补全

- [x] 世界观能力补全（MCP）
  - 已提供新增与修改能力：`worldsetting.create` / `worldsetting.update`
  - 删除能力默认不开放给 CLI 自动调用（保持不暴露删除工具）
  - 删除能力若后续开放，需先加“用户确认”机制
  - 已联通 `automation:data-changed`，MCP 写入后可触发页面刷新

- [x] MCP 配置优化（减少手填路径）
  - 新增命令：`pnpm mcp:config`
  - 可自动输出本机绝对路径的 Codex/Claude/JSON 配置
  - 支持 `--copy codex|claude|json` 一键复制（Windows）

- [x] AI 设置页模式联动与可用性收敛
  - `MCP CLI` 模式移除旧手填项（CLI 可执行路径/工作目录/启动参数模板/环境变量 JSON）
  - `MCP CLI` 模式只保留“复制配置片段 + 测试 MCP”
  - `HTTP API` 模式下“其他高级配置 / 章节摘要策略 / 代理配置”默认折叠
  - 测试前会先同步当前设置，减少“界面与主进程配置不一致”导致的误判
