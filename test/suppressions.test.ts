import { describe, expect, it } from "vitest"
import { isSuppressed, loadSuppressions, parseExpiryDate, ruleMatches } from "../src/scan/suppressions.js"
import type { LoadedSuppressions } from "../src/scan/suppressions.js"
import type { SuppressionRule } from "../src/types.js"

describe("suppressions engine", () => {
  it("parses expiration date strings correctly", () => {
    const ts = parseExpiryDate("2026-12-31")
    expect(ts).toBeGreaterThan(0)
    const date = new Date(ts)
    expect(date.getUTCFullYear()).toBe(2026)
    expect(date.getUTCMonth()).toBe(11) // 0-indexed December
    expect(date.getUTCDate()).toBe(31)
  })

  it("distinguishes active vs expired rules based on date", () => {
    const fixedNow = new Date("2026-08-20T12:00:00Z")
    const rules: SuppressionRule[] = [
      {
        id: "GHSA-1234",
        pkg: "lodash",
        type: "security",
        reason: "False positive in internal build script",
        expires: "2026-12-31", // Future -> Active
      },
      {
        id: "GHSA-9999",
        pkg: "axios",
        type: "security",
        reason: "Old workaround that has expired",
        expires: "2025-01-01", // Past -> Expired
      },
    ]

    const loaded: LoadedSuppressions = loadSuppressions("/fake/root", rules, fixedNow)
    expect(loaded.active).toHaveLength(1)
    expect(loaded.expired).toHaveLength(1)
    expect(loaded.active[0]?.rule.id).toBe("GHSA-1234")
    expect(loaded.expired[0]?.rule.id).toBe("GHSA-9999")
    expect(loaded.expired[0]?.expiredDaysAgo).toBeGreaterThan(0)
  })

  it("matches suppression rules by id, package, workspace, and glob", () => {
    const rule: SuppressionRule = {
      id: "CVE-2024-*",
      pkg: "@babel/*",
      workspace: "apps/*",
      type: "security",
      reason: "Babel dev tool CVE",
      expires: "2027-01-01",
    }

    expect(
      ruleMatches(rule, {
        id: "CVE-2024-5555",
        pkg: "@babel/core",
        workspace: "apps/web",
        type: "security",
      })
    ).toBe(true)

    // Different type
    expect(
      ruleMatches(rule, {
        id: "CVE-2024-5555",
        pkg: "@babel/core",
        workspace: "apps/web",
        type: "license",
      })
    ).toBe(false)

    // Non-matching workspace
    expect(
      ruleMatches(rule, {
        id: "CVE-2024-5555",
        pkg: "@babel/core",
        workspace: "packages/ui",
        type: "security",
      })
    ).toBe(false)
  })

  it("evaluates isSuppressed against active vs expired suppressions", () => {
    const fixedNow = new Date("2026-08-20T12:00:00Z")
    const rules: SuppressionRule[] = [
      {
        pkg: "request",
        type: "deprecation",
        reason: "Legacy service migration scheduled for Q4",
        expires: "2026-11-30",
      },
      {
        pkg: "nomnom",
        type: "deprecation",
        reason: "Should have been migrated already",
        expires: "2026-01-01",
      },
    ]

    const loaded = loadSuppressions("/fake/root", rules, fixedNow)

    const activeCheck = isSuppressed(loaded, { type: "deprecation", pkg: "request" })
    expect(activeCheck.suppressed).toBe(true)
    expect(activeCheck.activeRule).toBeDefined()

    const expiredCheck = isSuppressed(loaded, { type: "deprecation", pkg: "nomnom" })
    expect(expiredCheck.suppressed).toBe(false)
    expect(expiredCheck.expiredRule).toBeDefined()
  })
})
