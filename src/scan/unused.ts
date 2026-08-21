import * as fs from "node:fs"
import * as path from "node:path"
import ts from "typescript"
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
])

// Extensions that get their <script> block extracted before AST parsing.
// This is the same idea as Knip's per-framework "compiler" plugins: pull
// out the region that's actually valid JS/TS instead of writing a second
// text-matching engine per framework.
const SCRIPT_BLOCK_EXTENSIONS = new Set([".vue", ".svelte", ".astro"])

// Extensions that are JSON (or JSON-with-comments/trailing-commas), parsed
// structurally rather than as JS.
const JSON_CONFIG_EXTENSIONS = new Set([".json"])

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
 * Object/property keys under which a bare string in a JS/TS or JSON config
 * file is treated as a package reference (e.g. `plugins: ["tailwindcss-animate"]`,
 * `"extends": "eslint-config-airbnb"`). Deliberately narrow — this is the
 * direct fix for the old STRING_LITERAL_REGEX matching arbitrary quoted
 * strings anywhere in a config file.
 */
const CONFIG_REFERENCE_KEYS = new Set([
  "plugins",
  "presets",
  "extends",
  "extend",
  "parser",
  "processor",
  "reporter",
  "reporters",
  "transform",
  "preprocessor",
  "preprocessors",
  "compiler",
  "compilers",
  "loader",
  "loaders",
  "transport",
  "transports",
  "target",
  "targets",
  "adapter",
  "adapters",
  "driver",
  "drivers",
  "runner",
  "runners",
])

/**
 * Determines whether a file is a JS/TS project configuration file.
 */
export function isConfigurationFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  if (
    lower === "package.json" ||
    lower === "turbo.json" ||
    lower === "nx.json" ||
    lower === "biome.json" ||
    lower === "lerna.json" ||
    lower === "pnpm-workspace.yaml"
  ) {
    return true
  }
  if (lower.startsWith("tsconfig") && lower.endsWith(".json")) return true
  if (lower.startsWith("jsconfig") && lower.endsWith(".json")) return true
  if (
    lower.startsWith(".oxlintrc") ||
    lower.startsWith(".eslintrc") ||
    lower.startsWith(".prettierrc") ||
    lower.startsWith(".stylelintrc") ||
    lower.startsWith(".swcrc") ||
    lower.startsWith(".babelrc")
  ) {
    return true
  }
  if (/(?:^|\.)(?:config|rc)\.(?:[mc]?[jt]sx?|json|ya?ml|cjs|mjs)$/i.test(lower)) return true
  return false
}

/**
 * Determines if a file is a test, fixture, mock, or documentation file.
 */
export function isTestOrDocumentationFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase()
  if (
    normalized.includes("/__tests__/") ||
    normalized.includes("/__mocks__/") ||
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    normalized.includes("/e2e/") ||
    normalized.includes("/playwright/") ||
    normalized.includes("/cypress/") ||
    /\.(?:test|spec|cy|e2e)\.[mc]?[jt]sx?$/i.test(normalized)
  ) {
    return true
  }
  if (
    normalized.includes("/docs/") ||
    normalized.includes("/documentation/") ||
    normalized.includes("/stories/") ||
    /\.(?:stories|story)\.[mc]?[jt]sx?$/i.test(normalized)
  ) {
    return true
  }
  return false
}

/**
 * Determines if a package is a dev tool based on dev dependency type or common tooling naming patterns.
 */
