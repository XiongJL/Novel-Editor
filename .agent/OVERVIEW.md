# Project Overview for Antigravity

This document provides a high-level summary of the Novel Editor project to help AI agents quickly establish context.

**Last Updated**: 2026-02-05

## 1. Essentials
*   **Project**: Novel Editor (Monorepo)
*   **Core Tech**: 
    *   **Frontend/Desktop**: Electron, Vite, React, TypeScript, TailwindCSS.
    *   **Editor**: Meta Lexical (Rich Text Framework).
    *   **Data Layer**: Prisma (SQLite for Desktop), @novel-editor/core (Shared Logic).
    *   **Backend**: Spring Boot 3, MariaDB (Cloud Sync).
*   **Package Manager**: `pnpm` (TurboRepo).
*   **Important Paths**:
    *   `apps/desktop`: Main Electron application.
    *   `apps/desktop/src/components/LexicalEditor`: Lexical editor components and plugins.
    *   `apps/desktop/electron/search`: FTS5 search index utility.
    *   `apps/backend`: Spring Boot sync server.
    *   `packages/core`: Shared database client (Prisma/SQLite) and types.
*   **must use i18n**: All interface text must use internationalization (`react-i18next`).

## 2. Startup Commands
*   **Quick Start (Desktop)**: `pnpm dev` (Runs concurrent build for core & desktop).
*   **Backend Start**: `cd apps/backend` -> `mvn spring-boot:run -s settings.xml` (Recommended).
*   **DB Migration (Desktop)**: `pnpm db:push` (Syncs `packages/core/prisma/schema.prisma` to local `novel_editor.db`).

## 3. Architecture Highlights
*   **Dual-Database**: 
    *   Desktop uses local **SQLite** for offline-first experience.
    *   Backend uses **MariaDB** for cloud synchronization.
*   **IPC Communication**: Renderer calls `window.db.xxx` -> Preload -> Main Process `ipcMain.handle`.
*   **Lexical Editor**:
    *   `LexicalChapterEditor`: Main editor component with integrated toolbar.
    *   **Plugins**: `ToolbarPlugin`, `StylePlugin`, `ShortcutsPlugin`, `AutoFormatPlugin`, `FloatingTextFormatToolbarPlugin`, `IdeaInteractionPlugin`.
    *   **Nodes**: `IdeaMarkNode` (extends MarkNode for idea highlighting).
    *   **Features**: Rich text formatting, i18n support, mobile preview mode (iPhone frame), idea creation with text selection.
*   **Synchronization**:
    *   Logic based on `updatedAt` timestamps and cursors (SyncCursor).
    *   Endpoints: `/api/sync/push` & `/api/sync/pull`.

## 4. Editor Features (Lexical)
*   **Toolbar**: 
    *   Font family selector (Serif/Sans/Kaiti)
    *   Font size slider
    *   Wide/Mobile view toggle
    *   Text formatting (Bold, Italic, Underline, Strikethrough)
    *   Text alignment
    *   First-line indent (2em for Chinese text)
    *   One-click auto-format
*   **Auto Format Plugin**:
    *   Removes extra spaces
    *   Converts punctuation based on language setting (Chinese ↔ English)
    *   Capitalizes first letter after sentence-ending punctuation
*   **Style Plugin**:
    *   Dynamic font size, line height, font family
    *   First-line indentation (`text-indent: 2em`)
*   **Mobile Preview**: iPhone 15 style frame wrapper
*   **Idea System**:
    *   Create ideas from selected text (floating toolbar)
    *   Create global ideas (Ctrl+I shortcut or sidebar button)
    *   Jump to idea location in editor
    *   Star/unstar ideas
    *   Underline highlighting for marked text
*   **Global Search** (FTS5):
    *   Full-text search across chapters and ideas
    *   Real-time keyword highlighting on jump
    *   Progressive loading (20 results per batch)
    *   Progressive loading (20 results per batch)
    *   Auto-indexing on save
*   **Local Search (In-Editor)**:
    *   Ctrl+F to trigger floating search bar
    *   Search and Replace functionality
    *   Regex and Case sensitivity support
    *   Real-time highlighting using CSS Highlight API
    *   Keyboard navigation (Enter/Shift+Enter) and ESC support

## 5. Current Status & Known Issues
*   **Status**: 
    *   Lexical editor fully integrated with toolbar and plugins.
    *   Mobile view preview with iPhone frame.
    *   One-click formatting with language-aware punctuation.
    *   All toolbar items support i18n.
    *   **Global search with FTS5 indexing complete.**
*   **Critical Notes**:
    *   `packages/core` MUST be built (`pnpm build`) for Electron to load it.
    *   Old `EditorToolbar.tsx` component is deprecated (replaced by Lexical `ToolbarPlugin`).
    *   Theme configuration in `components/LexicalEditor/theme.ts`.

## 6. Build & Deployment
*   **Electron Builder**: configured for Installer (NSIS) and Portable.
*   **Database**:
    *   Development: `%APPDATA%/novel-editor`
    *   Production: `./resources/data` (Relative to executable)
*   **Build Scripts**:
    *   `scripts/copy-prisma.js`: Auto-copies Prisma client to prevent build errors.
    *   Command: `pnpm build` (Runs `copy-prisma` pre-hook).

## 7. Key Hooks & State Management
*   `useEditorPreferences`: Manages font size, line height, font family, max width, indent mode.
*   `useShortcuts`: Manages keyboard shortcuts configuration.
*   `useTranslation`: i18n hook from `react-i18next`.

## 8. Developer Tools
*   **DevTools Shortcuts**: F12 or Ctrl+Shift+I to toggle Developer Tools in Electron.

## 9. Next Steps for AI
*   If asked to fix bugs: Check `task.md` and `walkthrough.md` in `.gemini` memory first.
*   If implementing Sync: Refer to `SyncDesign.md`.
*   If implementing Search/Filter: Refer to `searchDesign.md`.
*   If modifying editor: Check `LexicalEditor/` plugins and `theme.ts`.
