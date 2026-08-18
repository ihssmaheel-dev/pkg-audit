import { afterEach, describe, expect, it, vi } from "vitest"
import { checkOutdated, encodeNpmName, fetchLatestVersion } from "../src/scan/registry.js"
import type { DepMap } from "../src/types.js"

function stubFetch(handler: (url: string) => { status: number; body?: object }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const result = handler(url)
      return {
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        json: async () => result.body ?? {},
      }
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("encodeNpmName", () => {
  it("encodes scoped names", () => {
    expect(encodeNpmName("@scope/pkg")).toBe("@scope%2Fpkg")
    expect(encodeNpmName("lodash")).toBe("lodash")
  })
})

describe("fetchLatestVersion", () => {
  it("returns the latest version on success", async () => {
    stubFetch(() => ({ status: 200, body: { version: "1.2.3" } }))
    const result = await fetchLatestVersion("lodash")
    expect(result).toEqual({ name: "lodash", status: "ok", latest: "1.2.3" })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://registry.npmjs.org/lodash/latest",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it("marks 404s as not-published", async () => {
    stubFetch(() => ({ status: 404 }))
    const result = await fetchLatestVersion("@private/pkg")
    expect(result).toEqual({ name: "@private/pkg", status: "not-published" })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://registry.npmjs.org/@private%2Fpkg/latest",
      expect.anything()
    )
  })

  it("marks other HTTP errors as error", async () => {
    stubFetch(() => ({ status: 500 }))
    const result = await fetchLatestVersion("lodash")
    expect(result.status).toBe("error")
  })

  it("marks network failures as network-error", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed")
    })
    const result = await fetchLatestVersion("lodash")
    expect(result.status).toBe("network-error")
    expect(result.error).toContain("fetch failed")
  })
})

function depMap(entries: [string, string[]][]): DepMap {
  const map: DepMap = new Map()
  for (const [name, versions] of entries) {
    const versionMap = new Map<string, { workspace: string; type: "prod" | "dev" | "peer" | "optional" }[]>()
    for (const v of versions) versionMap.set(v, [{ workspace: "a", type: "prod" }])
    map.set(name, versionMap)
  }
  return map
}

describe("checkOutdated", () => {
  it("classifies major, minor and patch updates", async () => {
    stubFetch((url) => {
      const latest: Record<string, string> = {
        foo: "2.0.0",
        bar: "1.1.0",
        baz: "1.0.1",
        same: "1.0.0",
      }
      const name = url.split("/")[3]!.replace("%2F", "/")
      return { status: 200, body: { version: latest[name] } }
    })

    const result = await checkOutdated(
      depMap([
        ["foo", ["1.0.0"]],
        ["bar", ["1.0.0"]],
        ["baz", ["1.0.0"]],
        ["same", ["1.0.0"]],
      ])
    )

    expect(result.outdated.map((r) => [r.name, r.status])).toEqual([
      ["foo", "major"],
      ["bar", "minor"],
      ["baz", "patch"],
    ])
    expect(result.upToDate.map((r) => r.name)).toEqual(["same"])
  })

  it("skips linked protocol versions", async () => {
    stubFetch(() => ({ status: 200, body: { version: "1.0.0" } }))
    const result = await checkOutdated(
      depMap([
        ["linked", ["workspace:*"]],
        ["real", ["1.0.0"]],
      ])
    )
    expect(result.all.map((r) => r.name)).toEqual(["real"])
  })

  it("reports unpublished packages", async () => {
    stubFetch(() => ({ status: 404 }))
    const result = await checkOutdated(depMap([["ghost", ["1.0.0"]]]))
    expect(result.unpublished).toEqual(["ghost"])
  })

  it("reports network errors with a message", async () => {
    stubFetch(() => {
      throw new Error("offline")
    })
    const result = await checkOutdated(depMap([["foo", ["1.0.0"]]]))
    expect(result.networkErrors).toEqual([{ name: "foo", error: "offline" }])
    expect(result.all[0]!.status).toBe("error")
  })

  it("emits progress events with totals", async () => {
    stubFetch(() => ({ status: 200, body: { version: "2.0.0" } }))
    const events: { done: number; total: number }[] = []
    await checkOutdated(
      depMap([
        ["a", ["1.0.0"]],
        ["b", ["1.0.0"]],
      ]),
      2,
      (e) => {
        events.push(e)
      }
    )
    expect(events[0]).toEqual({ phase: "outdated", done: 0, total: 2 })
    expect(events[events.length - 1]).toEqual({ phase: "outdated", done: 2, total: 2 })
  })
})
