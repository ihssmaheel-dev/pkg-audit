import { describe, expect, it } from "vitest"
import path from "node:path"
import { scan } from "../src/scan/index.js"

const FIXTURE = path.join(__dirname, "fixtures", "mono")

describe("scan", () => {
  it("finds package.json files and builds the workspace list", async () => {
    const result = await scan(FIXTURE)

    expect(result.root).toBe(FIXTURE)
    expect(result.workspaces).toHaveLength(9)
    expect(result.workspaces[0]!.isRoot).toBe(true)
    expect(result.workspaces[0]!.name).toBe("mono-root")
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.path).toContain("bad-json")
    expect(result.errors[0]!.error).toContain("invalid JSON")
    expect(result.meta.skippedGitignored).toBe(1)
    expect(result.meta.totalUniquePackages).toBeGreaterThan(0)
    expect(result.meta.ignoredDirs).toContain("node_modules")
  })

  it("does not descend into node_modules", async () => {
    const result = await scan(FIXTURE)
    expect(result.workspaces.some((w) => w.name === "fake-pkg")).toBe(false)
  })

  it("skips gitignored directories by default", async () => {
    const result = await scan(FIXTURE)
    expect(result.workspaces.some((w) => w.name === "@mono/ignored")).toBe(false)
  })

  it("honors respectGitignore=false", async () => {
    const result = await scan(FIXTURE, { respectGitignore: false })
    expect(result.workspaces.some((w) => w.name === "@mono/ignored")).toBe(true)
    expect(result.meta.skippedGitignored).toBe(0)
  })

  it("keeps dependency records with types and counts", async () => {
    const result = await scan(FIXTURE)
    const web = result.workspaces.find((w) => w.name === "@mono/web")!
    expect(web.deps.react).toEqual({ version: "19.0.0", type: "prod" })
    expect(web.deps.vitest).toEqual({ version: "^2.0.0", type: "dev" })
    expect(web.depCount).toBe(4)
    expect(web.devCount).toBe(1)
  })

  it("caps outdated to null when not requested", async () => {
    const result = await scan(FIXTURE)
    expect(result.outdated).toBeNull()
  })

  it("reports parse errors for broken package.json files", async () => {
    const result = await scan(FIXTURE)
    expect(result.errors).toHaveLength(1)
  })

  it("reports read errors for missing directories", async () => {
    const result = await scan(path.join(FIXTURE, "does-not-exist"))
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.workspaces).toHaveLength(0)
  })
})
