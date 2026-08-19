import { describe, expect, it } from "vitest"
import { auditDeprecations, KNOWN_DEPRECATIONS } from "../src/scan/deprecation.js"
import { buildDependencyMap } from "../src/scan/conflicts.js"
import type { Workspace } from "../src/types.js"

describe("Package Deprecation & Abandonment Audit", () => {
  it("includes curated known deprecations with modern replacements", () => {
    expect(KNOWN_DEPRECATIONS.request).toBeDefined()
    expect(KNOWN_DEPRECATIONS.request.replacement).toContain("fetch")
    expect(KNOWN_DEPRECATIONS.querystring).toBeDefined()
    expect(KNOWN_DEPRECATIONS.tslint).toBeDefined()
    expect(KNOWN_DEPRECATIONS["babel-eslint"]).toBeDefined()
  })

  it("identifies deprecated and abandoned dependencies across workspaces", async () => {
    const workspaces: Workspace[] = [
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
        name: "@repo/app",
        relPath: "apps/app",
        version: "1.0.0",
        private: true,
        isRoot: false,
        packageManager: null,
        enginesNode: null,
        depCount: 3,
        devCount: 1,
        deps: {
          request: { version: "^2.88.2", type: "prod" },
          querystring: { version: "^0.2.0", type: "prod" },
          react: { version: "^18.3.1", type: "prod" },
          tslint: { version: "^6.1.3", type: "dev" },
        },
      },
    ]

    const depMap = buildDependencyMap(workspaces)
    const result = await auditDeprecations(depMap, {
      concurrency: 2,
      timeoutMs: 1000,
    })

    expect(result.totalScanned).toBeGreaterThan(0)
    expect(result.totalDeprecated).toBeGreaterThanOrEqual(3) // request, querystring, tslint
    expect(result.deprecatedInProd).toBeGreaterThanOrEqual(2) // request, querystring
    expect(result.deprecatedInDev).toBeGreaterThanOrEqual(1) // tslint

    const reqPkg = result.packages.find((p) => p.name === "request")
    expect(reqPkg).toBeDefined()
    expect(reqPkg?.deprecated).toBe(true)
    expect(reqPkg?.isProd).toBe(true)
    expect(reqPkg?.replacementSuggestion).toContain("fetch")
    expect(reqPkg?.workspaces[0]?.workspace).toBe("apps/app")

    const tslintPkg = result.packages.find((p) => p.name === "tslint")
    expect(tslintPkg).toBeDefined()
    expect(tslintPkg?.deprecated).toBe(true)
    expect(tslintPkg?.isDev).toBe(true)
    expect(tslintPkg?.replacementSuggestion).toContain("eslint")
  })

  it("handles non-deprecated packages cleanly without false positives", async () => {
    const cleanWorkspaces: Workspace[] = [
      {
        name: "@repo/clean",
        relPath: "apps/clean",
        version: "1.0.0",
        private: true,
        isRoot: false,
        packageManager: null,
        enginesNode: null,
        depCount: 1,
        devCount: 0,
        deps: {
          typescript: { version: "^5.4.5", type: "dev" },
        },
      },
    ]

    const depMap = buildDependencyMap(cleanWorkspaces)
    const result = await auditDeprecations(depMap, {
      concurrency: 1,
      timeoutMs: 1000,
    })

    expect(result.packages.filter((p) => p.name === "typescript")).toHaveLength(0)
  })
})
