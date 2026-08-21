import fs from "node:fs"
import path from "node:path"
import type { DedupePackage, DedupeResult, DedupeVersionInstance } from "../types.js"
import { compareSemver, type FixResult } from "./fix.js"

export interface RawLockfilePackage {
  name: string
  version: string
  dependent?: string
}

function cleanSemver(v: string): string {
  return v.replace(/^[\^~>=<\s]+/, "").trim()
}

const dirSizeCache = new Map<string, number>()
const pnpmEntriesCache = new Map<string, string[]>()

function measureDirSize(dirPath: string): number {
  if (dirSizeCache.has(dirPath)) return dirSizeCache.get(dirPath)!
  let total = 0
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const e of entries) {
      if (e.name === ".git" || e.name === "node_modules") continue
      const full = path.join(dirPath, e.name)
      if (e.isDirectory()) {
        total += measureDirSize(full)
      } else if (e.isFile()) {
        try {
          total += fs.statSync(full).size
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  dirSizeCache.set(dirPath, total)
  return total
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const packageEstimatedSizeCache = new Map<string, number>()

export function estimatePackageSize(rootDir: string, pkgName: string): number {
  const cacheKey = `${rootDir}::${pkgName}`
  if (packageEstimatedSizeCache.has(cacheKey)) {
    return packageEstimatedSizeCache.get(cacheKey)!
  }

  const candidates = [
    path.join(rootDir, "node_modules", pkgName),
    path.join(rootDir, "node_modules", ".pnpm"),
  ]

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      if (c.endsWith(".pnpm")) {
        try {
          let entries = pnpmEntriesCache.get(c)
          if (!entries) {
            entries = fs.readdirSync(c)
            pnpmEntriesCache.set(c, entries)
          }
          const cleanName = pkgName.replace("/", "+")
          const matched = entries.find((e) => e.startsWith(cleanName))
          if (matched) {
            const size = measureDirSize(path.join(c, matched, "node_modules", pkgName))
            if (size > 0) {
              packageEstimatedSizeCache.set(cacheKey, size)
              return size
            }
          }
        } catch {
          // ignore
        }
      } else {
        const size = measureDirSize(c)
        if (size > 0) {
          packageEstimatedSizeCache.set(cacheKey, size)
          return size
        }
      }
    }
  }

  // Fallback estimated baseline: ~120KB per typical JS/TS package
  const fallback = 120 * 1024
  packageEstimatedSizeCache.set(cacheKey, fallback)
  return fallback
}

/**
 * Parses package-lock.json (v1, v2, v3 formats)
 */
function parseNpmLockfile(content: string): RawLockfilePackage[] {
  const result: RawLockfilePackage[] = []
  try {
    const json = JSON.parse(content)

    // Lockfile v2 & v3: packages map
    if (json.packages && typeof json.packages === "object") {
      for (const [key, pkgObj] of Object.entries(json.packages)) {
        if (!key || key === "" || !pkgObj || typeof pkgObj !== "object") continue
        const version = (pkgObj as { version?: string }).version
        if (!version || typeof version !== "string") continue

        // Extract package name from path like "node_modules/@scope/pkg" or "node_modules/foo/node_modules/bar"
        const lastNodeModulesIndex = key.lastIndexOf("node_modules/")
        if (lastNodeModulesIndex === -1) continue

        const pkgName = key.slice(lastNodeModulesIndex + "node_modules/".length)
        if (!pkgName || pkgName.startsWith(".")) continue

        // Find dependent from path if nested
        let dependent: string | undefined
        if (lastNodeModulesIndex > 0) {
          const parentPath = key.slice(0, lastNodeModulesIndex)
          const parentNMIndex = parentPath.lastIndexOf("node_modules/")
          if (parentNMIndex !== -1) {
            dependent = parentPath.slice(parentNMIndex + "node_modules/".length).replace(/\/$/, "")
          }
        }

        result.push({ name: pkgName, version: cleanSemver(version), dependent })
      }
      return result
    }

    // Lockfile v1: recursive dependencies map
    if (json.dependencies && typeof json.dependencies === "object") {
      const walk = (deps: Record<string, unknown>, parent?: string) => {
        for (const [name, depObj] of Object.entries(deps)) {
          if (!depObj || typeof depObj !== "object") continue
          const v = (depObj as { version?: string }).version
          if (v && typeof v === "string") {
            result.push({ name, version: cleanSemver(v), dependent: parent })
          }
          const nested = (depObj as { dependencies?: Record<string, unknown> }).dependencies
          if (nested && typeof nested === "object") {
            walk(nested, name)
          }
        }
      }
      walk(json.dependencies as Record<string, unknown>)
    }
  } catch {
    // Ignore JSON parse errors
  }
  return result
}

/**
 * Parses pnpm-lock.yaml (v5, v6, v9 formats) without external YAML parser
 */
function parsePnpmLockfile(content: string): RawLockfilePackage[] {
  const result: RawLockfilePackage[] = []
  const lines = content.split(/\r?\n/)
  let inPackages = false
  let currentPkg: RawLockfilePackage | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // Track top-level packages section
    if (/^packages:\s*$/.test(line) || /^snapshots:\s*$/.test(line)) {
      inPackages = true
      continue
    }

    // Exit packages section on next top-level key
    if (inPackages && /^[a-zA-Z0-9_-]+:\s*$/.test(line) && !line.startsWith(" ")) {
      inPackages = false
      continue
    }

    if (!inPackages) continue

    // Detect package entry lines in pnpm-lock.yaml:
    // v5/v6 format: "  /@babel/core@7.24.0:" or "  /lodash@4.17.21:" or "  'lodash@4.17.21':"
    // v9 format: "  '@babel/core@7.24.0':" or "  'lodash@4.17.21(foo@1.0.0)':"
    const match = line.match(/^\s{2}(?:'|")?\/?((?:@[^@/]+\/)?[^@/\s'"]+)@([0-9][^:('"]*)(?:.*)?:/)
    if (match && match[1] && match[2]) {
      const name = match[1].replace(/^\//, "")
      // Strip peer suffix e.g. 4.17.21_react@18.0.0 -> 4.17.21
      const rawVer = match[2].split("(")[0]?.split("_")[0] ?? match[2]
      const version = cleanSemver(rawVer)
      if (name && version) {
        currentPkg = { name, version }
        result.push(currentPkg)
      }
    }
  }

  return result
}

