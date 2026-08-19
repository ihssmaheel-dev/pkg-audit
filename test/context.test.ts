import { describe, expect, it } from "vitest"
import { generateMonorepoContext } from "../src/scan/context.js"
import type { ScanResult } from "../src/types.js"

describe("LLM Context & Agent Architecture Exporter", () => {
  const mockScanResult: ScanResult = {
    version: 1,
    root: "/monorepo",
    scannedMs: 123,
    unused: { phantoms: [], unused: [], scannedFilesCount: 0 },
    workspaces: [
      {
        name: "root",
        relPath: ".",
        version: "1.0.0",
        private: true,
        isRoot: true,
        packageManager: "pnpm@9.0.0",
        enginesNode: ">=18",
        depCount: 0,
        devCount: 0,
        deps: {},
      },
      {
        name: "@repo/web",
        relPath: "apps/web",
        version: "1.0.0",
        private: true,
        isRoot: false,
        packageManager: null,
        enginesNode: null,
        depCount: 2,
        devCount: 1,
        deps: {
          "@repo/ui": { version: "workspace:*", type: "prod" },
          react: { version: "^18.3.1", type: "prod" },
          typescript: { version: "^5.4.5", type: "dev" },
        },
      },
      {
        name: "@repo/ui",
        relPath: "packages/ui",
        version: "1.0.0",
        private: false,
        isRoot: false,
        packageManager: null,
        enginesNode: null,
        depCount: 1,
        devCount: 0,
        deps: {
          react: { version: "^18.3.1", type: "prod" },
        },
      },
    ],
    conflicts: [],
    hygieneIssues: [],
    graph: {
      nodes: [
        {
          name: "@repo/web",
          relPath: "apps/web",
          isRoot: false,
          deps: ["@repo/ui"],
          dependedBy: [],
          depth: 0,
          hasCycle: false,
        },
        {
          name: "@repo/ui",
          relPath: "packages/ui",
          isRoot: false,
          deps: [],
          dependedBy: ["@repo/web"],
          depth: 1,
          hasCycle: false,
        },
      ],
      edges: [
        {
          from: "@repo/web",
          to: "@repo/ui",
          type: "prod",
          version: "workspace:*",
          isCircular: false,
        },
      ],
      cycles: [],
      hasCycles: false,
      maxDepth: 1,
    },
    catalog: null,
    outdated: null,
    security: null,
    dedupe: null,
    licenses: null,
    errors: [],
    meta: {
      totalDepDeclarations: 4,
      totalUniquePackages: 3,
      ignoredDirs: [],
      skippedGitignored: 0,
      toolVersion: "0.1.0",
    },
  }

  it("generates markdown monorepo context with workspace directory and boundary rules", () => {
    const md = generateMonorepoContext(mockScanResult, { projectName: "my-cool-monorepo" })

    expect(md).toContain("# Monorepo Architecture & AI Agent Context")
    expect(md).toContain("my-cool-monorepo")
    expect(md).toContain("pnpm@9.0.0")
    expect(md).toContain("| `@repo/web` | `apps/web` | App | `@repo/ui` |")
    expect(md).toContain("| `@repo/ui` | `packages/ui` | Shared Library | *(None)* |")
    expect(md).toContain("## 🚫 Architectural Boundary Rules for AI Agents")
    expect(md).toContain("`apps/*` (Applications) **MAY** import from `packages/*`")
    expect(md).toContain("`packages/*` (Libraries) **MUST NEVER** import from `apps/*`")
    expect(md).toContain("## 📌 Centralized Version Policy & Shared Dependencies")
    expect(md).toContain("| `react` | `^18.3.1` |")
  })

  it("includes Cursor MDC frontmatter when target is cursor", () => {
    const md = generateMonorepoContext(mockScanResult, { target: "cursor" })
    expect(md).toContain("---")
    expect(md).toContain("description: Monorepo architecture rules")
    expect(md).toContain('globs: ["**/*"]')
    expect(md).toContain("alwaysApply: true")
  })

  it("generates structured JSON context for agent orchestration pipelines", () => {
    const jsonStr = generateMonorepoContext(mockScanResult, { format: "json", projectName: "json-monorepo" })
    const parsed = JSON.parse(jsonStr)

    expect(parsed.project).toBe("json-monorepo")
    expect(parsed.packageManager).toBe("pnpm@9.0.0")
    expect(parsed.totalWorkspaces).toBe(2)
    expect(parsed.workspaces).toHaveLength(2)
    expect(parsed.workspaces[0].name).toBe("@repo/web")
    expect(parsed.workspaces[0].role).toBe("app")
    expect(parsed.workspaces[0].internalDependencies).toEqual(["@repo/ui"])
    expect(parsed.versionPolicies.react).toBe("^18.3.1")
    expect(parsed.boundaryRules.length).toBeGreaterThan(0)
  })

  it("generates XML context format", () => {
    const xml = generateMonorepoContext(mockScanResult, { format: "xml", projectName: "xml-monorepo" })
    expect(xml).toContain('<monorepo_context project="xml-monorepo" package_manager="pnpm@9.0.0">')
    expect(xml).toContain('<workspace name="@repo/web" path="apps/web" role="app"')
    expect(xml).toContain('<dependency name="react" version="^18.3.1" />')
    expect(xml).toContain("</monorepo_context>")
  })

  it("flags active circular loops in boundary instructions", () => {
    const cycleScanResult: ScanResult = {
      ...mockScanResult,
      graph: {
        ...mockScanResult.graph,
        hasCycles: true,
        cycles: [{ path: ["@repo/web", "@repo/ui", "@repo/web"], length: 3 }],
      },
    }

    const md = generateMonorepoContext(cycleScanResult)
    expect(md).toContain("ACTIVE CYCLES DETECTED")
    expect(md).toContain("`@repo/web` ➔ `@repo/ui` ➔ `@repo/web`")
  })
})
