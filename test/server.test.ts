import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { AddressInfo } from "node:net"
import { startServer } from "../src/server/index.js"
import { getRecents } from "../src/config/index.js"

const FIXTURE = path.join(__dirname, "fixtures", "mono")

describe("server", () => {
  let server: Awaited<ReturnType<typeof startServer>>
  let configHome: string

  const api = (route: string): string =>
    `http://127.0.0.1:${server.port}${route}${route.includes("?") ? "&" : "?"}token=${server.token}`

  beforeEach(async () => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-audit-server-"))
    process.env.APPDATA = configHome
    process.env.XDG_CONFIG_HOME = configHome
    server = await startServer(null, { port: 0 })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.server.close(() => resolve()))
    delete process.env.APPDATA
    delete process.env.XDG_CONFIG_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
  })

  it("listens on 127.0.0.1 with an auth token", () => {
    expect(server.token).toMatch(/^[0-9a-f]{32}$/)
    const address = server.server.address() as AddressInfo
    expect(address.address).toBe("127.0.0.1")
    expect(server.port).toBe(address.port)
    expect(server.url).toContain(`token=${server.token}`)
  })

  it("serves /api/health without a token", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it("rejects API calls without a token", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/recents`)
    expect(res.status).toBe(401)
  })

  it("returns NO_DIR when no directory was given", async () => {
    const res = await fetch(api("/api/scan"))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe("NO_DIR")
  })

  it("scans a directory passed in the query", async () => {
    const res = await fetch(api(`/api/scan?dir=${encodeURIComponent(FIXTURE)}`))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { root: string; workspaces: unknown[] }
    expect(body.root).toBe(FIXTURE)
    expect(body.workspaces).toHaveLength(9)
  })

  it("records the scanned directory as a recent", async () => {
    await fetch(api(`/api/scan?dir=${encodeURIComponent(FIXTURE)}`))
    expect(getRecents()).toContain(FIXTURE)
  })

  it("rejects non-directory paths", async () => {
    const res = await fetch(api(`/api/scan?dir=${encodeURIComponent(__filename)}`))
    expect(res.status).toBe(400)
  })

  it("scans via POST with a dir body", async () => {
    const res = await fetch(api("/api/scan"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: FIXTURE }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { workspaces: unknown[] }
    expect(body.workspaces).toHaveLength(9)
  })

  it("lists recents and favorites", async () => {
    const res = await fetch(api("/api/recents"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { recents: unknown[]; favorites: unknown[] }
    expect(Array.isArray(body.recents)).toBe(true)
    expect(Array.isArray(body.favorites)).toBe(true)
  })

  it("exports a standalone HTML report", async () => {
    await fetch(api(`/api/scan?dir=${encodeURIComponent(FIXTURE)}`))
    const res = await fetch(api("/api/export.html"))
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("__PKG_AUDIT__")
    expect(html).toContain("mono-root")
  })

  it("rejects an export before any scan", async () => {
    const res = await fetch(api("/api/export.html"))
    expect(res.status).toBe(400)
  })
})
