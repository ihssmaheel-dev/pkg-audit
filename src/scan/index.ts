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
import { buildWorkspaceGraph } from "./graph.js"
import { scanWorkspaceDependencies } from "./unused.js"
import { generateCatalogPlan, applyCatalogPlan, readPnpmWorkspaceYaml } from "./catalog.js"
import { checkVulnerabilities, applySecurityFixes } from "./security.js"
import { analyzeLockfile, applyDedupeOverrides, generateOverridesDict } from "./dedupe.js"
import { scanMonorepoLicenses, generateNoticeText, generateSpdxJson, generateCsvReport } from "./license.js"
import { generateMonorepoContext } from "./context.js"
import { auditDeprecations } from "./deprecation.js"
import { getScanCache } from "./cache.js"
import { loadSuppressions, toSuppressionResult, isSuppressed } from "./suppressions.js"
import { evaluateVulnerabilitySLAs } from "./sla.js"
import { checkBoundaryViolations } from "./boundaries.js"
import type {
  BoundaryRule,
  DepType,
  ProgressEvent,
  ScanError,
  ScanResult,
  SuppressionRule,
  Workspace,
} from "../types.js"

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
  security?: boolean
  deprecation?: boolean
  abandonedDaysThreshold?: number
  offline?: boolean
  noCache?: boolean
  boundaries?: boolean
  boundaryRules?: BoundaryRule[]
  suppressions?: SuppressionRule[]
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

  const relPath = (path.relative(rootDir, path.dirname(filePath)) || ".").replace(/\\/g, "/")
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

  // Initialize scan cache with root directory and offline/noCache flags
  getScanCache({ rootDir, offline: opts.offline, noCache: opts.noCache })

  // Load suppressions with expiry evaluation
  const loadedSuppressions = loadSuppressions(rootDir, opts.suppressions)

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
  const graph = buildWorkspaceGraph(workspaces)
  const rawUnused = await scanWorkspaceDependencies(rootDir, workspaces)

  // Filter suppressed unused & phantoms
  const filteredUnused = {
    ...rawUnused,
    phantoms: rawUnused.phantoms.filter(
      (p) =>
        !isSuppressed(loadedSuppressions, {
          type: "phantom",
          pkg: p.name,
          workspace: p.workspace,
        }).suppressed
    ),
    unused: rawUnused.unused.filter(
      (u) =>
        !isSuppressed(loadedSuppressions, {
          type: "unused",
          pkg: u.name,
          workspace: u.workspace,
        }).suppressed
    ),
  }

  const totalDepDeclarations = workspaces.reduce((sum, w) => sum + w.depCount, 0)

  // Run network phases (outdated, security, deprecation) concurrently for 40-60% wall-clock reduction
  const [outdatedRes, securityRes, deprecationRes] = await Promise.all([
    (async (): Promise<ScanResult["outdated"]> => {
      if (!opts.outdated && !opts.versions) return null
      const res = await checkOutdated(depMap, opts.concurrency ?? 24, opts.onProgress)
      if (opts.changelog && res.outdated.length) {
        await fetchChangelogs(res.outdated, opts.changelogLines ?? 6)
      }
      return res
    })(),

    (async () => {
      if (!opts.security) return { security: null, vulnerabilitySLAs: null }
      const rawSecurity = await checkVulnerabilities(workspaces, {
        rootDir,
        onProgress: opts.onProgress,
      })

      const activeVulns = rawSecurity.vulnerabilities.filter(
        (v) =>
          !isSuppressed(loadedSuppressions, {
            type: "security",
            id: v.id,
            pkg: v.pkg,
          }).suppressed
      )

      const slaEvaluation = evaluateVulnerabilitySLAs(rootDir, activeVulns)
      const vulnerabilitySLAs = slaEvaluation.slaStatuses

      const security: ScanResult["security"] = {
        ...rawSecurity,
        vulnerabilities: activeVulns,
        criticalCount: activeVulns.filter((v) => v.severity === "CRITICAL").length,
        highCount: activeVulns.filter((v) => v.severity === "HIGH").length,
        moderateCount: activeVulns.filter((v) => v.severity === "MODERATE").length,
        lowCount: activeVulns.filter((v) => v.severity === "LOW").length,
        totalVulnerablePackages: new Set(activeVulns.map((v) => v.pkg)).size,
      }

      return { security, vulnerabilitySLAs }
    })(),

    (async (): Promise<ScanResult["deprecation"]> => {
      if (opts.deprecation === false) return null
      const rawDeprecation = await auditDeprecations(depMap, {
        concurrency: opts.concurrency ?? 24,
        abandonedDaysThreshold: opts.abandonedDaysThreshold ?? 730,
        onProgress: opts.onProgress,
      })

      const filteredPkgs = rawDeprecation.packages.filter(
        (p) =>
          !isSuppressed(loadedSuppressions, {
            type: "deprecation",
            pkg: p.name,
          }).suppressed
      )

      return {
        ...rawDeprecation,
        packages: filteredPkgs,
        totalDeprecated: filteredPkgs.filter((p) => p.deprecated).length,
        totalAbandoned: filteredPkgs.filter((p) => p.isAbandoned).length,
        totalZombies: filteredPkgs.filter((p) => p.isZombie).length,
      }
    })(),
  ])

  const outdated = outdatedRes
  const security = securityRes.security
  const vulnerabilitySLAs = securityRes.vulnerabilitySLAs
  const deprecation = deprecationRes

  const rootWs = workspaces.find((w) => w.isRoot)
  const dedupe = analyzeLockfile(rootDir, rootWs?.packageManager ?? null)
  const rawLicenses = scanMonorepoLicenses(workspaces, rootDir)

  // Filter suppressed licenses
  const filteredLicenses = {
    ...rawLicenses,
    packages: rawLicenses.packages.filter(
      (l) =>
        !isSuppressed(loadedSuppressions, {
          type: "license",
          pkg: l.name,
          id: l.spdxId,
        }).suppressed
    ),
  }

  // Cross-Boundary import enforcement
  const boundaries = checkBoundaryViolations(workspaces, rootDir, opts.boundaryRules, opts.onProgress)

  // Filter suppressed boundary violations
  const filteredBoundaryViolations = boundaries.violations.filter(
    (b) =>
      !isSuppressed(loadedSuppressions, {
        type: "boundary",
        workspace: b.sourceWorkspace,
        pkg: b.importedSpecifier,
      }).suppressed
  )

  const boundariesResult = {
    ...boundaries,
    violations: filteredBoundaryViolations,
    totalViolations: filteredBoundaryViolations.length,
  }

  const suppressionsResult = toSuppressionResult(loadedSuppressions)

  const tempScanData: ScanResult = {
    version: 1,
    root: rootDir,
    scannedMs: Date.now() - startedAt,
    workspaces: workspaces.map(({ absPath: _absPath, ...rest }) => rest),
    conflicts,
    hygieneIssues,
    graph,
    unused: filteredUnused,
    outdated,
    security,
    dedupe,
    licenses: filteredLicenses,
    deprecation,
    boundaries: boundariesResult,
    suppressions: suppressionsResult,
    vulnerabilitySLAs,
    errors: stats.errors,
    meta: {
      ignoredDirs: [...scanOpts.ignoreDirs].sort(),
      skippedGitignored: stats.skippedGitignored,
      toolVersion: TOOL_VERSION,
      totalDepDeclarations,
      totalUniquePackages: depMap.size,
    },
  }

  const catalog = generateCatalogPlan(tempScanData)

  return {
    ...tempScanData,
    catalog,
  }
}

export {
  buildDependencyMap,
  buildWorkspaceGraph,
  scanWorkspaceDependencies,
  findConflicts,
  findHygieneIssues,
  generateCatalogPlan,
  applyCatalogPlan,
  readPnpmWorkspaceYaml,
  checkVulnerabilities,
  applySecurityFixes,
  analyzeLockfile,
  applyDedupeOverrides,
  generateOverridesDict,
  scanMonorepoLicenses,
  generateNoticeText,
  generateSpdxJson,
  generateCsvReport,
  generateMonorepoContext,
  auditDeprecations,
  isLinkedProtocol,
  parseMajor,
  parseVersionTuple,
  compareTuples,
  checkOutdated,
  fetchChangelogs,
  fetchLatestVersion,
  getScanCache,
  loadSuppressions,
  evaluateVulnerabilitySLAs,
  checkBoundaryViolations,
}
