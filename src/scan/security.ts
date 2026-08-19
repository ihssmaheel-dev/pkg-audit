import type {
  DepType,
  ProgressEvent,
  SecurityResult,
  SecuritySeverity,
  SecurityVulnerability,
  Workspace,
} from "../types.js"
import { applyFixes, compareSemver, type FixResult, type PackageFix } from "./fix.js"

const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"
const OSV_VULN_URL = "https://api.osv.dev/v1/vulns"

interface OsvQuery {
  package: {
    name: string
    ecosystem: string
  }
  version: string
}

interface OsvEvent {
  introduced?: string
  fixed?: string
  last_affected?: string
  limit?: string
}

interface OsvRange {
  type: string
  events: OsvEvent[]
}

interface OsvAffected {
  package?: {
    name?: string
    ecosystem?: string
  }
  ranges?: OsvRange[]
  versions?: string[]
}

interface OsvSeverity {
  type: string
  score: string
}

interface OsvVuln {
  id: string
  summary?: string
  details?: string
  aliases?: string[]
  severity?: OsvSeverity[]
  database_specific?: {
    severity?: string
    github_reviewed?: boolean
    cwe_ids?: string[]
  }
  affected?: OsvAffected[]
  references?: Array<{ type: string; url: string }>
  published?: string
  modified?: string
}

interface OsvBatchResponse {
  results?: Array<{
    vulns?: Array<{ id: string; modified?: string }>
  }>
}

/**
 * Extracts a clean semver string suitable for registry / OSV queries,
 * handling simple prefixes (^, ~) and compound ranges (>=1.2.3 <2.0.0, 1.x, etc.).
 */
export function cleanVersion(v: string): string {
  const match = v.match(/(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)/)
  if (match && match[1]) {
    return match[1].split("-")[0] ?? match[1]
  }
  return (
    v
      .replace(/^[\^~>=<\s]+/, "")
      .trim()
      .split("-")[0] ?? v
  )
}

function parseCvssScore(scoreStr?: string): number | undefined {
  if (!scoreStr) return undefined
  // Check if string is a numeric score directly (e.g. "7.5", "9.8")
  const num = Number(scoreStr)
  if (Number.isFinite(num) && num > 0 && num <= 10) return num

  // Rough estimation from CVSS:3.x vector if numeric score not directly present
  if (
    scoreStr.includes("AV:N") &&
    scoreStr.includes("AC:L") &&
    scoreStr.includes("C:H") &&
    scoreStr.includes("I:H") &&
    scoreStr.includes("A:H")
  ) {
    return 9.8
  }
  return undefined
}

function mapSeverity(vuln: OsvVuln): { severity: SecuritySeverity; cvssScore?: number } {
  // 1. Check CVSS score in severity array first for exact score accuracy
  if (vuln.severity && vuln.severity.length > 0) {
    for (const sev of vuln.severity) {
      const cvss = parseCvssScore(sev.score)
      if (cvss !== undefined) {
        if (cvss >= 9.0) return { severity: "CRITICAL", cvssScore: cvss }
        if (cvss >= 7.0) return { severity: "HIGH", cvssScore: cvss }
        if (cvss >= 4.0) return { severity: "MODERATE", cvssScore: cvss }
        return { severity: "LOW", cvssScore: cvss }
      }
    }
  }

  // 2. Check database_specific.severity
  const dbSeverity = vuln.database_specific?.severity?.toUpperCase()
  if (dbSeverity === "CRITICAL") return { severity: "CRITICAL", cvssScore: 9.5 }
  if (dbSeverity === "HIGH") return { severity: "HIGH", cvssScore: 8.0 }
  if (dbSeverity === "MODERATE" || dbSeverity === "MEDIUM") return { severity: "MODERATE", cvssScore: 5.5 }
  if (dbSeverity === "LOW") return { severity: "LOW", cvssScore: 3.0 }

  return { severity: "MODERATE", cvssScore: 5.0 }
}

export function findPatchedVersion(vuln: OsvVuln, currentVersion?: string): string | null {
  if (!vuln.affected || !vuln.affected.length) return null

  const fixedVersions: string[] = []
  for (const aff of vuln.affected) {
    if (aff.ranges) {
      for (const range of aff.ranges) {
        for (const ev of range.events) {
          if (ev.fixed) {
            fixedVersions.push(ev.fixed)
          }
        }
      }
    }
  }

  if (fixedVersions.length === 0) return null

  // Sort fixed versions using semver comparison in ascending order
  fixedVersions.sort((a, b) => compareSemver(a, b))

  if (currentVersion) {
    const cVer = cleanVersion(currentVersion)
    // Find the smallest fixed version that is greater than or equal to current version
    const higherFixed = fixedVersions.find((f) => compareSemver(f, cVer) >= 0)
    if (higherFixed) return higherFixed
  }

  // Fallback to the highest fixed version
  return fixedVersions[fixedVersions.length - 1] ?? null
}

