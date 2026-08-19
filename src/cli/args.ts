export type FailOnSeverity = "major" | "range"

export interface CliOptions {
  target: string | null
  json: boolean
  jsonFile: string | null
  html: boolean
  htmlFile: string | null
  ui: boolean
  workspace: string | null
  top: number
  onlyConflicts: boolean
  full: boolean
  outdated: boolean
  versions: boolean
  changelog: boolean
  changelogLines: number
  concurrency: number
  ignoreDirs: Set<string>
  respectGitignore: boolean
  color: boolean
  help: boolean
  version: boolean
  failOn: FailOnSeverity | null
  port: number
  noOpen: boolean
  watch: boolean
  prComment: boolean
  prCommentFile: string | null
  postPrComment: boolean
  baseJson: string | null
  fix: boolean
  fixStrategy: "highest" | "most-frequent"
  dryRun: boolean
  fixPkg: string | null
  fixTargetVersion: string | null
  unused: boolean
  phantom: boolean
  removeUnused: boolean
  declarePhantoms: boolean
}

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".idea",
  ".vscode",
  ".vercel",
])

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    target: null,
    json: false,
    jsonFile: null,
    html: false,
    htmlFile: null,
    ui: false,
    workspace: null,
    top: 10,
    onlyConflicts: false,
    full: false,
    outdated: false,
    versions: false,
    changelog: false,
    changelogLines: 6,
    concurrency: 8,
    ignoreDirs: new Set(DEFAULT_IGNORE_DIRS),
    respectGitignore: true,
    color: process.stdout.isTTY && !("NO_COLOR" in process.env),
    help: false,
    version: false,
    failOn: null,
    port: 0,
    noOpen: false,
    watch: false,
    prComment: false,
    prCommentFile: null,
    postPrComment: false,
    baseJson: null,
    fix: false,
    fixStrategy: "highest",
    dryRun: false,
    fixPkg: null,
    fixTargetVersion: null,
    unused: false,
    phantom: false,
    removeUnused: false,
    declarePhantoms: false,
  }

  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      opts.help = true
    } else if (arg === "-v" || arg === "--version") {
      opts.version = true
    } else if (arg === "--no-color") {
      opts.color = false
    } else if (arg === "--no-gitignore") {
      opts.respectGitignore = false
    } else if (arg === "--only-conflicts") {
      opts.onlyConflicts = true
    } else if (arg === "--full") {
      opts.full = true
    } else if (arg === "--outdated") {
      opts.outdated = true
    } else if (arg === "--versions") {
      opts.versions = true
    } else if (arg === "--changelog") {
      opts.changelog = true
    } else if (arg === "--no-open") {
      opts.noOpen = true
    } else if (arg === "--watch") {
      opts.watch = true
    } else if (arg === "--fix" || arg === "fix") {
      opts.fix = true
    } else if (arg === "--unused" || arg === "unused") {
      opts.unused = true
    } else if (arg === "--phantom" || arg === "phantom") {
      opts.phantom = true
    } else if (arg === "--remove-unused") {
      opts.removeUnused = true
    } else if (arg === "--declare-phantoms") {
      opts.declarePhantoms = true
    } else if (arg === "--dry-run") {
      opts.dryRun = true
    } else if (arg.startsWith("--strategy=")) {
      const s = arg.split("=")[1]
      opts.fixStrategy = s === "most-frequent" ? "most-frequent" : "highest"
    } else if (arg.startsWith("--pkg=")) {
      opts.fixPkg = arg.split("=").slice(1).join("=")
    } else if (arg.startsWith("--target-version=")) {
      opts.fixTargetVersion = arg.split("=").slice(1).join("=")
    } else if (arg === "--post-pr-comment") {
      opts.postPrComment = true
      opts.prComment = true
    } else if (arg === "--pr-comment") {
      opts.prComment = true
    } else if (arg.startsWith("--pr-comment=")) {
      opts.prComment = true
      opts.prCommentFile = arg.split("=").slice(1).join("=")
    } else if (arg.startsWith("--base-json=")) {
      opts.baseJson = arg.split("=").slice(1).join("=")
    } else if (arg.startsWith("--changelog-lines=")) {
      const n = Number(arg.split("=")[1])
      opts.changelogLines = Number.isFinite(n) && n > 0 ? n : 6
    } else if (arg.startsWith("--concurrency=")) {
      const n = Number(arg.split("=")[1])
      opts.concurrency = Number.isFinite(n) && n > 0 ? n : 8
    } else if (arg.startsWith("--top=")) {
      const n = Number(arg.split("=")[1])
      opts.top = Number.isFinite(n) && n >= 0 ? n : 10
    } else if (arg.startsWith("--workspace=")) {
      opts.workspace = arg.split("=").slice(1).join("=")
    } else if (arg.startsWith("--fail-on=")) {
      const value = arg.split("=")[1]
      opts.failOn = value === "major" || value === "range" ? value : null
    } else if (arg.startsWith("--port=")) {
      opts.port = Number(arg.split("=")[1]) || 0
    } else if (arg === "--json") {
      opts.json = true
    } else if (arg.startsWith("--json=")) {
      opts.json = true
      opts.jsonFile = arg.split("=").slice(1).join("=")
    } else if (arg === "--html") {
      opts.html = true
    } else if (arg.startsWith("--html=")) {
      opts.html = true
      opts.htmlFile = arg.split("=").slice(1).join("=")
    } else if (arg === "--ui") {
      opts.ui = true
    } else if (arg.startsWith("--ignore-dir=")) {
      for (const d of arg.split("=")[1].split(",")) {
        if (d) opts.ignoreDirs.add(d)
      }
    } else if (arg === "ui") {
      opts.ui = true
    } else if (arg === "html") {
      opts.html = true
    } else if (arg === "json") {
      opts.json = true
    } else if (!arg.startsWith("-")) {
      if (!opts.target) opts.target = arg
    }
  }

  return opts
}

