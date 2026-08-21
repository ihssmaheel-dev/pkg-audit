import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  applySecurityFixes,
  checkVulnerabilities,
  cleanVersion,
  findPatchedVersion,
} from "../src/scan/security.js"
import { resetScanCache } from "../src/scan/cache.js"
import type { SecurityVulnerability, Workspace } from "../src/types.js"

describe("Google OSV Security Vulnerability Scanner", () => {
  let tmpDir: string

  beforeEach(() => {
    resetScanCache()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-security-"))
  })

  afterEach(() => {
    resetScanCache()
    vi.restoreAllMocks()
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  describe("cleanVersion and findPatchedVersion helpers", () => {
    it("cleans simple and compound version ranges correctly", () => {
      expect(cleanVersion("^4.17.15")).toBe("4.17.15")
      expect(cleanVersion("~1.2.3")).toBe("1.2.3")
      expect(cleanVersion(">=1.2.3 <2.0.0")).toBe("1.2.3")
      expect(cleanVersion("^1.0.0 || ^2.0.0")).toBe("1.0.0")
      expect(cleanVersion("0.21.1")).toBe("0.21.1")
    })

    it("finds the safe patched version correctly even if ranges are out of order", () => {
      const mockVuln = {
        id: "TEST-1",
        affected: [
          {
            ranges: [
              {
                type: "ECOSYSTEM",
                events: [{ fixed: "4.17.21" }, { fixed: "4.17.18" }, { fixed: "4.17.16" }],
              },
            ],
          },
        ],
      }

      // If current is 4.17.15, the lowest safe fixed version is 4.17.16
      expect(findPatchedVersion(mockVuln, "4.17.15")).toBe("4.17.16")
      // If current is 4.17.17, the lowest safe fixed version is 4.17.18
      expect(findPatchedVersion(mockVuln, "4.17.17")).toBe("4.17.18")
    })
  })

  it("queries Google OSV batch endpoint and hydrates full vulnerability records", async () => {
    const mockWorkspaces: Workspace[] = [
      {
        name: "@repo/web",
        version: "1.0.0",
        relPath: "apps/web",
        isRoot: false,
        private: true,
        packageManager: null,
        enginesNode: null,
        depCount: 2,
        devCount: 0,
        deps: {
          lodash: { version: "^4.17.15", type: "prod" },
          axios: { version: "^0.21.1", type: "prod" },
        },
      },
    ]

    // 1. Mock batch response (only IDs returned by POST /v1/querybatch)
    const mockBatchResponse = {
      results: [
        {
          vulns: [{ id: "GHSA-p6mc-m468-83gw" }],
        },
        {
          vulns: [{ id: "GHSA-cph5-m8f7-6c5x" }],
        },
      ],
    }

    // 2. Mock individual hydration responses for GET /v1/vulns/{id}
    const lodashFullVuln = {
      id: "GHSA-p6mc-m468-83gw",
      summary: "Prototype Pollution in lodash",
      aliases: ["CVE-2020-8203"],
      database_specific: {
        severity: "HIGH",
      },
      severity: [
        {
          type: "CVSS_V3",
          score: "7.4",
        },
      ],
      affected: [
        {
          package: { name: "lodash", ecosystem: "npm" },
          ranges: [
            {
              type: "ECOSYSTEM",
              events: [{ introduced: "0" }, { fixed: "4.17.21" }],
            },
          ],
        },
      ],
    }

    const axiosFullVuln = {
      id: "GHSA-cph5-m8f7-6c5x",
      summary: "Server-Side Request Forgery in axios",
      aliases: ["CVE-2021-3749"],
      database_specific: {
        severity: "CRITICAL",
      },
      severity: [
        {
          type: "CVSS_V3",
          score: "9.8",
        },
      ],
      affected: [
        {
          package: { name: "axios", ecosystem: "npm" },
          ranges: [
            {
              type: "ECOSYSTEM",
              events: [{ introduced: "0" }, { fixed: "0.21.2" }],
            },
          ],
        },
      ],
    }

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString()
      if (urlStr.includes("querybatch")) {
        return {
          ok: true,
          json: async () => mockBatchResponse,
        } as Response
      }
      if (urlStr.includes("GHSA-p6mc-m468-83gw")) {
        return {
          ok: true,
          json: async () => lodashFullVuln,
        } as Response
      }
      if (urlStr.includes("GHSA-cph5-m8f7-6c5x")) {
        return {
          ok: true,
          json: async () => axiosFullVuln,
        } as Response
      }
      return { ok: false, status: 404 } as Response
    })

    const result = await checkVulnerabilities(mockWorkspaces, { rootDir: tmpDir })

    // Should call batch query + 2 hydration queries
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(result.vulnerabilities.length).toBe(2)
    expect(result.criticalCount).toBe(1)
    expect(result.highCount).toBe(1)
    expect(result.totalVulnerablePackages).toBe(2)

    // Critical (axios) should be sorted first with real summary & CVSS
    const first = result.vulnerabilities[0]!
    expect(first.pkg).toBe("axios")
    expect(first.severity).toBe("CRITICAL")
    expect(first.cvssScore).toBe(9.8)
    expect(first.summary).toBe("Server-Side Request Forgery in axios")
    expect(first.patchedVersion).toBe("0.21.2")
    expect(first.suggestedVersion).toBe("^0.21.2")
    expect(first.advisoryUrl).toContain("GHSA-cph5-m8f7-6c5x")

    // High (lodash) should be second with real summary & CVSS
    const second = result.vulnerabilities[1]!
    expect(second.pkg).toBe("lodash")
    expect(second.severity).toBe("HIGH")
    expect(second.cvssScore).toBe(7.4)
    expect(second.summary).toBe("Prototype Pollution in lodash")
    expect(second.patchedVersion).toBe("4.17.21")
    expect(second.suggestedVersion).toBe("^4.17.21")
  })

  it("applies 1-click safe security upgrades across monorepo workspace package.json files", async () => {
    const webDir = path.join(tmpDir, "apps", "web")
    const apiDir = path.join(tmpDir, "apps", "api")
    fs.mkdirSync(webDir, { recursive: true })
    fs.mkdirSync(apiDir, { recursive: true })

    const webPkg = {
      name: "@repo/web",
      version: "1.0.0",
      dependencies: {
        lodash: "^4.17.15",
      },
    }
    fs.writeFileSync(path.join(webDir, "package.json"), JSON.stringify(webPkg, null, 2), "utf8")

    const apiPkg = {
      name: "@repo/api",
      version: "1.0.0",
      dependencies: {
        lodash: "^4.17.15",
      },
    }
    fs.writeFileSync(path.join(apiDir, "package.json"), JSON.stringify(apiPkg, null, 2), "utf8")

    const workspaces: Workspace[] = [
      {
        name: "@repo/web",
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
          lodash: { version: "^4.17.15", type: "prod" },
        },
      },
      {
        name: "@repo/api",
        version: "1.0.0",
        relPath: "apps/api",
        absPath: path.join(apiDir, "package.json"),
        isRoot: false,
        private: true,
        packageManager: null,
        enginesNode: null,
        depCount: 1,
        devCount: 0,
        deps: {
          lodash: { version: "^4.17.15", type: "prod" },
        },
      },
    ]

    const vulnerabilities: SecurityVulnerability[] = [
      {
        id: "GHSA-p6mc-m468-83gw",
        aliases: ["CVE-2020-8203"],
        pkg: "lodash",
        version: "^4.17.15",
        severity: "HIGH",
        summary: "Prototype Pollution in lodash",
        patchedVersion: "4.17.21",
        suggestedVersion: "^4.17.21",
        advisoryUrl: "https://github.com/advisories/GHSA-p6mc-m468-83gw",
        workspaces: [
          { workspace: "apps/web", type: "prod", currentVersion: "^4.17.15" },
          { workspace: "apps/api", type: "prod", currentVersion: "^4.17.15" },
        ],
      },
    ]

    const fixResult = await applySecurityFixes(tmpDir, vulnerabilities, workspaces)
    expect(fixResult.ok).toBe(true)
    expect(fixResult.modifiedFiles.length).toBe(2)

    const updatedWeb = JSON.parse(fs.readFileSync(path.join(webDir, "package.json"), "utf8"))
    expect(updatedWeb.dependencies.lodash).toBe("^4.17.21")

    const updatedApi = JSON.parse(fs.readFileSync(path.join(apiDir, "package.json"), "utf8"))
    expect(updatedApi.dependencies.lodash).toBe("^4.17.21")
  })
})
