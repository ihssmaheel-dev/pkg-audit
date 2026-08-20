import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { evaluateVulnerabilitySLAs, parseFailOnOption } from "../src/scan/sla.js"
import type { SecurityVulnerability } from "../src/types.js"

describe("Vulnerability SLA Engine", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-sla-test-"))
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  it("parses CLI fail-on options accurately", () => {
    expect(parseFailOnOption("major")).toEqual({ mode: "conflict", conflictSeverity: "major" })
    expect(parseFailOnOption("range")).toEqual({ mode: "conflict", conflictSeverity: "range" })
    expect(parseFailOnOption("copyleft")).toEqual({ mode: "copyleft" })
    expect(parseFailOnOption("critical:7d")).toEqual({
      mode: "sla",
      slaSeverity: "CRITICAL",
      slaMaxDays: 7,
    })
    expect(parseFailOnOption("high:14")).toEqual({
      mode: "sla",
      slaSeverity: "HIGH",
      slaMaxDays: 14,
    })
    expect(parseFailOnOption(null)).toEqual({ mode: "none" })
  })

  it("tracks vulnerability history and computes age in days", () => {
    const pastDate = new Date("2026-08-01T00:00:00Z")
    const mockVuln: SecurityVulnerability = {
      id: "GHSA-test-cve",
      pkg: "vuln-pkg",
      version: "1.0.0",
      severity: "CRITICAL",
      summary: "Remote code execution",
      advisoryUrl: "https://osv.dev",
      aliases: ["CVE-2026-1234"],
      patchedVersion: "1.0.1",
      suggestedVersion: "1.0.1",
      workspaces: [{ workspace: "apps/web", type: "prod", currentVersion: "1.0.0" }],
    }

    // First scan on Aug 1
    evaluateVulnerabilitySLAs(tmpDir, [mockVuln], { CRITICAL: 7 }, pastDate)

    // Second scan on Aug 20 (19 days later -> exceeds 7d SLA)
    const currentDate = new Date("2026-08-20T00:00:00Z")
    const result = evaluateVulnerabilitySLAs(tmpDir, [mockVuln], { CRITICAL: 7 }, currentDate)

    expect(result.slaStatuses).toHaveLength(1)
    const status = result.slaStatuses[0]!
    expect(status.ageInDays).toBe(19)
    expect(status.maxAgeDays).toBe(7)
    expect(status.isBreached).toBe(true)
    expect(result.breachedCount).toBe(1)
  })
})
