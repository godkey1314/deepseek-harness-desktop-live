# DeepSeek Harness Desktop Live — 桌面壳

> 非官方社区项目。与 DeepSeek 官方无任何关联。

这是 [DeepSeek Harness Desktop Live](https://github.com/godkey1314/deepseek-harness-desktop-live) 项目使用的 Electron 桌面封装。

它启动本地 `dsh web` 服务，在原生窗口中展示 Harness UI，并自动从本仓库的 GitHub Releases 更新自己。

## 功能

- 自动启动 `dsh web` 并在 Electron 窗口中打开 UI。
- 自动选择空闲端口（默认从 `3080` 开始）。
- 关闭时自动清理 `dsh` 进程树。
- 启动时自动检查更新。
- 发现新版本时，窗口右上角显示更新按钮，菜单栏同步提示。
- 支持 Windows、macOS、Linux 打包。

## 脚本

```sh
pnpm run build        # TypeScript 编译
pnpm start            # 本地构建并运行
pnpm run dist:win     # 构建 Windows NSIS + 便携版
pnpm run dist:mac     # 构建 macOS dmg + zip
pnpm run dist:linux   # 构建 Linux AppImage + deb
```

## 更新源

更新发布到：

```
https://github.com/godkey1314/deepseek-harness-desktop-live/releases
```

更新源在 `electron-builder.yml` 中配置。
