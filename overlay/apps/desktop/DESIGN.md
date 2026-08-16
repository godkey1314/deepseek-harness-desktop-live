# DeepSeek Harness Desktop（Electron 桌面版）开发方案

## 背景与目标

- 用户当前每次启动 DeepSeek Harness 需要手动执行 `dsh web`，再在浏览器中打开页面，体验不符合“像点击程序一样启动”的诉求。
- 目标：在官方源码 `apps/desktop` 下新增一个 Electron 桌面客户端，双击 exe 后自动启动本地 `dsh web` 服务，并在独立原生窗口中展示 Harness Web UI，不再需要命令行和浏览器标签页。
- 平台：Windows（本机已验证 .NET/Node/WebView2 环境；Electron 可跨平台，本次优先 Windows 打包）。

## 涉及范围

### 新增文件

- `apps/desktop/package.json` — Electron 应用包声明、启动/构建/打包脚本
- `apps/desktop/tsconfig.json` — 独立 TypeScript 工程（不加入仓库 Host/Client aggregate）
- `apps/desktop/src/main.ts` — Electron 主进程：拉起 `dsh web`、等待端口、创建窗口、退出清理
- `apps/desktop/src/updater.ts` — 桌面壳更新与 dsh 引擎更新逻辑
- `apps/desktop/src/source-updater.ts` — 源码更新：git 检查、变更报告、AI 风险分析、触发自动更新脚本
- `apps/desktop/source-update.config.json` — 源码更新配置
- `apps/desktop/scripts/update-source.ps1` — 自动更新后台脚本：拉源码、装依赖、验证、重新打包、失败回滚
- `apps/desktop/src/preload.ts` — 预加载脚本（contextBridge 安全桥接）
- `apps/desktop/electron-builder.yml` — Windows 安装包/便携版打包配置
- `apps/desktop/README.md` / `README.zh.md` — 使用与构建说明
- `apps/desktop/DESIGN.md` — 本方案文档

### 修改文件

- `pnpm-workspace.yaml` — `allowBuilds` 增加 `electron: true`（Electron 安装需要 postinstall 下载二进制）

### 不修改

- 不修改 `packages/` 核心代码
- 不修改 `apps/cli`、`apps/web` 现有行为
- 不新增数据库、不改变 Harness 协议

## 实现方案

### 核心思路

Electron 主进程在应用启动时：

1. 解析要执行的命令：
   - 环境变量 `DSH_DESKTOP_COMMAND` 优先；
   - 默认执行 `dsh web`（用户已全局安装 `dsh`）；
   - 未来可扩展为仓库内 `pnpm dsh web`。
2. 以子进程方式启动 `dsh web`，隐藏控制台窗口。
3. 轮询 `http://127.0.0.1:3080`，就绪后创建 `BrowserWindow` 加载该地址。
4. 窗口关闭时，结束 `dsh` 子进程及其子进程树（Windows 使用 `taskkill /T /F`）。

### 自动更新

桌面版包含两层自动更新：

1. **桌面壳更新（`electron-updater`）**
   - 启动后延迟数秒检查更新源；
   - 更新源通过环境变量 `DSH_DESKTOP_UPDATE_URL` 配置（generic provider）；
   - 未配置更新源时静默跳过，不影响正常使用；
   - 发现新版本后自动下载，下载完成弹窗提示“立即重启安装”或“稍后”。

2. **dsh 引擎更新（npm registry）**
   - 启动后读取本地 `dsh --version`；
   - 通过 `npm view @deepseek-ai/dsh version` 获取最新版本；
   - 使用 `semver` 比较，发现新版时弹窗询问是否更新；
   - 用户确认后执行 `npm install -g @deepseek-ai/dsh@latest` 自动下载安装；
   - 安装完成后提示重启应用生效。

3. **源码更新（本地 git 仓库）**
   - 菜单栏 `更新 -> 检查更新…` 触发；
   - 自动定位本地仓库，`git fetch` 后对比远程分支；
   - 生成更新报告（提交列表、变更统计、变更文件），可选调用 DeepSeek API 做风险分析；
   - 用户确认后应用自动退出，后台 PowerShell 脚本完成 `git merge --ff-only` → `pnpm install` → 桌面版编译验证 → 备份 release → 重新打包 → 启动新版本；
   - 更新前自动暂存本地已跟踪修改，失败时自动回滚并尝试恢复 release 备份。

### 分层设计

- `src/main.ts` — 接入层：进程生命周期、子进程管理、窗口创建、更新调度、菜单入口。
- `src/updater.ts` — 独立能力层：桌面壳更新与 dsh 更新逻辑。
- `src/source-updater.ts` — 独立能力层：源码更新检查、报告生成、AI 风险分析、更新脚本调度。
- `scripts/update-source.ps1` — 后台更新执行层：git 操作、依赖安装、构建打包、回滚。
- `package.json` / `electron-builder.yml` — 构建、打包与更新源配置。

### 关键决策与取舍

- 使用 Electron 而非 Tauri：本机没有 Rust 工具链，Electron 直接复用 Node 生态。
- 使用 TypeScript：符合仓库 ESM + strict 风格，同时保留独立构建，不进入仓库 aggregate。
- 默认依赖全局 `dsh`：本机已安装，且打包产物不携带 Harness 本体；如需完全自包含，后续可把 `dsh` 及其依赖打入安装包。
- 不修改 Web UI：桌面版只是壳，最大化复用官方 Web 能力。
- 更新源可配置：避免在没有发布渠道时构建/启动失败。

## 影响分析

- 对现有功能：无影响，`apps/desktop` 是新增独立 workspace。
- 对数据/数据库：无影响。
- 对接口/API：无影响。
- 对仓库安装：`pnpm install` 会新增 Electron 依赖下载；`pnpm-workspace.yaml` 放开 Electron 的构建脚本白名单。

## 测试要点

- 核心路径：`pnpm --filter @deepseek-ai/dsh-desktop start` 能启动窗口并加载 Harness UI。
- 边界条件：`dsh` 不在 PATH 时给出明确错误提示。
- 异常路径：端口被占用时提示；关闭窗口后 `dsh` 进程被清理。
- 打包验证：`pnpm --filter @deepseek-ai/dsh-desktop dist` 生成 Windows 安装包/便携 exe，双击可启动。
