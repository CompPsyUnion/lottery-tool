/**
 * Commit-time guard: entity changes must ship with a new, REGISTERED migration.
 *
 *   node scripts/dist/migration-check.js <commit-msg-file>
 *
 * Ported from unnc-freshmen-verifier-gateway's migration-check.ts, adapted to
 * this repo:
 *  - entity paths are src/entities/** (not server/entities)
 *  - migrations live in src/migrations and must ALSO be registered in the
 *    index.ts barrel (the barrel is what the runtime bundle and the CLI share —
 *    an unregistered migration file would silently never run).
 *
 * Bypass: include "bypass migration check" in the commit message.
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '../..')
const migrationsDir = resolve(rootDir, 'src', 'migrations')

const run = (command: string): string => execSync(command, { cwd: rootDir }).toString().trim()

const fail = (message: string): never => {
  console.error(message)
  console.error('Run: pnpm migration:generate --name=<Name>')
  console.error('To bypass temporarily, include "bypass migration check" in your commit message.')
  process.exit(1)
}

/** 定位 commit message 文件：优先 CLI 参数（相对路径按 git 顶层解析——
 * 钩子可能传相对路径，此前按本包目录 resolve 会落空导致 bypass 失效），
 * 否则用 git rev-parse --git-path 定位（兼容 worktree 等非标准 .git 布局） */
const locateCommitMsg = (): string | null => {
  const msgArg = process.argv[2]
  if (msgArg) {
    const gitTop = run('git rev-parse --show-toplevel')
    const byArg = resolve(gitTop, msgArg)
    if (existsSync(byArg)) return byArg
  }
  try {
    const byGit = resolve(run('git rev-parse --git-path COMMIT_EDITMSG'))
    if (existsSync(byGit)) return byGit
  } catch {
    /* 非钩子环境（无 git）时忽略 */
  }
  return null
}

/** 实体目录的暂存 diff 是否包含非注释行变更（纯注释改动不触发迁移要求）。
 * pathspec 用 ':/' 仓库根相对形式——脚本 cwd 在 apps/service，普通前缀会被
 * 按相对 cwd 解析而落空 */
const hasSubstantiveEntityChange = (): boolean => {
  const diff = run("git diff --cached -U0 -- ':/apps/service/src/entities/'")
  if (!diff) return false
  const isCommentLine = (l: string) => {
    const t = l.replace(/^[+-]\s*/, '').trimStart()
    return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')
  }
  return diff
    .split('\n')
    .some(
      (l) =>
        (l.startsWith('+') || l.startsWith('-')) &&
        !l.startsWith('+++') &&
        !l.startsWith('---') &&
        !isCommentLine(l),
    )
}

const main = (): void => {
  // Optional commit-message bypass (first CLI arg, or git's default location).
  const commitMsgPath = locateCommitMsg()
  if (commitMsgPath) {
    if (readFileSync(commitMsgPath, 'utf8').includes('bypass migration check')) {
      console.log('bypass migration check directive found in commit message, skipping.')
      return
    }
  }

  const staged = run('git diff --cached --name-status')
  if (!staged) return

  const lines = staged.split('\n').map((l) => l.trim().split(/\s+/))

  const entityStaged = lines.some(([, p]) => p?.startsWith('apps/service/src/entities/'))
  if (!entityStaged || !hasSubstantiveEntityChange()) return

  const migrationAdded = lines.some(
    ([status, p]) => status === 'A' && p?.startsWith('apps/service/src/migrations/'),
  )
  if (!migrationAdded) {
    fail('Entity changes detected without a new migration.')
  }

  // Every migration file (except the barrel + README) must be imported by the
  // barrel — that import list is what the server actually executes.
  const files = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter((f) => /^\d+-.*\.ts$/.test(f))
    : []
  if (!files.length) fail('No migration files found after entity changes.')

  const barrel = readFileSync(resolve(migrationsDir, 'index.ts'), 'utf8')
  const unregistered = files.filter((f) => !barrel.includes(`./${f.replace(/\.ts$/, '')}`))
  if (unregistered.length) {
    fail(`Migration file(s) not registered in src/migrations/index.ts: ${unregistered.join(', ')}`)
  }
}

main()
