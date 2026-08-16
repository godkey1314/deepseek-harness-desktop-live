# Changelog

## 0.1.0-rc.6 (2026-08-15)

- 新增“源码更新”功能：菜单栏 `更新 -> 检查更新…` 自动检查当前 git remote 的新提交，生成更新报告并支持 AI 风险分析；确认后自动拉源码、装依赖、重新打包并启动新版本。
- 新增 `apps/desktop/source-update.config.json` 配置文件和 `apps/desktop/scripts/update-source.ps1` 自动更新脚本。
- 更新前自动暂存本地已跟踪修改，失败时自动回滚；重新打包前自动备份 `apps/desktop/release/`。
- 更新报告保存到 `apps/desktop/update-reports/`，日志保存到 `apps/desktop/update-logs/`。

## 0.1.0-rc.5 (2026-08-15)

- 新增 Electron 桌面外壳：自动启动 `dsh web` 并在原生窗口展示 Harness UI。
- 自动选择空闲端口（默认从 3080 开始），避免与已在运行的 Harness 冲突；支持 `DSH_DESKTOP_PORT` 指定端口。
- 关闭窗口时清理 `dsh` 进程树（Windows `taskkill /T /F`）。
- 新增 dsh 引擎更新检查：对比 npm 最新版，确认后自动安装。
- 新增桌面壳自动更新：通过 `DSH_DESKTOP_UPDATE_URL` 配置 generic 更新源，下载完成后提示重启安装；自动识别 `-rc` 预发布 channel。
- 新增 Windows 打包配置：NSIS 安装包 + 便携版 exe；通过 `electronDist` 使用本地 Electron 二进制，并通过 `@electron/get` override 修复 electron-builder 26 的缓存解析问题。
