import { describe, expect, it } from "vitest"
import { parseArgs } from "../src/cli/args.js"

describe("parseArgs", () => {
  it("parses a positional target", () => {
    const opts = parseArgs(["./my-repo"])
    expect(opts.target).toBe("./my-repo")
  })

  it("keeps the first positional target", () => {
    const opts = parseArgs(["a", "b"])
    expect(opts.target).toBe("a")
  })

  it("parses boolean flags", () => {
    const opts = parseArgs([
      "--json",
      "--html",
      "--ui",
      "--outdated",
      "--changelog",
      "--full",
      "--only-conflicts",
      "--watch",
    ])
    expect(opts.json).toBe(true)
    expect(opts.html).toBe(true)
    expect(opts.ui).toBe(true)
    expect(opts.outdated).toBe(true)
    expect(opts.changelog).toBe(true)
    expect(opts.full).toBe(true)
    expect(opts.onlyConflicts).toBe(true)
    expect(opts.watch).toBe(true)
  })

  it("parses subcommand aliases", () => {
    expect(parseArgs(["ui"]).ui).toBe(true)
    expect(parseArgs(["html"]).html).toBe(true)
    expect(parseArgs(["json"]).json).toBe(true)
  })

  it("parses key=value flags", () => {
    const opts = parseArgs([
      "--top=25",
      "--workspace=apps/web",
      "--concurrency=16",
      "--changelog-lines=3",
      "--port=4321",
      "--ignore-dir=vendor,.cache",
    ])
    expect(opts.top).toBe(25)
    expect(opts.workspace).toBe("apps/web")
    expect(opts.concurrency).toBe(16)
    expect(opts.changelogLines).toBe(3)
    expect(opts.port).toBe(4321)
    expect(opts.ignoreDirs.has("vendor")).toBe(true)
    expect(opts.ignoreDirs.has(".cache")).toBe(true)
  })

  it("falls back to defaults for invalid numbers", () => {
    const opts = parseArgs(["--top=abc", "--concurrency=0", "--changelog-lines=-1"])
    expect(opts.top).toBe(10)
    expect(opts.concurrency).toBe(8)
    expect(opts.changelogLines).toBe(6)
  })

  it("parses file outputs", () => {
    const opts = parseArgs(["--json=report.json", "--html=out.html"])
    expect(opts.jsonFile).toBe("report.json")
    expect(opts.htmlFile).toBe("out.html")
  })

  it("parses --fail-on", () => {
    expect(parseArgs(["--fail-on=major"]).failOn).toBe("major")
    expect(parseArgs(["--fail-on=range"]).failOn).toBe("range")
    expect(parseArgs(["--fail-on=wat"]).failOn).toBeNull()
  })

  it("parses help and version", () => {
    expect(parseArgs(["-h"]).help).toBe(true)
    expect(parseArgs(["--version"]).version).toBe(true)
    expect(parseArgs(["-v"]).version).toBe(true)
  })

  it("parses --no-gitignore and --no-color", () => {
    const opts = parseArgs(["--no-gitignore", "--no-color"])
    expect(opts.respectGitignore).toBe(false)
    expect(opts.color).toBe(false)
  })

  it("defaults are sane", () => {
    const opts = parseArgs([])
    expect(opts.target).toBeNull()
    expect(opts.top).toBe(10)
    expect(opts.respectGitignore).toBe(true)
    expect(opts.port).toBe(0)
  })
})
