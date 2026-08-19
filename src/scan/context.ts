import type { ScanResult, Workspace } from "../types.js"

export interface ContextOptions {
  format?: "markdown" | "json" | "xml"
  target?: "generic" | "cursor" | "claude"
  projectName?: string
  maxVersionPolicyEntries?: number
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeMdTable(s: string): string {
  return s.replace(/\|/g, "\\|")
}

function cleanSemver(v: string): string {
  return v.replace(/^[\^~>=<\s]+/, "").trim()
}

function parseSemver(v: string): [number, number, number] {
  const clean = cleanSemver(v).split("-")[0] ?? ""
  const parts = clean.split(".").map((n) => Number.parseInt(n, 10) || 0)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

function compareSemver(a: string, b: string): number {
  const [majA, minA, patA] = parseSemver(a)
  const [majB, minB, patB] = parseSemver(b)
  if (majA !== majB) return majA - majB
  if (minA !== minB) return minA - minB
  return patA - patB
}

function classifyWorkspaceRole(ws: Workspace): "app" | "library" | "config" | "root" {
  if (ws.isRoot) return "root"
  const p = ws.relPath.toLowerCase().replace(/\\/g, "/")
  const n = (ws.name || "").toLowerCase()

  // 1. Config / tooling check (checked first so config packages with web/api in name aren't misclassified)
  if (
    p.startsWith("config/") ||
    p.startsWith("tooling/") ||
    p.startsWith("tools/") ||
    n.includes("config") ||
    n.includes("tsconfig") ||
    n.includes("eslint") ||
    n.includes("prettier") ||
    n.includes("stylelint")
  ) {
    return "config"
  }

  // 2. Apps check (strict directory paths or unambiguous segment/suffix match)
  if (
    p.startsWith("apps/") ||
    p.startsWith("app/") ||
    p.startsWith("services/") ||
    p.startsWith("service/") ||
    p.startsWith("frontend/") ||
    p.startsWith("backend/") ||
    p.startsWith("web/") ||
    p.startsWith("api/") ||
    n.endsWith("-app") ||
    n.endsWith("-web") ||
    n.endsWith("-service") ||
    n.endsWith("/web") ||
    n.endsWith("/api") ||
    n.endsWith("/app") ||
    n.endsWith("/server") ||
    n === "web" ||
    n === "api" ||
    n === "app" ||
    n === "server" ||
    n === "client" ||
    n.startsWith("@app/") ||
    n.startsWith("@apps/")
  ) {
    return "app"
  }

  // 3. Shared Library is default for packages/*, libs/*, etc.
  return "library"
}

function getBasename(dirPath: string): string {
  const parts = dirPath.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? dirPath
}

/**
 * Generates an optimized, token-efficient Monorepo Context document for LLM coding agents.
 */
export function generateMonorepoContext(data: ScanResult, opts: ContextOptions = {}): string {
  const format = opts.format ?? "markdown"
  const target = opts.target ?? "generic"
  const projectName = opts.projectName ?? getBasename(data.root)
  const maxVersionEntries = opts.maxVersionPolicyEntries ?? 30

  const rootWs = data.workspaces.find((w) => w.isRoot)
  const pm = rootWs?.packageManager ?? (data.dedupe?.packageManager || "npm")

  const nonRootWs = data.workspaces.filter((w) => !w.isRoot)
  const wsMap = new Map<string, Workspace>()
  for (const ws of data.workspaces) {
    if (ws.name) wsMap.set(ws.name, ws)
    if (ws.relPath && ws.relPath !== ".") wsMap.set(ws.relPath, ws)
  }

  // Workspaces detail
  const workspacesInfo = nonRootWs.map((ws) => {
    const role = classifyWorkspaceRole(ws)
    const internalDeps: string[] = []
    for (const depName of Object.keys(ws.deps)) {
      if (wsMap.has(depName)) {
        internalDeps.push(depName)
      }
    }
    return {
      name: ws.name || ws.relPath,
      relPath: ws.relPath,
      role,
      private: ws.private,
      internalDependencies: internalDeps,
      depCount: ws.depCount,
      devCount: ws.devCount,
    }
  })

  // Canonical versions for shared external packages
  const canonicalVersions: Record<string, string> = {}
  if (data.catalog && data.catalog.catalogEntries.length > 0) {
    for (const entry of data.catalog.catalogEntries) {
      canonicalVersions[entry.name] = entry.targetVersion
    }
  }

  // If no catalog, calculate from top shared packages (with deterministic tie-break)
  if (Object.keys(canonicalVersions).length === 0) {
    const sharedMap = new Map<string, Map<string, number>>()
    for (const ws of data.workspaces) {
      for (const [dep, info] of Object.entries(ws.deps)) {
        if (wsMap.has(dep)) continue
        if (!sharedMap.has(dep)) sharedMap.set(dep, new Map())
        const vMap = sharedMap.get(dep)!
        vMap.set(info.version, (vMap.get(info.version) ?? 0) + 1)
      }
    }

    for (const [dep, vMap] of sharedMap.entries()) {
      // Sort by occurrence count descending, then by highest semver
      const sortedVers = [...vMap.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]
        return compareSemver(b[0], a[0])
      })
      if (sortedVers.length > 0) {
        canonicalVersions[dep] = sortedVers[0]![0]
      }
    }
  }

