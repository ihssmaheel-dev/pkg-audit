import { isLinkedProtocol } from "./conflicts.js"
import { encodeNpmName, runPool } from "./registry.js"
import type { DepMap, DeprecatedPackage, DeprecationSummary, DepType, ProgressEvent } from "../types.js"

/**
 * Curated knowledge base of famous deprecated packages with their official or modern recommended replacements.
 * Provides instant zero-network and offline coverage.
 */
export const KNOWN_DEPRECATIONS: Record<
  string,
  { reason: string; replacement: string; abandoned?: boolean }
> = {
  request: {
    reason: "request has been deprecated since Feb 2020. See https://github.com/request/request/issues/3142",
    replacement: "native fetch, undici, or axios",
    abandoned: true,
  },
  "request-promise": {
    reason: "request-promise is deprecated. See https://github.com/request/request-promise/issues/314",
    replacement: "native fetch, undici, or axios",
    abandoned: true,
  },
  "request-promise-native": {
    reason: "request-promise-native is deprecated.",
    replacement: "native fetch or undici",
    abandoned: true,
  },
  querystring: {
    reason: "The querystring API is considered Legacy. New code should use the URLSearchParams API instead.",
    replacement: "URLSearchParams (native Node.js / Web standard)",
    abandoned: true,
  },
  tslint: {
    reason:
      "TSLint has been deprecated in favor of ESLint. See https://github.com/palantir/tslint/issues/4534",
    replacement: "typescript-eslint (@typescript-eslint/eslint-plugin)",
    abandoned: true,
  },
  "babel-eslint": {
    reason: "babel-eslint is now @babel/eslint-parser. Please upgrade.",
    replacement: "@babel/eslint-parser",
    abandoned: true,
  },
  nomnom: {
    reason: "nomnom is deprecated. See commander, yargs, or meow.",
    replacement: "commander, yargs, or citty",
    abandoned: true,
  },
  "node-sass": {
    reason: "Node Sass is deprecated. Please use `sass` (Dart Sass) instead.",
    replacement: "sass",
    abandoned: true,
  },
  "coffee-script": {
    reason: "CoffeeScript has moved to the `coffeescript` package name.",
    replacement: "typescript or coffeescript",
    abandoned: true,
  },
  "colors.js": {
    reason: "Deprecated due to supply chain vulnerabilities.",
    replacement: "picocolors, chalk, or colorette",
    abandoned: true,
  },
  "left-pad": {
    reason: "left-pad is deprecated and obsolete. Use String.prototype.padStart() instead.",
    replacement: "String.prototype.padStart()",
    abandoned: true,
  },
  "core-js-pure": {
    reason: "Legacy core-js builds should be upgraded to core-js@3.",
    replacement: "core-js@3",
  },
  optimist: {
    reason: "optimist is deprecated. Use yargs, commander, or minimist instead.",
    replacement: "commander or yargs",
    abandoned: true,
  },
  "uglify-js": {
    reason: "UglifyJS doesn't support ES6+. Use terser or esbuild instead.",
    replacement: "terser or esbuild",
  },
  "istanbul-lib-hook": {
    reason: "Use c8 or modern v8 coverage tooling instead.",
    replacement: "c8 or vitest coverage",
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

function extractReplacement(reason: string): string | undefined {
  const match =
    reason.match(
      /(?:use|upgrade to|switch to|replaced by|migrated to)\s+[`"']?([@\w\s/-]+?)[`"']?(?:\s+instead|\.|,|$)/i
    ) ?? reason.match(/(?:see|checkout)\s+(https?:\/\/[^\s]+)/i)
  return match ? match[1]?.trim() : undefined
}

export async function fetchPackageDeprecationInfo(
  name: string,
  timeoutMs = 8000
): Promise<{
  deprecated?: string
  lastPublished?: string
  repository?: string
  homepage?: string
  versionsDeprecated?: Record<string, string>
}> {
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

    // Find newest publish time
    let lastPublished: string | undefined
    if (data.time) {
      if (data.time.modified && data.time.modified !== data.time.created) {
        lastPublished = data.time.modified
      } else if (latestVersion && data.time[latestVersion]) {
        lastPublished = data.time[latestVersion]
      } else {
        const dates = Object.entries(data.time)
          .filter(([k]) => k !== "created" && k !== "modified")
          .map(([, v]) => v)
          .sort()
        if (dates.length > 0) {
          lastPublished = dates[dates.length - 1]
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
 * Audits all declared dependencies across the monorepo for official npm deprecations and maintenance abandonment.
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
      const info = await fetchPackageDeprecationInfo(name, opts.timeoutMs ?? 8000)
      done++
      if (opts.onProgress) {
        opts.onProgress({ phase: "deprecation", done, total: names.length })
      }
      return { name, info }
    },
    concurrency
  )

  const registryMap = new Map(registryData.map((d) => [d.name, d.info]))
  const results: DeprecatedPackage[] = []

  for (const name of names) {
    const versionMap = depMap.get(name)!
    const regInfo = registryMap.get(name) || {}
    const known = KNOWN_DEPRECATIONS[name]

    // Gather workspaces where this package is used
    const usages: Array<{
      workspace: string
      type: DepType
      rawVersion: string
    }> = []
    let hasProd = false
    let hasDev = false
    let chosenVersion = ""

    for (const [v, occurrences] of versionMap.entries()) {
      if (isLinkedProtocol(v)) continue
      if (!chosenVersion) chosenVersion = v
      for (const occ of occurrences) {
        usages.push({ workspace: occ.workspace, type: occ.type, rawVersion: v })
        if (occ.type === "prod") hasProd = true
        if (occ.type === "dev") hasDev = true
      }
    }

    if (usages.length === 0) continue

    // Determine deprecation status
    let isDeprecated = false
    let deprecationReason: string | undefined

    if (known) {
      isDeprecated = true
      deprecationReason = known.reason
    } else if (regInfo.deprecated) {
      isDeprecated = true
      deprecationReason = regInfo.deprecated
    } else if (regInfo.versionsDeprecated && Object.keys(regInfo.versionsDeprecated).length > 0) {
      // Check if current version or all versions are deprecated
      const matched =
        regInfo.versionsDeprecated[chosenVersion] || Object.values(regInfo.versionsDeprecated)[0]
      if (matched) {
        isDeprecated = true
        deprecationReason = matched
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
      yearsSinceLastRelease = 3.0
      daysSinceLastRelease = 1095
    }

    if (!isDeprecated && !isAbandoned) {
      continue
    }

    let replacement: string | undefined = known?.replacement
    if (!replacement && deprecationReason) {
      replacement = extractReplacement(deprecationReason)
    }

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
      replacementSuggestion: replacement,
      homepage: regInfo.homepage,
      repository: regInfo.repository,
    })
  }

  // Sort: Deprecated in Prod first, then Deprecated in Dev, then Abandoned, then alphabetical
  results.sort((a, b) => {
    if (a.deprecated && !b.deprecated) return -1
    if (!a.deprecated && b.deprecated) return 1
    if (a.isProd && !b.isProd) return -1
    if (!a.isProd && b.isProd) return 1
    if ((b.yearsSinceLastRelease ?? 0) !== (a.yearsSinceLastRelease ?? 0)) {
      return (b.yearsSinceLastRelease ?? 0) - (a.yearsSinceLastRelease ?? 0)
    }
    return a.name.localeCompare(b.name)
  })

  const totalDeprecated = results.filter((r) => r.deprecated).length
  const totalAbandoned = results.filter((r) => r.isAbandoned).length
  const deprecatedInProd = results.filter((r) => r.deprecated && r.isProd).length
  const deprecatedInDev = results.filter((r) => r.deprecated && !r.isProd).length
  const abandonedInProd = results.filter((r) => r.isAbandoned && r.isProd).length

  return {
    packages: results,
    totalScanned: names.length,
    totalDeprecated,
    totalAbandoned,
    deprecatedInProd,
    deprecatedInDev,
    abandonedInProd,
  }
}