/**
 * Parses yarn.lock (v1 and v2/v3/v4 Berry formats)
 */
function parseYarnLockfile(content: string): RawLockfilePackage[] {
  const result: RawLockfilePackage[] = []
  const lines = content.split(/\r?\n/)
  let currentName: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    // Header line e.g. "lodash@^4.17.15", "lodash@^4.17.21":
    // or "@babel/core@^7.0.0":
    // or "lodash@npm:^4.17.15": (Berry)
    if (!line.startsWith(" ") && line.includes("@") && line.endsWith(":")) {
      const firstSpec = line.split(",")[0]?.trim().replace(/^"/, "").replace(/"?:$/, "") ?? ""
      const atIdx = firstSpec.lastIndexOf("@")
      if (atIdx > 0) {
        currentName = firstSpec.slice(0, atIdx)
      }
      continue
    }

    // Version line under header e.g. "  version "4.17.21"" or "  version: 4.17.21"
    if (currentName && /^\s+version(?::|\s)\s*"?([^"\s]+)"?/.test(line)) {
      const match = line.match(/^\s+version(?::|\s)\s*"?([^"\s]+)"?/)
      if (match && match[1]) {
        result.push({ name: currentName, version: cleanSemver(match[1]) })
      }
      currentName = null
    }
  }

  return result
}

/**
 * Parses bun.lock text lockfile
 */
