import type { Conflict, ConflictSeverity, DepMap, Workspace } from "../types.js"

export function isLinkedProtocol(version: string): boolean {
  return version.startsWith("workspace:") || version.startsWith("catalog:") || version.startsWith("link:")
}

export function parseMajor(version: string): number | null {
  const cleaned = version.replace(/^[\^~<>=\s]+/, "")
  const m = cleaned.match(/^(\d+)/)
  return m ? Number(m[1]) : null
}

export function parseVersionTuple(version: string): [number, number, number] | null {
  const cleaned = version.replace(/^[\^~<>=\s]+/, "")
  const m = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function compareTuples(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

export function buildDependencyMap(workspaces: Workspace[]): DepMap {
  const map: DepMap = new Map()

  for (const ws of workspaces) {
    for (const [name, { version, type }] of Object.entries(ws.deps)) {
      if (!map.has(name)) map.set(name, new Map())
      const versions = map.get(name)!
      if (!versions.has(version)) versions.set(version, [])
      versions.get(version)!.push({ workspace: ws.relPath, type })
    }
  }

  return map
}

export function findConflicts(depMap: DepMap): Conflict[] {
  const conflicts: Conflict[] = []

  for (const [name, versions] of depMap.entries()) {
    const realVersions = [...versions.entries()].filter(([v]) => !isLinkedProtocol(v))
    if (realVersions.length <= 1) continue

    const majors = new Set(realVersions.map(([v]) => parseMajor(v)).filter((m): m is number => m !== null))
    const severity: ConflictSeverity = majors.size > 1 ? "major" : "range"

    conflicts.push({
      name,
      severity,
      versions: realVersions.map(([version, occurrences]) => ({ version, occurrences })),
    })
  }

  conflicts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "major" ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return conflicts
}
