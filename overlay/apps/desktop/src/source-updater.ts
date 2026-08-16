import { app, dialog, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

interface SourceUpdateConfig {
  enabled: boolean
  remote: string
  branch: string
  sourceDir: string
  ai: {
    apiKeyEnv: string
    model: string
    baseUrl: string
  }
  autoStash: boolean
  backupRelease: boolean
}

interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

const DEFAULT_CONFIG: SourceUpdateConfig = {
  enabled: true,
  remote: 'origin',
  branch: '',
  sourceDir: '',
  ai: {
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
  },
  autoStash: true,
  backupRelease: true,
}

const CONFIG_FILE = 'source-update.config.json'
const REPORT_DIR = 'update-reports'
const UPDATE_SCRIPT = 'scripts/update-source.ps1'

function runCommand(command: string, args: string[], cwd: string, timeoutMs = 120_000): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: error.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

function findRepoRoot(startPath: string): string | null {
  let current = resolve(startPath)
  try {
    if (!existsSync(current)) {
      return null
    }
  } catch {
    return null
  }

  for (;;) {
    try {
      if (existsSync(join(current, '.git'))) {
        return current
      }
    } catch {
      return null
    }
    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

function loadConfig(repoRoot: string): SourceUpdateConfig {
  const configPath = join(repoRoot, 'apps', 'desktop', CONFIG_FILE)
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<SourceUpdateConfig>
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        ai: { ...DEFAULT_CONFIG.ai, ...(parsed.ai ?? {}) },
      }
    }
  } catch (error) {
    console.error('[source-updater] failed to read config:', error)
  }
  return DEFAULT_CONFIG
}

async function getRemoteBranch(repoRoot: string, config: SourceUpdateConfig): Promise<string | null> {
  const upstream = await runCommand('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoRoot)
  if (upstream.code === 0 && upstream.stdout.trim()) {
    return upstream.stdout.trim()
  }

  const branch = config.branch || (await runCommand('git', ['branch', '--show-current'], repoRoot)).stdout.trim()
  if (!branch) {
    return null
  }
  return `${config.remote}/${branch}`
}

function markImportantFiles(report: string): string {
  const importantPatterns = [
    /(^|\/)package\.json$/m,
    /(^|\/)pnpm-lock\.yaml$/m,
    /(^|\/)pnpm-workspace\.yaml$/m,
    /(^|\/)electron-builder\.yml$/m,
    /(^|\/)apps\/desktop\//m,
    /(^|\/)packages\/(core|session|agent-loop|compaction|context|subagent|workflow)\//m,
    /(^|\/)vendor\//m,
  ]
  const lines = report.split('\n')
  const marked: string[] = []
  for (const line of lines) {
    if (importantPatterns.some((pattern) => pattern.test(line))) {
      marked.push(line)
    }
  }
  return marked.length > 0 ? `\n### 重点关注文件\n\n${marked.join('\n')}\n` : ''
}

async function buildChangeReport(repoRoot: string, config: SourceUpdateConfig): Promise<{ report: string; count: number; remoteBranch: string; oldCommit: string; newCommit: string } | null> {
  const remoteBranch = await getRemoteBranch(repoRoot, config)
  if (!remoteBranch) {
    return null
  }

  const fetchResult = await runCommand('git', ['fetch', config.remote], repoRoot, 180_000)
  if (fetchResult.code !== 0) {
    throw new Error(`git fetch 失败：${fetchResult.stderr.trim() || fetchResult.stdout.trim()}`)
  }

  const oldResult = await runCommand('git', ['rev-parse', 'HEAD'], repoRoot)
  const newResult = await runCommand('git', ['rev-parse', remoteBranch], repoRoot)
  if (oldResult.code !== 0 || newResult.code !== 0) {
    throw new Error(`无法获取提交号：${oldResult.stderr || newResult.stderr}`)
  }

  const oldCommit = oldResult.stdout.trim()
  const newCommit = newResult.stdout.trim()
  if (oldCommit === newCommit) {
    return { report: '', count: 0, remoteBranch, oldCommit, newCommit }
  }

  const logResult = await runCommand('git', ['log', '--oneline', '--no-merges', `${oldCommit}..${remoteBranch}`], repoRoot)
  const statResult = await runCommand('git', ['diff', '--stat', `${oldCommit}...${remoteBranch}`], repoRoot)
  const nameResult = await runCommand('git', ['diff', '--name-only', `${oldCommit}...${remoteBranch}`], repoRoot)

  const commits = logResult.stdout.trim().split('\n').filter(Boolean)
  const stats = statResult.stdout.trim()
  const files = nameResult.stdout.trim().split('\n').filter(Boolean)
  const count = commits.length

  const report = [
    `# DeepSeek Harness 源码更新报告`,
    ``,
    `- 检查时间：${new Date().toISOString()}`,
    `- 本地提交：${oldCommit}`,
    `- 远程提交：${newCommit}`,
    `- 远程分支：${remoteBranch}`,
    `- 新提交数：${count}`,
    ``,
    `## 提交列表`,
    ``,
    commits.length > 0 ? commits.join('\n') : '（无新提交）',
    ``,
    `## 变更统计`,
    ``,
    stats || '（无统计信息）',
    ``,
    `## 变更文件`,
    ``,
    files.length > 0 ? files.join('\n') : '（无文件变更）',
    ``,
    markImportantFiles(files.join('\n')),
  ].join('\n')

  return { report, count, remoteBranch, oldCommit, newCommit }
}

async function analyzeWithAI(report: string, config: SourceUpdateConfig): Promise<string> {
  const apiKey = process.env[config.ai.apiKeyEnv] || process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return '未配置 AI API Key，跳过自动风险分析。可把报告发给 AI 助手检查。'
  }

  const systemPrompt =
    '你是一名资深的 DeepSeek Harness 仓库维护工程师。用户准备把远程源码更新拉取到本地并重新打包 Electron 桌面版。' +
    '请分析下面的更新报告，重点指出：可能导致项目无法启动、pnpm install 失败、TypeScript 编译失败、Electron 打包失败、' +
    '或破坏本地 apps/desktop 桌面版的变更。最后给出风险等级：低 / 中 / 高，以及建议（直接更新 / 谨慎更新 / 先手动检查）。' +
    '请用中文简洁回答。'

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: report },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!response.ok) {
      return `AI 分析请求失败：HTTP ${response.status}`
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    return content?.trim() || 'AI 分析未返回内容。'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `AI 分析失败：${message}`
  }
}

