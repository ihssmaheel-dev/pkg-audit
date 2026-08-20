import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { ScanCache } from "../src/scan/cache.js"

describe("ScanCache", () => {
  let tmpDir: string
  let cache: ScanCache

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-cache-test-"))
    cache = new ScanCache({ rootDir: tmpDir, defaultTtlMs: 1000 })
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
  })

  it("stores and retrieves cached data by namespace and key", () => {
    cache.set("registry", "react", { version: "19.0.0" })
    const fetched = cache.get<{ version: string }>("registry", "react")
    expect(fetched).toEqual({ version: "19.0.0" })
  })

  it("persists cache across instances on disk", () => {
    cache.set("deprecation", "request", { deprecated: "use fetch" })

    // New cache instance pointing to same directory
    const secondCache = new ScanCache({ rootDir: tmpDir })
    const fetched = secondCache.get<{ deprecated: string }>("deprecation", "request")
    expect(fetched).toEqual({ deprecated: "use fetch" })
  })

  it("serves stale cache when offline mode is active", () => {
    // Set cache entry with 10ms TTL
    cache.set("downloads", "lodash", 15_000_000, 10)

    // Sleep for 30ms so it expires
    const offlineCache = new ScanCache({ rootDir: tmpDir, offline: true })
    const fetched = offlineCache.get<number>("downloads", "lodash")
    expect(fetched).toBe(15_000_000)
  })

  it("returns null when noCache is set (unless offline)", () => {
    cache.set("osv", "GHSA-1234", { id: "GHSA-1234", summary: "test vuln" })

    const noCacheInstance = new ScanCache({ rootDir: tmpDir, noCache: true })
    expect(noCacheInstance.get("osv", "GHSA-1234")).toBeNull()
  })
})
