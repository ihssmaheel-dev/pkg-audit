import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { applySecurityFixes, checkVulnerabilities } from "../src/scan/security.js"
import type { SecurityVulnerability, Workspace } from "../src/types.js"

describe("Google OSV Security Vulnerability Scanner", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-security-"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  it("queries Google OSV and correctly parses CVEs, severity, and safe patch versions", async () => {
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

    const mockOsvResponse = {
      results: [
        {
          vulns: [
            {
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
            },
          ],
        },
        {
          vulns: [
            {
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
            },
          ],
        },
      ],
    }

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockOsvResponse,
    } as unknown as Response)

    const result = await checkVulnerabilities(mockWorkspaces)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.vulnerabilities.length).toBe(2)
    expect(result.criticalCount).toBe(1)
    expect(result.highCount).toBe(1)
    expect(result.totalVulnerablePackages).toBe(2)

    // Critical (axios) should be sorted first
    const first = result.vulnerabilities[0]!
    expect(first.pkg).toBe("axios")
    expect(first.severity).toBe("CRITICAL")
    expect(first.patchedVersion).toBe("0.21.2")
    expect(first.suggestedVersion).toBe("^0.21.2")
    expect(first.advisoryUrl).toContain("GHSA-cph5-m8f7-6c5x")

    // High (lodash) should be second
    const second = result.vulnerabilities[1]!
    expect(second.pkg).toBe("lodash")
    expect(second.severity).toBe("HIGH")
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
