# DeepSeek Harness Desktop Live

> **非官方社区项目。** 本项目与 DeepSeek 官方无任何关联，未获得 DeepSeek 官方认可或赞助。

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Electron 桌面壳，内置**跟随官方仓库自动更新**的能力。

当官方 `deepseek-ai/deepseek-harness` 仓库出现新代码时，GitHub Actions 会自动：

1. 拉取官方最新源码；
2. 合入我们的桌面封装（`overlay/apps/desktop`）；
3. 构建 **Windows、macOS、Linux** 安装包；
4. 发布到本仓库的 GitHub Releases。

已经安装的桌面版会检查本仓库 Releases，并自动更新替换自己。

## 功能

- 自动启动 `dsh web`，在原生 Electron 窗口中展示 Harness UI。
- 自动选择空闲端口（默认从 `3080` 开始）。
- 关闭窗口时自动清理 `dsh` 进程树。
- 启动时自动检查更新。
- 发现新版本时，窗口右上角显示更新按钮，菜单栏同步提示。
- 跨平台构建：Windows（NSIS + 便携版）、macOS（dmg + zip）、Linux（AppImage + deb）。

## 下载

从 [Releases](https://github.com/godkey1314/deepseek-harness-desktop-live/releases) 下载最新安装包。

> **本仓库是唯一官方发布渠道。** 从其他渠道下载的版本可能无法收到自动更新。

## 工作原理

```
官方 deepseek-ai/deepseek-harness
        │  GitHub Actions 每 30 分钟检查一次
        ▼
拉取官方最新源码
        │  合入 overlay/apps/desktop
        ▼
构建 Windows / macOS / Linux 安装包
        │
        ▼
发布到 GitHub Releases
        │
        ▼
已安装的桌面版检查 GitHub Releases → 下载 → 自动替换
```

## 用户环境要求

- Windows、macOS 或 Linux。
- 已全局安装 `dsh`：`npm install -g @deepseek-ai/dsh`
  - 桌面壳启动的是本地 `dsh web` 服务，本身不打包 Harness 引擎。

## 开发运行

```sh
pnpm install
pnpm --filter dsh-desktop-live start
```

## 本地打包

```sh
# Windows
pnpm --filter dsh-desktop-live dist:win

# macOS
pnpm --filter dsh-desktop-live dist:mac

# Linux
pnpm --filter dsh-desktop-live dist:linux
```

输出目录：`overlay/apps/desktop/release/`。

## 自动构建与发布

工作流位于 `.github/workflows/build-release.yml`。

- 每 30 分钟运行一次，也可以在 Actions 页面手动触发。
- 只有官方仓库出现新提交时才会构建。
- 构建结果会记录在 **Automated Build Notifications** issue 中。

## 仓库结构

```
overlay/apps/desktop/        Electron 桌面封装源码
scripts/prepare-source.mjs   合并官方源码 + 封装 + 设置版本号
.github/workflows/           自动构建发布工作流
```

## 许可证

[MIT](./LICENSE)

DeepSeek 商标归其所有者所有。本项目是独立社区项目。
