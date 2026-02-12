# Novel Editor User Guide

Welcome to Novel Editor! A modern writing tool designed for creators, offering an immersive writing experience and powerful idea management.

## 1. Interface Overview

Navigate through the main views using the left Activity Bar:
- **Explorer**: Manage volumes and chapters.
- **Outline**: (In Development) View chapter outlines.
- **Ideas**: Manage and view all idea notes.
- **Plot**: Manage plot lines and story points.
- **World**: Manage characters, items, world settings, and maps.
- **Search**: Global full-text search.
- **Settings**: Adjust theme, language, and shortcuts.

## 2. Basic Operations

### 📚 Content Management
- **New Volume**: Click the "+" button at the top of the Explorer.
- **New Chapter**: Hover over a volume name and click the "+" button on the right.
- **Rename**: Double-click any volume or chapter name to edit.
- **Open Chapter**: Single click a chapter to open it in the editor.

### ✍️ Writing & Formatting
The top toolbar provides essential formatting tools:
- **Styles**: Bold, Italic, Underline, Strikethrough.
- **Alignment**: Left, Center, Right, Justify.
- **Auto Format**: Click the "Format" button to automatically:
    - Convert punctuation
    - Fix indentation (2em)
    - Optimize spacing
- **Mobile Preview**: Click the "Mobile Preview" icon to see how your text looks on a phone screen.

## 3. Core Features

### 💡 Idea System
Capture ideas without breaking your flow.
1.  **Selection Note**: Select text in the editor and click the floating "Bulb" icon to add a note linked to that text.
2.  **Global Note**: Press `Ctrl+I` to add a standalone idea anytime.
3.  **Idea Sidebar**: Click the Bulb icon on the left to view all ideas.
    - **Jump**: Click an idea card to jump directly to the referenced text in the editor.

### 🔍 Search
- **Local Find**: `Ctrl+F`
    - Support Find/Replace.
    - Support Regex and Case Sensitivity.
    - Real-time highlighting.
- **Global Search**: `Ctrl+Shift+F`
    - Search across all chapters, ideas, characters, items, world settings, and maps.
    - Click results to jump and highlight the corresponding content.

### 📖 Story Structure
Manage your plot from the "Plot" tab in the editor sidebar:
- **Plot Lines**: Create multiple parallel or intersecting plot lines (e.g., main plot, subplots).
- **Plot Points**: Add nodes like foreshadowing, mysteries, promises, and events to plot lines.
- **Narrative Matrix**: View a "Chapters × Plot Lines" grid for a full overview, with row/column transpose.
- **Text Anchors**: Pin plot points to specific locations in the editor text for bidirectional navigation.

### 📝 @ Mentions
Use `@` in plot point descriptions to quickly reference entities:
1.  Type `@` to open the mention dropdown.
2.  Use the top tabs to filter by category: **All / Character / Item / World / Map**.
3.  Type to filter, then press Enter or click to insert.
4.  Click an inserted @Character or @Item mention to view its detail card.

### 🌍 World Building
Manage your creative world from the "World" tab:
- **Characters**: Create character cards with avatars, descriptions, and custom attributes.
- **Items**: Manage props and objects in your story.
- **World Settings**: Record world lore, rules, and background.
- **Maps**: Create canvas maps to visually manage spatial relationships.

### 🎨 Personalization
Click the Gear icon at the bottom left to open Settings:
- **Theme**: Switch betweeen Light / Dark mode.
- **Language**: Switch between Chinese / English.
- **Shortcuts**: View and customize key bindings.

## 4. Common Shortcuts

| Action             | Windows/Linux      | macOS             |
| :----------------- | :----------------- | :---------------- |
| **Save**           | `Ctrl + S`         | `Cmd + S`         |
| **Undo**           | `Ctrl + Z`         | `Cmd + Z`         |
| **Redo**           | `Ctrl + Y`         | `Cmd + Shift + Z` |
| **Find**           | `Ctrl + F`         | `Cmd + F`         |
| **Global Search**  | `Ctrl + Shift + F` | `Cmd + Shift + F` |
| **New Idea**       | `Ctrl + I`         | `Cmd + I`         |
| **Auto Format**    | `Ctrl + E`         | `Cmd + E`         |
| **Toggle Sidebar** | `Ctrl + B`         | `Cmd + B`         |
| **Close Modal**    | `ESC`              | `ESC`             |

## 5. FAQ
- **Search not working?** The search index updates automatically on save. Try saving your file, or click "Rebuild Index" in the search panel.
