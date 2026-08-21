import * as fs from "node:fs"
import * as path from "node:path"
import type { BoundariesResult, BoundaryRule, BoundaryViolation, ProgressEvent, Workspace } from "../types.js"
import { extractImportSpecifiers } from "./unused.js"

export const DEFAULT_BOUNDARY_RULES: BoundaryRule[] = [
  {
    from: "packages/**",
    disallow: ["apps/**", "services/**"],
    reason: "Shared library packages must never depend on top-level applications",
  },
  {
    from: "libs/**",
    disallow: ["apps/**", "services/**"],
    reason: "Shared library packages must never depend on top-level applications",
  },
  {
    from: "apps/*",
    disallow: ["apps/*"],
    reason: "Applications must not import directly from sibling applications",
  },
]

function normalizeGlob(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, "/")
  const regexStr =
    "^" +
    normalized
      .replace(/\*\*/g, "___GLOBSTAR___")
      .replace(/\*/g, "[^/]+")
      .replace(/___GLOBSTAR___/g, ".*") +
    "$"
  return new RegExp(regexStr, "i")
}

function matchesPattern(pattern: string, relativePath: string): boolean {
  const normPath = relativePath.replace(/\\/g, "/")
  const re = normalizeGlob(pattern)
  return re.test(normPath)
}

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

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
])

function walkFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".env") {
        if (IGNORE_DIRS.has(e.name)) continue
      }
      if (IGNORE_DIRS.has(e.name)) continue

      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        results.push(...walkFiles(full))
      } else if (e.isFile() && SOURCE_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
        results.push(full)
      }
    }
  } catch {
    // Ignore read errors
  }
  return results
}

export function checkBoundaryViolations(
  workspaces: Workspace[],
  rootDir: string,
  rules: BoundaryRule[] = DEFAULT_BOUNDARY_RULES,
  onProgress?: (event: ProgressEvent) => void,
  preloadedImports?: Map<string, Array<{ filePath: string; specifiers: string[] }>>
): BoundariesResult {
  const violations: BoundaryViolation[] = []
  if (workspaces.length === 0 || rules.length === 0) {
    return { violations: [], totalViolations: 0, rulesEvaluatedCount: rules.length }
  }

  // Build lookup of workspace by package name and by directory
  const wsByName = new Map<string, Workspace>()
  const wsDirs: Array<{ ws: Workspace; absDir: string; relDir: string }> = []

  for (const ws of workspaces) {
    if (ws.name) wsByName.set(ws.name, ws)
    const absDir = ws.absPath ? path.dirname(ws.absPath) : path.resolve(rootDir, ws.relPath)
    wsDirs.push({ ws, absDir, relDir: ws.relPath.replace(/\\/g, "/") })
  }

  function findWorkspaceForFile(absFilePath: string): Workspace | undefined {
    let bestMatch: Workspace | undefined
    let bestLen = 0
    for (const item of wsDirs) {
      const rel = path.relative(item.absDir, absFilePath)
      if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
        if (item.absDir.length > bestLen) {
          bestLen = item.absDir.length
          bestMatch = item.ws
        }
      }
    }
    return bestMatch
  }

  let totalFiles = 0
  const wsDataMap = new Map<Workspace, Array<{ filePath: string; specifiers: string[] }>>()

  for (const item of wsDirs) {
    if (item.ws.isRoot) continue

    if (preloadedImports && preloadedImports.has(item.ws.relPath)) {
      const files = preloadedImports.get(item.ws.relPath)!
      wsDataMap.set(item.ws, files)
      totalFiles += files.length
    } else if (!preloadedImports) {
      const filePaths = walkFiles(item.absDir)
      const list: Array<{ filePath: string; specifiers: string[] }> = []
      for (const fp of filePaths) {
        try {
          const content = fs.readFileSync(fp, "utf8")
          list.push({ filePath: fp, specifiers: Array.from(extractImportSpecifiers(content)) })
        } catch {
          // Ignore
        }
      }
      wsDataMap.set(item.ws, list)
      totalFiles += list.length
    }
  }

  let filesDone = 0

  for (const [ws, fileItems] of wsDataMap.entries()) {
    const wsRel = ws.relPath.replace(/\\/g, "/")
    const matchingRules: BoundaryRule[] = []

    for (const r of rules) {
      if (matchesPattern(r.from, wsRel)) {
        matchingRules.push(r)
      }
    }

    if (matchingRules.length === 0) {
      filesDone += fileItems.length
      continue
    }

    for (const item of fileItems) {
      const { filePath, specifiers } = item
      filesDone++
      if (onProgress && totalFiles > 0 && filesDone % 20 === 0) {
        onProgress({ phase: "boundaries", done: filesDone, total: totalFiles })
      }

      for (const spec of specifiers) {
        let targetWs: Workspace | undefined

        if (spec.startsWith(".")) {
          // Relative import
          const resolvedTarget = path.resolve(path.dirname(filePath), spec)
          targetWs = findWorkspaceForFile(resolvedTarget)
        } else {
          // Package import: check if matches any monorepo workspace name
          // (e.g. "@repo/api" or "@repo/api/utils")
          for (const [wsName, candidateWs] of wsByName.entries()) {
            if (spec === wsName || spec.startsWith(`${wsName}/`)) {
              targetWs = candidateWs
              break
            }
          }
        }

        if (!targetWs || targetWs === ws || targetWs.isRoot) {
          continue
        }

        const targetRel = targetWs.relPath.replace(/\\/g, "/")

        // Check matching rules
        for (const rule of matchingRules) {
          for (const disallowPattern of rule.disallow) {
            // Sibling apps check: disallow "apps/*" means another app, not self
            if (matchesPattern(disallowPattern, targetRel)) {
              const ruleDesc =
                rule.reason || `Workspace '${wsRel}' cannot import from disallowed target '${targetRel}'`
              violations.push({
                sourceFile: path.relative(rootDir, filePath).replace(/\\/g, "/"),
                sourceWorkspace: ws.name || wsRel,
                importedSpecifier: spec,
                targetWorkspace: targetWs.name || targetRel,
                ruleDescription: ruleDesc,
              })
              break
            }
          }
        }
      }
    }
  }

  return {
    violations,
    totalViolations: violations.length,
    rulesEvaluatedCount: rules.length,
  }
}
