# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning in release tags.

## [0.1.2] - 2026-03-12

### Fixed
- GitHub Actions release workflow no longer depends on downloading `pnpm/action-setup`, avoiding intermittent `401 Unauthorized` failures during macOS job bootstrap.
- Release pipeline now installs `pnpm@8.15.9` directly on the runner before dependency installation.

## [0.1.1] - 2026-03-12

### Changed
- Windows `build:win` now packages from a fixed `win-unpacked` directory so the final `.exe`, portable build, installer shortcut, taskbar and window icon chain stay consistent.
- Electron Builder Windows icon configuration now edits the executable resources directly and carries the icon file into packaged resources.
- Repository package manager baseline is now `pnpm@8.15.9`, with GitHub Actions release jobs updated to the same pnpm version.
- Desktop and core package scripts no longer nest extra `npm`/`pnpm` invocations where they are unnecessary.

### Fixed
- Fixed the Windows Explorer `.exe` icon showing the default Electron icon while the running window and taskbar already showed the app icon.
- Fixed local initialization/build guidance to use `pnpm run setup` instead of pnpm's built-in `setup` command.

## [0.1.0] - 2026-03-11

### Added
- Windows installer and portable packaging flow.
- macOS DMG packaging configuration for universal builds.
- GitHub Actions release workflow for Windows and macOS artifacts.
- AI Workbench draft generation, validation, and atomic persistence flow.
- Continue writing preview-and-confirm insertion flow.
- Chapter summary pipeline with local/AI summary strategy.

### Changed
- Unified desktop app version to `0.1.0`.
- Windows release artifact naming now uses the application version.
- Uninstall flow now supports deleting local user data from the assisted uninstall wizard.

### Notes
- macOS DMG is built on macOS runners.
