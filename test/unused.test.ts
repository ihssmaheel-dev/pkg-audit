import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  extractImportsFromContent,
  extractPackageName,
  isDevToolPackage,
  scanWorkspaceDependencies,
} from "../src/scan/unused.js"
import { declarePhantomDependencies, removeUnusedDependencies } from "../src/scan/fix.js"
import type { Workspace } from "../src/types.js"

describe("unused & phantom dependency scanner", () => {
  describe("extractPackageName", () => {
    it("filters out relative and local paths", () => {
      expect(extractPackageName("./utils/helper.js")).toBeNull()
      expect(extractPackageName("../common/index")).toBeNull()
      expect(extractPackageName("/absolute/path")).toBeNull()
      expect(extractPackageName("#internal/alias")).toBeNull()
    })

    it("filters out Node.js and runtime builtins", () => {
      expect(extractPackageName("fs")).toBeNull()
      expect(extractPackageName("node:fs")).toBeNull()
      expect(extractPackageName("path")).toBeNull()
      expect(extractPackageName("node:path")).toBeNull()
      expect(extractPackageName("crypto")).toBeNull()
      expect(extractPackageName("node:crypto")).toBeNull()
      expect(extractPackageName("bun:ffi")).toBeNull()
    })

    it("extracts non-scoped package names and subpaths correctly", () => {
      expect(extractPackageName("react")).toBe("react")
      expect(extractPackageName("react-dom/client")).toBe("react-dom")
      expect(extractPackageName("lodash/debounce")).toBe("lodash")
      expect(extractPackageName("date-fns/format")).toBe("date-fns")
    })

    it("extracts scoped package names and subpaths correctly", () => {
      expect(extractPackageName("@tanstack/react-query")).toBe("@tanstack/react-query")
      expect(extractPackageName("@org/ui-kit/components/button")).toBe("@org/ui-kit")
      expect(extractPackageName("@preact/signals")).toBe("@preact/signals")
    })
  })

  describe("extractImportsFromContent", () => {
    it("extracts static, dynamic, require, type imports, and re-exports", () => {
      const code = `
        import React, { useState } from "react";
        import type { FC } from "react";
        import { debounce } from "lodash/debounce";
        import "@scope/ui-kit/styles.css";
        export { Button } from "@scope/ui-kit";
        export * from "date-fns";

        const lazyModule = await import("chalk");
        const fs = require("node:fs");
        const helper = require("./local/helper");
        const axios = require("axios");
      `

      const imports = extractImportsFromContent(code)
      expect(imports).toContain("react")
      expect(imports).toContain("lodash")
      expect(imports).toContain("@scope/ui-kit")
      expect(imports).toContain("date-fns")
      expect(imports).toContain("chalk")
      expect(imports).toContain("axios")

      expect(imports).not.toContain("node:fs")
      expect(imports).not.toContain("./local/helper")
    })
  })

  describe("isDevToolPackage", () => {
    it("identifies known types, linters, and build tooling", () => {
      expect(isDevToolPackage("@types/node", "dev")).toBe(true)
      expect(isDevToolPackage("@types/react", "dev")).toBe(true)
      expect(isDevToolPackage("typescript", "dev")).toBe(true)
      expect(isDevToolPackage("eslint", "dev")).toBe(true)
      expect(isDevToolPackage("@typescript-eslint/parser", "dev")).toBe(true)
      expect(isDevToolPackage("prettier", "dev")).toBe(true)
      expect(isDevToolPackage("vitest", "dev")).toBe(true)
      expect(isDevToolPackage("tailwindcss", "dev")).toBe(true)
      expect(isDevToolPackage("turbo", "dev")).toBe(true)

      expect(isDevToolPackage("zod", "dev")).toBe(false)
      expect(isDevToolPackage("typescript", "prod")).toBe(false)
    })
  })

  describe("scanWorkspaceDependencies and remediation", () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-unused-test-"))
    })

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup error
      }
    })

    it("detects phantom imports and unused dependencies on disk", async () => {
      const appDir = path.join(tmpDir, "apps", "web")
      const srcDir = path.join(appDir, "src")
      fs.mkdirSync(srcDir, { recursive: true })

      // package.json with:
      // - react (used)
      // - axios (declared in dependencies but unused in code)
      // - @types/react (dev tool, not imported)
      const pkgJson = {
        name: "@mono/web",
        version: "1.0.0",
        dependencies: {
          react: "^19.0.0",
          axios: "^1.6.0",
        },
        devDependencies: {
          "@types/react": "^19.0.0",
        },
      }
      fs.writeFileSync(path.join(appDir, "package.json"), JSON.stringify(pkgJson, null, 2), "utf8")

      // Source code imports react and phantom "zod" (undeclared in package.json)
      const srcCode = `
        import React from "react";
        import { z } from "zod";

        export const schema = z.string();
      `
      fs.writeFileSync(path.join(srcDir, "index.ts"), srcCode, "utf8")

      const workspaces: Workspace[] = [
        {
          name: "@mono/web",
          version: "1.0.0",
          relPath: "apps/web",
          absPath: path.join(appDir, "package.json"),
          isRoot: false,
          private: true,
          packageManager: null,
          enginesNode: null,
          depCount: 3,
          devCount: 1,
          deps: {
            react: { version: "^19.0.0", type: "prod" },
            axios: { version: "^1.6.0", type: "prod" },
            "@types/react": { version: "^19.0.0", type: "dev" },
          },
        },
      ]

      const scanRes = await scanWorkspaceDependencies(tmpDir, workspaces)

      expect(scanRes.scannedFilesCount).toBe(1)

      // Check Phantom
      expect(scanRes.phantoms).toHaveLength(1)
      expect(scanRes.phantoms[0]?.name).toBe("zod")
      expect(scanRes.phantoms[0]?.workspace).toBe("apps/web")
      expect(scanRes.phantoms[0]?.files).toContain("apps/web/src/index.ts")

      // Check Unused
      expect(scanRes.unused).toHaveLength(2)
      const axiosUnused = scanRes.unused.find((u) => u.name === "axios")
      const typesUnused = scanRes.unused.find((u) => u.name === "@types/react")

      expect(axiosUnused?.type).toBe("prod")
      expect(axiosUnused?.isDevTool).toBe(false)

      expect(typesUnused?.type).toBe("dev")
      expect(typesUnused?.isDevTool).toBe(true)

      // Test declare phantom remediation
      const declareRes = await declarePhantomDependencies(tmpDir, [
        { workspace: "apps/web", pkg: "zod", version: "^3.22.0", type: "prod" },
      ])
      expect(declareRes.ok).toBe(true)
      expect(declareRes.changes).toHaveLength(1)

      const updatedPkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8")) as {
        dependencies: Record<string, string>
      }
      expect(updatedPkg.dependencies.zod).toBe("^3.22.0")

      // Test remove unused remediation
      const removeRes = await removeUnusedDependencies(tmpDir, [
        { workspace: "apps/web", pkg: "axios", type: "prod" },
      ])
      expect(removeRes.ok).toBe(true)

      const finalPkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8")) as {
        dependencies: Record<string, string>
      }
      expect(finalPkg.dependencies.axios).toBeUndefined()
    })
  })
})
