import * as fs from "node:fs"
import * as path from "node:path"
import type { DepType, PhantomDependency, UnusedDependency, UnusedScanResult, Workspace } from "../types.js"

const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".nuxt",
  ".svelte-kit",
  ".astro",
  "coverage",
  ".cache",
  ".output",
  ".system_generated",
  ".husky",
  ".vscode",
  ".idea",
])

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".vue",
  ".svelte",
  ".astro",
])

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "test",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
])

const DEV_TOOL_PATTERNS = [
  /^@types\//,
  /^eslint(-plugin-|-config-)?/,
  /^@eslint\//,
  /^@typescript-eslint\//,
  /^prettier(-plugin-)?/,
  /^@biomejs\//,
  /^stylelint/,
  /^typescript$/,
  /^tsup$/,
  /^vite$/,
  /^vitest$/,
  /^jest$/,
  /^playwright$/,
  /^@playwright\//,
  /^cypress$/,
  /^turbo$/,
  /^nx$/,
  /^husky$/,
  /^lint-staged$/,
  /^rimraf$/,
  /^concurrently$/,
  /^cross-env$/,
  /^nodemon$/,
  /^tailwindcss$/,
  /^@tailwindcss\//,
  /^postcss$/,
  /^autoprefixer$/,
  /^sass$/,
  /^less$/,
  /^@babel\//,
  /^@swc\//,
  /^changesets/,
  /^@changesets\//,
  /^@commitlint\//,
  /^commitlint/,
  /^dependency-cruiser/,
  /^type-fest$/,
  /^pino-pretty$/,
  /^reflect-metadata$/,
]

export function isDevToolPackage(name: string, type: DepType): boolean {
  if (type === "dev") return true
  // Even in prod dependencies, some tools/types/polyfills are known non-import or framework runtime plugins
  return DEV_TOOL_PATTERNS.some((pattern) => pattern.test(name))
}

/**
 * Loads tsconfig / jsconfig compilerOptions.paths to detect custom path aliases.
 */
export function loadPathAliasMatcher(wsDir: string, rootDir: string): (specifier: string) => boolean {
  const aliasPrefixes: string[] = []

  const checkFile = (filePath: string) => {
    if (!fs.existsSync(filePath)) return
    try {
      const raw = fs.readFileSync(filePath, "utf8")
      // Strip comments for JSON parsing
      const cleanJson = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "")
      const parsed = JSON.parse(cleanJson) as {
        compilerOptions?: { paths?: Record<string, string[]> }
      }
      const paths = parsed.compilerOptions?.paths
      if (paths && typeof paths === "object") {
        for (const aliasKey of Object.keys(paths)) {
          const prefix = aliasKey.replace(/\*.*$/, "")
          if (prefix) aliasPrefixes.push(prefix)
        }
      }
    } catch {
      // Ignore parse error
    }
  }

  checkFile(path.join(wsDir, "tsconfig.json"))
  checkFile(path.join(wsDir, "jsconfig.json"))
  if (wsDir !== rootDir) {
    checkFile(path.join(rootDir, "tsconfig.json"))
    checkFile(path.join(rootDir, "jsconfig.json"))
  }

  return (specifier: string): boolean => {
    // Universal path alias conventions
    if (
      specifier.startsWith("@/") ||
      specifier.startsWith("~/") ||
      specifier.startsWith("#/") ||
      specifier.startsWith("$/") ||
      specifier.startsWith("@@/")
    ) {
      return true
    }

    return aliasPrefixes.some((prefix) => specifier.startsWith(prefix))
  }
}

/**
 * Parses raw import/require specifier into root package name.
 * Returns null if the specifier is a relative/local path, an alias, or a Node/runtime builtin.
 */
