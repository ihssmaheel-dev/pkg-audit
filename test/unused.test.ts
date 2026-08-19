import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  extractImportsFromContent,
  extractPackageName,
  extractPackagesFromScripts,
  extractReferencesFromConfig,
  isDevToolPackage,
  loadPathAliasMatcher,
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
    })

    it("filters out standard universal path aliases (@/, ~/, #/, $/)", () => {
      expect(extractPackageName("@/components/header")).toBeNull()
      expect(extractPackageName("@/hooks/use-theme")).toBeNull()
      expect(extractPackageName("@/lib/utils")).toBeNull()
      expect(extractPackageName("@/stores/auth")).toBeNull()
      expect(extractPackageName("~/routes/_root")).toBeNull()
      expect(extractPackageName("#/stores")).toBeNull()
    })

    it("filters out custom tsconfig aliases when matcher is provided", () => {
      const isAlias = (spec: string) => spec.startsWith("@components/") || spec.startsWith("@app/")
      expect(extractPackageName("@components/button", isAlias)).toBeNull()
      expect(extractPackageName("@app/config", isAlias)).toBeNull()
      expect(extractPackageName("@nestjs/common", isAlias)).toBe("@nestjs/common")
    })

    it("filters out Node.js and runtime builtins", () => {
      expect(extractPackageName("fs")).toBeNull()
      expect(extractPackageName("fs/promises")).toBeNull()
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

    it("extracts scoped package names and deep subpaths correctly", () => {
      expect(extractPackageName("@tanstack/react-query")).toBe("@tanstack/react-query")
      expect(extractPackageName("@hookform/resolvers/zod")).toBe("@hookform/resolvers")
      expect(extractPackageName("@nestjs/event-emitter")).toBe("@nestjs/event-emitter")
      expect(extractPackageName("@aws-sdk/client-s3")).toBe("@aws-sdk/client-s3")
      expect(extractPackageName("@fastify/cookie")).toBe("@fastify/cookie")
    })
  })

  describe("extractImportsFromContent", () => {
    it("extracts static, dynamic, require, type imports, side-effect imports, and re-exports", () => {
      const code = `
        import React, { useState } from "react";
        import type { FC } from "react";
        import { debounce } from "lodash/debounce";
        import "@scope/ui-kit/styles.css";
        import "reflect-metadata";
        import "@/components/layout/header";
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
      expect(imports).toContain("reflect-metadata")
      expect(imports).toContain("date-fns")
      expect(imports).toContain("chalk")
      expect(imports).toContain("axios")

      expect(imports).not.toContain("@/components/layout/header")
      expect(imports).not.toContain("node:fs")
      expect(imports).not.toContain("./local/helper")
    })
  })

  describe("extractPackagesFromScripts", () => {
    it("parses CLI binary names to packages", () => {
      const scripts = {
        build: "turbo run build",
        lint: "eslint .",
        format: "prettier --write .",
        typecheck: "tsc --noEmit",
        dev: "nodemon src/index.ts",
        migrate: "migrate-mongo up",
        release: "changeset publish",
      }

      const pkgs = extractPackagesFromScripts(scripts)
      expect(pkgs).toContain("turbo")
      expect(pkgs).toContain("eslint")
      expect(pkgs).toContain("prettier")
      expect(pkgs).toContain("typescript")
      expect(pkgs).toContain("nodemon")
      expect(pkgs).toContain("migrate-mongo")
      expect(pkgs).toContain("@changesets/cli")
    })
  })

  describe("extractReferencesFromConfig", () => {
    it("extracts config plugins and transports", () => {
      const config = `
        export default {
          plugins: ["@vitejs/plugin-react", "tailwindcss-animate"],
          transport: { target: "pino-pretty" }
        }
      `
      const refs = extractReferencesFromConfig(config)
      expect(refs).toContain("@vitejs/plugin-react")
      expect(refs).toContain("tailwindcss-animate")
      expect(refs).toContain("pino-pretty")
    })
  })

  describe("loadPathAliasMatcher", () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-alias-test-"))
    })

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // Ignore
      }
    })

    it("loads compilerOptions.paths from tsconfig.json with comments", () => {
      const tsconfig = `{
        // Main compiler config
        "compilerOptions": {
          "paths": {
            "@components/*": ["./src/components/*"],
            "@lib/*": ["./src/lib/*"]
          }
        }
      }`
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), tsconfig, "utf8")

      const isAlias = loadPathAliasMatcher(tmpDir, tmpDir)
      expect(isAlias("@components/button")).toBe(true)
      expect(isAlias("@lib/db")).toBe(true)
      expect(isAlias("@/components/header")).toBe(true)
      expect(isAlias("@tanstack/react-query")).toBe(false)
    })
  })

  describe("scanWorkspaceDependencies with nested workspaces", () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-nested-test-"))
    })

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup error
      }
    })

    it("isolates child workspaces and recognizes dev tool scripts and config references", async () => {
      // Root manifest with scripts
      const rootPkg = {
        name: "monorepo-root",
        version: "1.0.0",
        private: true,
        scripts: {
          build: "turbo run build",
          lint: "eslint .",
          format: "prettier --write .",
        },
        devDependencies: {
          turbo: "^2.0.0",
          eslint: "^9.0.0",
          prettier: "^3.0.0",
        },
      }
      fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify(rootPkg, null, 2), "utf8")

      // Apps: api
      const apiDir = path.join(tmpDir, "apps", "api")
      const apiSrc = path.join(apiDir, "src")
      fs.mkdirSync(apiSrc, { recursive: true })

      const apiPkg = {
        name: "@mono/api",
        version: "1.0.0",
        dependencies: {
          "@nestjs/common": "^11.2.1",
          "@nestjs/event-emitter": "^3.1.0",
          "@aws-sdk/client-s3": "^3.1111.0",
          jsonwebtoken: "^9.0.0",
        },
        devDependencies: {
          "@types/jsonwebtoken": "^9.0.0",
        },
      }
      fs.writeFileSync(path.join(apiDir, "package.json"), JSON.stringify(apiPkg, null, 2), "utf8")

      const apiCode = `
        import { Injectable } from "@nestjs/common";
        import { EventEmitter2 } from "@nestjs/event-emitter";
        import { S3Client } from "@aws-sdk/client-s3";
        import jwt from "jsonwebtoken";
      `
      fs.writeFileSync(path.join(apiSrc, "main.ts"), apiCode, "utf8")

      // Apps: web
      const webDir = path.join(tmpDir, "apps", "web")
      const webSrc = path.join(webDir, "src")
      fs.mkdirSync(webSrc, { recursive: true })

      const webPkg = {
        name: "@mono/web",
        version: "1.0.0",
        dependencies: {
          react: "^19.0.0",
        },
      }
      fs.writeFileSync(path.join(webDir, "package.json"), JSON.stringify(webPkg, null, 2), "utf8")

      const webCode = `
        import React from "react";
        import { Header } from "@/components/header";
        import { z } from "zod";
      `
      fs.writeFileSync(path.join(webSrc, "app.tsx"), webCode, "utf8")

      const workspaces: Workspace[] = [
        {
          name: "monorepo-root",
          version: "1.0.0",
          relPath: ".",
          absPath: path.join(tmpDir, "package.json"),
          isRoot: true,
          private: true,
          packageManager: null,
          enginesNode: null,
          depCount: 3,
          devCount: 3,
          deps: {
            turbo: { version: "^2.0.0", type: "dev" },
            eslint: { version: "^9.0.0", type: "dev" },
            prettier: { version: "^3.0.0", type: "dev" },
          },
        },
        {
          name: "@mono/api",
          version: "1.0.0",
          relPath: "apps/api",
          absPath: path.join(apiDir, "package.json"),
          isRoot: false,
          private: true,
          packageManager: null,
          enginesNode: null,
          depCount: 5,
          devCount: 1,
          deps: {
            "@nestjs/common": { version: "^11.2.1", type: "prod" },
            "@nestjs/event-emitter": { version: "^3.1.0", type: "prod" },
            "@aws-sdk/client-s3": { version: "^3.1111.0", type: "prod" },
            jsonwebtoken: { version: "^9.0.0", type: "prod" },
            "@types/jsonwebtoken": { version: "^9.0.0", type: "dev" },
          },
        },
        {
          name: "@mono/web",
          version: "1.0.0",
          relPath: "apps/web",
          absPath: path.join(webDir, "package.json"),
          isRoot: false,
          private: true,
          packageManager: null,
          enginesNode: null,
          depCount: 1,
          devCount: 0,
          deps: {
            react: { version: "^19.0.0", type: "prod" },
          },
        },
      ]

      const scanRes = await scanWorkspaceDependencies(tmpDir, workspaces)

      // 1. Root workspace: turbo, eslint, prettier are used in package.json scripts -> 0 unused!
      const rootUnused = scanRes.unused.filter((u) => u.workspace === ".")
      expect(rootUnused).toHaveLength(0)

      // 2. @mono/api: @types/jsonwebtoken is recognized as used because jsonwebtoken is used!
      const apiUnused = scanRes.unused.filter((u) => u.workspace === "apps/api")
      expect(apiUnused).toHaveLength(0)

      // 3. @mono/web imports @/components/header (alias - ignored) and zod (phantom)
      const webPhantoms = scanRes.phantoms.filter((p) => p.workspace === "apps/web")
      expect(webPhantoms).toHaveLength(1)
      expect(webPhantoms[0]?.name).toBe("zod")

      // 4. Test declare phantom remediation
      const declareRes = await declarePhantomDependencies(tmpDir, [
        { workspace: "apps/web", pkg: "zod", version: "^3.22.0", type: "prod" },
      ])
      expect(declareRes.ok).toBe(true)

      // 5. Test remove unused remediation
      const removeRes = await removeUnusedDependencies(tmpDir, [
        { workspace: "apps/web", pkg: "zod", type: "prod" },
      ])
      expect(removeRes.ok).toBe(true)
    })
  })

  describe("isDevToolPackage", () => {
    it("classifies dev tools, linters, and type packages", () => {
      expect(isDevToolPackage("@types/node", "dev")).toBe(true)
      expect(isDevToolPackage("eslint", "dev")).toBe(true)
      expect(isDevToolPackage("prettier", "dev")).toBe(true)
      expect(isDevToolPackage("pino-pretty", "prod")).toBe(true)
      expect(isDevToolPackage("reflect-metadata", "prod")).toBe(true)
      expect(isDevToolPackage("zod", "prod")).toBe(false)
    })
  })
})
