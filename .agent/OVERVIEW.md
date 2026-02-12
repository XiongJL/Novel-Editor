# Project Overview for Antigravity

This document provides a high-level summary of the Novel Editor project to help AI agents quickly establish context.

**Last Updated**: 2026-02-12

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
    *   **Plugins**: `ToolbarPlugin`, `StylePlugin`, `ShortcutsPlugin`, `AutoFormatPlugin`, `FloatingTextFormatToolbarPlugin`, `IdeaInteractionPlugin`, `PlotAnchorInteractionPlugin`.
    *   **Nodes**: `IdeaMarkNode`, `PlotAnchorNode` (extends MarkNode).
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
    *   **Recent Files**: Dropdown with last 25 edited chapters (access from toolbar)
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
*   **Word Count**:
    *   Real-time statistics (CJK optimized)
    *   Unobtrusive UI (bottom-right, auto-fading)
    *   Performance optimized (1.5s debounce)
*   **Global Search** (FTS5):
    *   Full-text search across chapters and ideas
    *   Real-time keyword highlighting on jump
    *   Progressive loading (20 results per batch)
    *   Auto-indexing on save
*   **Local Search (In-Editor)**:
    *   Ctrl+F to trigger floating search bar
    *   Search and Replace functionality
    *   Regex and Case sensitivity support
    *   Real-time highlighting using CSS Highlight API
    *   Keyboard navigation (Enter/Shift+Enter) and ESC support
*   **Story Structure Tools**:
    *   **Plot Sidebar**: Manage plot lines and points.
    *   **Narrative Matrix**: 2D grid view (Chapters vs Plot Lines) to track narrative flow globally.
    *   **Bidirectional Navigation**: 
        *   **Text -> Plot**: Click anchor in text to highlight plot point in sidebar.
        *   **Plot -> Text**: Click "Jump" icon on plot card to scroll to text anchor (with shake feedback if missing).
    *   **Unified Visuals**: Consistent icons (Mystery/Promise/Foreshadowing/Event) across Matrix and Sidebar.
    *   **@ Mentions**:
        *   **Smart Mention Recognition**: Regular expression based parsing in textareas and matrix views.
        *   **Extended Types**: Supports character, item, world setting, and map mentions with category filter tabs.
        *   **Dual Mention Systems**: Lexical editor uses `MentionsPlugin.tsx`; PlotPointModal uses independent textarea-based implementation. Both support all 4 entity types.
        *   **Transparent Textarea Overlay**: Solved text overlapping by making native textarea text transparent (maintaining cursor visibility) and rendering highlighted mentions on a perfectly aligned backdrop layer.
        *   **Entity Info Card**: Click-outside detection for auto-closing. Dynamic positioning to prevent overflow beyond viewport.
        *   **i18n Support**: Full localization for entity data cards and mention labels.
    *   **Global Search (Map Integration)**:
        *   Search sidebar supports map name searching alongside chapters, ideas, characters, items, and world settings.
        *   Click search results to navigate and highlight corresponding entities.

## 5. Current Status & Known Issues
*   **Status**: 
    *   Lexical editor fully integrated with toolbar and plugins.
    *   Mobile view preview with iPhone frame.
    *   One-click formatting with language-aware punctuation.
    *   All toolbar items support i18n.
    *   **Recent Files UI complete.**
    *   **Global search with FTS5 indexing complete.**
    *   **Narrative Matrix view implemented.**
    *   **Plot System fully interactive (Anchors, Jump, Sync).**
    *   **@ Mentions fully functional** in PlotPointModal, NarrativeMatrix, and Lexical editor with support for character, item, world, and map types.
    *   **Global Search extended** with map name search category.
    *   **EntityInfoCard optimized** with dynamic positioning and cleaned UI.
    *   **System-wide Delete Confirmation unified** using `ConfirmModal`.
*   **Planned**:
    *   Cloud sync integration.
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

## 10. UI Development Standards (Components)
*   **Modals**: 
    *   All new modals MUST extend `BaseModal` (`components/ui/BaseModal.tsx`) to ensure visual consistency.
    *   **Delete Confirmation**: Use `ConfirmModal` (`components/ui/ConfirmModal.tsx`) for ALL destructive actions. Do NOT use native `confirm()`.
    *   **Style**: Footer buttons should be right-aligned, except for the "Delete" button which stays on the far left. Use `text-xs` for footer buttons to maintain a refined look.
    *   **Backdrop**: Solid `bg-black/80` (no blur).
    *   **Rounding**: `rounded-xl`.
    *   **Animations**: Handled by `BaseModal` (Framer Motion).
    *   **Performance**: Use uncontrolled components (Refs) for text inputs to avoid re-renders during typing.
    *   **Theme**: Always pass the `theme` prop to `BaseModal`.

## 11. Next Steps for AI
*   If asked to fix bugs: Check `task.md` and `walkthrough.md` in `.gemini` memory first.
*   If implementing Sync: Refer to `SyncDesign.md`.
*   If implementing Search/Filter: Refer to `searchDesign.md`.
*   If modifying editor: Check `LexicalEditor/` plugins and `theme.ts`.
