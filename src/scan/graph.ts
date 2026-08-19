import type {
  Workspace,
  WorkspaceCycle,
  WorkspaceGraph,
  WorkspaceGraphEdge,
  WorkspaceGraphNode,
} from "../types.js"

export function buildWorkspaceGraph(workspaces: Workspace[]): WorkspaceGraph {
  // Map by package name and by relPath
  const byName = new Map<string, Workspace>()
  const byPath = new Map<string, Workspace>()

  for (const ws of workspaces) {
    if (ws.name && !ws.name.startsWith("(unnamed")) {
      byName.set(ws.name, ws)
    }
    byPath.set(ws.relPath, ws)
  }

  const nodeMap = new Map<string, WorkspaceGraphNode>()

  // Initialize nodes
  for (const ws of workspaces) {
    nodeMap.set(ws.relPath, {
      name: ws.name,
      relPath: ws.relPath,
      isRoot: ws.isRoot,
      deps: [],
      dependedBy: [],
      depth: 0,
      hasCycle: false,
    })
  }

  const edges: WorkspaceGraphEdge[] = []
  const adjacency = new Map<string, string[]>()
  for (const ws of workspaces) {
    adjacency.set(ws.relPath, [])
  }

  // Build edges
  for (const ws of workspaces) {
    const fromNode = nodeMap.get(ws.relPath)
    if (!fromNode) continue

    for (const [depName, depRecord] of Object.entries(ws.deps)) {
      let targetWs = byName.get(depName)

      // Also handle link: or file: relative paths
      if (!targetWs && (depRecord.version.startsWith("file:") || depRecord.version.startsWith("link:"))) {
        const rawTarget = depRecord.version.replace(/^(file:|link:)/, "").trim()
        for (const candidate of workspaces) {
          if (candidate.relPath === rawTarget || candidate.relPath.endsWith(rawTarget)) {
            targetWs = candidate
            break
          }
        }
      }

      if (targetWs && targetWs.relPath !== ws.relPath) {
        fromNode.deps.push(targetWs.name || targetWs.relPath)
        const targetNode = nodeMap.get(targetWs.relPath)
        if (targetNode) {
          targetNode.dependedBy.push(ws.name || ws.relPath)
        }

        adjacency.get(ws.relPath)?.push(targetWs.relPath)

        edges.push({
          from: ws.relPath,
          to: targetWs.relPath,
          type: depRecord.type,
          version: depRecord.version,
          isCircular: false,
        })
      }
    }
  }

  // Find cycles using DFS
  const rawCycles: string[][] = []
  const visited = new Set<string>()
  const recStack = new Map<string, number>() // path index
  const currentPath: string[] = []

  function dfs(curr: string) {
    visited.add(curr)
    recStack.set(curr, currentPath.length)
    currentPath.push(curr)

    const neighbors = adjacency.get(curr) ?? []
    for (const next of neighbors) {
      if (recStack.has(next)) {
        // Cycle detected
        const cycleStartIndex = recStack.get(next)!
        const cycle = currentPath.slice(cycleStartIndex).concat(next)
        rawCycles.push(cycle)
      } else if (!visited.has(next)) {
        dfs(next)
      }
    }

    recStack.delete(curr)
    currentPath.pop()
  }

  for (const ws of workspaces) {
    if (!visited.has(ws.relPath)) {
      dfs(ws.relPath)
    }
  }

  // Deduplicate and canonicalize cycles
  const seenCycleKeys = new Set<string>()
  const cycles: WorkspaceCycle[] = []

  for (const cycle of rawCycles) {
    const cycleNodes = cycle.slice(0, -1) // remove duplicated last element
    if (cycleNodes.length === 0) continue

    // Canonical representation: rotate to start with smallest string
    let minIdx = 0
    for (let i = 1; i < cycleNodes.length; i++) {
      if (cycleNodes[i]! < cycleNodes[minIdx]!) {
        minIdx = i
      }
    }
    const normalized = [...cycleNodes.slice(minIdx), ...cycleNodes.slice(0, minIdx), cycleNodes[minIdx]!]

    const key = normalized.join(" -> ")
    if (!seenCycleKeys.has(key)) {
      seenCycleKeys.add(key)
      // Convert relPaths to names for human readability if available
      const namedPath = normalized.map((p) => {
        const ws = byPath.get(p)
        return ws && ws.name && !ws.name.startsWith("(unnamed") ? ws.name : p
      })

      cycles.push({
        path: namedPath,
        length: cycleNodes.length,
      })

      // Mark nodes and edges as circular
      for (const p of cycleNodes) {
        const node = nodeMap.get(p)
        if (node) node.hasCycle = true
      }

      for (let i = 0; i < cycle.length - 1; i++) {
        const u = cycle[i]!
        const v = cycle[i + 1]!
        const edge = edges.find((e) => e.from === u && e.to === v)
        if (edge) edge.isCircular = true
      }
    }
  }

  // Compute layered depth levels (Longest Path in DAG without circular edges)
  const nonCircularAdj = new Map<string, string[]>()
  for (const ws of workspaces) {
    nonCircularAdj.set(ws.relPath, [])
  }
  for (const edge of edges) {
    if (!edge.isCircular) {
      nonCircularAdj.get(edge.from)?.push(edge.to)
    }
  }

  const memoDepth = new Map<string, number>()
  const visiting = new Set<string>()

  function getDepth(curr: string): number {
    if (memoDepth.has(curr)) return memoDepth.get(curr)!
    if (visiting.has(curr)) return 0 // Cycle fallback

    visiting.add(curr)
    const targets = nonCircularAdj.get(curr) ?? []
    let maxChildDepth = -1

    for (const next of targets) {
      maxChildDepth = Math.max(maxChildDepth, getDepth(next))
    }

    visiting.delete(curr)
    const depth = maxChildDepth + 1
    memoDepth.set(curr, depth)
    return depth
  }

  let maxDepth = 0
  for (const ws of workspaces) {
    const depth = getDepth(ws.relPath)
    const node = nodeMap.get(ws.relPath)
    if (node) {
      node.depth = depth
      if (depth > maxDepth) maxDepth = depth
    }
  }

  const nodes = Array.from(nodeMap.values())

  return {
    nodes,
    edges,
    cycles,
    hasCycles: cycles.length > 0,
    maxDepth,
  }
}
