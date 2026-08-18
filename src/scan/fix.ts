import fs from "node:fs"
import path from "node:path"
import type { Conflict, ScanResult } from "../types.js"

export type FixStrategy = "highest" | "most-frequent"

export interface PackageFix {
  name: string
  targetVersion: string
  workspaces?: string[] // if specified, only apply to these workspaces; otherwise all
}

export interface FixChange {
  workspace: string
  filePath: string
  pkg: string
  from: string
  to: string
  depType: string
}

export interface FixResult {
  ok: boolean
  modifiedFiles: string[]
  changes: FixChange[]
  errors: Array<{ path: string; error: string }>
}

export interface AutoFixPlan {
  fixes: PackageFix[]
  strategy: FixStrategy
  totalConflicts: number
}

// Clean semver string for numerical comparison: "^19.0.0-rc.1" -> "19.0.0-rc.1"
function cleanSemver(v: string): string {
  return v.replace(/^[\^~>=<\s]+/, "").trim()
}

// Parse semver into numeric tuple [major, minor, patch, prerelease]
function parseSemverTuple(v: string): [number, number, number, string] {
  const clean = cleanSemver(v)
  const [core = "", prerelease = ""] = clean.split("-")
  const parts = core.split(".").map((n) => Number.parseInt(n, 10) || 0)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, prerelease]
}

// Compare two semver strings: returns > 0 if a > b, < 0 if a < b, 0 if equal
export function compareSemver(a: string, b: string): number {
  const [majA, minA, patA, preA] = parseSemverTuple(a)
  const [majB, minB, patB, preB] = parseSemverTuple(b)

  if (majA !== majB) return majA - majB
  if (minA !== minB) return minA - minB
  if (patA !== patB) return patA - patB

  if (!preA && preB) return 1
  if (preA && !preB) return -1
  return preA.localeCompare(preB)
}

export function pickTargetVersion(conflict: Conflict, strategy: FixStrategy): string {
  if (!conflict.versions.length) return ""

  if (strategy === "most-frequent") {
    // Pick version with highest occurrence count across workspaces
    let best = conflict.versions[0]!
    for (const v of conflict.versions) {
      if (v.occurrences.length > best.occurrences.length) {
        best = v
      } else if (v.occurrences.length === best.occurrences.length) {
        // If equal, prefer higher semver
        if (compareSemver(v.version, best.version) > 0) {
          best = v
        }
      }
    }
    return best.version
  }

  // Strategy: "highest" (default)
  let highest = conflict.versions[0]!.version
  for (const v of conflict.versions) {
    if (compareSemver(v.version, highest) > 0) {
      highest = v.version
    }
  }
  return highest
}

export function resolveConflictsAuto(result: ScanResult, strategy: FixStrategy = "highest"): AutoFixPlan {
  const fixes: PackageFix[] = []

  for (const conflict of result.conflicts) {
    const targetVersion = pickTargetVersion(conflict, strategy)
    if (targetVersion) {
      fixes.push({
        name: conflict.name,
        targetVersion,
      })
    }
  }

  return {
    fixes,
    strategy,
    totalConflicts: result.conflicts.length,
  }
}

// Detect indentation (e.g. 2 spaces, 4 spaces, tab)
function detectIndent(raw: string): string | number {
  const match = raw.match(/^[ \t]+(?=")/m)
  if (!match) return 2
  const indent = match[0]
  if (indent.includes("\t")) return "\t"
  return indent.length || 2
}

export async function applyFixes(
  rootDir: string,
  fixes: PackageFix[],
  scanData?: ScanResult
): Promise<FixResult> {
  const fixMap = new Map<string, PackageFix>()
  for (const f of fixes) {
    fixMap.set(f.name, f)
  }

  const modifiedSet = new Set<string>()
  const changes: FixChange[] = []
  const errors: Array<{ path: string; error: string }> = []

  // If scanData is provided, use workspace paths; otherwise search manifests in rootDir
  const workspacePaths: Array<{ name: string; relPath: string; absPath: string }> = []

  if (scanData && scanData.workspaces.length > 0) {
    for (const ws of scanData.workspaces) {
      workspacePaths.push({
        name: ws.name,
        relPath: ws.relPath,
        absPath: ws.absPath ?? path.resolve(rootDir, ws.relPath, "package.json"),
      })
    }
  } else {
    // Fallback: search all package.json files recursively
    const findPackageJsons = (dir: string): string[] => {
      const results: string[] = []
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            results.push(...findPackageJsons(full))
          } else if (entry.name === "package.json") {
            results.push(full)
          }
        }
      } catch {
        // Ignore read errors
      }
      return results
    }

    const pkgFiles = findPackageJsons(rootDir)
    for (const file of pkgFiles) {
      workspacePaths.push({
        name: path.basename(path.dirname(file)),
        relPath: path.relative(rootDir, path.dirname(file)) || ".",
        absPath: file,
      })
    }
  }

  const DEP_SECTIONS = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const

  for (const ws of workspacePaths) {
    const pkgJsonPath = ws.absPath.endsWith("package.json")
      ? ws.absPath
      : path.join(ws.absPath, "package.json")

    if (!fs.existsSync(pkgJsonPath)) continue

    let raw: string
    try {
      raw = fs.readFileSync(pkgJsonPath, "utf8")
    } catch (err) {
      errors.push({ path: pkgJsonPath, error: String(err) })
      continue
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch (err) {
      errors.push({ path: pkgJsonPath, error: `Invalid JSON: ${String(err)}` })
      continue
    }

    let changed = false
    const indent = detectIndent(raw)
    const hasTrailingNewline = raw.endsWith("\n")
    const eol = raw.includes("\r\n") ? "\r\n" : "\n"

    for (const section of DEP_SECTIONS) {
      const deps = parsed[section] as Record<string, string> | undefined
      if (!deps || typeof deps !== "object") continue

      for (const [depName, currentVer] of Object.entries(deps)) {
        const fix = fixMap.get(depName)
        if (!fix) continue

        // If specific workspaces were requested, check match
        if (fix.workspaces && fix.workspaces.length > 0) {
          const matches = fix.workspaces.some(
            (w) => w === ws.name || w === ws.relPath || w === path.basename(ws.relPath)
          )
          if (!matches) continue
        }

        if (currentVer !== fix.targetVersion) {
          deps[depName] = fix.targetVersion
          changed = true
          changes.push({
            workspace: ws.name || ws.relPath,
            filePath: pkgJsonPath,
            pkg: depName,
            from: currentVer,
            to: fix.targetVersion,
            depType: section,
          })
        }
      }
    }

    if (changed) {
      try {
        let updatedJson = JSON.stringify(parsed, null, indent)
        if (eol === "\r\n") {
          updatedJson = updatedJson.replace(/\n/g, "\r\n")
        }
        if (hasTrailingNewline) {
          updatedJson += eol
        }
        fs.writeFileSync(pkgJsonPath, updatedJson, "utf8")
        modifiedSet.add(pkgJsonPath)
      } catch (err) {
        errors.push({ path: pkgJsonPath, error: `Failed to write: ${String(err)}` })
      }
    }
  }

  return {
    ok: errors.length === 0,
    modifiedFiles: Array.from(modifiedSet),
    changes,
    errors,
  }
}
