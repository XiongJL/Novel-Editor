@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "NODE_EXE="

if defined NOVEL_EDITOR_NODE_EXE (
  set "NODE_EXE=%NOVEL_EDITOR_NODE_EXE%"
)

if not defined NODE_EXE (
  for /f "delims=" %%I in ('where node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%I"
  )
)

if not defined NODE_EXE (
  echo [novel-editor-mcp.cmd] node.exe not found. Set NOVEL_EDITOR_NODE_EXE or add node to PATH. 1>&2
  exit /b 1
)

if not defined NOVEL_EDITOR_MCP_LOG_FILE (
  set "NOVEL_EDITOR_MCP_LOG_FILE=%TEMP%\novel-editor-mcp.log"
)

"%NODE_EXE%" "%SCRIPT_DIR%novel-editor-mcp.mjs"
