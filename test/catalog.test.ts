import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  applyCatalogPlan,
  generateCatalogPlan,
  readPnpmWorkspaceYaml,
  serializePnpmWorkspaceYaml,
} from "../src/scan/catalog.js"
import type { ScanResult, Workspace } from "../src/types.js"

describe("pnpm catalog migration engine", () => {
  describe("readPnpmWorkspaceYaml & serializePnpmWorkspaceYaml", () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-catalog-yaml-"))
    })

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // Ignore
      }
    })

    it("parses existing pnpm-workspace.yaml with packages and catalog sections", () => {
      const yaml = `
# Workspace packages
packages:
  - "apps/*"
  - "packages/*"

catalog:
  react: ^19.0.0
  react-dom: ^19.0.0
  typescript: ^5.7.0

catalogs:
  legacy:
    react: ^18.3.1
`
      fs.writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), yaml, "utf8")

      const parsed = readPnpmWorkspaceYaml(tmpDir)
      expect(parsed.exists).toBe(true)
      expect(parsed.packages).toEqual(["apps/*", "packages/*"])
      expect(parsed.catalog).toEqual({
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        typescript: "^5.7.0",
      })
      expect(parsed.catalogs.legacy).toEqual({
        react: "^18.3.1",
      })
    })

    it("serializes and replaces catalog section while preserving packages and other comments", () => {
      const existing = `
# Monorepo configuration
packages:
  - "apps/*"
  - "packages/*"

# Existing catalog
catalog:
  old-pkg: ^1.0.0
`
      const updated = serializePnpmWorkspaceYaml(existing, {
        react: "^19.0.0",
        typescript: "^5.7.2",
        zod: "^3.23.8",
      })

      expect(updated).toContain('packages:\n  - "apps/*"\n  - "packages/*"')
      expect(updated).toContain("catalog:\n  react: ^19.0.0\n  typescript: ^5.7.2\n  zod: ^3.23.8")
      expect(updated).not.toContain("old-pkg")
    })
  })

  describe("generateCatalogPlan & applyCatalogPlan", () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-catalog-plan-"))
    })

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // Ignore
      }
    })

    it("generates catalog plan and applies migration to pnpm-workspace.yaml and workspace package.json files", async () => {
      // 1. Setup mock monorepo workspaces
      const apiDir = path.join(tmpDir, "apps", "api")
      const webDir = path.join(tmpDir, "apps", "web")
      const uiDir = path.join(tmpDir, "packages", "ui")

      fs.mkdirSync(apiDir, { recursive: true })
      fs.mkdirSync(webDir, { recursive: true })
      fs.mkdirSync(uiDir, { recursive: true })

      const apiPkg = {
        name: "@repo/api",
        version: "1.0.0",
        dependencies: {
          "@repo/ui": "workspace:*",
          zod: "^3.22.4",
          dotenv: "^16.4.5",
        },
        devDependencies: {
          typescript: "^5.6.0",
        },
      }
      fs.writeFileSync(path.join(apiDir, "package.json"), JSON.stringify(apiPkg, null, 2), "utf8")

      const webPkg = {
        name: "@repo/web",
        version: "1.0.0",
        dependencies: {
          "@repo/ui": "workspace:*",
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          zod: "^3.23.8",
        },
        devDependencies: {
          typescript: "^5.7.2",
        },
      }
      fs.writeFileSync(path.join(webDir, "package.json"), JSON.stringify(webPkg, null, 2), "utf8")

      const uiPkg = {
        name: "@repo/ui",
        version: "1.0.0",
        dependencies: {
          react: "^19.0.0",
          "react-dom": "^19.0.0",
        },
        devDependencies: {
          typescript: "^5.7.2",
        },
      }
      fs.writeFileSync(path.join(uiDir, "package.json"), JSON.stringify(uiPkg, null, 2), "utf8")

      const workspaces: Workspace[] = [
        {
          name: "@repo/api",
          version: "1.0.0",
          relPath: "apps/api",
          absPath: path.join(apiDir, "package.json"),
          isRoot: false,
          private: true,
          packageManager: null,
          enginesNode: null,
          depCount: 3,
          devCount: 1,
          deps: {
            "@repo/ui": { version: "workspace:*", type: "prod" },
            zod: { version: "^3.22.4", type: "prod" },
            dotenv: { version: "^16.4.5", type: "prod" },
            typescript: { version: "^5.6.0", type: "dev" },
          },
        },
        {
          name: "@repo/web",
          version: "1.0.0",
          relPath: "apps/web",
          absPath: path.join(webDir, "package.json"),
          isRoot: false,
          private: true,
          packageManager: null,
          enginesNode: null,
          depCount: 4,
          devCount: 1,
          deps: {
            "@repo/ui": { version: "workspace:*", type: "prod" },
            react: { version: "^19.0.0", type: "prod" },
            "react-dom": { version: "^19.0.0", type: "prod" },
            zod: { version: "^3.23.8", type: "prod" },
            typescript: { version: "^5.7.2", type: "dev" },
          },
        },
        {
          name: "@repo/ui",
          version: "1.0.0",
          relPath: "packages/ui",
          absPath: path.join(uiDir, "package.json"),
          isRoot: false,
          private: true,
          packageManager: null,
          enginesNode: null,
          depCount: 2,
          devCount: 1,
          deps: {
            react: { version: "^19.0.0", type: "prod" },
            "react-dom": { version: "^19.0.0", type: "prod" },
            typescript: { version: "^5.7.2", type: "dev" },
          },
        },
      ]

      const scanResult: ScanResult = {
        version: 1,
        root: tmpDir,
        scannedMs: 10,
        workspaces,
        conflicts: [
          {
            name: "zod",
            severity: "range",
            versions: [
              { version: "^3.22.4", occurrences: [{ workspace: "apps/api", type: "prod" }] },
              { version: "^3.23.8", occurrences: [{ workspace: "apps/web", type: "prod" }] },
            ],
          },
          {
            name: "typescript",
            severity: "range",
            versions: [
              { version: "^5.6.0", occurrences: [{ workspace: "apps/api", type: "dev" }] },
              { version: "^5.7.2", occurrences: [{ workspace: "apps/web", type: "dev" }] },
            ],
          },
        ],
        hygieneIssues: [],
        graph: { nodes: [], edges: [], cycles: [], hasCycles: false, maxDepth: 1 },
        unused: { phantoms: [], unused: [], scannedFilesCount: 3 },
        outdated: null,
        security: null,
        errors: [],
        meta: {
          ignoredDirs: [],
          skippedGitignored: 0,
          toolVersion: "0.1.0",
          totalDepDeclarations: 12,
          totalUniquePackages: 5,
        },
      }

      // Generate catalog plan (highest strategy)
      const plan = generateCatalogPlan(scanResult, { strategy: "highest" })

      // Shared packages: react, react-dom, typescript, zod
      expect(plan.catalogEntries.map((e) => e.name)).toContain("react")
      expect(plan.catalogEntries.map((e) => e.name)).toContain("react-dom")
      expect(plan.catalogEntries.map((e) => e.name)).toContain("typescript")
      expect(plan.catalogEntries.map((e) => e.name)).toContain("zod")

      // Target versions should be highest
      const zodEntry = plan.catalogEntries.find((e) => e.name === "zod")
      expect(zodEntry?.targetVersion).toBe("^3.23.8")

      const tsEntry = plan.catalogEntries.find((e) => e.name === "typescript")
      expect(tsEntry?.targetVersion).toBe("^5.7.2")

      // Internal workspace package @repo/ui should NOT be in catalog
      expect(plan.catalogEntries.find((e) => e.name === "@repo/ui")).toBeUndefined()

      // Apply catalog plan
      const migrationRes = await applyCatalogPlan(tmpDir, plan, scanResult)
      expect(migrationRes.ok).toBe(true)

      // Verify pnpm-workspace.yaml created
      const pnpmYamlContent = fs.readFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "utf8")
      expect(pnpmYamlContent).toContain("catalog:")
      expect(pnpmYamlContent).toContain("react: ^19.0.0")
      expect(pnpmYamlContent).toContain("typescript: ^5.7.2")
      expect(pnpmYamlContent).toContain("zod: ^3.23.8")

      // Verify package.json files updated to "catalog:"
      const updatedApi = JSON.parse(fs.readFileSync(path.join(apiDir, "package.json"), "utf8"))
      expect(updatedApi.dependencies.zod).toBe("catalog:")
      expect(updatedApi.devDependencies.typescript).toBe("catalog:")
      expect(updatedApi.dependencies["@repo/ui"]).toBe("workspace:*")

      const updatedWeb = JSON.parse(fs.readFileSync(path.join(webDir, "package.json"), "utf8"))
      expect(updatedWeb.dependencies.react).toBe("catalog:")
      expect(updatedWeb.dependencies["react-dom"]).toBe("catalog:")
      expect(updatedWeb.dependencies.zod).toBe("catalog:")
      expect(updatedWeb.devDependencies.typescript).toBe("catalog:")
    })
  })
})
