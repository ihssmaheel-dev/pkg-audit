import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { checkBoundaryViolations } from "../src/scan/boundaries.js"
import type { Workspace } from "../src/types.js"

describe("Boundary Enforcement Engine", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-boundaries-test-"))
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  it("detects forbidden package imports across boundaries", () => {
    const pkgUiDir = path.join(tmpDir, "packages", "ui")
    const appWebDir = path.join(tmpDir, "apps", "web")
    fs.mkdirSync(pkgUiDir, { recursive: true })
    fs.mkdirSync(appWebDir, { recursive: true })

    // Violating file in packages/ui importing from apps/web
    fs.writeFileSync(
      path.join(pkgUiDir, "button.tsx"),
      `import React from "react";\nimport { webConfig } from "@mono/web";\nexport const Button = () => null;`
    )

    const workspaces: Workspace[] = [
      {
        name: "@mono/ui",
        relPath: "packages/ui",
        absPath: path.join(pkgUiDir, "package.json"),
        version: "1.0.0",
        private: false,
        isRoot: false,
        packageManager: "pnpm",
        enginesNode: null,
        deps: {},
        depCount: 0,
        devCount: 0,
      },
      {
        name: "@mono/web",
        relPath: "apps/web",
        absPath: path.join(appWebDir, "package.json"),
        version: "1.0.0",
        private: true,
        isRoot: false,
        packageManager: "pnpm",
        enginesNode: null,
        deps: {},
        depCount: 0,
        devCount: 0,
      },
    ]

    const result = checkBoundaryViolations(workspaces, tmpDir, [
      {
        from: "packages/**",
        disallow: ["apps/**"],
        reason: "Packages must not import from apps",
      },
    ])

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.sourceWorkspace).toBe("@mono/ui")
    expect(result.violations[0]?.targetWorkspace).toBe("@mono/web")
    expect(result.violations[0]?.importedSpecifier).toBe("@mono/web")
  })
})
