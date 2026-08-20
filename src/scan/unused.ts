import * as fs from "node:fs"
import * as path from "node:path"
import type { DepType, PhantomDependency, UnusedDependency, UnusedScanResult, Workspace } from "../types.js"
import { compareSemver } from "./fix.js"

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

/**
 * Common CLI binary name alias mappings to package names (e.g. tsc -> typescript, swc -> @swc/cli).
 */
const KNOWN_CLI_ALIASES: Record<string, string> = {
  tsc: "typescript",
  swc: "@swc/cli",
  changeset: "@changesets/cli",
  changesets: "@changesets/cli",
  commitlint: "@commitlint/cli",
  depcruise: "dependency-cruiser",
  "drizzle-kit": "drizzle-kit",
  prisma: "prisma",
  "graphql-codegen": "@graphql-codegen/cli",
}

/**
 * Strips single-line, multi-line, and HTML comments from code while preserving string literals.
 * Prevents commented-out imports from masking real dead dependencies.
 */
export function stripComments(code: string): string {
  let result = ""
  let inSingleLineComment = false
  let inMultiLineComment = false
  let inHtmlComment = false
  let inString: "'" | '"' | "`" | null = null
  let inRegex = false
  let inRegexCharClass = false
  let isEscaped = false
  let lastNonWsChar = ""

  // Characters after which a '/' introduces a regular expression literal rather than division
  const REGEX_PRECEDING_CHARS = new Set([
    "(",
    "[",
    "{",
    ";",
    ",",
    ":",
    "=",
    "!",
    "?",
    "&",
    "|",
    "^",
    "~",
    "+",
    "-",
    "*",
    "%",
    "<",
    ">",
    "/",
  ])

  for (let i = 0; i < code.length; i++) {
    const char = code[i]!
    const next = code[i + 1]

    if (inSingleLineComment) {
      if (char === "\n" || char === "\r") {
        inSingleLineComment = false
        result += char
      }
      continue
    }

    if (inMultiLineComment) {
      if (char === "*" && next === "/") {
        inMultiLineComment = false
        i++ // skip '/'
      }
      continue
    }

    if (inHtmlComment) {
      if (char === "-" && next === "-" && code[i + 2] === ">") {
        inHtmlComment = false
        i += 2 // skip '->'
      }
      continue
    }

    if (inString !== null) {
      result += char
      if (isEscaped) {
        isEscaped = false
      } else if (char === "\\") {
        isEscaped = true
      } else if (char === inString) {
        inString = null
        lastNonWsChar = char
      }
      continue
    }

    if (inRegex) {
      result += char
      if (isEscaped) {
        isEscaped = false
      } else if (char === "\\") {
        isEscaped = true
      } else if (char === "[" && !inRegexCharClass) {
        inRegexCharClass = true
      } else if (char === "]" && inRegexCharClass) {
        inRegexCharClass = false
      } else if (char === "/" && !inRegexCharClass) {
        inRegex = false
        lastNonWsChar = "/"
      } else if (char === "\n" || char === "\r") {
        inRegex = false // regex literals cannot span lines in JS
      }
      continue
    }

    // Check for comment starts
    if (char === "/" && next === "/") {
      inSingleLineComment = true
      i++ // skip next '/'
      continue
    }

    if (char === "/" && next === "*") {
      inMultiLineComment = true
      i++ // skip next '*'
      continue
    }

    // Check for regex literal start vs division operator
    if (char === "/") {
      const canStartRegex = lastNonWsChar === "" || REGEX_PRECEDING_CHARS.has(lastNonWsChar)
      if (canStartRegex) {
        inRegex = true
        inRegexCharClass = false
        isEscaped = false
        result += char
        continue
      }
    }

    if (char === "<" && next === "!" && code[i + 2] === "-" && code[i + 3] === "-") {
      inHtmlComment = true
      i += 3 // skip '!--'
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = char
      result += char
      continue
    }

    result += char
    if (!/\s/.test(char)) {
      lastNonWsChar = char
    }
  }

  return result
}

/**
 * Determines whether a file is a project configuration file based on specific naming patterns.
 */