export function extractPackageName(specifier: string, isAlias?: (spec: string) => boolean): string | null {
  const trimmed = specifier.trim()
  if (!trimmed) return null

  // Ignore relative imports and absolute local paths
  if (
    trimmed.startsWith(".") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("~") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("$")
  ) {
    return null
  }

  // Check custom tsconfig path aliases
  if (isAlias && isAlias(trimmed)) {
    return null
  }

  // Ignore node:*, bun:*, deno:* protocols
  if (trimmed.startsWith("node:") || trimmed.startsWith("bun:") || trimmed.startsWith("deno:")) {
    return null
  }

  // Ignore Node standard builtins
  if (NODE_BUILTINS.has(trimmed)) {
    return null
  }

  // Scoped package: @scope/pkg or @scope/pkg/subpath
  if (trimmed.startsWith("@")) {
    if (trimmed.startsWith("@/")) return null // Path alias
    const parts = trimmed.split("/")
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`
    }
    return null
  }

  // Non-scoped package: pkg or pkg/subpath
  const firstSlash = trimmed.indexOf("/")
  if (firstSlash !== -1) {
    return trimmed.slice(0, firstSlash)
  }

  return trimmed
}

// Regex patterns to capture import/require/export/plugin specifiers across ES/CJS/CSS/Frameworks
const IMPORT_EXPORT_REGEX =
  /(?:import\s+(?:type\s+)?(?:[\s\w*$,{}]+from\s+)?|export\s+(?:[\s\w*$,{}]+from\s+)?|import\s*\(\s*|require\s*\(\s*|require\.resolve\s*\(\s*|import\s+["']|@import\s+["'])["']([^"']+)["']/g

/**
 * Extracts all external package names imported in a source file content.
 */
export function extractImportsFromContent(content: string, isAlias?: (spec: string) => boolean): Set<string> {
  const packages = new Set<string>()
  let match: RegExpExecArray | null

  // Reset regex index
  IMPORT_EXPORT_REGEX.lastIndex = 0

  while ((match = IMPORT_EXPORT_REGEX.exec(content)) !== null) {
    const specifier = match[1]
    if (!specifier) continue
    const pkg = extractPackageName(specifier, isAlias)
    if (pkg) {
      packages.add(pkg)
    }
  }

  return packages
}

/**
 * Recursively collects all source files within a workspace directory,
 * explicitly skipping child workspace directories to prevent cross-workspace contamination.
 */
export async function collectSourceFiles(
  dir: string,
  childWorkspaceDirs: Set<string>,
  results: string[] = []
): Promise<string[]> {
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Skip ignored directories (node_modules, dist, etc.)
      if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith(".")) {
        continue
      }

      // CRITICAL: Skip any subdirectory that is another registered workspace in the monorepo
      const normalizedPath = path.resolve(fullPath).toLowerCase()
      if (childWorkspaceDirs.has(normalizedPath)) {
        continue
      }

      await collectSourceFiles(fullPath, childWorkspaceDirs, results)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SOURCE_EXTENSIONS.has(ext)) {
        results.push(fullPath)
      }
    }
  }

  return results
}

/**
 * Scans all workspaces in the monorepo for Phantom (undeclared) and Unused (dead) dependencies.
 */
export async function scanWorkspaceDependencies(
  rootDir: string,
  workspaces: Workspace[]
): Promise<UnusedScanResult> {
  const phantoms: PhantomDependency[] = []
  const unused: UnusedDependency[] = []
  let totalFilesScanned = 0

  // Index all workspace absolute directory paths for strict boundary isolation
  const allWorkspaceDirPaths = new Map<string, string>()
  const monorepoPackageNames = new Set<string>()

  for (const ws of workspaces) {
    const wsDir = ws.absPath ? path.dirname(ws.absPath) : path.resolve(rootDir, ws.relPath)
    allWorkspaceDirPaths.set(ws.relPath, path.resolve(wsDir).toLowerCase())
    if (ws.name) {
      monorepoPackageNames.add(ws.name)
    }
  }

  // Index all declared dependencies across the monorepo for hoisting lookups
  const globalDepVersions = new Map<string, { version: string; workspace: string }[]>()
  for (const ws of workspaces) {
    for (const [depName, depRecord] of Object.entries(ws.deps)) {
      if (!globalDepVersions.has(depName)) {
        globalDepVersions.set(depName, [])
      }
      globalDepVersions.get(depName)!.push({
        version: depRecord.version,
        workspace: ws.relPath,
      })
    }
  }

  for (const ws of workspaces) {
    const wsDir = ws.absPath ? path.dirname(ws.absPath) : path.resolve(rootDir, ws.relPath)

    // Build the set of OTHER workspace directories that this workspace must NOT traverse into
    const childWorkspaceDirs = new Set<string>()
    for (const [otherRelPath, otherAbsDir] of allWorkspaceDirPaths.entries()) {
      if (otherRelPath !== ws.relPath) {
        childWorkspaceDirs.add(otherAbsDir)
      }
    }

    const isAlias = loadPathAliasMatcher(wsDir, rootDir)
    const sourceFiles = await collectSourceFiles(wsDir, childWorkspaceDirs)
    totalFilesScanned += sourceFiles.length

    // Map: importedPackage -> Set of relative file paths where imported
    const importedInFiles = new Map<string, Set<string>>()

    for (const filePath of sourceFiles) {
      let content = ""
      try {
        content = await fs.promises.readFile(filePath, "utf8")
      } catch {
        continue
      }

      const fileImports = extractImportsFromContent(content, isAlias)
      const relFilePath = path.relative(rootDir, filePath).replace(/\\/g, "/")

      for (const pkg of fileImports) {
        if (!importedInFiles.has(pkg)) {
          importedInFiles.set(pkg, new Set())
        }
        importedInFiles.get(pkg)!.add(relFilePath)
      }
    }

    // 1. Detect Phantom (Undeclared) Dependencies
    for (const [importedPkg, fileSet] of importedInFiles.entries()) {
      // Valid if declared in this workspace's manifest
      if (ws.deps[importedPkg]) continue

      // Valid if self-reference (workspace imports its own package name)
      if (ws.name && ws.name === importedPkg) continue

      // If it's a monorepo workspace package that is imported but missing in deps:
      const isInternalMonorepoPkg = monorepoPackageNames.has(importedPkg)

      // Look up hoisting source
      const globalMatches = globalDepVersions.get(importedPkg) ?? []
      let suggestedVersion: string | null = null
      let hoistedFrom: string | null = null

      if (isInternalMonorepoPkg) {
        suggestedVersion = "workspace:*"
        hoistedFrom = "Monorepo workspace"
      } else {
        const rootMatch = globalMatches.find((m) => m.workspace === ".")
        if (rootMatch) {
          suggestedVersion = rootMatch.version
          hoistedFrom = "Root workspace"
        } else if (globalMatches.length > 0) {
          suggestedVersion = globalMatches[0]!.version
          hoistedFrom = globalMatches[0]!.workspace
        }
      }

      phantoms.push({
        name: importedPkg,
        workspace: ws.relPath,
        files: Array.from(fileSet).sort(),
        suggestedVersion,
        hoistedFrom,
      })
    }

    // 2. Detect Unused Dependencies
    for (const [depName, depRecord] of Object.entries(ws.deps)) {
      // If it was imported anywhere in this workspace's source files, it is used
      if (importedInFiles.has(depName)) continue

      const isDevTool = isDevToolPackage(depName, depRecord.type)

      unused.push({
        name: depName,
        workspace: ws.relPath,
        version: depRecord.version,
        type: depRecord.type,
        isDevTool,
      })
    }
  }

  // Sort phantoms and unused for consistent, deterministic outputs
  phantoms.sort((a, b) => a.workspace.localeCompare(b.workspace) || a.name.localeCompare(b.name))
  unused.sort((a, b) => {
    // Prioritize production unused dependencies first
    if (a.type === "prod" && b.type !== "prod") return -1
    if (a.type !== "prod" && b.type === "prod") return 1
    return a.workspace.localeCompare(b.workspace) || a.name.localeCompare(b.name)
  })

  return {
    phantoms,
    unused,
    scannedFilesCount: totalFilesScanned,
  }
}