  const allVersionEntries = Object.entries(canonicalVersions)
  const totalVersionPolicies = allVersionEntries.length
  const topVersionEntries = allVersionEntries.slice(0, maxVersionEntries)

  // JSON format
  if (format === "json") {
    return JSON.stringify(
      {
        project: projectName,
        packageManager: pm,
        totalWorkspaces: nonRootWs.length,
        workspaces: workspacesInfo,
        totalVersionPolicies,
        versionPolicies: canonicalVersions,
        circularDependencies: data.graph.cycles,
        boundaryRules: [
          "Applications (apps/*) may import shared libraries (packages/*).",
          "Libraries (packages/*) must never import applications.",
          "Avoid circular dependencies between internal workspaces.",
          "When adding shared external dependencies, use canonical monorepo versions or catalog: syntax.",
        ],
      },
      null,
      2
    )
  }

  // XML format
  if (format === "xml") {
    let xml = `<monorepo_context project="${escapeXml(projectName)}" package_manager="${escapeXml(pm)}">\n`
    xml += `  <workspaces total="${nonRootWs.length}">\n`
    for (const w of workspacesInfo) {
      xml += `    <workspace name="${escapeXml(w.name)}" path="${escapeXml(w.relPath)}" role="${w.role}" internal_deps="${escapeXml(w.internalDependencies.join(", "))}" />\n`
    }
    xml += `  </workspaces>\n`
    xml += `  <version_policies total="${totalVersionPolicies}" shown="${topVersionEntries.length}"${topVersionEntries.length < totalVersionPolicies ? ' truncated="true"' : ""}>\n`
    for (const [pkg, ver] of topVersionEntries) {
      xml += `    <dependency name="${escapeXml(pkg)}" version="${escapeXml(ver)}" />\n`
    }
    xml += `  </version_policies>\n`
    xml += `  <boundary_rules>\n`
    xml += `    <rule>apps/* can import packages/*; packages/* must never import apps/*</rule>\n`
    xml += `    <rule>Strictly avoid circular dependency cycles</rule>\n`
    xml += `    <rule>Always reuse canonical dependency versions or catalog: syntax</rule>\n`
    xml += `  </boundary_rules>\n`
    xml += `</monorepo_context>`
    return xml
  }

  // Markdown format (Default & Token-Optimized)
  let md = ""

  if (target === "cursor") {
    md += `---
description: Monorepo architecture rules, workspace boundaries, and dependency version policies
globs: ["**/*"]
alwaysApply: true
---

`
  }

