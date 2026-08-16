param(
  [string]$ParamsFile
)

$ErrorActionPreference = 'Stop'

if (-not $ParamsFile -or -not (Test-Path $ParamsFile)) {
  Write-Host '缺少参数文件'
  exit 1
}

$params = Get-Content -Raw -Path $ParamsFile | ConvertFrom-Json
$repoRoot = $params.repoRoot
$remote = $params.config.remote
$remoteBranch = $params.remoteBranch
$oldCommit = $params.oldCommit
$originalExe = $params.originalExe
$isPackaged = $params.isPackaged
$autoStash = $params.config.autoStash
$backupRelease = $params.config.backupRelease
$logFile = $params.logFile

$logDir = Split-Path $logFile -Parent
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 自动更新开始" -Encoding UTF8

function Write-Log {
  param([string]$Message)
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Write-Host $line
  Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $repoRoot
  )
  $cmdLine = "$FilePath $($Arguments -join ' ')"
  Write-Log ">>> $cmdLine"
  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments *>> $logFile
    if ($LASTEXITCODE -ne 0) {
      throw "命令失败 ($LASTEXITCODE): $cmdLine"
    }
  } finally {
    Pop-Location
  }
}

Write-Log "仓库: $repoRoot"
Write-Log "远程分支: $remoteBranch"

# 等待原桌面进程退出，避免打包时 exe 被占用
$deadline = (Get-Date).AddMinutes(5)
while ($true) {
  $proc = Get-Process -Id $params.pid -ErrorAction SilentlyContinue
  if (-not $proc) {
    break
  }
  if ((Get-Date) -gt $deadline) {
    Write-Log '等待原进程退出超时，取消更新'
    exit 1
  }
  Start-Sleep -Seconds 1
}
Write-Log '原进程已退出'

Set-Location $repoRoot

# 先保存本地已跟踪修改的补丁，用于失败回滚
$patchFile = $null
$localDiff = git diff
if ($LASTEXITCODE -ne 0) {
  throw 'git diff 失败'
}
if ($localDiff) {
  $patchDir = Join-Path $repoRoot 'apps/desktop/update-logs'
  New-Item -ItemType Directory -Force -Path $patchDir | Out-Null
  $patchFile = Join-Path $patchDir "local-changes-$(Get-Date -Format 'yyyyMMdd-HHmmss').patch"
  Set-Content -Path $patchFile -Value $localDiff -Encoding UTF8
  Write-Log "已保存本地修改补丁: $patchFile"
}

# 拉取远程
Invoke-Checked 'git' @('fetch', $remote)

$newCommit = (git rev-parse $remoteBranch).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "无法获取远程提交: $remoteBranch"
}

if ($newCommit -eq $oldCommit) {
  Write-Log '已经是最新，无需更新'
  if ($isPackaged -and $originalExe -and (Test-Path $originalExe)) {
    Start-Process -FilePath $originalExe
  }
  exit 0
}
Write-Log "更新: $oldCommit -> $newCommit"

# 暂存本地已跟踪修改
$stashed = $false
if ($autoStash) {
  $dirty = @(git status --porcelain | Where-Object { $_ -notmatch '^\?\?' })
  if ($LASTEXITCODE -ne 0) {
    throw 'git status 失败'
  }
  if ($dirty.Count -gt 0) {
    Write-Log '检测到本地已跟踪修改，执行 git stash'
    git stash push -m "dsh-desktop-auto-update-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    if ($LASTEXITCODE -ne 0) {
      throw 'git stash 失败'
    }
    $stashed = $true
  }
}

try {
  # 快进合并远程分支
  Invoke-Checked 'git' @('merge', '--ff-only', $remoteBranch)

  # 恢复本地修改（pnpm-workspace.yaml 的 electron 放行依赖它，必须在 install 前恢复）
  if ($stashed) {
    Write-Log '恢复本地修改 git stash pop'
    git stash pop
    if ($LASTEXITCODE -ne 0) {
      throw 'git stash pop 失败，已停止更新以避免破坏本地修改'
    }
    $stashed = $false
  }

  # 安装依赖
  Invoke-Checked 'pnpm' @('install')

  # 桌面版编译验证
  Invoke-Checked 'pnpm' @('--filter', '@deepseek-ai/dsh-desktop', 'build')

  # 备份现有 release
  $releaseDir = Join-Path $repoRoot 'apps/desktop/release'
  if ($backupRelease -and (Test-Path $releaseDir)) {
    $backupDir = "$releaseDir-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Write-Log "备份 release -> $backupDir"
    Copy-Item -Path $releaseDir -Destination $backupDir -Recurse
  }

  # 重新打包
  Invoke-Checked 'pnpm' @('--filter', '@deepseek-ai/dsh-desktop', 'dist')

  # 如果还有未恢复的 stash，尝试恢复
  if ($stashed) {
    Write-Log '恢复剩余 git stash'
    git stash pop
    if ($LASTEXITCODE -ne 0) {
      Write-Log 'WARNING: git stash pop 失败，请手动运行 git stash list 检查'
    }
  }

  # 启动新版本
  if ($isPackaged -and $originalExe -and (Test-Path $originalExe)) {
    Write-Log "启动新版本: $originalExe"
    Start-Process -FilePath $originalExe
  } else {
    Write-Log '未启动新版本（当前为开发模式或找不到原 exe），请手动启动'
  }

  Write-Log '自动更新完成'
  exit 0
} catch {
  $errorMessage = $_.Exception.Message
  Write-Log "自动更新失败: $errorMessage"
  Write-Log '开始回滚'

  # 回滚代码到更新前
  git reset --hard $oldCommit
  if ($LASTEXITCODE -ne 0) {
    Write-Log 'WARNING: git reset --hard 回滚失败，请手动检查仓库状态'
  }

  # 恢复本地修改
  if ($stashed) {
    Write-Log '尝试从 stash 恢复本地修改'
    git stash pop
    if ($LASTEXITCODE -ne 0) {
      Write-Log 'WARNING: stash pop 失败，请手动运行 git stash list 检查'
    }
  } elseif ($patchFile -and (Test-Path $patchFile)) {
    Write-Log "尝试从补丁恢复本地修改: $patchFile"
    git apply $patchFile
    if ($LASTEXITCODE -ne 0) {
      Write-Log 'WARNING: git apply 恢复补丁失败，请手动处理'
    }
  }

  # 恢复 release 备份
  if ($backupRelease) {
    $releaseDir = Join-Path $repoRoot 'apps/desktop/release'
    $backups = @(Get-ChildItem -Path (Split-Path $releaseDir) -Directory -Filter 'release-backup-*' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    if ($backups.Count -gt 0) {
      $backupDir = $backups[0].FullName
      Write-Log "从备份恢复 release: $backupDir"
      if (Test-Path $releaseDir) {
        Remove-Item -Path $releaseDir -Recurse -Force
      }
      Copy-Item -Path $backupDir -Destination $releaseDir -Recurse
    }
  }

  Write-Log '回滚完成，请查看上面的日志'
  exit 1
}
