import { compareTuples, isLinkedProtocol, parseVersionTuple } from "./conflicts.js"
import { encodeNpmName, runPool } from "./registry.js"
import type {
  DepMap,
  DeprecatedPackage,
  DeprecationSummary,
  DepType,
  InactivitySeverity,
  PopularityTier,
  ProgressEvent,
} from "../types.js"

/**
 * Curated knowledge base of famous deprecated packages with their official or modern recommended replacements
 * and estimated weekly downloads baseline for instant zero-network/offline coverage.
 */
export const KNOWN_DEPRECATIONS: Record<
  string,
  { reason: string; replacement: string; abandoned?: boolean; weeklyDownloads?: number }
> = {
  request: {
    reason: "request has been deprecated since Feb 2020. See https://github.com/request/request/issues/3142",
    replacement: "native fetch, undici, or axios",
    abandoned: true,
    weeklyDownloads: 14_200_000,
  },
  "request-promise": {
    reason: "request-promise is deprecated. See https://github.com/request/request-promise/issues/314",
    replacement: "native fetch, undici, or axios",
    abandoned: true,
    weeklyDownloads: 3_800_000,
  },
  "request-promise-native": {
    reason: "request-promise-native is deprecated.",
    replacement: "native fetch or undici",
    abandoned: true,
    weeklyDownloads: 1_200_000,
  },
  querystring: {
    reason: "The querystring API is considered Legacy. New code should use the URLSearchParams API instead.",
    replacement: "URLSearchParams (native Node.js / Web standard)",
    abandoned: true,
    weeklyDownloads: 24_500_000,
  },
  tslint: {
    reason:
      "TSLint has been deprecated in favor of ESLint. See https://github.com/palantir/tslint/issues/4534",
    replacement: "typescript-eslint (@typescript-eslint/eslint-plugin)",
    abandoned: true,
    weeklyDownloads: 2_100_000,
  },
  "babel-eslint": {
    reason: "babel-eslint is now @babel/eslint-parser. Please upgrade.",
    replacement: "@babel/eslint-parser",
    abandoned: true,
    weeklyDownloads: 1_900_000,
  },
  nomnom: {
    reason: "nomnom is deprecated. See commander, yargs, or meow.",
    replacement: "commander, yargs, or citty",
    abandoned: true,
    weeklyDownloads: 350_000,
  },
  "node-sass": {
    reason: "Node Sass is deprecated. Please use `sass` (Dart Sass) instead.",
    replacement: "sass",
    abandoned: true,
    weeklyDownloads: 3_400_000,
  },
  "coffee-script": {
    reason: "CoffeeScript has moved to the `coffeescript` package name.",
    replacement: "typescript or coffeescript",
    abandoned: true,
    weeklyDownloads: 420_000,
  },
  "colors.js": {
    reason: "Deprecated due to supply chain vulnerabilities.",
    replacement: "picocolors, chalk, or colorette",
    abandoned: true,
    weeklyDownloads: 1_200_000,
  },
  "left-pad": {
    reason: "left-pad is deprecated and obsolete. Use String.prototype.padStart() instead.",
    replacement: "String.prototype.padStart()",
    abandoned: true,
    weeklyDownloads: 2_000_000,
  },
  "core-js-pure": {
    reason: "Legacy core-js builds should be upgraded to core-js@3.",
    replacement: "core-js@3",
    weeklyDownloads: 9_500_000,
  },
  optimist: {
    reason: "optimist is deprecated. Use yargs, commander, or minimist instead.",
    replacement: "commander or yargs",
    abandoned: true,
    weeklyDownloads: 3_100_000,
  },
  "uglify-js": {
    reason: "UglifyJS doesn't support ES6+. Use terser or esbuild instead.",
    replacement: "terser or esbuild",
    weeklyDownloads: 7_800_000,
  },
  "istanbul-lib-hook": {
    reason: "Use c8 or modern v8 coverage tooling instead.",
    replacement: "c8 or vitest coverage",
    abandoned: true,
    weeklyDownloads: 4_500_000,
  },
}

export interface DeprecationOptions {
  concurrency?: number
  abandonedDaysThreshold?: number // default 730 days (2 years)
  timeoutMs?: number
  onProgress?: (event: ProgressEvent) => void
}