function parseBunLockfile(content: string): RawLockfilePackage[] {
  const result: RawLockfilePackage[] = []
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const match = line.match(/"?((?:@[^@/]+\/)?[^@/\s'"]+)@([0-9][^"\s]*)"?:/)
    if (match && match[1] && match[2]) {
      result.push({ name: match[1], version: cleanSemver(match[2]) })
    }
  }

  return result
}

/**
 * Analyzes lockfile at rootDir for duplicate transitive packages and calculates optimal overrides.
 */
export function analyzeLockfile(
  rootDir: string,
  preferredPackageManager?: string | null
): DedupeResult | null {
  // Check available lockfiles in priority order
  const lockfileCandidates: Array<{
    file: "pnpm-lock.yaml" | "package-lock.json" | "yarn.lock" | "bun.lock"
    pm: "pnpm" | "npm" | "yarn" | "bun"
    parser: (content: string) => RawLockfilePackage[]
  }> = [
    { file: "pnpm-lock.yaml", pm: "pnpm", parser: parsePnpmLockfile },
    { file: "package-lock.json", pm: "npm", parser: parseNpmLockfile },
    { file: "yarn.lock", pm: "yarn", parser: parseYarnLockfile },
    { file: "bun.lock", pm: "bun", parser: parseBunLockfile },
  ]

  let chosenLockfile: (typeof lockfileCandidates)[number] | null = null
  let lockfilePath: string | null = null
  let fileContent = ""

  // If a package manager is specified in root package.json, check its lockfile first
  if (preferredPackageManager) {
    const normalized = preferredPackageManager.toLowerCase().split("@")[0] ?? ""
    const matched = lockfileCandidates.find((c) => c.pm === normalized)
    if (matched) {
      const p = path.join(rootDir, matched.file)
      if (fs.existsSync(p)) {
        chosenLockfile = matched
        lockfilePath = p
        fileContent = fs.readFileSync(p, "utf8")
      }
    }
  }

  // Otherwise check each candidate
  if (!chosenLockfile) {
    for (const candidate of lockfileCandidates) {
      const p = path.join(rootDir, candidate.file)
      if (fs.existsSync(p)) {
        chosenLockfile = candidate
        lockfilePath = p
        fileContent = fs.readFileSync(p, "utf8")
        break
      }
    }
  }

  if (!chosenLockfile || !lockfilePath || !fileContent) {
    return null
  }

  const rawPackages = chosenLockfile.parser(fileContent)
  if (rawPackages.length === 0) {
    return {
      packageManager: chosenLockfile.pm,
      lockfilePath,
      lockfileType: chosenLockfile.file,
      duplicates: [],
      totalDuplicates: 0,
      totalWastedVersions: 0,
      totalInstalledPackages: 0,
    }
  }

  // Group by package name -> Map<version, Set<dependents>>
  const pkgMap = new Map<string, Map<string, Set<string>>>()

  for (const item of rawPackages) {
    if (!pkgMap.has(item.name)) {
      pkgMap.set(item.name, new Map())
    }
    const versionMap = pkgMap.get(item.name)!
    if (!versionMap.has(item.version)) {
      versionMap.set(item.version, new Set())
    }
    if (item.dependent) {
      versionMap.get(item.version)!.add(item.dependent)
    }
  }

  const duplicates: DedupePackage[] = []
  let totalWastedVersions = 0

  for (const [pkgName, versionMap] of pkgMap.entries()) {
    const versionsList: DedupeVersionInstance[] = []
    for (const [version, deps] of versionMap.entries()) {
      versionsList.push({
        version,
        dependents: Array.from(deps),
      })
    }

    if (versionsList.length > 1) {
      // Sort versions using semver
      versionsList.sort((a, b) => compareSemver(b.version, a.version))

      const highestVersion = versionsList[0]!.version

      // Calculate most frequent
      let maxCount = -1
      let mostFrequent = highestVersion
      for (const v of versionsList) {
        const count = Math.max(1, v.dependents.length)
        if (count > maxCount) {
          maxCount = count
          mostFrequent = v.version
        }
      }

      const estimatedBytesPerInstance = estimatePackageSize(rootDir, pkgName)
      const estimatedSavingsBytes = (versionsList.length - 1) * estimatedBytesPerInstance

      duplicates.push({
        name: pkgName,
        versions: versionsList,
        suggestedVersion: highestVersion,
        duplicateCount: versionsList.length,
        highestVersion,
        mostFrequentVersion: mostFrequent,
        estimatedBytesPerInstance,
        estimatedSavingsBytes,
      })

      totalWastedVersions += versionsList.length - 1
    }
  }

  let totalSavings = 0
  for (const d of duplicates) {
    totalSavings += d.estimatedSavingsBytes ?? 0
  }

  // Sort duplicates by highest number of duplicate versions, then package name
  duplicates.sort((a, b) => b.duplicateCount - a.duplicateCount || a.name.localeCompare(b.name))

  return {
    packageManager: chosenLockfile.pm,
    lockfilePath,
    lockfileType: chosenLockfile.file,
    duplicates,
    totalDuplicates: duplicates.length,
    totalWastedVersions,
    totalInstalledPackages: pkgMap.size,
    savings: {
      estimatedBytes: totalSavings,
      estimatedHuman: formatBytes(totalSavings),
      redundantInstallsCount: totalWastedVersions,
    },
  }
}

