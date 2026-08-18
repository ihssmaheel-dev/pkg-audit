import type { HygieneIssue, Workspace } from "../types.js"

export function findHygieneIssues(workspaces: Workspace[]): HygieneIssue[] {
  const issues: HygieneIssue[] = []

  const unnamed = workspaces.filter((w) => w.name.startsWith("(unnamed:"))
  for (const w of unnamed) {
    issues.push({
      kind: "unnamed",
      message: `${w.relPath} has no "name" field — likely not a real workspace (tool cache/config?). Consider adding it to --ignore-dir if so.`,
    })
  }

  const byName = new Map<string, string[]>()
  for (const w of workspaces) {
    if (w.name.startsWith("(unnamed:")) continue
    if (!byName.has(w.name)) byName.set(w.name, [])
    byName.get(w.name)!.push(w.relPath)
  }
  for (const [name, paths] of byName.entries()) {
    if (paths.length > 1) {
      issues.push({
        kind: "duplicate-name",
        message: `"${name}" is used by ${paths.length} manifests: ${paths.join(", ")}`,
      })
    }
  }

  const pmValues = new Map<string, string[]>()
  for (const w of workspaces) {
    if (!w.packageManager) continue
    if (!pmValues.has(w.packageManager)) pmValues.set(w.packageManager, [])
    pmValues.get(w.packageManager)!.push(w.relPath)
  }
  if (pmValues.size > 1) {
    const detail = [...pmValues.entries()].map(([v, paths]) => `${v} (${paths.join(", ")})`).join("; ")
    issues.push({
      kind: "packageManager",
      message: `"packageManager" differs across manifests: ${detail}`,
    })
  }

  const engineValues = new Map<string, string[]>()
  for (const w of workspaces) {
    if (!w.enginesNode) continue
    if (!engineValues.has(w.enginesNode)) engineValues.set(w.enginesNode, [])
    engineValues.get(w.enginesNode)!.push(w.relPath)
  }
  if (engineValues.size > 1) {
    const detail = [...engineValues.entries()].map(([v, paths]) => `${v} (${paths.join(", ")})`).join("; ")
    issues.push({
      kind: "engines",
      message: `"engines.node" differs across manifests: ${detail}`,
    })
  }

  return issues
}
