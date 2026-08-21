import fs from "node:fs"
import path from "node:path"
import { buildDependencyMap, findConflicts } from "./conflicts.js"
import { findHygieneIssues } from "./hygiene.js"
import { buildWorkspaceGraph } from "./graph.js"
import type { Conflict, DepType, ScanResult, Workspace } from "../types.js"

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

// Verify that a resolved path is strictly inside the parent directory (blocks directory traversal)
export function isPathInside(childPath: string, parentDir: string): boolean {
  const rel = path.relative(path.resolve(parentDir), path.resolve(childPath))
  return !rel.startsWith("..") && !path.isAbsolute(rel)
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
export function detectIndent(raw: string): string | number {
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
      const abs = ws.absPath ?? path.resolve(rootDir, ws.relPath, "package.json")
      if (isPathInside(abs, rootDir)) {
        workspacePaths.push({
          name: ws.name,
          relPath: ws.relPath,
          absPath: abs,
        })
      }
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

export interface RemoveUnusedItem {
  workspace: string
  pkg: string
  type?: string
}

export async function removeUnusedDependencies(
  rootDir: string,
  items: RemoveUnusedItem[],
  scanData?: ScanResult
): Promise<FixResult> {
  const modifiedSet = new Set<string>()
  const changes: FixChange[] = []
  const errors: Array<{ path: string; error: string }> = []

  // Group items by workspace
  const workspaceMap = new Map<string, RemoveUnusedItem[]>()
  for (const item of items) {
    if (!workspaceMap.has(item.workspace)) {
      workspaceMap.set(item.workspace, [])
    }
    workspaceMap.get(item.workspace)!.push(item)
  }

  const DEP_SECTIONS = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const

  for (const [wsTarget, wsItems] of workspaceMap.entries()) {
    let pkgJsonPath: string | null = null

    // Find actual path via scanData if available
    if (scanData && scanData.workspaces.length > 0) {
      const match = scanData.workspaces.find((w) => w.relPath === wsTarget || w.name === wsTarget)
      if (match) {
        pkgJsonPath = path.resolve(rootDir, match.relPath, "package.json")
      } else {
        errors.push({ path: wsTarget, error: `Workspace '${wsTarget}' not found in scan results` })
        continue
      }
    } else {
      const candidate = path.resolve(rootDir, wsTarget, "package.json")
      if (isPathInside(candidate, rootDir)) {
        pkgJsonPath = candidate
      } else {
        errors.push({ path: wsTarget, error: "Access denied: target path is outside repository root" })
        continue
      }
    }

    if (!isPathInside(pkgJsonPath, rootDir)) {
      errors.push({ path: pkgJsonPath, error: "Access denied: manifest path is outside repository root" })
      continue
    }

    if (!fs.existsSync(pkgJsonPath)) {
      errors.push({ path: pkgJsonPath, error: "Manifest not found" })
      continue
    }

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

    for (const item of wsItems) {
      for (const section of DEP_SECTIONS) {
        const deps = parsed[section] as Record<string, string> | undefined
        if (deps && typeof deps === "object" && item.pkg in deps) {
          const prevVersion = deps[item.pkg] ?? ""
          delete deps[item.pkg]
          changed = true
          changes.push({
            workspace: wsTarget,
            filePath: pkgJsonPath,
            pkg: item.pkg,
            from: prevVersion,
            to: "(removed)",
            depType: section,
          })
        }
      }
    }

    if (changed) {
      try {
        let updatedJson = JSON.stringify(parsed, null, indent)
        if (eol === "\r\n") updatedJson = updatedJson.replace(/\n/g, "\r\n")
        if (hasTrailingNewline) updatedJson += eol
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

export interface DeclarePhantomItem {
  workspace: string
  pkg: string
  version: string
  type?: "prod" | "dev"
}

export async function declarePhantomDependencies(
  rootDir: string,
  items: DeclarePhantomItem[],
  scanData?: ScanResult
): Promise<FixResult> {
  const modifiedSet = new Set<string>()
  const changes: FixChange[] = []
  const errors: Array<{ path: string; error: string }> = []

  // Group items by workspace
  const workspaceMap = new Map<string, DeclarePhantomItem[]>()
  for (const item of items) {
    if (!workspaceMap.has(item.workspace)) {
      workspaceMap.set(item.workspace, [])
    }
    workspaceMap.get(item.workspace)!.push(item)
  }

  for (const [wsTarget, wsItems] of workspaceMap.entries()) {
    let pkgJsonPath: string | null = null

    // Find actual path via scanData if available
    if (scanData && scanData.workspaces.length > 0) {
      const match = scanData.workspaces.find((w) => w.relPath === wsTarget || w.name === wsTarget)
      if (match) {
        pkgJsonPath = path.resolve(rootDir, match.relPath, "package.json")
      } else {
        errors.push({ path: wsTarget, error: `Workspace '${wsTarget}' not found in scan results` })
        continue
      }
    } else {
      const candidate = path.resolve(rootDir, wsTarget, "package.json")
      if (isPathInside(candidate, rootDir)) {
        pkgJsonPath = candidate
      } else {
        errors.push({ path: wsTarget, error: "Access denied: target path is outside repository root" })
        continue
      }
    }

    if (!isPathInside(pkgJsonPath, rootDir)) {
      errors.push({ path: pkgJsonPath, error: "Access denied: manifest path is outside repository root" })
      continue
    }

    if (!fs.existsSync(pkgJsonPath)) {
      errors.push({ path: pkgJsonPath, error: "Manifest not found" })
      continue
    }

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

    for (const item of wsItems) {
      const section = item.type === "dev" ? "devDependencies" : "dependencies"
      if (!parsed[section] || typeof parsed[section] !== "object") {
        parsed[section] = {}
      }

      const deps = parsed[section] as Record<string, string>
      const prevVersion = deps[item.pkg] || "(none)"

      if (deps[item.pkg] !== item.version) {
        deps[item.pkg] = item.version

        // Sort keys alphabetically
        const sortedDeps: Record<string, string> = {}
        for (const k of Object.keys(deps).sort()) {
          sortedDeps[k] = deps[k]!
        }
        parsed[section] = sortedDeps

        changed = true
        changes.push({
          workspace: wsTarget,
          filePath: pkgJsonPath,
          pkg: item.pkg,
          from: prevVersion,
          to: item.version,
          depType: section,
        })
      }
    }

    if (changed) {
      try {
        let updatedJson = JSON.stringify(parsed, null, indent)
        if (eol === "\r\n") updatedJson = updatedJson.replace(/\n/g, "\r\n")
        if (hasTrailingNewline) updatedJson += eol
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

/**
 * Incrementally reconciles a ScanResult in memory after disk changes (<5ms)
 * without re-scanning thousands of source files, ASTs, or licenses across the monorepo.
 */
export async function fastReconcileScan(
  rootDir: string,
  previousScan: ScanResult,
  modifiedFiles: string[],
  actionInfo?: {
    action?: string
    fixes?: PackageFix[]
    unused?: RemoveUnusedItem[]
    phantoms?: DeclarePhantomItem[]
  }
): Promise<ScanResult> {
  const modSet = new Set(modifiedFiles.map((f) => path.resolve(f).toLowerCase()))

  // 1. Re-read only the modified workspace manifests
  const updatedWorkspaces: Workspace[] = await Promise.all(
    previousScan.workspaces.map(async (ws) => {
      const absPath = path.resolve(rootDir, ws.relPath, "package.json")
      if (!modSet.has(absPath.toLowerCase())) {
        return ws
      }

      try {
        if (!fs.existsSync(absPath)) return ws
        const raw = await fs.promises.readFile(absPath, "utf8")
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const deps: Record<string, { version: string; type: DepType }> = {}
        const DEP_FIELDS: ReadonlyArray<readonly [string, DepType]> = [
          ["dependencies", "prod"],
          ["devDependencies", "dev"],
          ["peerDependencies", "peer"],
          ["optionalDependencies", "optional"],
        ]

        for (const [field, type] of DEP_FIELDS) {
          const section = parsed[field] as Record<string, string> | undefined
          if (section && typeof section === "object") {
            for (const [name, version] of Object.entries(section)) {
              if (typeof version === "string") {
                deps[name] = { version, type }
              }
            }
          }
        }

        return {
          ...ws,
          name: typeof parsed.name === "string" ? parsed.name : ws.name,
          private: typeof parsed.private === "boolean" ? parsed.private : ws.private,
          version: typeof parsed.version === "string" ? parsed.version : ws.version,
          deps,
          depCount: Object.keys(deps).length,
        }
      } catch {
        return ws
      }
    })
  )

  // 2. Fast In-Memory Recomputation of Conflicts, Hygiene, and Graph
  const depMap = buildDependencyMap(updatedWorkspaces)
  const conflicts = findConflicts(depMap)
  const hygieneIssues = findHygieneIssues(updatedWorkspaces)
  const graph = buildWorkspaceGraph(updatedWorkspaces)

  // 3. Incrementally reconcile Phantoms and Unused
  let updatedUnused = previousScan.unused
  if (previousScan.unused) {
    let phantoms = [...previousScan.unused.phantoms]
    let unused = [...previousScan.unused.unused]

    if (actionInfo?.action === "declare-phantom" && actionInfo.phantoms) {
      const declaredKeys = new Set(actionInfo.phantoms.map((p) => `${p.workspace}:${p.pkg}`))
      phantoms = phantoms.filter((p) => !declaredKeys.has(`${p.workspace}:${p.name}`))
    }

    if (actionInfo?.action === "remove-unused" && actionInfo.unused) {
      const removedKeys = new Set(actionInfo.unused.map((u) => `${u.workspace}:${u.pkg}`))
      unused = unused.filter((u) => !removedKeys.has(`${u.workspace}:${u.name}`))
    }

    updatedUnused = {
      ...previousScan.unused,
      phantoms,
      unused,
    }
  }

  return {
    ...previousScan,
    workspaces: updatedWorkspaces,
    conflicts,
    hygieneIssues,
    graph,
    unused: updatedUnused,
    meta: {
      ...previousScan.meta,
      totalDepDeclarations: updatedWorkspaces.reduce((sum, w) => sum + w.depCount, 0),
      totalUniquePackages: depMap.size,
    },
  }
}
