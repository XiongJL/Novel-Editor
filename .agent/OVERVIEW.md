# Project Overview for Antigravity

This document provides a high-level summary of the Novel Editor project for fast onboarding.

**Last Updated**: 2026-03-04

## 1. Essentials
- **Project**: Novel Editor (Monorepo)
- **Core Tech**:
  - **Desktop**: Electron, Vite, React, TypeScript, TailwindCSS
  - **Editor**: Meta Lexical
  - **Data Layer**: Prisma (SQLite on desktop), `@novel-editor/core`
  - **Backend**: Spring Boot 3, MariaDB (sync)
- **Package Manager**: `pnpm` (TurboRepo)
- **i18n rule**: All UI text must use `react-i18next`.

## 2. Important Paths
- `apps/desktop`
- `apps/desktop/src/components/LexicalEditor`
- `apps/desktop/src/components/AIWorkbench`
- `apps/desktop/src/components/Settings`
- `apps/desktop/electron/ai`
- `apps/desktop/electron/search`
- `apps/desktop/scripts/ai-dev-diagnostics.mjs`
- `packages/core`
- `apps/backend`

## 3. Startup Commands
- Desktop dev: `pnpm dev`
- DB schema push (desktop/core): `pnpm db:push`
- Backend dev: `cd apps/backend && mvn spring-boot:run -s settings.xml`

## 4. Recent Key Status (2026-03-04)
- AI Workbench is available from ActivityBar (`ai_workbench`).
- Creative assets flow is closed-loop: generate draft -> edit/select -> validate -> confirm persist.
- Creative assets persistence now uses atomic transaction + per-item error details.
- Dev diagnostics were moved out of UI; terminal-only via `ai:diag`.
- Chapter summary pipeline is available with configurable trigger/mode, and ContextBuilder reads summaries first with fallback.
- Next focused task: title generation progress feedback (same UX pattern as continue-writing).

## 5. Current AI Feature Baseline
- AI settings with provider/proxy and basic tests.
- Title generation with candidate replacement.
- Continue writing with mandatory context injection (world settings + outline + key entities).
- Continue writing config modal and preview-then-confirm insertion.
- AI map image generation with progress and persistence to local assets.
- Summary strategy: local heuristic or AI summary; AI mode defaults to manual/finished trigger (not autosave-triggered by default).

## 6. Critical Notes
- Desktop runtime data file is `%APPDATA%/@novel-editor/desktop/novel_editor.db`.
- `packages/core/prisma/dev.db` is tool-chain DB for Prisma commands in `packages/core`; it is not the desktop runtime DB.
- Terminal mojibake does not necessarily mean file encoding corruption. Do not mass-rewrite encoding without confirmation.

## 7. Build & Packaging
- Build: `pnpm build`
- Electron Builder outputs installer + portable artifacts.
- Dev diagnostics scripts are development-only and should not become user-facing UI capabilities.

## 8. Next Steps
- Implement title generation progress stages + unified i18n status/error text.
- Continue coverage gap closure in AI capability matrix.
- Keep user docs and internal docs synchronized on each phase update.
