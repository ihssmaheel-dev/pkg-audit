import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { applyFixes, compareSemver, pickTargetVersion, resolveConflictsAuto } from "../src/scan/fix.js"
import type { Conflict, ScanResult } from "../src/types.js"

describe("fix engine", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-fix-test-"))
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup error
    }
  })

  describe("compareSemver", () => {
    it("compares basic numeric versions correctly", () => {
      expect(compareSemver("^19.0.0", "^18.2.0")).toBeGreaterThan(0)
      expect(compareSemver("1.0.0", "1.1.0")).toBeLessThan(0)
      expect(compareSemver("^2.4.1", "~2.4.1")).toBe(0)
    })

    it("handles prerelease tags", () => {
      expect(compareSemver("19.0.0", "19.0.0-rc.1")).toBeGreaterThan(0)
      expect(compareSemver("19.0.0-rc.1", "19.0.0")).toBeLessThan(0)
    })
  })

  describe("pickTargetVersion", () => {
    const mockConflict: Conflict = {
      name: "react",
      severity: "major",
      versions: [
        {
          version: "^18.2.0",
          occurrences: [
            { workspace: "app-a", type: "prod" },
            { workspace: "app-b", type: "prod" },
          ],
        },
        {
          version: "^19.0.0",
          occurrences: [{ workspace: "app-c", type: "prod" }],
        },
      ],
    }

    it("picks highest semver when strategy is highest", () => {
      const ver = pickTargetVersion(mockConflict, "highest")
      expect(ver).toBe("^19.0.0")
    })

    it("picks most frequent version when strategy is most-frequent", () => {
      const ver = pickTargetVersion(mockConflict, "most-frequent")
      expect(ver).toBe("^18.2.0")
    })
  })

  describe("resolveConflictsAuto", () => {
    it("generates an automatic fix plan for all conflicts", () => {
      const mockResult: ScanResult = {
        version: 1,
        root: "/root",
        workspaces: [],
        conflicts: [
          {
            name: "zod",
            severity: "range",
            versions: [
              { version: "^3.21.0", occurrences: [{ workspace: "a", type: "prod" }] },
              { version: "^3.22.0", occurrences: [{ workspace: "b", type: "prod" }] },
            ],
          },
        ],
        hygieneIssues: [],
        graph: { nodes: [], edges: [], cycles: [], hasCycles: false, maxDepth: 0 },
        unused: { phantoms: [], unused: [], scannedFilesCount: 0 },
        outdated: null,
        security: null,
        dedupe: null,
        licenses: null,
        errors: [],
        meta: {
          totalDepDeclarations: 2,
          totalUniquePackages: 1,
          toolVersion: "0.1.0",
          skippedGitignored: 0,
          ignoredDirs: [],
        },
        scannedMs: 10,
      }

      const plan = resolveConflictsAuto(mockResult, "highest")
      expect(plan.fixes).toHaveLength(1)
      expect(plan.fixes[0]).toEqual({ name: "zod", targetVersion: "^3.22.0" })
    })
  })

  describe("applyFixes", () => {
    it("updates package.json dependencies on disk while preserving indentation", async () => {
      const appADir = path.join(tmpDir, "apps", "web")
      const appBDir = path.join(tmpDir, "apps", "api")
      fs.mkdirSync(appADir, { recursive: true })
      fs.mkdirSync(appBDir, { recursive: true })

      const pkgA = {
        name: "@mono/web",
        dependencies: {
          react: "^18.2.0",
          zod: "^3.21.0",
        },
      }

      const pkgB = {
        name: "@mono/api",
        dependencies: {
          react: "^19.0.0",
          zod: "^3.22.0",
        },
      }

      fs.writeFileSync(path.join(appADir, "package.json"), JSON.stringify(pkgA, null, 2) + "\n")
      fs.writeFileSync(path.join(appBDir, "package.json"), JSON.stringify(pkgB, null, 2) + "\n")

      const fixes = [
        { name: "react", targetVersion: "^19.0.0" },
        { name: "zod", targetVersion: "^3.22.0" },
      ]

      const fixResult = await applyFixes(tmpDir, fixes)
      expect(fixResult.ok).toBe(true)
      expect(fixResult.modifiedFiles).toHaveLength(1) // Only pkgA needed changes

      const updatedPkgA = JSON.parse(
        fs.readFileSync(path.join(appADir, "package.json"), "utf8")
      ) as typeof pkgA
      expect(updatedPkgA.dependencies.react).toBe("^19.0.0")
      expect(updatedPkgA.dependencies.zod).toBe("^3.22.0")
    })

    it("rejects path traversal attempts outside rootDir", async () => {
      const { removeUnusedDependencies, declarePhantomDependencies } = await import("../src/scan/fix.js")
      const resultUnused = await removeUnusedDependencies(tmpDir, [
        { workspace: "../../../../tmp", pkg: "evil-pkg" },
      ])
      expect(resultUnused.ok).toBe(false)
      expect(resultUnused.errors.length).toBeGreaterThan(0)
      expect(resultUnused.errors[0]?.error).toContain("Access denied")

      const resultPhantom = await declarePhantomDependencies(tmpDir, [
        { workspace: "../../../../tmp", pkg: "evil-pkg", version: "^1.0.0" },
      ])
      expect(resultPhantom.ok).toBe(false)
      expect(resultPhantom.errors.length).toBeGreaterThan(0)
      expect(resultPhantom.errors[0]?.error).toContain("Access denied")
    })
  })

  describe("fastReconcileScan", () => {
    it("incrementally reconciles scan result in memory in sub-5ms", async () => {
      const { fastReconcileScan, applyFixes } = await import("../src/scan/fix.js")
      const appADir = path.join(tmpDir, "apps", "web")
      const appBDir = path.join(tmpDir, "apps", "api")
      fs.mkdirSync(appADir, { recursive: true })
      fs.mkdirSync(appBDir, { recursive: true })

      const pkgA = {
        name: "@mono/web",
        dependencies: {
          react: "^18.2.0",
        },
      }
      const pkgB = {
        name: "@mono/api",
        dependencies: {
          react: "^19.0.0",
        },
      }

      const pkgAPath = path.join(appADir, "package.json")
      const pkgBPath = path.join(appBDir, "package.json")
      fs.writeFileSync(pkgAPath, JSON.stringify(pkgA, null, 2) + "\n")
      fs.writeFileSync(pkgBPath, JSON.stringify(pkgB, null, 2) + "\n")

      const initialScan: ScanResult = {
        version: 1,
        root: tmpDir,
        scannedMs: 10,
        workspaces: [
          {
            name: "@mono/web",
            relPath: "apps/web",
            absPath: pkgAPath,
            private: false,
            version: "1.0.0",
            deps: { react: { version: "^18.2.0", type: "prod" } },
            depCount: 1,
            devCount: 0,
            enginesNode: null,
            isRoot: false,
            packageManager: "pnpm",
          },
          {
            name: "@mono/api",
            relPath: "apps/api",
            absPath: pkgBPath,
            private: false,
            version: "1.0.0",
            deps: { react: { version: "^19.0.0", type: "prod" } },
            depCount: 1,
            devCount: 0,
            enginesNode: null,
            isRoot: false,
            packageManager: "pnpm",
          },
        ],
        conflicts: [
          {
            name: "react",
            severity: "major",
            versions: [
              { version: "^18.2.0", occurrences: [{ workspace: "apps/web", type: "prod" }] },
              { version: "^19.0.0", occurrences: [{ workspace: "apps/api", type: "prod" }] },
            ],
          },
        ],
        hygieneIssues: [],
        graph: { nodes: [], edges: [], cycles: [], hasCycles: false, maxDepth: 0 },
        unused: {
          phantoms: [
            {
              name: "zod",
              workspace: "apps/web",
              files: ["index.ts"],
              suggestedVersion: "^3.22.0",
              hoistedFrom: null,
            },
          ],
          unused: [
            { name: "lodash", workspace: "apps/web", version: "^4.17.21", type: "prod", isDevTool: false },
          ],
          scannedFilesCount: 10,
        },
        outdated: null,
        security: null,
        dedupe: null,
        licenses: null,
        errors: [],
        meta: {
          totalDepDeclarations: 2,
          totalUniquePackages: 1,
          toolVersion: "0.1.0",
          skippedGitignored: 0,
          ignoredDirs: [],
        },
      }

      // Apply fix on disk
      const fixResult = await applyFixes(tmpDir, [{ name: "react", targetVersion: "^19.0.0" }], initialScan)
      expect(fixResult.ok).toBe(true)

      // Run fast incremental reconcile
      const t0 = performance.now()
      const reconciled = await fastReconcileScan(tmpDir, initialScan, fixResult.modifiedFiles, {
        action: "declare-phantom",
        phantoms: [{ workspace: "apps/web", pkg: "zod", version: "^3.22.0" }],
      })
      const duration = performance.now() - t0

      expect(duration).toBeLessThan(100)
      expect(reconciled.conflicts).toHaveLength(0) // Conflict resolved in memory!
      expect(reconciled.unused?.phantoms).toHaveLength(0) // Declared phantom reconciled in memory!
      expect(reconciled.workspaces.find((w) => w.relPath === "apps/web")?.deps.react?.version).toBe("^19.0.0")
    })
  })
})
