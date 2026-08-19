import type { ScanResult, Workspace } from "../types.js"

export interface ContextOptions {
  format?: "markdown" | "json" | "xml"
  target?: "generic" | "cursor" | "claude"
  projectName?: string
}

function classifyWorkspaceRole(ws: Workspace): "app" | "library" | "config" | "root" {
  if (ws.isRoot) return "root"
  const p = ws.relPath.toLowerCase()
  const n = (ws.name || "").toLowerCase()
  if (
    p.startsWith("apps/") ||
    p.startsWith("app/") ||
    n.includes("app") ||
    n.includes("web") ||
    n.includes("api") ||
    n.includes("server")
  ) {
    return "app"
  }
  if (p.startsWith("config/") || n.includes("config") || n.includes("tsconfig") || n.includes("eslint")) {
    return "config"
  }
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

  const rootWs = data.workspaces.find((w) => w.isRoot)
  const pm = rootWs?.packageManager ?? (data.dedupe?.packageManager || "npm")

  const nonRootWs = data.workspaces.filter((w) => !w.isRoot)
  const wsMap = new Map<string, Workspace>()
  for (const ws of data.workspaces) {
    if (ws.name) wsMap.set(ws.name, ws)
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

  // If no catalog, calculate from top shared packages
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
      let maxCount = 0
      let topVer = ""
      for (const [v, count] of vMap.entries()) {
        if (count > maxCount) {
          maxCount = count
          topVer = v
        }
      }
      if (topVer) {
        canonicalVersions[dep] = topVer
      }
    }
  }

  // JSON format
  if (format === "json") {
    return JSON.stringify(
      {
        project: projectName,
        packageManager: pm,
        totalWorkspaces: nonRootWs.length,
        workspaces: workspacesInfo,
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
    let xml = `<monorepo_context project="${projectName}" package_manager="${pm}">\n`
    xml += `  <workspaces total="${nonRootWs.length}">\n`
    for (const w of workspacesInfo) {
      xml += `    <workspace name="${w.name}" path="${w.relPath}" role="${w.role}" internal_deps="${w.internalDependencies.join(", ")}" />\n`
    }
    xml += `  </workspaces>\n`
    xml += `  <version_policies>\n`
    for (const [pkg, ver] of Object.entries(canonicalVersions).slice(0, 30)) {
      xml += `    <dependency name="${pkg}" version="${ver}" />\n`
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
        ? w.internalDependencies.map((d) => `\`${d}\``).join(", ")
        : "*(None)*"
    md += `| \`${w.name}\` | \`${w.relPath}\` | ${roleBadge} | ${internalList} |\n`
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
      md += `     - ${c.path.map((w: string) => `\`${w}\``).join(" ➔ ")}\n`
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

  const topEntries = Object.entries(canonicalVersions).slice(0, 30)
  if (topEntries.length > 0) {
    md += `| Package | Canonical Version Spec |
| :--- | :--- |
`
    for (const [pkg, ver] of topEntries) {
      md += `| \`${pkg}\` | \`${ver}\` |\n`
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
