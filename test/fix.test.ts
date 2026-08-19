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
  })
})
