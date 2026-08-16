# DeepSeek Harness Desktop Live

> **Unofficial community project.** This project is not affiliated with, endorsed by, or sponsored by DeepSeek.

An Electron desktop shell for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) with **automatic updates that follow the official repository**.

When the official `deepseek-ai/deepseek-harness` repository gets new code, GitHub Actions automatically:

1. Pulls the latest official source.
2. Merges in our desktop wrapper (`overlay/apps/desktop`).
3. Builds installers for **Windows, macOS, and Linux**.
4. Publishes them to this repository's GitHub Releases.

Installed apps check this repository's Releases and update themselves automatically.

## Features

- Launches `dsh web` automatically and shows the Harness UI in a native Electron window.
- Automatic port selection (default starts at `3080`).
- Cleans up the `dsh` process tree when the window closes.
- Automatic update check on startup.
- Update badge in the top-right corner of the window and dynamic menu item when a new version is available.
- Cross-platform builds: Windows (NSIS + portable), macOS (dmg + zip), Linux (AppImage + deb).

## Download

Download the latest installer from [Releases](https://github.com/godkey1314/deepseek-harness-desktop-live/releases).

> **Only this repository is the official distribution channel.** Builds downloaded from elsewhere may not receive automatic updates.

## How it works

```
official deepseek-ai/deepseek-harness
        │  GitHub Actions checks every 30 minutes
        ▼
pull latest official source
        │  merge overlay/apps/desktop
        ▼
build Windows / macOS / Linux packages
        │
        ▼
publish to GitHub Releases
        │
        ▼
installed desktop app checks GitHub Releases → downloads → replaces itself
```

## Requirements for users

- Windows, macOS, or Linux.
- A global `dsh` installation: `npm install -g @deepseek-ai/dsh`
  - The desktop shell launches the local `dsh web` service. It does not bundle the Harness engine itself.

## Development

```sh
pnpm install
pnpm --filter dsh-desktop-live start
```

## Build locally

```sh
# Windows
pnpm --filter dsh-desktop-live dist:win

# macOS
pnpm --filter dsh-desktop-live dist:mac

# Linux
pnpm --filter dsh-desktop-live dist:linux
```

Output is written to `overlay/apps/desktop/release/`.

## Automatic build and release

The workflow is in `.github/workflows/build-release.yml`.

- It runs every 30 minutes and can be triggered manually from the Actions tab.
- It only builds when the official repository has a new commit.
- Build results are reported in the **Automated Build Notifications** issue.

## Repository layout

```
overlay/apps/desktop/   Electron desktop wrapper source
scripts/prepare-source.mjs   Merge official source + overlay + set version
.github/workflows/     Automatic build and release workflow
```

## License

[MIT](./LICENSE)

DeepSeek is a trademark of its respective owner. This project is an independent community project.
