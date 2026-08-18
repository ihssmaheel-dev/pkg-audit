import { describe, expect, it } from "vitest"
import path from "node:path"
import { generateStandaloneHtml } from "../src/html/index.js"
import { scan } from "../src/scan/index.js"

const FIXTURE = path.join(__dirname, "fixtures", "mono")

describe("generateStandaloneHtml", () => {
  it("embeds the scan result in __PKG_AUDIT__", async () => {
    const result = await scan(FIXTURE)
    const html = generateStandaloneHtml(result)

    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("window.__PKG_AUDIT__ = ")
    expect(html).toContain('"root":"')
    expect(html).toContain('<div id="app"></div>')
    expect(html).toContain("<title>pkg-audit")
  })

  it("produces valid JSON payload that parses back", async () => {
    const result = await scan(FIXTURE)
    const html = generateStandaloneHtml(result)
    const match = html.match(/window\.__PKG_AUDIT__ = (\{.*?\});<\/script>/s)
    expect(match).not.toBeNull()
    const parsed = JSON.parse(match![1]!) as { root: string }
    expect(parsed.root).toBe(FIXTURE)
  })
})
