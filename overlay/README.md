# Overlay

This directory contains the desktop wrapper that is merged into the official DeepSeek Harness source before building.

```
overlay/apps/desktop/   Electron desktop shell source
```

What the overlay adds:

- `apps/desktop/package.json` — desktop app manifest and build scripts.
- `apps/desktop/src/main.ts` — Electron main process: starts `dsh web`, creates the window, shows update UI.
- `apps/desktop/src/preload.ts` — safe bridge for the in-page update button.
- `apps/desktop/src/updater.ts` — automatic update logic via `electron-updater`.
- `apps/desktop/electron-builder.yml` — Windows/macOS/Linux packaging and GitHub Releases publishing.
- `apps/desktop/build/icon.png` — application icon.

The `scripts/prepare-source.mjs` script at the repository root copies this overlay into the official source, patches `pnpm-workspace.yaml` to allow Electron's build script, and sets the release version.
