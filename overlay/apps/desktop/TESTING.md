# DeepSeek Harness Desktop 测试计划

## 测试范围

桌面版是官方 Web UI 的 Electron 外壳，测试重点为启动链路、进程清理、自动更新配置与异常提示。

## 测试用例

| 编号 | 用例 | 步骤 | 预期结果 | 状态 |
|---|---|---|---|---|
| T1 | 类型构建 | `pnpm --filter @deepseek-ai/dsh-desktop build` | tsc 编译成功，生成 `dist/main.js`、`dist/updater.js` | ✅ 通过 |
| T2 | Electron 二进制 | `electron --version` | 输出 `v43.4.0` | ✅ 通过 |
| T3 | 启动并加载 UI | 端口 3080 空闲时运行 `pnpm --filter @deepseek-ai/dsh-desktop start` | 自动启动 `dsh web`，窗口加载 `http://127.0.0.1:3080` | ⏳ 待执行（当前 3080 被正在运行的 Harness 占用） |
| T4 | 关闭清理 | 启动 T3 后关闭窗口 | `dsh` 进程树被 `taskkill /T /F` 清理 | ⏳ 待执行 |
| T5 | dsh 更新检查 | 打包后启动，npm 存在新版 `@deepseek-ai/dsh` | 弹窗提示新版本，确认后自动安装 | ⏳ 待执行（需发布源/新版本） |
| T6 | 桌面壳更新 | 设置 `DSH_DESKTOP_UPDATE_URL` 后启动 | 自动检查并下载新版本，完成后提示重启 | ⏳ 待执行（需更新源） |
| T7 | dsh 缺失提示 | 临时移除 PATH 中的 `dsh` 后启动 | 弹出“无法启动 dsh”错误框 | ⏳ 待执行 |
| T8 | 服务超时提示 | 使用不可达端口/命令启动 | 弹出“等待 dsh 服务超时”错误框并退出 | ⏳ 待执行 |
| T9 | Windows 打包 | `pnpm --filter @deepseek-ai/dsh-desktop dist`（使用 `ELECTRON_BUILDER_BINARIES_MIRROR`） | 生成 NSIS 安装包、便携 exe、`rc.yml` 更新元数据 | ✅ 通过 |
| T10 | 自动换端口 | 3080 被占用时启动桌面版 | 自动选用 3081 等空闲端口，当前 3080 服务不受影响 | ⏳ 待执行 |
| T11 | 源码更新检查 | 在 git 仓库内运行桌面版，点击菜单 `更新 -> 检查更新…` | 生成更新报告，显示提交数、变更文件，并支持 AI 风险分析 | ⏳ 待执行 |
| T12 | 自动更新与回滚 | 有远程新提交时确认更新 | 应用自动关闭，后台完成拉源码、装依赖、重新打包并启动新版本；失败时自动回滚 | ⏳ 待执行 |

## 结论

- 已通过：T1、T2。
- 未执行项需要真实桌面环境、空闲端口或发布更新源；建议用户在本机空闲时按表执行。