function getAdvisoryUrl(vuln: OsvVuln): string {
  if (vuln.id.startsWith("GHSA-")) {
    return `https://github.com/advisories/${vuln.id}`
  }
  if (vuln.id.startsWith("CVE-")) {
    return `https://nvd.nist.gov/vuln/detail/${vuln.id}`
  }
  if (vuln.references && vuln.references.length > 0) {
    return vuln.references[0]!.url
  }
  return `https://osv.dev/vulnerability/${vuln.id}`
}

/**
 * Hydrates full vulnerability records for a list of unique vuln IDs via GET /v1/vulns/{id}.
 */
async function hydrateVuln(id: string, timeoutMs: number): Promise<OsvVuln | null> {
  const url = `${OSV_VULN_URL}/${encodeURIComponent(id)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return (await res.json()) as OsvVuln
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function hydrateAllVulns(
  vulnIds: string[],
  concurrency = 16,
  timeoutMs = 10000
): Promise<Map<string, OsvVuln>> {
  const map = new Map<string, OsvVuln>()
  const uniqueIds = Array.from(new Set(vulnIds))
  if (uniqueIds.length === 0) return map

  let index = 0
  const workers = Array.from({ length: Math.min(concurrency, uniqueIds.length) }, async () => {
    while (index < uniqueIds.length) {
      const currentId = uniqueIds[index++]!
      const data = await hydrateVuln(currentId, timeoutMs)
      if (data) {
        map.set(currentId, data)
      }
    }
  })

  await Promise.allSettled(workers)
  return map
}

/**
 * Queries Google OSV API in batches for all declared dependencies across the monorepo,
 * then hydrates full advisory records for rich CVE details, CVSS scores, and safe patches.
 */
export async function checkVulnerabilities(
  workspaces: Workspace[],
  options: {
    timeoutMs?: number
    concurrency?: number
    rootDir?: string
    onProgress?: (event: ProgressEvent) => void
  } = {}
): Promise<SecurityResult> {
  const timeoutMs = options.timeoutMs ?? 10000
  const concurrency = options.concurrency ?? 16

  let catalogMap: Record<string, string> = {}
  if (options.rootDir) {
    try {
      const { readPnpmWorkspaceYaml } = await import("./catalog.js")
      const parsed = readPnpmWorkspaceYaml(options.rootDir)
      catalogMap = parsed.catalog ?? {}
    } catch {
      // Ignore
    }
  }

  // Index all unique package & version declarations
  // Key: "pkg@cleanVersion" -> { pkg, rawVersion, cleanVersion, workspaces: [...] }
  interface PkgOccurrence {
    pkg: string
    rawVersion: string
    cleanVersion: string
    workspaces: Array<{ workspace: string; type: DepType; currentVersion: string }>
  }

  const occurrencesMap = new Map<string, PkgOccurrence>()

  for (const ws of workspaces) {
    for (const [pkgName, depRecord] of Object.entries(ws.deps)) {
      // Skip workspace packages and links
      if (depRecord.version.startsWith("workspace:") || depRecord.version.startsWith("link:")) {
        continue
      }
      let rawVer = depRecord.version
      if (rawVer.startsWith("catalog:")) {
        const catVer = catalogMap[pkgName]
        if (!catVer) continue
        rawVer = catVer
      }
      const cVer = cleanVersion(rawVer)
      if (!cVer || !/^\d+/.test(cVer)) continue

      const key = `${pkgName}@${cVer}`
      if (!occurrencesMap.has(key)) {
        occurrencesMap.set(key, {
          pkg: pkgName,
          rawVersion: rawVer,
          cleanVersion: cVer,
          workspaces: [],
        })
      }
      occurrencesMap.get(key)!.workspaces.push({
        workspace: ws.relPath,
        type: depRecord.type,
        currentVersion: depRecord.version,
      })
    }
  }

  const items = Array.from(occurrencesMap.values())
  const vulnerabilities: SecurityVulnerability[] = []

  if (items.length === 0) {
    return {
      vulnerabilities: [],
      criticalCount: 0,
      highCount: 0,
      moderateCount: 0,
      lowCount: 0,
      totalVulnerablePackages: 0,
      scannedPackageCount: 0,
    }
  }

  // 1. Batch query Google OSV in chunks of 250 queries to get minimal vulnerability IDs
  const CHUNK_SIZE = 250
  const allVulnIds: string[] = []
  const itemVulnMap = new Map<PkgOccurrence, string[]>()

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE)
    const queries: OsvQuery[] = chunk.map((item) => ({
      package: {
        name: item.pkg,
        ecosystem: "npm",
      },
      version: item.cleanVersion,
    }))

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(OSV_BATCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer))

      if (!response.ok) {
        continue
      }

      const data = (await response.json()) as OsvBatchResponse
      const results = data.results ?? []

      for (let j = 0; j < results.length; j++) {
        const res = results[j]
        const item = chunk[j]
        if (!res || !item || !res.vulns || res.vulns.length === 0) continue

        const ids = res.vulns.map((v) => v.id)
        itemVulnMap.set(item, ids)
        for (const id of ids) {
          allVulnIds.push(id)
        }
      }
    } catch {
      // Network error or timeout during OSV query
    }

    if (options.onProgress) {
      options.onProgress({
        phase: "security",
        done: Math.min(i + CHUNK_SIZE, items.length),
        total: items.length,
      })
    }
  }

  // 2. Hydration step: Fetch full records for all unique vulnerability IDs
  const hydratedMap = await hydrateAllVulns(allVulnIds, concurrency, timeoutMs)

  // 3. Assemble full SecurityVulnerability entries
  const seenVulnKey = new Set<string>()

  for (const [item, vulnIds] of itemVulnMap.entries()) {
    for (const id of vulnIds) {
      const dedupeKey = `${id}:${item.pkg}:${item.cleanVersion}`
      if (seenVulnKey.has(dedupeKey)) continue
      seenVulnKey.add(dedupeKey)

      const vuln = hydratedMap.get(id) ?? { id }
      const { severity, cvssScore } = mapSeverity(vuln)
      const patched = findPatchedVersion(vuln, item.cleanVersion)
      const suggestedVersion = patched ? `^${patched}` : null

      vulnerabilities.push({
        id: vuln.id,
        aliases: vuln.aliases ?? [],
        pkg: item.pkg,
        version: item.rawVersion,
        severity,
        cvssScore,
        summary: vuln.summary ?? "Security Vulnerability Advisory",
        details: vuln.details,
        patchedVersion: patched,
        suggestedVersion,
        advisoryUrl: getAdvisoryUrl(vuln),
        publishedAt: vuln.published,
        workspaces: item.workspaces,
      })
    }
  }

  // Sort vulnerabilities: CRITICAL -> HIGH -> MODERATE -> LOW, then by package name
  const SEVERITY_ORDER: Record<SecuritySeverity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MODERATE: 2,
    LOW: 3,
    UNKNOWN: 4,
  }

  vulnerabilities.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (b.cvssScore ?? 0) - (a.cvssScore ?? 0) ||
      a.pkg.localeCompare(b.pkg)
  )

  const vulnerablePkgs = new Set(vulnerabilities.map((v) => v.pkg))

  return {
    vulnerabilities,
    criticalCount: vulnerabilities.filter((v) => v.severity === "CRITICAL").length,
    highCount: vulnerabilities.filter((v) => v.severity === "HIGH").length,
    moderateCount: vulnerabilities.filter((v) => v.severity === "MODERATE").length,
    lowCount: vulnerabilities.filter((v) => v.severity === "LOW" || v.severity === "UNKNOWN").length,
    totalVulnerablePackages: vulnerablePkgs.size,
    scannedPackageCount: items.length,
  }
}

/**
 * Automatically remediates security vulnerabilities by upgrading packages to their safe patched versions.
 */
export async function applySecurityFixes(
  rootDir: string,
  vulnerabilities: SecurityVulnerability[],
  workspaces: Workspace[]
): Promise<FixResult> {
  const fixesMap = new Map<string, PackageFix>()

  for (const vuln of vulnerabilities) {
    if (!vuln.suggestedVersion) continue
    const existing = fixesMap.get(vuln.pkg)
    if (!existing) {
      fixesMap.set(vuln.pkg, {
        name: vuln.pkg,
        targetVersion: vuln.suggestedVersion,
      })
    }
  }

  const fixes = Array.from(fixesMap.values())
  return applyFixes(rootDir, fixes, {
    version: 1,
    root: rootDir,
    scannedMs: 0,
    workspaces,
    conflicts: [],
    hygieneIssues: [],
    graph: { nodes: [], edges: [], cycles: [], hasCycles: false, maxDepth: 0 },
    unused: { phantoms: [], unused: [], scannedFilesCount: 0 },
    outdated: null,
    security: null,
    dedupe: null,
    errors: [],
    meta: {
      ignoredDirs: [],
      skippedGitignored: 0,
      toolVersion: "0.1.0",
      totalDepDeclarations: 0,
      totalUniquePackages: 0,
    },
  })
}