interface NpmRegistryPackument {
  name: string
  deprecated?: string
  description?: string
  homepage?: string
  repository?: { url?: string } | string
  time?: Record<string, string>
  "dist-tags"?: { latest?: string }
  versions?: Record<
    string,
    {
      version: string
      deprecated?: string
      description?: string
      homepage?: string
      repository?: { url?: string } | string
    }
  >
}

/**
 * Strips SemVer range prefixes like ^, ~, >=, <=, =, v to get the base version string.
 */
function cleanVersionString(v: string): string {
  return v.replace(/^[~^<>=v\s]+/, "").trim()
}

/**
 * Enhanced replacement parser recognizing diverse author phrasing patterns.
 */
export function extractReplacement(reason: string): string | undefined {
  const patterns = [
    /(?:use|upgrade to|switch to|replaced by|migrated to|try|recommend(?:ed)?(?: using)?|moved to|superseded by|renamed to)\s+[`"']?([@\w/.-]+?)[`"']?(?:\s+instead|\.|,|$)/i,
    /(?:see|checkout|check out|check|refer to|visit)\s+[`"']?(https?:\/\/[^\s`"']+)/i,
    /(https?:\/\/[^\s`"']+)/i,
  ]
  for (const pat of patterns) {
    const match = reason.match(pat)
    if (match && match[1]) {
      const res = match[1].trim().replace(/[.,;:)>\]]+$/, "")
      if (res.length > 0 && res.startsWith("http")) {
        return res
      }
      if (res.length > 0 && !res.includes(" ") && !res.endsWith("/")) {
        return res
      }
    }
  }
  return undefined
}

export function calculateInactivitySeverity(days: number | undefined): InactivitySeverity {
  if (days === undefined) return "recent"
  if (days >= 1826) return "critical" // > 5 years
  if (days >= 1095) return "severe" // > 3 years
  if (days >= 730) return "moderate" // > 2 years
  return "recent"
}

export function calculatePopularityTier(
  downloads: number | undefined,
  isDeprecatedOrAbandoned: boolean
): PopularityTier {
  const d = downloads ?? 0
  if (d >= 1_000_000 && isDeprecatedOrAbandoned) return "zombie"
  if (d >= 100_000) return "high"
  if (d >= 10_000) return "medium"
  return "low"
}

import { getScanCache } from "./cache.js"

export async function fetchWeeklyDownloads(name: string, timeoutMs = 4000): Promise<number | undefined> {
  const cache = getScanCache()
  const cached = cache.get<number>("downloads", name)
  if (cached !== null) return cached

  if (cache.isOfflineMode()) return undefined

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeNpmName(name)}`, {
      signal: controller.signal,
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { downloads?: number }
    const result = typeof data.downloads === "number" ? data.downloads : undefined
    if (result !== undefined) {
      cache.set("downloads", name, result)
    }
    return result
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

export interface PackageDeprecationInfo {
  deprecated?: string
  lastPublished?: string
  repository?: string
  homepage?: string
  versionsDeprecated?: Record<string, string>
}

export async function fetchPackageDeprecationInfo(
  name: string,
  timeoutMs = 8000
): Promise<PackageDeprecationInfo> {
  const cache = getScanCache()
  const cached = cache.get<PackageDeprecationInfo>("deprecation", name)
  if (cached !== null) return cached

  if (cache.isOfflineMode()) return {}

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeNpmName(name)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    if (!res.ok) {
      return {}
    }
    const data = (await res.json()) as NpmRegistryPackument
    const rootDeprecated = data.deprecated
    const latestVersion = data["dist-tags"]?.latest
    const latestInfo = latestVersion && data.versions ? data.versions[latestVersion] : undefined
    const deprecated = rootDeprecated || latestInfo?.deprecated

    // Find newest publish time:
    // 1. Prioritize data.time[latestVersion] (the actual release date of what latest is)
    // 2. If not found, sort real version release timestamps
    // 3. Fallback to data.time.modified only if no release timestamps exist
    let lastPublished: string | undefined
    if (data.time) {
      if (latestVersion && data.time[latestVersion]) {
        lastPublished = data.time[latestVersion]
      } else {
        const dates = Object.entries(data.time)
          .filter(([k]) => k !== "created" && k !== "modified")
          .map(([, v]) => v)
          .sort()
        if (dates.length > 0) {
          lastPublished = dates[dates.length - 1]
        } else if (data.time.modified) {
          lastPublished = data.time.modified
        }
      }
    }

    const versionsDeprecated: Record<string, string> = {}
    if (data.versions) {
      for (const [v, vInfo] of Object.entries(data.versions)) {
        if (vInfo.deprecated) {
          versionsDeprecated[v] = vInfo.deprecated
        }
      }
    }

    let repository: string | undefined
    if (typeof data.repository === "string") {
      repository = data.repository
    } else if (data.repository && typeof data.repository.url === "string") {
      repository = data.repository.url.replace(/^git\+/, "").replace(/\.git$/, "")
    }

    return {
      deprecated,
      lastPublished,
      repository,
      homepage: data.homepage,
      versionsDeprecated,
    }
  } catch {
    return {}
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Audits all declared dependencies across the monorepo for official npm deprecations,
 * maintenance abandonment, and ecosystem zombie dependency risks with weekly downloads.
 */
export async function auditDeprecations(
  depMap: DepMap,
  opts: DeprecationOptions = {}
): Promise<DeprecationSummary> {
  const concurrency = opts.concurrency ?? 8
  const thresholdDays = opts.abandonedDaysThreshold ?? 730 // 2 years
  const now = Date.now()

  const names = [...depMap.keys()].filter((name) => {
    const versions = [...depMap.get(name)!.keys()].filter((v) => !isLinkedProtocol(v))
    return versions.length > 0
  })

  if (opts.onProgress) {
    opts.onProgress({ phase: "deprecation", done: 0, total: names.length })
  }

  let done = 0
  const registryData = await runPool(
    names,
    async (name) => {
      const [info, weeklyDownloads] = await Promise.all([
        fetchPackageDeprecationInfo(name, opts.timeoutMs ?? 8000),
        fetchWeeklyDownloads(name, Math.min(opts.timeoutMs ?? 8000, 5000)),
      ])
      done++
      if (opts.onProgress) {
        opts.onProgress({ phase: "deprecation", done, total: names.length })
      }
      return { name, info, weeklyDownloads }
    },
    concurrency
  )

  const registryMap = new Map(
    registryData.map((d) => [d.name, { info: d.info, downloads: d.weeklyDownloads }])
  )
  const results: DeprecatedPackage[] = []

  for (const name of names) {
    const versionMap = depMap.get(name)!
    const regEntry = registryMap.get(name)
    const regInfo = regEntry?.info || {}
    const known = KNOWN_DEPRECATIONS[name]

    // Gather workspaces where this package is used
    const usages: Array<{
      workspace: string
      type: DepType
      rawVersion: string
    }> = []
    let hasProd = false
    let hasDev = false

    // Collect all declared versions and sort them deterministically:
    // 1. Total occurrences count descending
    // 2. Highest SemVer version
    // 3. Alphabetical tie-break
    const declaredVersions: Array<{ version: string; count: number }> = []

    for (const [v, occurrences] of versionMap.entries()) {
      if (isLinkedProtocol(v)) continue
      declaredVersions.push({ version: v, count: occurrences.length })
      for (const occ of occurrences) {
        usages.push({ workspace: occ.workspace, type: occ.type, rawVersion: v })
        if (occ.type === "prod") hasProd = true
        if (occ.type === "dev") hasDev = true
      }
    }

    if (usages.length === 0) continue

    declaredVersions.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      const tA = parseVersionTuple(a.version)
      const tB = parseVersionTuple(b.version)
      if (tA && tB) {
        const diff = compareTuples(tB, tA)
        if (diff !== 0) return diff
      }
      return a.version.localeCompare(b.version)
    })

    const chosenVersion = declaredVersions[0]?.version ?? ""

    // Determine deprecation status:
    // 1. Curated known deprecation
    // 2. Root/package-level deprecation from registry
    // 3. Exact declared version deprecation match in regInfo.versionsDeprecated
    let isDeprecated = false
    let deprecationReason: string | undefined

    if (known) {
      isDeprecated = true
      deprecationReason = known.reason
    } else if (regInfo.deprecated) {
      isDeprecated = true
      deprecationReason = regInfo.deprecated
    } else if (regInfo.versionsDeprecated && Object.keys(regInfo.versionsDeprecated).length > 0) {
      // Check if any declared version in our monorepo matches a deprecated version
      for (const { version } of declaredVersions) {
        const exactMatch = regInfo.versionsDeprecated[version]
        const cleanMatch = regInfo.versionsDeprecated[cleanVersionString(version)]
        const matched = exactMatch || cleanMatch
        if (matched) {
          isDeprecated = true
          deprecationReason = `Version ${version} is deprecated: ${matched}`
          break
        }
      }
    }

    // Determine abandonment status (> thresholdDays since last release)
    let isAbandoned = false
    let daysSinceLastRelease: number | undefined
    let yearsSinceLastRelease: number | undefined

    if (regInfo.lastPublished) {
      const pubDate = new Date(regInfo.lastPublished).getTime()
      if (!Number.isNaN(pubDate)) {
        daysSinceLastRelease = Math.max(0, Math.floor((now - pubDate) / (1000 * 60 * 60 * 24)))
        yearsSinceLastRelease = Number((daysSinceLastRelease / 365.25).toFixed(1))
        if (daysSinceLastRelease >= thresholdDays) {
          isAbandoned = true
        }
      }
    } else if (known?.abandoned) {
      isAbandoned = true
      yearsSinceLastRelease = 4.0
      daysSinceLastRelease = 1460
    }

    if (!isDeprecated && !isAbandoned) {
      continue
    }

    let replacement: string | undefined = known?.replacement
    if (!replacement && deprecationReason) {
      replacement = extractReplacement(deprecationReason)
    }

    const weeklyDownloads = regEntry?.downloads ?? known?.weeklyDownloads
    const isZombie = (isDeprecated || isAbandoned) && (weeklyDownloads ?? 0) >= 1_000_000
    const inactivitySeverity = calculateInactivitySeverity(daysSinceLastRelease)
    const popularityTier = calculatePopularityTier(weeklyDownloads, isDeprecated || isAbandoned)

    results.push({
      name,
      version: chosenVersion,
      workspaces: usages,
      isProd: hasProd,
      isDev: hasDev,
      deprecated: isDeprecated,
      deprecationReason,
      isAbandoned,
      lastPublished: regInfo.lastPublished,
      daysSinceLastRelease,
      yearsSinceLastRelease,
      inactivitySeverity,
      weeklyDownloads,
      popularityTier,
      isZombie,
      replacementSuggestion: replacement,
      homepage: regInfo.homepage,
      repository: regInfo.repository,
    })
  }

  // Smart Sorting:
  // 1. Zombie Dependencies in Prod (highest downloads first)
  // 2. Other Zombie Dependencies
  // 3. Deprecated in Prod
  // 4. Deprecated in Dev
  // 5. Inactivity severity (critical > severe > moderate)
  // 6. Weekly downloads descending
  results.sort((a, b) => {
    if (a.isZombie && !b.isZombie) return -1
    if (!a.isZombie && b.isZombie) return 1
    if (a.isProd && !b.isProd) return -1
    if (!a.isProd && b.isProd) return 1
    if (a.deprecated && !b.deprecated) return -1
    if (!a.deprecated && b.deprecated) return 1
    if ((b.weeklyDownloads ?? 0) !== (a.weeklyDownloads ?? 0)) {
      return (b.weeklyDownloads ?? 0) - (a.weeklyDownloads ?? 0)
    }
    if ((b.yearsSinceLastRelease ?? 0) !== (a.yearsSinceLastRelease ?? 0)) {
      return (b.yearsSinceLastRelease ?? 0) - (a.yearsSinceLastRelease ?? 0)
    }
    return a.name.localeCompare(b.name)
  })

  const totalDeprecated = results.filter((r) => r.deprecated).length
  const totalAbandoned = results.filter((r) => r.isAbandoned).length
  const totalZombies = results.filter((r) => r.isZombie).length
  const deprecatedInProd = results.filter((r) => r.deprecated && r.isProd).length
  const deprecatedInDev = results.filter((r) => r.deprecated && !r.isProd).length
  const abandonedInProd = results.filter((r) => r.isAbandoned && r.isProd).length

  return {
    packages: results,
    totalScanned: names.length,
    totalDeprecated,
    totalAbandoned,
    totalZombies,
    deprecatedInProd,
    deprecatedInDev,
    abandonedInProd,
  }
}
