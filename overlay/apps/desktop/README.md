# DeepSeek Harness Desktop Live — Desktop Shell

> Unofficial community project. Not affiliated with DeepSeek.

This is the Electron desktop wrapper used by the [DeepSeek Harness Desktop Live](https://github.com/godkey1314/deepseek-harness-desktop-live) project.

It launches the local `dsh web` service, shows the Harness UI in a native window, and automatically updates itself from this repository's GitHub Releases.

## Features

- Starts `dsh web` and opens the UI in an Electron window.
- Picks a free port automatically (default starts at `3080`).
- Cleans up the `dsh` process tree on close.
- Checks for updates on startup.
- Shows an update button in the top-right corner and a dynamic menu item when a new version is available.
- Supports Windows, macOS, and Linux packaging.

## Scripts

```sh
pnpm run build        # TypeScript compile
pnpm start            # Build and run locally
pnpm run dist:win     # Build Windows NSIS + portable
pnpm run dist:mac     # Build macOS dmg + zip
pnpm run dist:linux   # Build Linux AppImage + deb
```

## Update source

Updates are published to:

```
https://github.com/godkey1314/deepseek-harness-desktop-live/releases
```

The update feed is configured in `electron-builder.yml`.
