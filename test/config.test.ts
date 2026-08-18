import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  addRecent,
  getConfigDir,
  getFavorites,
  getRecents,
  loadConfig,
  toggleFavorite,
} from "../src/config/index.js"

let configHome: string

function tempProjectDir(): string {
  return fs.mkdtempSync(path.join(__dirname, ".tmp", "proj-"))
}

beforeEach(() => {
  configHome = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-config-"))
  process.env.APPDATA = configHome
  process.env.XDG_CONFIG_HOME = configHome
  fs.mkdirSync(path.join(__dirname, ".tmp"), { recursive: true })
})

afterEach(() => {
  delete process.env.APPDATA
  delete process.env.XDG_CONFIG_HOME
  fs.rmSync(configHome, { recursive: true, force: true })
  fs.rmSync(path.join(__dirname, ".tmp"), { recursive: true, force: true })
})

describe("config dir", () => {
  it("resolves to the platform config dir plus pkg-audit", () => {
    expect(getConfigDir()).toBe(path.join(configHome, "pkg-audit"))
  })
})

describe("state", () => {
  it("starts empty", () => {
    expect(getRecents()).toEqual([])
    expect(getFavorites()).toEqual([])
  })

  it("adds recents most-recent-first without duplicates", () => {
    addRecent("C:/repo")
    addRecent("C:/other")
    addRecent("C:/repo")
    const recents = getRecents()
    expect(recents[0]).toBe(path.resolve("C:/repo"))
    expect(recents).toHaveLength(2)
  })

  it("caps recents at 15", () => {
    for (let i = 0; i < 20; i++) {
      addRecent(`C:/repo-${i}`)
    }
    expect(getRecents()).toHaveLength(15)
  })

  it("toggles favorites", () => {
    toggleFavorite("C:/repo")
    expect(getFavorites()).toHaveLength(1)
    toggleFavorite("C:/repo")
    expect(getFavorites()).toHaveLength(0)
  })
})

describe("loadConfig", () => {
  it("returns {} when nothing is configured", async () => {
    const dir = tempProjectDir()
    expect(await loadConfig(dir)).toEqual({})
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("reads the pkg-audit key from package.json", async () => {
    const dir = tempProjectDir()
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "x", "pkg-audit": { top: 5, failOn: "major" } }),
      "utf8"
    )
    expect(await loadConfig(dir)).toEqual({ top: 5, failOn: "major" })
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("loads an MJS config file", async () => {
    const dir = tempProjectDir()
    fs.writeFileSync(path.join(dir, "pkg-audit.config.mjs"), "export default { top: 3 };", "utf8")
    expect(await loadConfig(dir)).toEqual({ top: 3 })
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("loads a CJS config file", async () => {
    const dir = tempProjectDir()
    fs.writeFileSync(path.join(dir, "pkg-audit.config.cjs"), "module.exports = { top: 4 };", "utf8")
    expect(await loadConfig(dir)).toEqual({ top: 4 })
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