export function isDevToolPackage(name: string, type: DepType): boolean {
  if (type === "dev" || type === "peer") return true
  const lower = name.toLowerCase()

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
 * Parses a JSON/JSONC config file (tsconfig.json-style: comments and
 * trailing commas allowed) using TypeScript's own tolerant JSON parser
 * instead of a hand-rolled comment stripper. This is the exact same
 * function `tsc` uses internally to read tsconfig.json.
 */
function parseJsoncFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return undefined
  let raw: string
  try {
    raw = fs.readFileSync(filePath, "utf8")
  } catch {
    return undefined
  }
  const { config, error } = ts.parseConfigFileTextToJson(filePath, raw)
  if (error) return undefined
  return config
}

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

    const prefixes: string[] = []
    const parsed = parseJsoncFile(filePath) as
      { compilerOptions?: { paths?: Record<string, string[]> } } | undefined
    const paths = parsed?.compilerOptions?.paths
    if (paths && typeof paths === "object") {
      for (const aliasKey of Object.keys(paths)) {
        const prefix = aliasKey.replace(/\*.*$/, "")
        if (prefix) prefixes.push(prefix)
      }
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

  if (isAlias && isAlias(trimmed)) return null
  if (trimmed.startsWith("node:") || trimmed.startsWith("bun:") || trimmed.startsWith("deno:")) return null
  if (NODE_BUILTINS.has(trimmed)) return null

  if (trimmed.startsWith("@")) {
    if (trimmed.startsWith("@/")) return null
    const parts = trimmed.split("/")
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`
    return null
  }

  const firstSlash = trimmed.indexOf("/")
  if (firstSlash !== -1) return trimmed.slice(0, firstSlash)
  return trimmed
}

// ---------------------------------------------------------------------------
// AST-based extraction. Replaces the old stripComments() + regex lexer.
// Comments, string contents, and regex literals structurally cannot be
// mistaken for import specifiers here, because we only ever look at real
// syntax nodes the parser produced.
// ---------------------------------------------------------------------------

function extractScriptBlock(content: string, ext: string): string {
  if (!SCRIPT_BLOCK_EXTENSIONS.has(ext)) return content
  const lower = content.toLowerCase()
  const scriptStart = lower.indexOf("<script")
  if (scriptStart === -1) return ""
  const tagEnd = lower.indexOf(">", scriptStart)
  if (tagEnd === -1) return ""
  const scriptEnd = lower.indexOf("</script>", tagEnd)
  if (scriptEnd === -1) return ""
  return content.slice(tagEnd + 1, scriptEnd)
}

function getScriptKind(ext: string): ts.ScriptKind {
  switch (ext) {
    case ".tsx":
      return ts.ScriptKind.TSX
    case ".ts":
    case ".mts":
    case ".cts":
      return ts.ScriptKind.TS
    case ".jsx":
      return ts.ScriptKind.JSX
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS
    // .vue/.svelte/.astro <script> blocks: TSX is permissive enough to
    // parse both plain JS and TS content without inspecting lang="...".
    case ".vue":
    case ".svelte":
    case ".astro":
      return ts.ScriptKind.TSX
    default:
      return ts.ScriptKind.TS
  }
}

function collectStringLiteralsFromExpr(expr: ts.Expression, out: string[]): void {
  if (ts.isStringLiteralLike(expr)) {
    out.push(expr.text)
  } else if (ts.isArrayLiteralExpression(expr)) {
    for (const el of expr.elements) collectStringLiteralsFromExpr(el, out)
  }
  // Nested calls like babel-style `["plugin-name", { options }]` are
  // handled by the array branch above; the options object itself is not
  // walked, so option values never get mistaken for package refs.
}

/**
 * Single AST walk that extracts BOTH real import/require specifiers AND
 * config-style bare-string references (only under known risk keys like
 * `plugins`/`extends`/`presets`), for one JS/TS/JSX/TSX/Vue/Svelte/Astro file.
 */
export function parseSourceFile(
  content: string,
  filePath: string,
  isAlias?: (spec: string) => boolean
): { imports: Set<string>; configRefs: Set<string> } {
  const imports = new Set<string>()
  const configRefs = new Set<string>()

  const ext = path.extname(filePath).toLowerCase()
  const source = extractScriptBlock(content, ext)
  if (!source.trim()) return { imports, configRefs }

  let sourceFile: ts.SourceFile
  try {
    sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, false, getScriptKind(ext))
  } catch {
    return { imports, configRefs }
  }

  const addImport = (raw: string | undefined) => {
    if (!raw) return
    const pkg = extractPackageName(raw, isAlias)
    if (pkg) imports.add(pkg)
  }

  const addConfigRefs = (raws: string[]) => {
    for (const raw of raws) {
      const pkg = extractPackageName(raw, isAlias)
      if (pkg) configRefs.add(pkg)
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) addImport(node.moduleSpecifier.text)
    } else if (ts.isImportEqualsDeclaration(node)) {
      const ref = node.moduleReference
      if (ts.isExternalModuleReference(ref) && ts.isStringLiteralLike(ref.expression)) {
        addImport(ref.expression.text)
      }
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        addImport(node.moduleSpecifier.text)
      }
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const expr = node.expression
      const isRequireCall = ts.isIdentifier(expr) && expr.text === "require"
      const isRequireResolve =
        ts.isPropertyAccessExpression(expr) &&
        ts.isIdentifier(expr.expression) &&
        expr.expression.text === "require" &&
        expr.name.text === "resolve"

      if ((isDynamicImport || isRequireCall || isRequireResolve) && node.arguments.length > 0) {
        const arg = node.arguments[0]
        if (arg && ts.isStringLiteralLike(arg)) addImport(arg.text)
      }
    } else if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      // Config-style: `plugins: ["a", "b"]`, `extends: "eslint-config-x"`
      const keyName = ts.isIdentifier(node.name)
        ? node.name.text
        : ts.isStringLiteralLike(node.name)
          ? node.name.text
          : null
      if (keyName && CONFIG_REFERENCE_KEYS.has(keyName) && ts.isPropertyAssignment(node)) {
        const collected: string[] = []
        collectStringLiteralsFromExpr(node.initializer, collected)
        addConfigRefs(collected)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  for (const ref of sourceFile.typeReferenceDirectives ?? []) {
    addImport(ref.fileName)
  }

  return { imports, configRefs }
}

/**
 * Strips single-line, multi-line, and HTML comments from code while preserving string literals.
 */
export function stripComments(code: string): string {
  let result = ""
  let inSingle = false
  let inMulti = false
  let inStr: string | null = null
  let inRegex = false
  let inRegexClass = false
  let isEsc = false
  let lastNonWs = ""

  const REGEX_PRECEDING = new Set([
    "(",
    ",",
    "=",
    ":",
    "[",
    "!",
    "&",
    "|",
    "?",
    "+",
    "-",
    "~",
    "*",
    "%",
    "<",
    ">",
    "/",
  ])

  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!
    const next = code[i + 1]

    if (inSingle) {
      if (ch === "\n" || ch === "\r") {
        inSingle = false
        result += ch
      }
      continue
    }
    if (inMulti) {
      if (ch === "*" && next === "/") {
        inMulti = false
        i++
      }
      continue
    }
    if (inStr) {
      result += ch
      if (isEsc) {
        isEsc = false
      } else if (ch === "\\") {
        isEsc = true
      } else if (ch === inStr) {
        inStr = null
        lastNonWs = ch
      }
      continue
    }
    if (inRegex) {
      result += ch
      if (isEsc) {
        isEsc = false
      } else if (ch === "\\") {
        isEsc = true
      } else if (ch === "[" && !inRegexClass) {
        inRegexClass = true
      } else if (ch === "]" && inRegexClass) {
        inRegexClass = false
      } else if (ch === "/" && !inRegexClass) {
        inRegex = false
        lastNonWs = "/"
      } else if (ch === "\n" || ch === "\r") {
        inRegex = false
      }
      continue
    }

    if (ch === "/" && next === "/") {
      inSingle = true
      i++
      continue
    }
    if (ch === "/" && next === "*") {
      inMulti = true
      i++
      continue
    }
    if (ch === "/") {
      const canBeRegex = lastNonWs === "" || REGEX_PRECEDING.has(lastNonWs)
      if (canBeRegex) {
        inRegex = true
        inRegexClass = false
        isEsc = false
        result += ch
        continue
      }
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch
      result += ch
      continue
    }

    result += ch
    if (!/\s/.test(ch)) {
      lastNonWs = ch
    }
  }
  return result
}

/**
 * Extracts raw import specifiers from source content.
 */
export function extractImportSpecifiers(content: string, filePath = "unknown.ts"): Set<string> {
  const specifiers = new Set<string>()
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        specifiers.add(node.moduleSpecifier.text)
      }
    } else if (ts.isCallExpression(node)) {
      const expr = node.expression
      const isDynamicImport = expr.kind === ts.SyntaxKind.ImportKeyword
      const isRequireCall = ts.isIdentifier(expr) && expr.text === "require"
      const isRequireResolve =
        ts.isPropertyAccessExpression(expr) &&
        ts.isIdentifier(expr.expression) &&
        expr.expression.text === "require" &&
        expr.name.text === "resolve"

      if ((isDynamicImport || isRequireCall || isRequireResolve) && node.arguments.length > 0) {
        const arg = node.arguments[0]
        if (arg && ts.isStringLiteralLike(arg)) {
          specifiers.add(arg.text)
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return specifiers
}

/**
 * Backward-compatible wrapper: import specifiers only.
 */
export function extractImportsFromContent(content: string, isAlias?: (spec: string) => boolean): Set<string> {
  return parseSourceFile(content, "unknown.ts", isAlias).imports
}

/**
 * Walks a parsed JSON config value, collecting string leaves that sit
 * under a known risk key (plugins/extends/presets/...), instead of
 * matching every quoted string in the file.
 */
function collectJsonConfigReferences(
  value: unknown,
  refs: Set<string>,
  isAlias: ((spec: string) => boolean) | undefined,
  underRiskKey: boolean
): void {
  if (typeof value === "string") {
    if (underRiskKey) {
      const pkg = extractPackageName(value, isAlias)
      if (pkg) refs.add(pkg)
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonConfigReferences(item, refs, isAlias, underRiskKey)
    return
  }
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      collectJsonConfigReferences(val, refs, isAlias, CONFIG_REFERENCE_KEYS.has(key))
    }
  }
}

/**
 * Extracts config-style package references from either a JSON config file
 * or a JS/TS config file. Structurally scoped (see CONFIG_REFERENCE_KEYS)
 * rather than matching any quoted string in the file.
 */
export function extractReferencesFromConfig(
  content: string,
  filePath = "config.ts",
  isAlias?: (spec: string) => boolean
): Set<string> {
  const ext = path.extname(filePath).toLowerCase()

  if (JSON_CONFIG_EXTENSIONS.has(ext) || path.basename(filePath).toLowerCase().startsWith(".eslintrc")) {
    let config: unknown
    try {
      const parsed = ts.parseConfigFileTextToJson(filePath.replace(/\\/g, "/"), content)
      if (parsed.error || parsed.config === undefined) return new Set()
      config = parsed.config
    } catch {
      return new Set()
    }
    const refs = new Set<string>()
    collectJsonConfigReferences(config, refs, isAlias, false)
    return refs
  }

  // JS/TS config file: real imports are captured by parseSourceFile's
  // `imports` set already (handled at the call site); this covers only
  // the bare-string config-key patterns.
  return parseSourceFile(content, filePath, isAlias).configRefs
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
  if (visitedDirs.has(normalizedDirPath)) return results
  visitedDirs.add(normalizedDirPath)

  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  const subDirs: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    let isDir = entry.isDirectory()
    let isFile = entry.isFile()

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
      if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith(".")) continue
      const normalizedSub = path.resolve(fullPath).toLowerCase()
      if (childWorkspaceDirs.has(normalizedSub)) continue
      subDirs.push(fullPath)
    } else if (isFile) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SOURCE_EXTENSIONS.has(ext) || isConfigurationFile(entry.name)) {
        results.push(fullPath)
      }
    }
  }

  if (subDirs.length > 0) {
    await Promise.all(subDirs.map((sub) => collectSourceFiles(sub, childWorkspaceDirs, visitedDirs, results)))
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

  if (activePackages.has(depName) || activePackages.has(lowerDep)) return true

  if (lowerDep.startsWith("@")) {
    const scope = lowerDep.split("/")[0]!
    for (const active of activePackages) {
      if (active.toLowerCase().startsWith(`${scope}/`)) return true
    }
  }

  const PLUGIN_PREFIX_REGEX =
    /^(@?[a-z0-9_-]+)[/-](?:plugin|preset|config|adapter|driver|theme|reporter|loader|transformer)(?:-[a-z0-9_-]+)?$/i
  const match = lowerDep.match(PLUGIN_PREFIX_REGEX)
  if (match && match[1]) {
    const baseTool = match[1].toLowerCase()
    if (activePackages.has(baseTool)) return true
  }

  for (const active of activePackages) {
    const activeLower = active.toLowerCase()
    if (lowerDep.startsWith(`${activeLower}-`) || lowerDep.startsWith(`@${activeLower}/`)) return true
  }

  if (lowerDep.startsWith("@types/")) {
    const basePkg = lowerDep.slice(7)
    if (basePkg === "node" && (sourceFileExtensions.has(".ts") || sourceFileExtensions.has(".tsx")))
      return true
    if (
      (basePkg === "react" || basePkg === "react-dom") &&
      (sourceFileExtensions.has(".tsx") || sourceFileExtensions.has(".jsx"))
    ) {
      return true
    }
    if (activePackages.has(basePkg)) return true
  }

  if (
    (lowerDep === "react" || lowerDep === "react-dom" || lowerDep === "preact" || lowerDep === "solid-js") &&
    (sourceFileExtensions.has(".tsx") || sourceFileExtensions.has(".jsx"))
  ) {
    return true
  }

  if (lowerDep === "vue" && sourceFileExtensions.has(".vue")) return true
  if (lowerDep === "svelte" && sourceFileExtensions.has(".svelte")) return true

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
  if (matches.length === 0) return { suggestedVersion: null, hoistedFrom: null }

  const rootMatch = matches.find((m) => m.workspace === ".")
  if (rootMatch) return { suggestedVersion: rootMatch.version, hoistedFrom: "Root workspace" }

  const versionCounts = new Map<string, number>()
  const versionFirstWorkspace = new Map<string, string>()

  for (const m of matches) {
    versionCounts.set(m.version, (versionCounts.get(m.version) ?? 0) + 1)
    if (!versionFirstWorkspace.has(m.version)) versionFirstWorkspace.set(m.version, m.workspace)
  }

  let bestVersion = matches[0]!.version
  let maxCount = 0
  for (const [ver, count] of versionCounts.entries()) {
    if (count > maxCount) {
      maxCount = count
      bestVersion = ver
    } else if (count === maxCount && compareSemver(ver, bestVersion) > 0) {
      bestVersion = ver
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

  const allWorkspaceDirPaths = new Map<string, string>()
  const monorepoPackageNames = new Set<string>()

  for (const ws of workspaces) {
    const wsDir = ws.absPath ? path.dirname(ws.absPath) : path.resolve(rootDir, ws.relPath)
    allWorkspaceDirPaths.set(ws.relPath, path.resolve(wsDir).toLowerCase())
    if (ws.name) monorepoPackageNames.add(ws.name)
  }

  const globalDepVersions = new Map<string, { version: string; workspace: string }[]>()
  for (const ws of workspaces) {
    for (const [depName, depRecord] of Object.entries(ws.deps)) {
      if (!globalDepVersions.has(depName)) globalDepVersions.set(depName, [])
      globalDepVersions.get(depName)!.push({ version: depRecord.version, workspace: ws.relPath })
    }
  }

  const rootWs = workspaces.find((w) => w.isRoot || w.relPath === ".")
  const rootDeps = rootWs ? rootWs.deps : {}

  const WORKSPACE_CONCURRENCY = 24
  const queue = [...workspaces]

  const processWorkspace = async (ws: Workspace) => {
    const wsDir = ws.absPath ? path.dirname(ws.absPath) : path.resolve(rootDir, ws.relPath)

    const childWorkspaceDirs = new Set<string>()
    for (const [otherRelPath, otherAbsDir] of allWorkspaceDirPaths.entries()) {
      if (otherRelPath !== ws.relPath) childWorkspaceDirs.add(otherAbsDir)
    }

    const isAlias = loadPathAliasMatcher(wsDir, rootDir)
    const sourceFiles = await collectSourceFiles(wsDir, childWorkspaceDirs)

    const importedInFiles = new Map<string, Set<string>>()
    const configReferences = new Set<string>()
    const fileExtensionsPresent = new Set<string>()

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

    for (const p of extractPackagesFromScripts(pkgJsonScripts)) configReferences.add(p)

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
            // Config files only contribute tool/preset/plugin references
            // (never treated as runtime module imports for phantom/unused
            // purposes) — but JS/TS config files' real `import` statements
            // ARE genuine tool usages, so those still count.
            for (const ref of extractReferencesFromConfig(content, filePath, isAlias)) {
              configReferences.add(ref)
            }
            if (/\.(?:[mc]?[jt]sx?)$/i.test(basename)) {
              for (const pkg of parseSourceFile(content, filePath, isAlias).imports) {
                configReferences.add(pkg)
              }
            }
            return
          }

          const fileImports = parseSourceFile(content, filePath, isAlias).imports
          const relFilePath = path.relative(rootDir, filePath).replace(/\\/g, "/")

          for (const pkg of fileImports) {
            if (!importedInFiles.has(pkg)) importedInFiles.set(pkg, new Set())
            importedInFiles.get(pkg)!.add(relFilePath)
          }
        })
      )
    }

    const activePackages = new Set<string>([...importedInFiles.keys(), ...configReferences])
    const wsPhantoms: PhantomDependency[] = []
    const wsUnused: UnusedDependency[] = []

    for (const [importedPkg, fileSet] of importedInFiles.entries()) {
      if (ws.deps[importedPkg]) continue
      if (ws.name && ws.name === importedPkg) continue

      const isOnlyInTestOrDocs = [...fileSet].every((f) => isTestOrDocumentationFile(f))
      if (isOnlyInTestOrDocs && rootDeps[importedPkg]) continue

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

    for (const [depName, depRecord] of Object.entries(ws.deps)) {
      if (depRecord.type === "peer" || depRecord.type === "optional") continue
      if (importedInFiles.has(depName)) continue
      if (configReferences.has(depName)) continue
      if (isConnectedEcosystemPackage(depName, activePackages, fileExtensionsPresent)) continue

      wsUnused.push({
        name: depName,
        workspace: ws.relPath,
        version: depRecord.version,
        type: depRecord.type,
        isDevTool: isDevToolPackage(depName, depRecord.type),
      })
    }

    return { filesCount: sourceFiles.length, phantoms: wsPhantoms, unused: wsUnused }
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

  phantoms.sort((a, b) => a.workspace.localeCompare(b.workspace) || a.name.localeCompare(b.name))
  unused.sort((a, b) => {
    if (a.type === "prod" && b.type !== "prod") return -1
    if (a.type !== "prod" && b.type === "prod") return 1
    return a.workspace.localeCompare(b.workspace) || a.name.localeCompare(b.name)
  })

  return { phantoms, unused, scannedFilesCount: totalFilesScanned }
}
