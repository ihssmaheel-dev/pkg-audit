import { describe, expect, it } from "vitest"
import { buildWorkspaceGraph } from "../src/scan/graph.js"
import type { Workspace } from "../src/types.js"

describe("workspace graph & circular dependency detection", () => {
  it("builds a clean directed acyclic graph (DAG) with correct depth layers", () => {
    const workspaces: Workspace[] = [
      {
        name: "@mono/helpers",
        version: "1.0.0",
        relPath: "packages/helpers",
        isRoot: false,
        private: true,
        packageManager: null,
        enginesNode: null,
        depCount: 0,
        devCount: 0,
        deps: {},
      },
      {
        name: "@mono/ui-kit",
        version: "1.0.0",
        relPath: "packages/ui-kit",
        isRoot: false,
        private: true,
        packageManager: null,
        enginesNode: null,
        depCount: 1,
        devCount: 0,
        deps: {
          "@mono/helpers": { version: "workspace:*", type: "prod" },
        },
      },
      {
        name: "@mono/web",
        version: "1.0.0",
        relPath: "apps/web",
        isRoot: false,
        private: true,
        packageManager: null,
        enginesNode: null,
        depCount: 2,
        devCount: 0,
        deps: {
          "@mono/ui-kit": { version: "workspace:*", type: "prod" },
          "@mono/helpers": { version: "workspace:*", type: "prod" },
        },
      },
    ]

    const graph = buildWorkspaceGraph(workspaces)

    expect(graph.hasCycles).toBe(false)
    expect(graph.cycles).toHaveLength(0)
    expect(graph.nodes).toHaveLength(3)
    expect(graph.edges).toHaveLength(3)

    const helpersNode = graph.nodes.find((n) => n.name === "@mono/helpers")
    const uiNode = graph.nodes.find((n) => n.name === "@mono/ui-kit")
    const webNode = graph.nodes.find((n) => n.name === "@mono/web")

    expect(helpersNode?.depth).toBe(0)
    expect(uiNode?.depth).toBe(1)
    expect(webNode?.depth).toBe(2)

    expect(helpersNode?.dependedBy).toContain("@mono/ui-kit")
    expect(helpersNode?.dependedBy).toContain("@mono/web")
    expect(webNode?.deps).toContain("@mono/ui-kit")
  })

  it("detects a 2-node circular dependency loop (A ➔ B ➔ A)", () => {
    const workspaces: Workspace[] = [
      {
        name: "@mono/core",
        version: "1.0.0",
        relPath: "packages/core",
        isRoot: false,
        private: true,
        packageManager: null,
        enginesNode: null,
        depCount: 1,
        devCount: 0,
        deps: {
          "@mono/utils": { version: "workspace:*", type: "prod" },
        },
      },
      {
        name: "@mono/utils",
        version: "1.0.0",
        relPath: "packages/utils",
        isRoot: false,
        private: true,
        packageManager: null,
        enginesNode: null,
        depCount: 1,
        devCount: 0,
        deps: {
          "@mono/core": { version: "workspace:*", type: "prod" },
        },
      },
    ]

    const graph = buildWorkspaceGraph(workspaces)

    expect(graph.hasCycles).toBe(true)
    expect(graph.cycles).toHaveLength(1)
    expect(graph.cycles[0]!.length).toBe(2)
    expect(graph.cycles[0]!.path).toContain("@mono/core")
    expect(graph.cycles[0]!.path).toContain("@mono/utils")

    const coreNode = graph.nodes.find((n) => n.name === "@mono/core")
    const utilsNode = graph.nodes.find((n) => n.name === "@mono/utils")
    expect(coreNode?.hasCycle).toBe(true)
    expect(utilsNode?.hasCycle).toBe(true)

    expect(graph.edges.every((e) => e.isCircular)).toBe(true)
  })

  it("detects a 3-node circular dependency loop (A ➔ B ➔ C ➔ A)", () => {
    const workspaces: Workspace[] = [
      {
        name: "@mono/a",
        version: "1.0.0",
        relPath: "packages/a",
        isRoot: false,
        private: true,
        packageManager: null,
        enginesNode: null,
        depCount: 1,
        devCount: 0,
        deps: {
          "@mono/b": { version: "workspace:*", type: "prod" },
        },
      },
      {
        name: "@mono/b",
        version: "1.0.0",
        relPath: "packages/b",
        isRoot: false,
        private: true,
        packageManager: null,
        enginesNode: null,
        depCount: 1,
        devCount: 0,
        deps: {
          "@mono/c": { version: "workspace:*", type: "prod" },
        },
      },
      {
        name: "@mono/c",
        version: "1.0.0",
        relPath: "packages/c",
        isRoot: false,
        private: true,
        packageManager: null,
        enginesNode: null,
        depCount: 1,
        devCount: 0,
        deps: {
          "@mono/a": { version: "workspace:*", type: "prod" },
        },
      },
    ]

    const graph = buildWorkspaceGraph(workspaces)

    expect(graph.hasCycles).toBe(true)
    expect(graph.cycles).toHaveLength(1)
    expect(graph.cycles[0]!.length).toBe(3)
    expect(graph.cycles[0]!.path[0]).toBe(graph.cycles[0]!.path[graph.cycles[0]!.path.length - 1])
  })
})
