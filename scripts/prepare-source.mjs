import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const sourceDir = path.resolve(process.argv[2] ?? 'source')
const version = process.argv[3] || process.env.VERSION || ''

const overlayDesktop = path.join(repoRoot, 'overlay', 'apps', 'desktop')
const targetDesktop = path.join(sourceDir, 'apps', 'desktop')

if (!fs.existsSync(overlayDesktop)) {
  throw new Error(`overlay desktop not found: ${overlayDesktop}`)
}

fs.cpSync(overlayDesktop, targetDesktop, { recursive: true, force: true })

const workspacePath = path.join(sourceDir, 'pnpm-workspace.yaml')
if (fs.existsSync(workspacePath)) {
  let workspace = fs.readFileSync(workspacePath, 'utf8')
  if (!/electron:\s*true/.test(workspace)) {
    workspace = workspace.replace(/(allowBuilds:\n)/, '$1  electron: true\n')
    if (!workspace.includes('electron: true')) {
      workspace += '\nallowBuilds:\n  electron: true\n'
    }
    fs.writeFileSync(workspacePath, workspace)
    console.log('Patched pnpm-workspace.yaml: allow electron build scripts')
  }
} else {
  console.warn('pnpm-workspace.yaml not found, skipping allowBuilds patch')
}

if (version) {
  const pkgPath = path.join(targetDesktop, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  pkg.version = version
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`Set desktop version to ${version}`)
}

console.log(`Prepared source at ${sourceDir}`)
