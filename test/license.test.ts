import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  categorizeLicense,
  generateCsvReport,
  generateNoticeText,
  generateSpdxJson,
  normalizeSpdx,
  scanMonorepoLicenses,
} from "../src/scan/license.js"
import type { Workspace } from "../src/types.js"

describe("License Compliance & Legal Risk Scanner", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-license-"))
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  it("normalizes raw license strings and categorizes risk accurately", () => {
    // Permissive
    expect(normalizeSpdx("MIT").spdxId).toBe("MIT")
    expect(categorizeLicense("MIT", "MIT")).toBe("permissive")
    expect(normalizeSpdx("Apache 2.0").spdxId).toBe("Apache-2.0")
    expect(categorizeLicense("Apache-2.0", "Apache 2.0")).toBe("permissive")
    expect(normalizeSpdx("BSD-3-Clause").spdxId).toBe("BSD-3-Clause")
    expect(categorizeLicense("BSD-3-Clause", "BSD-3-Clause")).toBe("permissive")
    expect(normalizeSpdx("ISC").spdxId).toBe("ISC")
    expect(categorizeLicense("ISC", "ISC")).toBe("permissive")

    // Weak Copyleft
    expect(normalizeSpdx("MPL-2.0").spdxId).toBe("MPL-2.0")
    expect(categorizeLicense("MPL-2.0", "MPL-2.0")).toBe("weak-copyleft")
    expect(normalizeSpdx("LGPL-3.0").spdxId).toBe("LGPL-3.0")
    expect(categorizeLicense("LGPL-3.0", "LGPL-3.0")).toBe("weak-copyleft")

    // Strong Copyleft
    expect(normalizeSpdx("GPL-3.0").spdxId).toBe("GPL-3.0")
    expect(categorizeLicense("GPL-3.0", "GPL-3.0")).toBe("strong-copyleft")
    expect(normalizeSpdx("AGPL-3.0").spdxId).toBe("AGPL-3.0")
    expect(categorizeLicense("AGPL-3.0", "AGPL-3.0")).toBe("strong-copyleft")
    expect(normalizeSpdx("SSPL-1.0").spdxId).toBe("SSPL-1.0")
    expect(categorizeLicense("SSPL-1.0", "SSPL-1.0")).toBe("strong-copyleft")

    // Proprietary & Unknown
    expect(normalizeSpdx("UNLICENSED").spdxId).toBe("UNLICENSED")
    expect(categorizeLicense("UNLICENSED", "UNLICENSED")).toBe("proprietary")
    expect(normalizeSpdx(null).spdxId).toBe("UNKNOWN")
    expect(categorizeLicense("UNKNOWN", "UNKNOWN")).toBe("unknown")
  })

  it("scans monorepo licenses from local node_modules and flags production copyleft", () => {
    // Create mock node_modules for lodash (MIT), react (MIT), and bad-copyleft-lib (GPL-3.0)
    const nmDir = path.join(tmpDir, "node_modules")
    fs.mkdirSync(path.join(nmDir, "lodash"), { recursive: true })
    fs.writeFileSync(
      path.join(nmDir, "lodash", "package.json"),
      JSON.stringify({
        name: "lodash",
        version: "4.17.21",
        license: "MIT",
        author: "John-David Dalton",
        repository: { url: "https://github.com/lodash/lodash.git" },
      }),
      "utf8"
    )

    fs.mkdirSync(path.join(nmDir, "bad-copyleft-lib"), { recursive: true })
    fs.writeFileSync(
      path.join(nmDir, "bad-copyleft-lib", "package.json"),
      JSON.stringify({
        name: "bad-copyleft-lib",
        version: "1.0.0",
        license: "GPL-3.0",
        author: { name: "Copyleft Author", email: "author@gnu.org" },
      }),
      "utf8"
    )

    fs.mkdirSync(path.join(nmDir, "dev-tool"), { recursive: true })
    fs.writeFileSync(
      path.join(nmDir, "dev-tool", "package.json"),
      JSON.stringify({
        name: "dev-tool",
        version: "2.0.0",
        license: "AGPL-3.0",
      }),
      "utf8"
    )

    const workspaces: Workspace[] = [
      {
        name: "web-app",
        relPath: "apps/web",
        version: "1.0.0",
        private: true,
        isRoot: false,
        packageManager: null,
        enginesNode: null,
        depCount: 2,
        devCount: 1,
        deps: {
          lodash: { version: "^4.17.21", type: "prod" },
          "bad-copyleft-lib": { version: "^1.0.0", type: "prod" },
          "dev-tool": { version: "^2.0.0", type: "dev" },
        },
      },
    ]

    const res = scanMonorepoLicenses(workspaces, tmpDir)
    expect(res.totalScanned).toBe(3)
    expect(res.permissiveCount).toBe(1) // lodash
    expect(res.strongCopyleftCount).toBe(2) // bad-copyleft-lib, dev-tool
    expect(res.prodCopyleftCount).toBe(1) // only bad-copyleft-lib is in prod!

    const badLib = res.packages.find((p) => p.name === "bad-copyleft-lib")!
    expect(badLib).toBeDefined()
    expect(badLib.spdxId).toBe("GPL-3.0")
    expect(badLib.riskLevel).toBe("strong-copyleft")
    expect(badLib.isCopyleft).toBe(true)
    expect(badLib.isProd).toBe(true)
    expect(badLib.author).toBe("Copyleft Author <author@gnu.org>")

    const devTool = res.packages.find((p) => p.name === "dev-tool")!
    expect(devTool.isCopyleft).toBe(true)
    expect(devTool.isProd).toBe(false)
  })

  it("generates NOTICE.txt attribution report", () => {
    const mockLicenseResult = {
      packages: [
        {
          name: "lodash",
          version: "4.17.21",
          license: "MIT",
          spdxId: "MIT",
          riskLevel: "permissive" as const,
          isCopyleft: false,
          isProd: true,
          workspaces: [{ workspace: "web-app", type: "prod" as const, spec: "^4.17.21" }],
          author: "John-David Dalton",
          repository: "https://github.com/lodash/lodash",
        },
      ],
      permissiveCount: 1,
      weakCopyleftCount: 0,
      strongCopyleftCount: 0,
      proprietaryCount: 0,
      unknownCount: 0,
      prodCopyleftCount: 0,
      totalScanned: 1,
    }

    const notice = generateNoticeText(mockLicenseResult, "My Company Monorepo")
    expect(notice).toContain("THIRD-PARTY SOFTWARE NOTICES AND INFORMATION")
    expect(notice).toContain("Project: My Company Monorepo")
    expect(notice).toContain("Package: lodash")
    expect(notice).toContain("Version: 4.17.21")
    expect(notice).toContain("License: MIT (MIT)")
    expect(notice).toContain("Author: John-David Dalton")
  })

  it("generates SPDX 2.3 JSON Software Bill of Materials (SBOM)", () => {
    const mockLicenseResult = {
      packages: [
        {
          name: "lodash",
          version: "4.17.21",
          license: "MIT",
          spdxId: "MIT",
          riskLevel: "permissive" as const,
          isCopyleft: false,
          isProd: true,
          workspaces: [{ workspace: "web-app", type: "prod" as const, spec: "^4.17.21" }],
          author: "John-David Dalton",
          repository: "https://github.com/lodash/lodash",
          homepage: "https://lodash.com",
        },
      ],
      permissiveCount: 1,
      weakCopyleftCount: 0,
      strongCopyleftCount: 0,
      proprietaryCount: 0,
      unknownCount: 0,
      prodCopyleftCount: 0,
      totalScanned: 1,
    }

    const spdxStr = generateSpdxJson(mockLicenseResult, "enterprise-repo")
    const spdx = JSON.parse(spdxStr)
    expect(spdx.spdxVersion).toBe("SPDX-2.3")
    expect(spdx.name).toBe("enterprise-repo")
    expect(spdx.packages).toHaveLength(1)
    expect(spdx.packages[0].name).toBe("lodash")
    expect(spdx.packages[0].versionInfo).toBe("4.17.21")
    expect(spdx.packages[0].licenseConcluded).toBe("MIT")
  })

  it("generates CSV spreadsheet report", () => {
    const mockLicenseResult = {
      packages: [
        {
          name: "lodash",
          version: "4.17.21",
          license: "MIT",
          spdxId: "MIT",
          riskLevel: "permissive" as const,
          isCopyleft: false,
          isProd: true,
          workspaces: [{ workspace: "web-app", type: "prod" as const, spec: "^4.17.21" }],
          author: "John-David Dalton",
          repository: "https://github.com/lodash/lodash",
        },
      ],
      permissiveCount: 1,
      weakCopyleftCount: 0,
      strongCopyleftCount: 0,
      proprietaryCount: 0,
      unknownCount: 0,
      prodCopyleftCount: 0,
      totalScanned: 1,
    }

    const csv = generateCsvReport(mockLicenseResult)
    const lines = csv.split("\n")
    expect(lines[0]).toBe(
      "Package,Version,License,SPDX Identifier,Risk Level,Is Copyleft,Production Used,Workspaces,Author,Repository,Homepage"
    )
    expect(lines[1]).toContain('"lodash"')
    expect(lines[1]).toContain('"MIT"')
    expect(lines[1]).toContain('"permissive"')
  })
})