export function isConfigurationFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  if (lower === "package.json" || lower === "turbo.json" || lower === "nx.json" || lower === "biome.json") {
    return true
  }
  if (lower.startsWith("tsconfig") && lower.endsWith(".json")) return true
  if (lower.startsWith("jsconfig") && lower.endsWith(".json")) return true
  if (/(?:^|\.)config\.[a-z0-9]+$/i.test(lower)) return true
  if (lower.startsWith(".") && (lower.endsWith("rc") || lower.includes("rc."))) return true
  return false
}

/**
 * Determines if a package is a dev tool based on dev dependency type or common tooling naming patterns.
 */
export function isDevToolPackage(name: string, type: DepType): boolean {
  if (type === "dev" || type === "peer") return true
  const lower = name.toLowerCase()

  // Types, linters, bundlers, testing tools, and compilers
  if (
    lower.startsWith("@types/") ||
    lower.startsWith("@typescript-eslint/") ||
    lower.startsWith("@eslint/") ||
    lower.startsWith("@biomejs/") ||
    lower.startsWith("@babel/") ||
    lower.startsWith("@swc/") ||
    lower.startsWith("@playwright/") ||
    lower.startsWith("@testing-library/") ||
    lower.startsWith("@storybook/") ||
    lower.startsWith("eslint") ||
    lower.startsWith("prettier") ||
    lower.startsWith("stylelint") ||
    lower.startsWith("postcss") ||
    lower.startsWith("tailwind") ||
    lower.endsWith("-plugin") ||
    lower.endsWith("-preset") ||
    lower.endsWith("-loader") ||
    lower.endsWith("-cli")
  ) {
    return true
  }

  return false
}

const TSCONFIG_ALIAS_CACHE = new Map<string, string[]>()

/**
 * Loads compilerOptions.paths from tsconfig.json / jsconfig.json to dynamically match custom path aliases.
 */
