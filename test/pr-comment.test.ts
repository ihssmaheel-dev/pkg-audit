import { describe, expect, it } from "vitest"
import path from "node:path"
import { scan } from "../src/scan/index.js"
import { generatePrComment, PR_COMMENT_TAG } from "../src/cli/pr-comment.js"
import type { ScanResult } from "../src/types.js"

const FIXTURE = path.join(__dirname, "fixtures", "mono")

describe("generatePrComment", () => {
  it("generates markdown containing sticky PR tag and metric summary", async () => {
    const result = await scan(FIXTURE)
    const comment = generatePrComment(result)

    expect(comment).toContain(PR_COMMENT_TAG)
    expect(comment).toContain("## ⚡ `pkg-audit` Monorepo Dependency Report")
    expect(comment).toContain("Alignment Score:")
    expect(comment).toContain("Version Conflicts")
    expect(comment).toContain("Workspaces")
  })

  it("renders conflict details collapsible table", async () => {
    const result = await scan(FIXTURE)
    const comment = generatePrComment(result)

    expect(comment).toContain("<details")
    expect(comment).toContain("Active Version Conflicts")
    expect(comment).toContain("| Package | Severity | Workspace Versions |")
    expect(comment).toContain("react")
  })

  it("calculates alignment delta against a base scan result", async () => {
    const result = await scan(FIXTURE)
    const mockBase: ScanResult = {
      ...result,
      conflicts: [], // 100% aligned base
    }

    const comment = generatePrComment(result, { baseResult: mockBase })
    expect(comment).toMatch(/vs base branch/)
  })

  it("handles a clean 100% aligned monorepo gracefully", () => {
    const cleanResult: ScanResult = {
      version: 1,
      root: "/mock/repo",
      workspaces: [
        {
          name: "@mono/app",
          version: "1.0.0",
          relPath: "apps/app",
          absPath: "/mock/repo/apps/app",
          isRoot: false,
          private: true,
          packageManager: "pnpm@9.0.0",
          enginesNode: ">=18",
          depCount: 1,
          devCount: 0,
          deps: { zod: { version: "^3.22.0", type: "prod" } },
        },
      ],
      conflicts: [],
      hygieneIssues: [],
      outdated: null,
      meta: {
        totalDepDeclarations: 1,
        totalUniquePackages: 1,
        toolVersion: "0.1.0",
        skippedGitignored: 0,
        ignoredDirs: [],
      },
      errors: [],
      scannedMs: 12,
    }

    const comment = generatePrComment(cleanResult)
    expect(comment).toContain("🟢 **Clean / Aligned**")
    expect(comment).toContain("`100%`")
    expect(comment).not.toContain("Active Version Conflicts")
  })
})
