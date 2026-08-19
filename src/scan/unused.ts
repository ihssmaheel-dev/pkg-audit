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
  ".json",
])

const CONFIG_FILE_NAMES = new Set([
  "package.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "tsconfig.build.json",
  "tsconfig.node.json",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.js",
  ".prettierrc.cjs",
  "prettier.config.js",
  "prettier.config.mjs",
  "prettier.config.cjs",
  "vite.config.ts",
  "vite.config.js",
  "vitest.config.ts",
  "vitest.config.js",
  "jest.config.js",
  "jest.config.ts",
  "tailwind.config.js",
  "tailwind.config.ts",
  "tailwind.config.mjs",
  "postcss.config.js",
  "postcss.config.cjs",
  "postcss.config.mjs",
  "babel.config.js",
  "babel.config.json",
  ".babelrc",
  "metro.config.js",
  "app.json",
  "app.config.js",
  "app.config.ts",
  "turbo.json",
  "nx.json",
  ".commitlintrc.json",
  ".commitlintrc.js",
  "commitlint.config.js",
  "commitlint.config.ts",
  "commitlint.config.mjs",
  "commitlint.config.cjs",
  ".dependency-cruiser.js",
  ".dependency-cruiser.cjs",
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
  /^pino-loki$/,
  /^reflect-metadata$/,
  /^react-native-css-interop$/,
  /^react-native-screens$/,
  /^expo-status-bar$/,
  /^taze$/,
  /^tsx$/,
  /^migrate-mongo$/,
  /^testcontainers$/,
  /^fast-check$/,
  /^jsdom$/,
  /^msw$/,
]

export function isDevToolPackage(name: string, type: DepType): boolean {
  if (type === "dev") return true
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
 * Parses raw import/require/plugin specifier into root package name.
 */
export function extractPackageName(specifier: string, isAlias?: (spec: string) => boolean): string | null {
  const trimmed = specifier.trim()
  if (!trimmed) return null

  if (
    trimmed.startsWith(".") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("~") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("$")
  ) {
    return null
  }

  if (isAlias && isAlias(trimmed)) {
    return null
  }

  if (trimmed.startsWith("node:") || trimmed.startsWith("bun:") || trimmed.startsWith("deno:")) {
    return null
  }

  if (NODE_BUILTINS.has(trimmed)) {
    return null
  }

  if (trimmed.startsWith("@")) {
    if (trimmed.startsWith("@/")) return null
    const parts = trimmed.split("/")
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`
    }
    return null
  }

  const firstSlash = trimmed.indexOf("/")
  if (firstSlash !== -1) {
    return trimmed.slice(0, firstSlash)
  }

  return trimmed
}

// Regex patterns to capture import/require/export/plugin specifiers across ES/CJS/CSS/Frameworks
const IMPORT_EXPORT_REGEX =
  /(?:import\s+(?:type\s+)?(?:[\s\w*$,{}]+from\s+)?|export\s+(?:[\s\w*$,{}]+from\s+)?|import\s*\(\s*|require\s*\(\s*|require\.resolve\s*\(\s*|import\s+["']|@import\s+["'])["']([^"']+)["']/g

// Regex to capture string literals inside transport configs, plugins, and frameworks
const STRING_LITERAL_REGEX = /["'](@?[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)?)["']/g

/**
 * Extracts all external package names imported in a source file content.
 */
export function extractImportsFromContent(content: string, isAlias?: (spec: string) => boolean): Set<string> {
  const packages = new Set<string>()
  let match: RegExpExecArray | null

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
 * Extracts references from config files (e.g. tsconfig extends, eslint plugins, tailwind plugins, pino transports).
 */
export function extractReferencesFromConfig(
  content: string,
  isAlias?: (spec: string) => boolean
): Set<string> {
  const refs = new Set<string>()
  let match: RegExpExecArray | null

  STRING_LITERAL_REGEX.lastIndex = 0
  while ((match = STRING_LITERAL_REGEX.exec(content)) !== null) {
    const specifier = match[1]
    if (!specifier) continue
    const pkg = extractPackageName(specifier, isAlias)
    if (pkg) {
      refs.add(pkg)
    }
  }

  return refs
}

/**
 * Extracts CLI binary names and packages from package.json "scripts".
 */
export function extractPackagesFromScripts(scriptsRecord?: Record<string, string>): Set<string> {
  const referenced = new Set<string>()
  if (!scriptsRecord) return referenced

  const CLI_NAME_MAP: Record<string, string> = {
    tsc: "typescript",
    eslint: "eslint",
    prettier: "prettier",
    turbo: "turbo",
    vitest: "vitest",
    vite: "vite",
    tsx: "tsx",
    taze: "taze",
    nodemon: "nodemon",
    concurrently: "concurrently",
    "migrate-mongo": "migrate-mongo",
    changeset: "@changesets/cli",
    changesets: "@changesets/cli",
    commitlint: "@commitlint/cli",
    husky: "husky",
    "lint-staged": "lint-staged",
    "dependency-cruiser": "dependency-cruiser",
    depcruise: "dependency-cruiser",
    tailwindcss: "tailwindcss",
    swc: "@swc/cli",
    cross_env: "cross-env",
    "cross-env": "cross-env",
    rimraf: "rimraf",
    next: "next",
    expo: "expo",
    jest: "jest",
    playwright: "@playwright/test",
    cypress: "cypress",
  }

  for (const scriptContent of Object.values(scriptsRecord)) {
    const tokens = scriptContent.split(/[\s;&|><=]+/)
    for (const token of tokens) {
      const cleanToken = token.trim().replace(/^npx\s+/, "")
      if (CLI_NAME_MAP[cleanToken]) {
        referenced.add(CLI_NAME_MAP[cleanToken]!)
      } else if (cleanToken.startsWith("@") || cleanToken.length > 2) {
        referenced.add(cleanToken)
      }
    }
  }

  return referenced
}

/**
 * Recursively collects all source and config files within a workspace directory,
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
      if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith(".")) {
        continue
      }

      const normalizedPath = path.resolve(fullPath).toLowerCase()
      if (childWorkspaceDirs.has(normalizedPath)) {
        continue
      }

      await collectSourceFiles(fullPath, childWorkspaceDirs, results)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SOURCE_EXTENSIONS.has(ext) || CONFIG_FILE_NAMES.has(entry.name)) {
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
    const configReferences = new Set<string>()

    // Check package.json scripts for active CLI tool references
    let pkgJsonScripts: Record<string, string> | undefined
    try {
      const pkgJsonPath = ws.absPath ?? path.join(wsDir, "package.json")
      if (fs.existsSync(pkgJsonPath)) {
        const raw = fs.readFileSync(pkgJsonPath, "utf8")
        const parsed = JSON.parse(raw) as { scripts?: Record<string, string> }
        pkgJsonScripts = parsed.scripts
      }
    } catch {
      // Ignore
    }

    const scriptReferencedPkgs = extractPackagesFromScripts(pkgJsonScripts)
    for (const p of scriptReferencedPkgs) {
      configReferences.add(p)
    }

    for (const filePath of sourceFiles) {
      let content = ""
      try {
        content = await fs.promises.readFile(filePath, "utf8")
      } catch {
        continue
      }

      const basename = path.basename(filePath)
      const isConfigFile = CONFIG_FILE_NAMES.has(basename)

      if (isConfigFile) {
        const configRefs = extractReferencesFromConfig(content, isAlias)
        for (const ref of configRefs) {
          configReferences.add(ref)
        }
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

      const isInternalMonorepoPkg = monorepoPackageNames.has(importedPkg)
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
      // Used if imported in any source file
      if (importedInFiles.has(depName)) continue

      // Used if referenced in config files or scripts
      if (configReferences.has(depName)) continue

      // Check if it's a type definition for a package that IS used or declared
      if (depName.startsWith("@types/")) {
        const basePkg = depName.slice(7) // e.g. @types/jsonwebtoken -> jsonwebtoken
        if (
          basePkg === "node" ||
          ws.deps[basePkg] ||
          importedInFiles.has(basePkg) ||
          configReferences.has(basePkg)
        ) {
          continue
        }
      }

      // Framework plugins / JSX runtimes / transports
      if (
        (depName === "react" || depName === "react-dom") &&
        (importedInFiles.has("react") ||
          importedInFiles.has("react-dom") ||
          sourceFiles.some((f) => f.endsWith(".tsx") || f.endsWith(".jsx")))
      ) {
        continue
      }

      if (
        (depName === "pino-pretty" || depName === "pino-loki") &&
        (ws.deps["pino"] || importedInFiles.has("pino"))
      ) {
        continue
      }

      if (
        (depName === "reflect-metadata" || depName === "rxjs") &&
        (ws.deps["@nestjs/core"] || ws.deps["@nestjs/common"] || importedInFiles.has("@nestjs/common"))
      ) {
        continue
      }

      if (
        (depName === "expo-status-bar" ||
          depName === "react-native-screens" ||
          depName === "react-native-css-interop") &&
        (ws.deps["expo"] || ws.deps["react-native"] || ws.deps["nativewind"])
      ) {
        continue
      }

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