/**
 * Generates an overrides / resolutions dictionary for all or selected duplicate packages.
 */
export function generateOverridesDict(
  duplicates: DedupePackage[],
  strategy: "highest" | "most-frequent" = "highest"
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const d of duplicates) {
    result[d.name] = strategy === "highest" ? d.highestVersion : d.mostFrequentVersion
  }
  return result
}

/**
 * Atomically updates root package.json with overrides / resolutions according to package manager.
 */
export function applyDedupeOverrides(
  rootDir: string,
  overrides: Record<string, string>,
  packageManager: "pnpm" | "npm" | "yarn" | "bun" | string
): FixResult {
  const pkgJsonPath = path.join(rootDir, "package.json")
  const result: FixResult = {
    ok: true,
    modifiedFiles: [],
    changes: [],
    errors: [],
  }

  if (!fs.existsSync(pkgJsonPath)) {
    result.ok = false
    result.errors.push({ path: pkgJsonPath, error: "root package.json not found" })
    return result
  }

  try {
    const raw = fs.readFileSync(pkgJsonPath, "utf8")
    // Detect indent
    const indentMatch = raw.match(/^[ \t]+(?=")/m)
    const indent = indentMatch ? indentMatch[0] : "  "

    const json = JSON.parse(raw)
    const pm = packageManager.toLowerCase().split("@")[0] ?? "npm"

    if (pm === "pnpm") {
      if (!json.pnpm || typeof json.pnpm !== "object") {
        json.pnpm = {}
      }
      json.pnpm.overrides = {
        ...(json.pnpm.overrides ?? {}),
        ...overrides,
      }
    } else if (pm === "yarn") {
      json.resolutions = {
        ...(json.resolutions ?? {}),
        ...overrides,
      }
    } else {
      // npm and bun standard: "overrides"
      json.overrides = {
        ...(json.overrides ?? {}),
        ...overrides,
      }
    }

    const updated = JSON.stringify(json, null, indent) + "\n"
    fs.writeFileSync(pkgJsonPath, updated, "utf8")
    result.modifiedFiles.push(pkgJsonPath)

    for (const [pkg, ver] of Object.entries(overrides)) {
      result.changes.push({
        workspace: ".",
        filePath: pkgJsonPath,
        pkg,
        from: "multiple versions",
        to: ver,
        depType: "overrides",
      })
    }
  } catch (err) {
    result.ok = false
    result.errors.push({ path: pkgJsonPath, error: String(err) })
  }

  return result
}
