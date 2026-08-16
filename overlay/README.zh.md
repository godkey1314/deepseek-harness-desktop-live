# Overlay（封装层）

本目录存放构建时要合并进官方 DeepSeek Harness 源码的桌面封装。

```
overlay/apps/desktop/   Electron 桌面壳源码
```

封装内容：

- `apps/desktop/package.json` — 桌面应用清单与构建脚本。
- `apps/desktop/src/main.ts` — Electron 主进程：启动 `dsh web`、创建窗口、展示更新 UI。
- `apps/desktop/src/preload.ts` — 页面内更新按钮的安全桥接。
- `apps/desktop/src/updater.ts` — 基于 `electron-updater` 的自动更新逻辑。
- `apps/desktop/electron-builder.yml` — Windows/macOS/Linux 打包与 GitHub Releases 发布配置。
- `apps/desktop/build/icon.png` — 应用图标。

仓库根目录的 `scripts/prepare-source.mjs` 会把这个 overlay 复制进官方源码，修改 `pnpm-workspace.yaml` 允许 Electron 构建脚本，并设置发布版本号。