  md += `# Monorepo Architecture & AI Agent Context

> **Auto-generated by \`pkg-audit context\`** — Do not manually edit. Provide this document to AI agents (Cursor, Claude, Copilot, Antigravity) to prevent dependency conflicts and architecture boundary violations.

---

## 🏗️ Monorepo Overview
- **Project**: \`${projectName}\`
- **Package Manager**: \`${pm}\`
- **Total Workspaces**: ${nonRootWs.length}
${data.catalog && data.catalog.existingCatalogCount > 0 ? `- **Central Catalog**: Active (\`${data.catalog.existingCatalogCount}\` packages in \`pnpm-workspace.yaml\` catalog)` : ""}

---

## 📦 Workspaces Directory & Roles

| Workspace | Path | Role | Internal Dependencies |
| :--- | :--- | :--- | :--- |
`

  for (const w of workspacesInfo) {
    const roleBadge = w.role === "app" ? "App" : w.role === "config" ? "Config" : "Shared Library"
    const internalList =
      w.internalDependencies.length > 0
        ? w.internalDependencies.map((d) => `\`${escapeMdTable(d)}\``).join(", ")
        : "*(None)*"
    md += `| \`${escapeMdTable(w.name)}\` | \`${escapeMdTable(w.relPath)}\` | ${roleBadge} | ${internalList} |\n`
  }

  md += `
---

## 🚫 Architectural Boundary Rules for AI Agents

1. **Dependency Flow Direction**:
   - \`apps/*\` (Applications) **MAY** import from \`packages/*\` (Shared Libraries).
   - \`packages/*\` (Libraries) **MUST NEVER** import from \`apps/*\` (Applications).
   - Core / helper libraries should remain self-contained without circular references.

2. **Circular Dependencies**:
`

  if (data.graph.hasCycles) {
    md += `   - ⚠️ **ACTIVE CYCLES DETECTED**: The monorepo currently contains ${data.graph.cycles.length} circular loop(s):\n`
    for (const c of data.graph.cycles) {
      md += `     - ${c.path.map((w: string) => `\`${escapeMdTable(w)}\``).join(" ➔ ")}\n`
    }
    md += `   - **AI Rule**: Do NOT introduce additional links that worsen these cycles!\n`
  } else {
    md += `   - **Clean Topology**: Zero circular dependencies detected. **Never create a cycle between workspaces.**\n`
  }

  md += `
3. **Workspace Protocol Linking**:
   - In \`package.json\`, internal workspace dependencies must use \`"workspace:*"\` (for pnpm) or corresponding linked protocol rather than published npm versions.

---

## 📌 Centralized Version Policy & Shared Dependencies

When adding or upgrading external dependencies, **ALWAYS** reuse the canonical version specifications below to prevent version conflicts and duplicate bundle bloat:

`

  if (topVersionEntries.length > 0) {
    md += `| Package | Canonical Version Spec |
| :--- | :--- |
`
    for (const [pkg, ver] of topVersionEntries) {
      md += `| \`${escapeMdTable(pkg)}\` | \`${escapeMdTable(ver)}\` |\n`
    }

    if (totalVersionPolicies > maxVersionEntries) {
      md += `\n*(Showing top ${maxVersionEntries} of ${totalVersionPolicies} shared dependencies — see JSON format for complete list)*\n`
    }
  } else {
    md += `*(No shared external packages detected)*\n`
  }

  md += `
---

## 💡 AI Developer Instructions

When working in this codebase:
- **Creating new workspaces**: Register the folder in monorepo workspaces configuration.
- **Adding dependencies**: Check the **Version Policy** above first. If the library exists in other workspaces, copy the exact semver or use \`"catalog:"\`.
- **Refactoring code**: Respect the **Dependency Flow Direction** to avoid build tool deadlocks.
`

  return md
}
