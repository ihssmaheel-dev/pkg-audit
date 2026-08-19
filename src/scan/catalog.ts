import fs from "node:fs"
import path from "node:path"
import type { CatalogEntry, CatalogMigrationResult, CatalogPlan, ScanResult } from "../types.js"
import { compareSemver, detectIndent } from "./fix.js"

export interface ParsedPnpmWorkspace {
  exists: boolean
  filePath: string
  packages: string[]
  catalog: Record<string, string>
  catalogs: Record<string, Record<string, string>>
  raw: string
}

/**
 * Reads and parses pnpm-workspace.yaml if present in rootDir.
 */
export function readPnpmWorkspaceYaml(rootDir: string): ParsedPnpmWorkspace {
  const filePath = path.resolve(rootDir, "pnpm-workspace.yaml")
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      filePath,
      packages: [],
      catalog: {},
      catalogs: {},
      raw: "",
    }
  }

  let raw = ""
  try {
    raw = fs.readFileSync(filePath, "utf8")
  } catch {
    return { exists: false, filePath, packages: [], catalog: {}, catalogs: {}, raw: "" }
  }

  const packages: string[] = []
  const catalog: Record<string, string> = {}
  const catalogs: Record<string, Record<string, string>> = {}

  // Parse sections line by line
  let currentSection: "packages" | "catalog" | "catalogs" | null = null
  let currentCatalogName: string | null = null

  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    if (/^packages\s*:/i.test(line)) {
      currentSection = "packages"
      currentCatalogName = null
      continue
    }

    if (/^catalog\s*:/i.test(line)) {
      currentSection = "catalog"
      currentCatalogName = null
      continue
    }

    if (/^catalogs\s*:/i.test(line)) {
      currentSection = "catalogs"
      currentCatalogName = null
      continue
    }

    // Top-level key change
    if (/^[a-zA-Z0-9_-]+\s*:/i.test(line) && !line.startsWith(" ") && !line.startsWith("\t")) {
      currentSection = null
      currentCatalogName = null
      continue
    }

    if (currentSection === "packages") {
      const match = trimmed.match(/^-\s*["']?([^"']+)["']?$/)
      if (match && match[1]) {
        packages.push(match[1])
      }
    } else if (currentSection === "catalog") {
      const match = trimmed.match(/^["']?([^"':\s]+)["']?\s*:\s*["']?([^"']+)["']?$/)
      if (match && match[1] && match[2]) {
        catalog[match[1]] = match[2]
      }
    } else if (currentSection === "catalogs") {
      const subCatalogHeader = line.match(/^\s{2}(["']?[a-zA-Z0-9_-]+["']?)\s*:\s*$/)
      if (subCatalogHeader && subCatalogHeader[1]) {
        currentCatalogName = subCatalogHeader[1].replace(/["']/g, "")
        if (!catalogs[currentCatalogName]) {
          catalogs[currentCatalogName] = {}
        }
      } else if (currentCatalogName) {
        const match = trimmed.match(/^["']?([^"':\s]+)["']?\s*:\s*["']?([^"']+)["']?$/)
        if (match && match[1] && match[2]) {
          catalogs[currentCatalogName]![match[1]] = match[2]
        }
      }
    }
  }

  return {
    exists: true,
    filePath,
    packages,
    catalog,
    catalogs,
    raw,
  }
}

/**
 * Builds the updated pnpm-workspace.yaml content containing the new catalog entries.
 */
export function serializePnpmWorkspaceYaml(
  existingYaml: string,
  newCatalog: Record<string, string>,
  defaultPackages: string[] = ["apps/*", "packages/*"]
): string {
  const sortedKeys = Object.keys(newCatalog).sort()
  const catalogLines = sortedKeys.map((k) => `  ${k}: ${newCatalog[k]}`)

  if (!existingYaml.trim()) {
    // Create new YAML from scratch
    return [
      "packages:",
      ...defaultPackages.map((p) => `  - "${p}"`),
      "",
      "catalog:",
      ...catalogLines,
      "",
    ].join("\n")
  }

  const lines = existingYaml.split(/\r?\n/)
  const result: string[] = []
  let inCatalog = false
  let catalogReplaced = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    if (/^catalog\s*:/i.test(line)) {
      inCatalog = true
      catalogReplaced = true
      result.push("catalog:")
      for (const cl of catalogLines) {
        result.push(cl)
      }
      continue
    }

    if (inCatalog) {
      // Check if we exited the catalog section (top level key or next section)
      if (/^[a-zA-Z0-9_-]+\s*:/i.test(line) && !line.startsWith(" ") && !line.startsWith("\t")) {
        inCatalog = false
        result.push(line)
      }
      // Else skip old catalog lines
      continue
    }

    result.push(line)
  }

  // If no catalog section was present, append it
  if (!catalogReplaced) {
    if (result.length > 0 && result[result.length - 1] !== "") {
      result.push("")
    }
    result.push("catalog:")
    for (const cl of catalogLines) {
      result.push(cl)
    }
    result.push("")
  }

  return result.join("\n")
}

/**
 * Generates a comprehensive plan to centralize dependencies into `pnpm-workspace.yaml` catalog:.
 */
export function generateCatalogPlan(
  scanData: ScanResult,
  options: {
    strategy?: "highest" | "most-frequent"
    allPackages?: boolean
  } = {}
): CatalogPlan {
  const strategy = options.strategy ?? "highest"
  const allPackages = options.allPackages ?? false
  const rootDir = scanData.root

  const existingWorkspace = readPnpmWorkspaceYaml(rootDir)
  const existingCatalog = existingWorkspace.catalog

  // Collect internal monorepo workspace names to avoid cataloging workspace packages
  const internalWorkspaceNames = new Set<string>()
  for (const ws of scanData.workspaces) {
    if (ws.name) internalWorkspaceNames.add(ws.name)
  }

  // Map of pkgName -> list of { workspace, version, type }
  const pkgUsages = new Map<string, Array<{ workspace: string; version: string; type: string }>>()

  for (const ws of scanData.workspaces) {
    for (const [depName, depRecord] of Object.entries(ws.deps)) {
      // Skip internal workspace packages and already cataloged entries
      if (internalWorkspaceNames.has(depName)) continue
      if (depRecord.version.startsWith("catalog:") || depRecord.version.startsWith("workspace:")) {
        continue
      }
      // Skip peer and optional dependencies
      if (depRecord.type === "peer" || depRecord.type === "optional") continue

      if (!pkgUsages.has(depName)) {
        pkgUsages.set(depName, [])
      }
      pkgUsages.get(depName)!.push({
        workspace: ws.relPath,
        version: depRecord.version,
        type: depRecord.type,
      })
    }
  }

  const catalogEntries: CatalogEntry[] = []
  const affectedWorkspaceFiles = new Set<string>()

  for (const [pkgName, usages] of pkgUsages.entries()) {
    const workspaces = Array.from(new Set(usages.map((u) => u.workspace))).sort()

    // By default, catalog dependencies used in >= 2 workspaces OR any dependency with version conflicts
    const isConflicted = scanData.conflicts.some((c) => c.name === pkgName)
    const isShared = workspaces.length >= 2
    if (!allPackages && !isShared && !isConflicted) {
      continue
    }

    // Determine target version
    let targetVersion = existingCatalog[pkgName] ?? ""
    const previousVersions: Record<string, string> = {}
    for (const u of usages) {
      previousVersions[u.workspace] = u.version
      affectedWorkspaceFiles.add(u.workspace)
    }

    if (!targetVersion) {
      if (strategy === "most-frequent") {
        const counts = new Map<string, number>()
        for (const u of usages) {
          counts.set(u.version, (counts.get(u.version) ?? 0) + 1)
        }
        let maxCount = 0
        for (const [ver, count] of counts.entries()) {
          if (count > maxCount || (count === maxCount && compareSemver(ver, targetVersion) > 0)) {
            maxCount = count
            targetVersion = ver
          }
        }
      } else {
        // Highest version strategy
        targetVersion = usages[0]!.version
        for (const u of usages) {
          if (compareSemver(u.version, targetVersion) > 0) {
            targetVersion = u.version
          }
        }
      }
    }

    catalogEntries.push({
      name: pkgName,
      targetVersion,
      workspacesCount: workspaces.length,
      workspaces,
      previousVersions,
    })
  }

  catalogEntries.sort((a, b) => b.workspacesCount - a.workspacesCount || a.name.localeCompare(b.name))

  return {
    catalogEntries,
    strategy,
    totalPackages: catalogEntries.length,
    totalWorkspacesUpdated: affectedWorkspaceFiles.size,
    pnpmWorkspaceYamlPath: existingWorkspace.filePath,
    existingCatalogCount: Object.keys(existingCatalog).length,
    updatedWorkspaceFiles: Array.from(affectedWorkspaceFiles).sort(),
  }
}

/**
 * Applies the catalog migration to disk:
 * 1. Writes/updates `pnpm-workspace.yaml` `catalog:`.
 * 2. Replaces versions in workspace `package.json` files with `"catalog:"`.
 */
export async function applyCatalogPlan(
  rootDir: string,
  plan: CatalogPlan,
  scanData?: ScanResult
): Promise<CatalogMigrationResult> {
  const modifiedSet = new Set<string>()
  const errors: Array<{ path: string; error: string }> = []

  // 1. Read or initialize pnpm-workspace.yaml
  const pnpmYaml = readPnpmWorkspaceYaml(rootDir)
  const mergedCatalog: Record<string, string> = { ...pnpmYaml.catalog }

  for (const entry of plan.catalogEntries) {
    mergedCatalog[entry.name] = entry.targetVersion
  }

  // Derive default package globs from scanData if available
  let defaultPackageGlobs = ["apps/*", "packages/*"]
  if (scanData && scanData.workspaces.length > 0) {
    const parentDirs = new Set<string>()
    for (const ws of scanData.workspaces) {
      if (ws.relPath === ".") continue
      const parent = path.dirname(ws.relPath).replace(/\\/g, "/")
      if (parent && parent !== ".") {
        parentDirs.add(`${parent}/*`)
      }
    }
    if (parentDirs.size > 0) {
      defaultPackageGlobs = Array.from(parentDirs).sort()
    }
  }

  const updatedYamlContent = serializePnpmWorkspaceYaml(
    pnpmYaml.raw,
    mergedCatalog,
    pnpmYaml.packages.length > 0 ? pnpmYaml.packages : defaultPackageGlobs
  )

  try {
    fs.writeFileSync(pnpmYaml.filePath, updatedYamlContent, "utf8")
    modifiedSet.add(pnpmYaml.filePath)
  } catch (err) {
    errors.push({ path: pnpmYaml.filePath, error: `Failed to write YAML: ${String(err)}` })
  }

  // 2. Build set of catalog package names
  const catalogPackageNames = new Set<string>(plan.catalogEntries.map((e) => e.name))

  // 3. Update workspace package.json files
  const DEP_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"]

  const targetWorkspaces: Array<{ relPath: string; absPath: string }> = []
  if (scanData && scanData.workspaces.length > 0) {
    for (const ws of scanData.workspaces) {
      targetWorkspaces.push({
        relPath: ws.relPath,
        absPath: ws.absPath ?? path.resolve(rootDir, ws.relPath, "package.json"),
      })
    }
  } else {
    // Fallback: update workspaces specified in plan
    for (const wsRel of plan.updatedWorkspaceFiles) {
      targetWorkspaces.push({
        relPath: wsRel,
        absPath: path.resolve(rootDir, wsRel, "package.json"),
      })
    }
  }

  for (const ws of targetWorkspaces) {
    if (!fs.existsSync(ws.absPath)) continue

    let raw: string
    try {
      raw = fs.readFileSync(ws.absPath, "utf8")
    } catch (err) {
      errors.push({ path: ws.absPath, error: String(err) })
      continue
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch (err) {
      errors.push({ path: ws.absPath, error: `Invalid JSON: ${String(err)}` })
      continue
    }

    let changed = false
    const indent = detectIndent(raw)
    const hasTrailingNewline = raw.endsWith("\n")
    const eol = raw.includes("\r\n") ? "\r\n" : "\n"

    for (const section of DEP_SECTIONS) {
      if (!parsed[section] || typeof parsed[section] !== "object") continue
      const deps = parsed[section] as Record<string, string>

      for (const pkg of Object.keys(deps)) {
        if (catalogPackageNames.has(pkg)) {
          if (deps[pkg] !== "catalog:") {
            deps[pkg] = "catalog:"
            changed = true
          }
        }
      }
    }

    if (changed) {
      try {
        let updatedJson = JSON.stringify(parsed, null, indent)
        if (eol === "\r\n") updatedJson = updatedJson.replace(/\n/g, "\r\n")
        if (hasTrailingNewline) updatedJson += eol
        fs.writeFileSync(ws.absPath, updatedJson, "utf8")
        modifiedSet.add(ws.absPath)
      } catch (err) {
        errors.push({ path: ws.absPath, error: `Failed to write manifest: ${String(err)}` })
      }
    }
  }

  return {
    ok: errors.length === 0,
    pnpmWorkspaceYamlPath: pnpmYaml.filePath,
    catalogCount: Object.keys(mergedCatalog).length,
    modifiedFiles: Array.from(modifiedSet),
    errors,
  }
}