function saveReport(repoRoot: string, report: string): string {
  const reportDir = join(repoRoot, 'apps', 'desktop', REPORT_DIR)
  mkdirSync(reportDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = join(reportDir, `update-report-${timestamp}.md`)
  writeFileSync(reportPath, report, 'utf8')
  return reportPath
}

function writeUpdateParams(repoRoot: string, config: SourceUpdateConfig, params: Record<string, unknown>): string {
  const paramsPath = join(tmpdir(), `dsh-source-update-${Date.now()}.json`)
  writeFileSync(paramsPath, JSON.stringify({ ...params, repoRoot, config }, null, 2), 'utf8')
  return paramsPath
}

async function startSourceUpdate(repoRoot: string, config: SourceUpdateConfig, oldCommit: string, remoteBranch: string): Promise<void> {
  const scriptPath = join(repoRoot, 'apps', 'desktop', UPDATE_SCRIPT)
  if (!existsSync(scriptPath)) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'DeepSeek Harness 更新',
      message: '找不到自动更新脚本',
      detail: `预期路径：${scriptPath}\n请确认 apps/desktop/scripts/update-source.ps1 存在。`,
    })
    return
  }

  const params = {
    pid: process.pid,
    oldCommit,
    remoteBranch,
    originalExe: app.getPath('exe'),
    isPackaged: app.isPackaged,
    logFile: join(repoRoot, 'apps', 'desktop', 'update-logs', `update-${Date.now()}.log`),
  }
  const paramsPath = writeUpdateParams(repoRoot, config, params)

  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ParamsFile', paramsPath],
    {
      cwd: repoRoot,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    },
  )
  child.unref()

  await dialog.showMessageBox({
    type: 'info',
    title: 'DeepSeek Harness 更新',
    message: '自动更新已启动',
    detail: '应用即将关闭，后台将自动完成：拉取源码 → 安装依赖 → 重新打包 → 启动新版本。\n日志会写入 apps/desktop/update-logs/。',
  })

  app.quit()
}

export async function checkForSourceUpdate(): Promise<void> {
  const candidates = [
    process.env.DSH_DESKTOP_SOURCE_DIR,
    app.getPath('exe'),
    app.getAppPath(),
    process.cwd(),
  ].filter((value): value is string => Boolean(value))

  let repoRoot: string | null = null
  for (const candidate of candidates) {
    repoRoot = findRepoRoot(candidate)
    if (repoRoot) {
      break
    }
  }

  if (!repoRoot) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'DeepSeek Harness 更新',
      message: '找不到本地源码仓库',
      detail: '请确认桌面版位于 deepseek-harness 仓库内运行，或设置环境变量 DSH_DESKTOP_SOURCE_DIR 指向仓库根目录。',
    })
    return
  }

  const config = loadConfig(repoRoot)
  if (!config.enabled) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'DeepSeek Harness 更新',
      message: '源码更新功能未启用',
      detail: `如需启用，请编辑 ${join(repoRoot, 'apps', 'desktop', CONFIG_FILE)} 将 enabled 设为 true。`,
    })
    return
  }

  try {
    const result = await buildChangeReport(repoRoot, config)
    if (!result) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'DeepSeek Harness 更新',
        message: '无法确定远程更新分支',
        detail: '请检查当前 git 分支和 remote 配置。',
      })
      return
    }

    if (result.count === 0) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'DeepSeek Harness 更新',
        message: '当前已是最新版本',
        detail: `本地 ${result.oldCommit} 已与 ${result.remoteBranch} 一致。`,
      })
      return
    }

    let report = result.report
    const aiAnalysis = await analyzeWithAI(report, config)
    report += `\n## AI 风险分析\n\n${aiAnalysis}\n`

    const reportPath = saveReport(repoRoot, report)
    const preview = report.split('\n').slice(0, 40).join('\n')

    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'DeepSeek Harness 更新',
      message: `发现 ${result.count} 个新提交`,
      detail: `报告已保存：\n${reportPath}\n\n${preview}\n\n${aiAnalysis}`,
      buttons: ['开始更新', '打开报告', '取消'],
      defaultId: 0,
      cancelId: 2,
    })

    if (response === 0) {
      await startSourceUpdate(repoRoot, config, result.oldCommit, result.remoteBranch)
    } else if (response === 1) {
      const error = await shell.openPath(reportPath)
      if (error) {
        console.error('[source-updater] failed to open report:', error)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await dialog.showMessageBox({
      type: 'error',
      title: 'DeepSeek Harness 更新',
      message: '检查更新失败',
      detail: message,
    })
  }
}