export function printHelp(): void {
  console.log(`pkg-audit — scan a monorepo's package.json files and cross-check versions

Usage:
  pkg-audit [dir] [options]
  pkg-audit fix [dir]          # automatically resolve and align version conflicts
  pkg-audit ui [dir]           # alias of --ui
  pkg-audit html [dir]         # write standalone HTML report
  pkg-audit json [dir]         # machine output

Options:
  --fix                  Align conflicting dependency versions across all workspaces
  --strategy=<strategy>  Fix strategy: 'highest' (default) or 'most-frequent'
  --dry-run              Preview changes without modifying package.json files
  --pkg=<name>           Limit fix to a single package name
  --target-version=<ver> Specify custom target version to align to (used with --pkg)
  --unused               Scan source files and show unused & phantom dependencies
  --remove-unused        Automatically remove unused dependencies from package.json
  --declare-phantoms     Automatically declare phantom dependencies in package.json
  --json[=file]          Emit JSON (stdout, or to file if given)
  --html[=file]          Write standalone HTML report (default: pkg-audit-report.html)
  --pr-comment[=file]    Generate GitHub PR comment markdown (to stdout or file)
  --post-pr-comment      Automatically post/update PR sticky comment in GitHub Actions
  --base-json=file       Compare with base branch JSON audit to compute delta
  --ui                   Open local dashboard in browser
  --workspace=<name>     Full dependency detail for one workspace (name or path)
  --full                 Full dependency matrix for every workspace
  --outdated             Check versions against the npm registry (needs internet)
  --versions             Show EVERY dependency with current vs latest npm version
  --changelog            With --outdated, fetch GitHub release notes per package
  --changelog-lines=N    Max lines of release notes to show per package (default 6)
  --concurrency=N        Parallel registry requests for --outdated/--versions (default 8)
  --top=N                Show N most-shared dependencies (default 10, 0 to hide)
  --only-conflicts       Skip the workspace list, show only conflicts
  --ignore-dir=a,b       Extra directory names to skip
  --no-gitignore         Don't honor .gitignore files (respected by default)
  --no-color             Disable ANSI colors
  --no-open              Don't auto-open browser with --ui
  --port=N               Port for --ui server (default: auto)
  --watch                Rescan on package.json changes (with --ui)
  --fail-on=major|range  Exit with code 2 if conflicts at this severity or worse
  -h, --help             Show this help
  -v, --version          Show version`)
}