export function loadPathAliasMatcher(wsDir: string, rootDir: string): (specifier: string) => boolean {
  const aliasPrefixes: string[] = []

  const checkFile = (filePath: string) => {
    const cached = TSCONFIG_ALIAS_CACHE.get(filePath)
    if (cached !== undefined) {
      aliasPrefixes.push(...cached)
      return
    }

    if (!fs.existsSync(filePath)) {
      TSCONFIG_ALIAS_CACHE.set(filePath, [])
      return
    }

    const prefixes: string[] = []
    try {
      const raw = fs.readFileSync(filePath, "utf8")
      const cleanJson = stripComments(raw)
      const parsed = JSON.parse(cleanJson) as {
        compilerOptions?: { paths?: Record<string, string[]> }
      }
      const paths = parsed.compilerOptions?.paths
      if (paths && typeof paths === "object") {
        for (const aliasKey of Object.keys(paths)) {
          const prefix = aliasKey.replace(/\*.*$/, "")
          if (prefix) prefixes.push(prefix)
        }
      }
    } catch {
      // Ignore parse error
    }

    TSCONFIG_ALIAS_CACHE.set(filePath, prefixes)
    aliasPrefixes.push(...prefixes)
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
 * Parses raw import/require/specifier into root package name.
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

// Regex patterns to capture import/require/export specifiers across ES/CJS/CSS/Frameworks (including backticks)
const IMPORT_EXPORT_REGEX =
  /(?:import\s+(?:type\s+)?(?:[\s\w*$,{}]+from\s+)?|export\s+(?:[\s\w*$,{}]+from\s+)?|import\s*\(\s*|require\s*\(\s*|require\.resolve\s*\(\s*|import\s+[`"']|@import\s+[`"'])[`"']([^`"'$]+)[`"']/g

// Regex to capture string literals inside configuration files and dynamic transports
const STRING_LITERAL_REGEX = /[`"'](@?[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)?)[`"']/g

/**
 * Extracts all raw import/require/export specifiers from source content.
 */
export function extractImportSpecifiers(content: string): Set<string> {
  const specifiers = new Set<string>()
  const cleanContent = stripComments(content)
  let match: RegExpExecArray | null

  IMPORT_EXPORT_REGEX.lastIndex = 0
  while ((match = IMPORT_EXPORT_REGEX.exec(cleanContent)) !== null) {
    const specifier = match[1]?.trim()
    if (specifier) {
      specifiers.add(specifier)
    }
  }

  return specifiers
}

/**
 * Extracts all external package names imported in a source file content after stripping comments.
 */
export function extractImportsFromContent(content: string, isAlias?: (spec: string) => boolean): Set<string> {
  const packages = new Set<string>()
  const cleanContent = stripComments(content)
  let match: RegExpExecArray | null

  IMPORT_EXPORT_REGEX.lastIndex = 0
  while ((match = IMPORT_EXPORT_REGEX.exec(cleanContent)) !== null) {
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
 * Extracts all potential package names referenced in configuration files after stripping comments.
 */
export function extractReferencesFromConfig(
  content: string,
  isAlias?: (spec: string) => boolean
): Set<string> {
  const refs = new Set<string>()
  const cleanContent = stripComments(content)
  let match: RegExpExecArray | null

  STRING_LITERAL_REGEX.lastIndex = 0
  while ((match = STRING_LITERAL_REGEX.exec(cleanContent)) !== null) {
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
 * Generic extraction of CLI commands and binary names from package.json "scripts".
 */
export function extractPackagesFromScripts(scriptsRecord?: Record<string, string>): Set<string> {
  const referenced = new Set<string>()
  if (!scriptsRecord) return referenced

  for (const scriptContent of Object.values(scriptsRecord)) {
    const subCommands = scriptContent.split(/[;&|><]+/)
    for (const cmd of subCommands) {
      const tokens = cmd.trim().split(/\s+/)
      for (const token of tokens) {
        const cleanToken = token.trim().replace(/^npx\s+/, "")
        if (!cleanToken) continue

        referenced.add(cleanToken)

        if (KNOWN_CLI_ALIASES[cleanToken]) {
          referenced.add(KNOWN_CLI_ALIASES[cleanToken]!)
        }
      }
    }
  }

  return referenced
}

/**
 * Recursively collects all source and configuration files in a directory,
 * following symlinks safely with cycle protection and strictly skipping child workspace directories.
 */
export async function collectSourceFiles(
  dir: string,
  childWorkspaceDirs: Set<string>,
  visitedDirs: Set<string> = new Set(),
  results: string[] = []
): Promise<string[]> {
  const normalizedDirPath = path.resolve(dir).toLowerCase()
  if (visitedDirs.has(normalizedDirPath)) {
    return results
  }
  visitedDirs.add(normalizedDirPath)

  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    let isDir = entry.isDirectory()
    let isFile = entry.isFile()

    // Follow symlinks safely
    if (entry.isSymbolicLink()) {
      try {
        const stat = await fs.promises.stat(fullPath)
        isDir = stat.isDirectory()
        isFile = stat.isFile()
      } catch {
        continue
      }
    }

    if (isDir) {
      if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith(".")) {
        continue
      }

      const normalizedSub = path.resolve(fullPath).toLowerCase()
      if (childWorkspaceDirs.has(normalizedSub)) {
        continue
      }

      await collectSourceFiles(fullPath, childWorkspaceDirs, visitedDirs, results)
    } else if (isFile) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SOURCE_EXTENSIONS.has(ext) || isConfigurationFile(entry.name)) {
        results.push(fullPath)
      }
    }
  }

  return results
}

/**
 * Checks if a declared package is generically connected to any active package in the workspace
 * via scoped ecosystem, plugin prefix/suffix pairing, or runtime framework conventions.
 */
export function isConnectedEcosystemPackage(
  depName: string,
  activePackages: Set<string>,
  sourceFileExtensions: Set<string>
): boolean {
  const lowerDep = depName.toLowerCase()

  // 1. Scoped Ecosystem Connection (e.g. @fastify/*, @nestjs/*, @opentelemetry/*, @tanstack/*, @aws-sdk/*, @expo/*)
  if (lowerDep.startsWith("@")) {
    const scope = lowerDep.split("/")[0]!
    for (const active of activePackages) {
      if (active.toLowerCase().startsWith(`${scope}/`)) {
        return true
      }
    }
  }

  // 2. Generic Plugin / Preset / Config / Adapter / Driver Suffix Pairing
  const PLUGIN_PREFIX_REGEX =
    /^(@?[a-z0-9_-]+)[/-](?:plugin|preset|config|adapter|driver|theme|reporter|loader|transformer)(?:-[a-z0-9_-]+)?$/i
  const match = lowerDep.match(PLUGIN_PREFIX_REGEX)
  if (match && match[1]) {
    const baseTool = match[1].toLowerCase()
    if (activePackages.has(baseTool)) {
      return true
    }
  }

  // 3. Reverse Plugin Connection: if base tool matches active tool prefix
  for (const active of activePackages) {
    const activeLower = active.toLowerCase()
    if (lowerDep.startsWith(`${activeLower}-`) || lowerDep.startsWith(`@${activeLower}/`)) {
      return true
    }
  }

  // 4. Type Definitions (@types/<pkg>)
  if (lowerDep.startsWith("@types/")) {
    const basePkg = lowerDep.slice(7)
    if (basePkg === "node" && (sourceFileExtensions.has(".ts") || sourceFileExtensions.has(".tsx"))) {
      return true
    }
    if (
      (basePkg === "react" || basePkg === "react-dom") &&
      (sourceFileExtensions.has(".tsx") || sourceFileExtensions.has(".jsx"))
    ) {
      return true
    }
    if (activePackages.has(basePkg)) {
      return true
    }
  }

  // 5. Template & UI Runtimes
  if (
    (lowerDep === "react" || lowerDep === "react-dom" || lowerDep === "preact" || lowerDep === "solid-js") &&
    (sourceFileExtensions.has(".tsx") || sourceFileExtensions.has(".jsx"))
  ) {
    return true
  }

  if (lowerDep === "vue" && sourceFileExtensions.has(".vue")) {
    return true
  }

  if (lowerDep === "svelte" && sourceFileExtensions.has(".svelte")) {
    return true
  }

  // 6. Common Decorator Polyfill
  if (lowerDep === "reflect-metadata" && sourceFileExtensions.has(".ts")) {
    for (const active of activePackages) {
      if (active.includes("nest") || active.includes("typeorm") || active.includes("routing-controllers")) {
        return true
      }
    }
  }

  return false
}

/**
 * Determines the best suggested version for a phantom dependency using a frequency map
 * and tie-breaking by highest semver.
 */
function getSuggestedVersion(
  depName: string,
  globalDepVersions: Map<string, { version: string; workspace: string }[]>,
  isInternalMonorepoPkg: boolean
): { suggestedVersion: string | null; hoistedFrom: string | null } {
  if (isInternalMonorepoPkg) {
    return { suggestedVersion: "workspace:*", hoistedFrom: "Monorepo workspace" }
  }

  const matches = globalDepVersions.get(depName) ?? []
  if (matches.length === 0) {
    return { suggestedVersion: null, hoistedFrom: null }
  }

  // If root workspace declares it, prefer root version
  const rootMatch = matches.find((m) => m.workspace === ".")
  if (rootMatch) {
    return { suggestedVersion: rootMatch.version, hoistedFrom: "Root workspace" }
  }

  // Tally frequency of each version across all workspaces
  const versionCounts = new Map<string, number>()
  const versionFirstWorkspace = new Map<string, string>()

  for (const m of matches) {
    versionCounts.set(m.version, (versionCounts.get(m.version) ?? 0) + 1)
    if (!versionFirstWorkspace.has(m.version)) {
      versionFirstWorkspace.set(m.version, m.workspace)
    }
  }

  let bestVersion = matches[0]!.version
  let maxCount = 0

  for (const [ver, count] of versionCounts.entries()) {
    if (count > maxCount) {
      maxCount = count
      bestVersion = ver
    } else if (count === maxCount) {
      if (compareSemver(ver, bestVersion) > 0) {
        bestVersion = ver
      }
    }
  }

  return {
    suggestedVersion: bestVersion,
    hoistedFrom: versionFirstWorkspace.get(bestVersion) ?? matches[0]!.workspace,
  }
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

  // Index all workspace absolute directory paths for boundary isolation
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

  // Process workspaces concurrently using a worker pool for high performance on large monorepos
  const WORKSPACE_CONCURRENCY = 24
  const queue = [...workspaces]

  const processWorkspace = async (ws: Workspace) => {
    const wsDir = ws.absPath ? path.dirname(ws.absPath) : path.resolve(rootDir, ws.relPath)

    const childWorkspaceDirs = new Set<string>()
    for (const [otherRelPath, otherAbsDir] of allWorkspaceDirPaths.entries()) {
      if (otherRelPath !== ws.relPath) {
        childWorkspaceDirs.add(otherAbsDir)
      }
    }

    const isAlias = loadPathAliasMatcher(wsDir, rootDir)
    const sourceFiles = await collectSourceFiles(wsDir, childWorkspaceDirs)

    // Map: importedPackage -> Set of relative file paths where imported
    const importedInFiles = new Map<string, Set<string>>()
    const configReferences = new Set<string>()
    const fileExtensionsPresent = new Set<string>()

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

    // Read source files in parallel chunks
    const FILE_CHUNK_SIZE = 32
    for (let i = 0; i < sourceFiles.length; i += FILE_CHUNK_SIZE) {
      const chunk = sourceFiles.slice(i, i + FILE_CHUNK_SIZE)
      await Promise.all(
        chunk.map(async (filePath) => {
          const ext = path.extname(filePath).toLowerCase()
          if (ext) fileExtensionsPresent.add(ext)

          let content = ""
          try {
            content = await fs.promises.readFile(filePath, "utf8")
          } catch {
            return
          }

          const basename = path.basename(filePath)
          const isConfigFile = isConfigurationFile(basename)

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
        })
      )
    }

    // Combine all actively referenced packages in this workspace
    const activePackages = new Set<string>([...importedInFiles.keys(), ...configReferences])
    const wsPhantoms: PhantomDependency[] = []
    const wsUnused: UnusedDependency[] = []

    // 1. Detect Phantom (Undeclared) Dependencies
    for (const [importedPkg, fileSet] of importedInFiles.entries()) {
      // Valid if declared in this workspace's manifest
      if (ws.deps[importedPkg]) continue

      // Valid if self-reference (workspace imports its own package name)
      if (ws.name && ws.name === importedPkg) continue

      const isInternalMonorepoPkg = monorepoPackageNames.has(importedPkg)
      const { suggestedVersion, hoistedFrom } = getSuggestedVersion(
        importedPkg,
        globalDepVersions,
        isInternalMonorepoPkg
      )

      wsPhantoms.push({
        name: importedPkg,
        workspace: ws.relPath,
        files: Array.from(fileSet).sort(),
        suggestedVersion,
        hoistedFrom,
      })
    }

    // 2. Detect Unused Dependencies (excluding peer and optional dependencies)
    for (const [depName, depRecord] of Object.entries(ws.deps)) {
      // Peer and optional dependencies are contracts, not mandatory imports
      if (depRecord.type === "peer" || depRecord.type === "optional") {
        continue
      }

      // Used if directly imported in source code
      if (importedInFiles.has(depName)) continue

      // Used if referenced in config files or scripts
      if (configReferences.has(depName)) continue

      // Used if connected generically via ecosystem, plugin pairing, type definition, or template runtime
      if (isConnectedEcosystemPackage(depName, activePackages, fileExtensionsPresent)) {
        continue
      }

      const isDevTool = isDevToolPackage(depName, depRecord.type)

      wsUnused.push({
        name: depName,
        workspace: ws.relPath,
        version: depRecord.version,
        type: depRecord.type,
        isDevTool,
      })
    }

    return {
      filesCount: sourceFiles.length,
      phantoms: wsPhantoms,
      unused: wsUnused,
    }
  }

  const workers = Array.from({ length: WORKSPACE_CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const ws = queue.shift()
      if (!ws) break
      const res = await processWorkspace(ws)
      totalFilesScanned += res.filesCount
      phantoms.push(...res.phantoms)
      unused.push(...res.unused)
    }
  })

  await Promise.all(workers)

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
