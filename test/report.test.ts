import { describe, expect, it } from "vitest"
import path from "node:path"
import { renderTerminalReport } from "../src/cli/report.js"
import { parseArgs } from "../src/cli/args.js"
import { scan } from "../src/scan/index.js"

const FIXTURE = path.join(__dirname, "fixtures", "mono")

describe("renderTerminalReport", () => {
  it("prints a header, workspace count and conflict summary", async () => {
    const result = await scan(FIXTURE)
    const output = renderTerminalReport(result, parseArgs([]))

    expect(output).toContain("pkg-audit")
    expect(output).toContain("react")
    expect(output).toContain("zod")
    expect(output).toContain("1 file(s) could not be read/parsed")
  })

  it("includes workspace details with --full", async () => {
    const result = await scan(FIXTURE)
    const output = renderTerminalReport(result, parseArgs(["--full"]))

    expect(output).toContain("@mono/web")
    expect(output).toContain("react")
    expect(output).toContain("(prod)")
  })

  it("shows only conflicts with --only-conflicts", async () => {
    const result = await scan(FIXTURE)
    const output = renderTerminalReport(result, parseArgs(["--only-conflicts"]))

    expect(output).toContain("Version conflicts")
    expect(output).not.toContain("Workspaces (")
  })

  it("renders a single workspace with --workspace", async () => {
    const result = await scan(FIXTURE)
    const output = renderTerminalReport(result, parseArgs(["--workspace=@mono/web"]))

    expect(output).toContain("@mono/web @ 1.0.0")
    expect(output).toContain("react")
  })

  it("does not crash on a result without outdated data", async () => {
    const result = await scan(FIXTURE)
    expect(() => renderTerminalReport(result, parseArgs([]))).not.toThrow()
  })
})
