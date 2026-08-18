import fs from "node:fs"
import path from "node:path"
import { parseGitignoreFile, isGitignored } from "./gitignore.js"
import {
  buildDependencyMap,
  compareTuples,
  findConflicts,
  isLinkedProtocol,
  parseMajor,
  parseVersionTuple,
} from "./conflicts.js"
import { findHygieneIssues } from "./hygiene.js"
import { checkOutdated, fetchLatestVersion } from "./registry.js"
import { fetchChangelogs } from "./changelog.js"
import type { DepType, ProgressEvent, ScanError, ScanResult, Workspace } from "../types.js"

export const DEFAULT_IGNORE_DIRS: ReadonlySet<string> = new Set([
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

export const DEP_FIELDS: ReadonlyArray<readonly [string, DepType]> = [
  ["dependencies", "prod"],
  ["devDependencies", "dev"],
  ["peerDependencies", "peer"],
  ["optionalDependencies", "optional"],
]

export const TOOL_VERSION = "0.1.0"

interface ScanOptions {
  ignoreDirs?: Iterable<string>
  respectGitignore?: boolean
  outdated?: boolean
  versions?: boolean
  changelog?: boolean
  changelogLines?: number
  concurrency?: number
  onProgress?: (event: ProgressEvent) => void
}

interface ScanStats {
  errors: ScanError[]
  skippedGitignored: number
}

function findPackageJsonFiles(
  dir: string,
  opts: { ignoreDirs: Set<string>; respectGitignore: boolean },
  stats: ScanStats,
  results: string[] = [],
  inheritedPatterns: ReturnType<typeof parseGitignoreFile> = []
): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    stats.errors.push({
      path: dir,
      error: err instanceof Error ? err.message : String(err),
    })
    return results
  }

  let activePatterns = inheritedPatterns
  if (opts.respectGitignore && entries.some((e) => e.name === ".gitignore")) {
    const local = parseGitignoreFile(path.join(dir, ".gitignore"))
    if (local.length) activePatterns = [...inheritedPatterns, ...local]
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue

    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (opts.ignoreDirs.has(entry.name)) continue
      if (opts.respectGitignore && isGitignored(full, true, activePatterns)) {
        stats.skippedGitignored++
        continue
      }
      findPackageJsonFiles(full, opts, stats, results, activePatterns)
    } else if (entry.name === "package.json") {
      if (opts.respectGitignore && isGitignored(full, false, activePatterns)) {
        stats.skippedGitignored++
        continue
      }
      results.push(full)
    }
  }

  return results
}

function loadWorkspace(filePath: string, rootDir: string, stats: ScanStats): Workspace | null {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, "utf8")
  } catch (err) {
    stats.errors.push({
      path: filePath,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }

  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(raw) as Record<string, unknown>
  } catch (err) {
    stats.errors.push({
      path: filePath,
      error: `invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
    })
    return null
  }

  const relPath = path.relative(rootDir, path.dirname(filePath)) || "."
  const deps: Workspace["deps"] = {}

  for (const [field, type] of DEP_FIELDS) {
    const block = pkg[field]
    if (!block || typeof block !== "object") continue
    for (const [name, version] of Object.entries(block as Record<string, unknown>)) {
      deps[name] = { version: String(version), type }
    }
  }

  const engines = pkg.engines as { node?: unknown } | undefined

  return {
    relPath,
    absPath: filePath,
    name: (pkg.name as string) || `(unnamed: ${relPath})`,
    version: (pkg.version as string) || "0.0.0",
    private: Boolean(pkg.private),
    isRoot: relPath === ".",
    packageManager: (pkg.packageManager as string) || null,
    enginesNode: (engines?.node as string) || null,
    deps,
    depCount: Object.keys(deps).length,
    devCount: Object.values(deps).filter((d) => d.type === "dev").length,
  }
}

export async function scan(dir: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const rootDir = path.resolve(dir)
  const startedAt = Date.now()

  const scanOpts = {
    ignoreDirs: new Set(opts.ignoreDirs ?? DEFAULT_IGNORE_DIRS),
    respectGitignore: opts.respectGitignore !== false,
  }

  const stats: ScanStats = { errors: [], skippedGitignored: 0 }
  const files = findPackageJsonFiles(rootDir, scanOpts, stats)
  const workspaces = files
    .map((f) => loadWorkspace(f, rootDir, stats))
    .filter((w): w is Workspace => w !== null)
    .sort((a, b) => (a.isRoot === b.isRoot ? a.relPath.localeCompare(b.relPath) : a.isRoot ? -1 : 1))

  const depMap = buildDependencyMap(workspaces)
  const conflicts = findConflicts(depMap)
  const hygieneIssues = findHygieneIssues(workspaces)

  const totalDepDeclarations = workspaces.reduce((sum, w) => sum + w.depCount, 0)

  let outdated: ScanResult["outdated"] = null
  if (opts.outdated || opts.versions) {
    outdated = await checkOutdated(depMap, opts.concurrency ?? 8, opts.onProgress)
    if (opts.changelog && outdated.outdated.length) {
      await fetchChangelogs(outdated.outdated, opts.changelogLines ?? 6)
    }
  }

  return {
    version: 1,
    root: rootDir,
    scannedMs: Date.now() - startedAt,
    workspaces: workspaces.map(({ absPath: _absPath, ...rest }) => rest),
    conflicts,
    hygieneIssues,
    outdated,
    errors: stats.errors,
    meta: {
      ignoredDirs: [...scanOpts.ignoreDirs].sort(),
      skippedGitignored: stats.skippedGitignored,
      toolVersion: TOOL_VERSION,
      totalDepDeclarations,
      totalUniquePackages: depMap.size,
    },
  }
}

export {
  buildDependencyMap,
  findConflicts,
  findHygieneIssues,
  isLinkedProtocol,
  parseMajor,
  parseVersionTuple,
  compareTuples,
  checkOutdated,
  fetchChangelogs,
  fetchLatestVersion,
}
