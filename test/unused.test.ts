import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  collectSourceFiles,
  extractImportsFromContent,
  extractPackageName,
  extractPackagesFromScripts,
  extractReferencesFromConfig,
  isConfigurationFile,
  isConnectedEcosystemPackage,
  isDevToolPackage,
  loadPathAliasMatcher,
  scanWorkspaceDependencies,
  stripComments,
} from "../src/scan/unused.js"
import { declarePhantomDependencies, removeUnusedDependencies } from "../src/scan/fix.js"
import type { Workspace } from "../src/types.js"

describe("unused & phantom dependency scanner", () => {
  describe("stripComments", () => {
    it("strips single-line comments without stripping URLs inside quotes", () => {
      const code = `
        // import "dead-pkg";
        const url = "https://example.com/api"; // comment
        import live from "live-pkg";
      `
      const stripped = stripComments(code)
      expect(stripped).not.toContain("dead-pkg")
      expect(stripped).toContain("https://example.com/api")
      expect(stripped).toContain("live-pkg")
    })

    it("strips multi-line block comments", () => {
      const code = `
        /*
          import "ghost-multiline";
          const x = 1;
        */
        import active from "active-pkg";
      `
      const stripped = stripComments(code)
      expect(stripped).not.toContain("ghost-multiline")
      expect(stripped).toContain("active-pkg")
    })

    it("preserves regex literals containing slashes and asterisks without misidentifying them as comments", () => {
      const code = `
        const pattern = /a\\/\\/b/g;
        const starPattern = /\\/*\\//;
        const charClass = /[/]/;
        import real from "real-pkg";
      `
      const stripped = stripComments(code)
      expect(stripped).toContain("pattern")
      expect(stripped).toContain("starPattern")
      expect(stripped).toContain("charClass")
      expect(stripped).toContain("real-pkg")
    })
  })

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
    it("extracts static, dynamic, backticks, type imports, side-effect imports, and ignores comments", () => {
      const code = `
        // import commented from "commented-pkg";
        /* import multiline from "multiline-pkg"; */
        import React, { useState } from "react";
        import type { FC } from "react";
        import { debounce } from "lodash/debounce";
        import "@scope/ui-kit/styles.css";
        import "reflect-metadata";
        import "@/components/layout/header";
        export { Button } from "@scope/ui-kit";
        export * from "date-fns";

        const lazyModule = await import(\`chalk\`);
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

      expect(imports).not.toContain("commented-pkg")
      expect(imports).not.toContain("multiline-pkg")
      expect(imports).not.toContain("@/components/layout/header")
      expect(imports).not.toContain("node:fs")
      expect(imports).not.toContain("./local/helper")
    })

    it("ignores code examples and template strings in documentation components without falsely extracting phantom dependencies", () => {
      const docCode = `
        import { createInstallation } from 'scenes/onboarding/shared/OnboardingDocsContentWrapper'
        import { StepDefinition } from '../steps'

        export const getVercelAISteps = (ctx: any) => {
          return [
            {
              title: 'Install dependencies',
              content: (
                <CodeBlock
                  code={dedent\`
                    import { OpenTelemetry } from '@ai-sdk/otel'
                    import { NodeSDK } from '@opentelemetry/sdk-node'
                    import { resourceFromAttributes } from '@opentelemetry/resources'
                  \`}
                />
              )
            }
          ]
        }
      `

      const imports = extractImportsFromContent(docCode)
      expect(imports).not.toContain("@ai-sdk/otel")
      expect(imports).not.toContain("@opentelemetry/sdk-node")
      expect(imports).not.toContain("@opentelemetry/resources")
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

  describe("extractReferencesFromConfig and isConfigurationFile", () => {
    it("identifies config files generically and rejects non-JS files", () => {
      expect(isConfigurationFile("package.json")).toBe(true)
      expect(isConfigurationFile("tsconfig.build.json")).toBe(true)
      expect(isConfigurationFile("tailwind.config.ts")).toBe(true)
      expect(isConfigurationFile("vite.config.mjs")).toBe(true)
      expect(isConfigurationFile(".eslintrc.cjs")).toBe(true)
      expect(isConfigurationFile(".prettierrc")).toBe(true)
      expect(isConfigurationFile(".oxlintrc.json")).toBe(true)
      expect(isConfigurationFile("turbo.json")).toBe(true)

      // Must never treat non-JS language files (like Go/Python/Rust) or normal source files as config files
      expect(isConfigurationFile("config.go")).toBe(false)
      expect(isConfigurationFile("config.py")).toBe(false)
      expect(isConfigurationFile("config.rs")).toBe(false)
      expect(isConfigurationFile("app.tsx")).toBe(false)
      expect(isConfigurationFile("index.ts")).toBe(false)
    })

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

  describe("isConnectedEcosystemPackage", () => {
    it("connects scoped packages, plugin pairs, and type definitions generically", () => {
      const active = new Set(["@fastify/cookie", "eslint", "react", "tailwindcss"])
      const exts = new Set([".tsx", ".ts"])

      expect(isConnectedEcosystemPackage("@fastify/static", active, exts)).toBe(true)
      expect(isConnectedEcosystemPackage("eslint-plugin-react-hooks", active, exts)).toBe(true)
      expect(isConnectedEcosystemPackage("tailwindcss-animate", active, exts)).toBe(true)
      expect(isConnectedEcosystemPackage("@types/react", active, exts)).toBe(true)
      expect(isConnectedEcosystemPackage("@types/node", active, exts)).toBe(true)
      expect(isConnectedEcosystemPackage("react-dom", active, exts)).toBe(true)

      expect(isConnectedEcosystemPackage("zod", active, exts)).toBe(false)
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

  describe("collectSourceFiles with symlinks", () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-symlink-test-"))
    })

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // Ignore
      }
    })

    it("safely follows symlinked directories", async () => {
      const realDir = path.join(tmpDir, "real-src")
      fs.mkdirSync(realDir, { recursive: true })
      fs.writeFileSync(path.join(realDir, "real.ts"), "export const a = 1;", "utf8")

      const linkDir = path.join(tmpDir, "linked-src")
      try {
        fs.symlinkSync(realDir, linkDir, "junction")
      } catch {
        // Fallback for Windows without admin privileges
      }

      const files = await collectSourceFiles(tmpDir, new Set())
      expect(files.some((f) => f.endsWith("real.ts"))).toBe(true)
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

    it("isolates child workspaces, calculates suggestedVersion from frequency, and skips peer deps", async () => {
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
          zod: "^3.22.4",
        },
        devDependencies: {
          "@types/jsonwebtoken": "^9.0.0",
        },
        peerDependencies: {
          "@nestjs/core": "^11.2.1",
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
          depCount: 6,
          devCount: 1,
          deps: {
            "@nestjs/common": { version: "^11.2.1", type: "prod" },
            "@nestjs/event-emitter": { version: "^3.1.0", type: "prod" },
            "@aws-sdk/client-s3": { version: "^3.1111.0", type: "prod" },
            jsonwebtoken: { version: "^9.0.0", type: "prod" },
            zod: { version: "^3.22.4", type: "prod" },
            "@types/jsonwebtoken": { version: "^9.0.0", type: "dev" },
            "@nestjs/core": { version: "^11.2.1", type: "peer" },
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

      // 2. @mono/api: @nestjs/core is a peer dependency -> skipped from unused report!
      const peerUnused = scanRes.unused.find((u) => u.name === "@nestjs/core")
      expect(peerUnused).toBeUndefined()

      // 3. @mono/web imports zod (phantom) -> suggestedVersion is "^3.22.4" from @mono/api!
      const webPhantoms = scanRes.phantoms.filter((p) => p.workspace === "apps/web")
      expect(webPhantoms).toHaveLength(1)
      expect(webPhantoms[0]?.name).toBe("zod")
      expect(webPhantoms[0]?.suggestedVersion).toBe("^3.22.4")

      // 4. Test declare phantom remediation
      const declareRes = await declarePhantomDependencies(tmpDir, [
        { workspace: "apps/web", pkg: "zod", version: "^3.22.4", type: "prod" },
      ])
      expect(declareRes.ok).toBe(true)

      // 5. Test remove unused remediation
      const removeRes = await removeUnusedDependencies(tmpDir, [
        { workspace: "apps/web", pkg: "zod", type: "prod" },
      ])
      expect(removeRes.ok).toBe(true)
    })

    it("does not flag root-hoisted test dependencies in test files or rules in .oxlintrc.json", async () => {
      const rootDir = tmpDir
      const appDir = path.join(rootDir, "frontend")
      fs.mkdirSync(appDir, { recursive: true })
      fs.mkdirSync(path.join(appDir, "src", "test"), { recursive: true })

      // .oxlintrc.json with restricted import rules
      fs.writeFileSync(
        path.join(rootDir, ".oxlintrc.json"),
        JSON.stringify({
          rules: {
            "no-restricted-imports": [
              "error",
              { paths: [{ name: "@posthog/brand/hoggies", message: "Do not import" }] },
            ],
          },
        })
      )

      // Test file importing @playwright/test
      fs.writeFileSync(
        path.join(appDir, "src", "test", "quarantine.test.ts"),
        `
          import { test, expect } from '@playwright/test'
          test('smoke', () => { expect(1).toBe(1) })
        `
      )

      // Non-JS file (Go file) with import
      fs.mkdirSync(path.join(rootDir, "livestream", "tui", "config"), { recursive: true })
      fs.writeFileSync(
        path.join(rootDir, "livestream", "tui", "config", "config.go"),
        `
          package config
          import (
            "encoding/json"
            "os"
          )
        `
      )

      const workspaces: Workspace[] = [
        {
          name: "root",
          version: "1.0.0",
          relPath: ".",
          absPath: path.join(rootDir, "package.json"),
          isRoot: true,
          private: true,
          packageManager: null,
          enginesNode: null,
          depCount: 0,
          devCount: 1,
          deps: {
            "@playwright/test": { version: "^1.50.0", type: "dev" },
          },
        },
        {
          name: "frontend",
          version: "1.0.0",
          relPath: "frontend",
          absPath: path.join(appDir, "package.json"),
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

      const scanRes = await scanWorkspaceDependencies(rootDir, workspaces)

      // 1. @posthog/brand from .oxlintrc.json must NOT be a phantom dependency
      const posthogPhantom = scanRes.phantoms.find((p) => p.name.includes("posthog"))
      expect(posthogPhantom).toBeUndefined()

      // 2. encoding from config.go must NOT be a phantom dependency
      const encodingPhantom = scanRes.phantoms.find((p) => p.name === "encoding")
      expect(encodingPhantom).toBeUndefined()

      // 3. @playwright/test in frontend's test file is declared in root devDeps -> NOT a phantom!
      const playwrightPhantom = scanRes.phantoms.find((p) => p.name === "@playwright/test")
      expect(playwrightPhantom).toBeUndefined()
    })
  })

  describe("isDevToolPackage", () => {
    it("classifies dev tools, linters, and type packages", () => {
      expect(isDevToolPackage("@types/node", "dev")).toBe(true)
      expect(isDevToolPackage("eslint", "dev")).toBe(true)
      expect(isDevToolPackage("prettier", "dev")).toBe(true)
      expect(isDevToolPackage("eslint-plugin-react", "prod")).toBe(true)
      expect(isDevToolPackage("zod", "prod")).toBe(false)
    })
  })

  describe("SFC and Astro multi-script & frontmatter parsing", () => {
    it("extracts imports from Astro frontmatter and client script tags", () => {
      const astroContent = `---
import Header from '../components/Header.astro'
import { format } from 'date-fns'
import type { User } from '@types/user'
---
<div>
  <h1>Hello Astro</h1>
  <script>
    import clientLib from 'client-analytics'
  </script>
</div>
`
      const imports = extractImportsFromContent(astroContent, undefined)
      expect(imports.has("date-fns")).toBe(true)
      expect(imports.has("client-analytics")).toBe(true)
      expect(imports.has("@types/user")).toBe(true)
    })

    it("extracts imports from multiple script blocks in Vue SFC (<script setup> + <script>)", () => {
      const vueContent = `
<script setup lang="ts">
import { ref } from 'vue'
import lodash from 'lodash'
const count = ref(0)
</script>

<template>
  <div>{{ count }}</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import helper from 'vue-helper-pkg'
export default defineComponent({
  name: 'MyComponent'
})
</script>
`
      const imports = extractImportsFromContent(vueContent, undefined)
      expect(imports.has("vue")).toBe(true)
      expect(imports.has("lodash")).toBe(true)
      expect(imports.has("vue-helper-pkg")).toBe(true)
    })

    it("extracts imports from multiple script blocks in Svelte (<script context='module'> + <script>)", () => {
      const svelteContent = `
<script context="module">
import { preloadHelper } from 'svelte-module-pkg'
</script>

<script>
import { onMount } from 'svelte'
import axios from 'axios'
</script>

<main>Hello</main>
`
      const imports = extractImportsFromContent(svelteContent, undefined)
      expect(imports.has("svelte-module-pkg")).toBe(true)
      expect(imports.has("svelte")).toBe(true)
      expect(imports.has("axios")).toBe(true)
    })
  })

  describe("YAML config extraction", () => {
    it("safely ignores pnpm-workspace.yaml without feeding to TS parser", () => {
      const pnpmWorkspaceYaml = `
packages:
  - 'apps/*'
  - 'packages/*'
catalog:
  react: ^19.0.0
`
      const refs = extractReferencesFromConfig(pnpmWorkspaceYaml, "pnpm-workspace.yaml")
      expect(refs.size).toBe(0)
    })

    it("extracts plugins and presets from YAML config files cleanly", () => {
      const prettierYaml = `
plugins:
  - prettier-plugin-tailwindcss
  - '@ianvs/prettier-plugin-sort-imports'
`
      const refs = extractReferencesFromConfig(prettierYaml, ".prettierrc.yaml")
      expect(refs.has("prettier-plugin-tailwindcss")).toBe(true)
      expect(refs.has("@ianvs/prettier-plugin-sort-imports")).toBe(true)
    })
  })

  describe("BaseUrl and local directory module imports", () => {
    it("recognizes src/* and local folder imports as internal paths rather than phantoms", () => {
      const isAlias = loadPathAliasMatcher(process.cwd(), process.cwd())
      expect(extractPackageName("src/queries/schema/schema-general", isAlias)).toBeNull()
      expect(extractPackageName("lib/components/ActivityLog/SentenceList", isAlias)).toBeNull()
      expect(extractPackageName("scenes/urls", isAlias)).toBeNull()
      expect(extractPackageName("types/common", isAlias)).toBeNull()
      expect(extractPackageName("react", isAlias)).toBe("react")
      expect(extractPackageName("torph/react", isAlias)).toBe("torph")
    })
  })
})
