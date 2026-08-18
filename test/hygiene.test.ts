import { describe, expect, it } from "vitest"
import path from "node:path"
import { findHygieneIssues } from "../src/scan/hygiene.js"
import { scan } from "../src/scan/index.js"

const FIXTURE = path.join(__dirname, "fixtures", "mono")

describe("hygiene", () => {
  it("flags unnamed workspaces", async () => {
    const result = await scan(FIXTURE)
    const issues = findHygieneIssues(result.workspaces)
    const unnamed = issues.filter((i) => i.kind === "unnamed")
    expect(unnamed).toHaveLength(1)
    expect(unnamed[0]!.message).toContain("unnamed")
  })

  it("flags duplicate workspace names", async () => {
    const result = await scan(FIXTURE)
    const issues = findHygieneIssues(result.workspaces)
    const dupes = issues.filter((i) => i.kind === "duplicate-name")
    expect(dupes).toHaveLength(1)
    expect(dupes[0]!.message).toContain("dupe-pkg")
    expect(dupes[0]!.message).toContain("2")
  })

  it("flags mismatched packageManager across workspaces", async () => {
    const result = await scan(FIXTURE)
    const issues = findHygieneIssues(result.workspaces)
    const pms = issues.filter((i) => i.kind === "packageManager")
    expect(pms).toHaveLength(1)
    expect(pms[0]!.message).toContain("pnpm@9.0.0")
    expect(pms[0]!.message).toContain("pnpm@8.0.0")
  })

  it("flags mismatched engines.node across workspaces", async () => {
    const result = await scan(FIXTURE)
    const issues = findHygieneIssues(result.workspaces)
    const engines = issues.filter((i) => i.kind === "engines")
    expect(engines).toHaveLength(1)
    expect(engines[0]!.message).toContain(">=18")
    expect(engines[0]!.message).toContain("^20")
  })

  it("returns no issues for a clean set of workspaces", () => {
    const issues = findHygieneIssues([
      {
        relPath: "a",
        name: "a",
        version: "1.0.0",
        private: false,
        isRoot: false,
        packageManager: "pnpm@9.0.0",
        enginesNode: ">=18",
        deps: {},
        depCount: 0,
        devCount: 0,
      },
      {
        relPath: "b",
        name: "b",
        version: "1.0.0",
        private: false,
        isRoot: false,
        packageManager: "pnpm@9.0.0",
        enginesNode: ">=18",
        deps: {},
        depCount: 0,
        devCount: 0,
      },
    ])
    expect(issues).toHaveLength(0)
  })
})
