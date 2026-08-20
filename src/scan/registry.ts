import { compareTuples, isLinkedProtocol, parseVersionTuple } from "./conflicts.js"
import type {
  DepMap,
  OutdatedRecord,
  OutdatedResult,
  OutdatedStatus,
  ProgressEvent,
  RegistryResult,
} from "../types.js"

import { getScanCache } from "./cache.js"

export function encodeNpmName(name: string): string {
  return name.startsWith("@") ? name.replace("/", "%2F") : name
}

export async function fetchLatestVersion(name: string, timeoutMs = 8000): Promise<RegistryResult> {
  const cache = getScanCache()
  const cached = cache.get<RegistryResult>("registry", name)
  if (cached) {
    return { ...cached, fromCache: true }
  }

  if (cache.isOfflineMode()) {
    return {
      name,
      status: "network-error",
      error: "Offline mode: package not in cache",
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeNpmName(name)}/latest`, {
      signal: controller.signal,
    })
    if (!res.ok) {
      const result: RegistryResult = { name, status: res.status === 404 ? "not-published" : "error" }
      cache.set("registry", name, result)
      return result
    }
    const data = (await res.json()) as { version?: string }
    const result: RegistryResult = { name, status: "ok", latest: data.version }
    cache.set("registry", name, result)
    return result
  } catch (err) {
    return {
      name,
      status: "network-error",
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function runPool<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function next(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await worker(items[i])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()))
  return results
}

const SEVERITY_ORDER: Record<OutdatedStatus, number> = {
  major: 0,
  minor: 1,
  patch: 2,
  unknown: 3,
  "not-published": 4,
  error: 5,
  "up-to-date": 6,
}

export async function checkOutdated(
  depMap: DepMap,
  concurrency = 8,
  onProgress?: (event: ProgressEvent) => void
): Promise<OutdatedResult> {
  const names = [...depMap.keys()].filter((name) => {
    const versions = [...depMap.get(name)!.keys()].filter((v) => !isLinkedProtocol(v))
    return versions.length > 0
  })

  if (onProgress) onProgress({ phase: "outdated", done: 0, total: names.length })

  let done = 0
  const registryResults = await runPool(
    names,
    async (name) => {
      const result = await fetchLatestVersion(name)
      done++
      if (onProgress) onProgress({ phase: "outdated", done, total: names.length })
      return result
    },
    concurrency
  )

  const byName = new Map(registryResults.map((r) => [r.name, r]))
  const all: OutdatedRecord[] = []

  for (const name of names) {
    const result = byName.get(name)
    if (!result) continue

    if (result.status === "not-published") {
      all.push({ name, current: null, latest: null, status: "not-published" })
      continue
    }
    if (result.status !== "ok") {
      all.push({
        name,
        current: null,
        latest: null,
        status: "error",
        error: result.error || "check failed",
      })
      continue
    }

    const versions = [...depMap.get(name)!.keys()].filter((v) => !isLinkedProtocol(v))

    let current: { raw: string; tuple: [number, number, number] } | null = null
    for (const v of versions) {
      const t = parseVersionTuple(v)
      if (t && (!current || compareTuples(t, current.tuple) > 0)) {
        current = { raw: v, tuple: t }
      }
    }
    const latestTuple = result.latest ? parseVersionTuple(result.latest) : null

    if (!current || !latestTuple) {
      all.push({
        name,
        current: current ? current.raw : null,
        latest: result.latest ?? null,
        status: "unknown",
      })
      continue
    }

    const cmp = compareTuples(latestTuple, current.tuple)
    if (cmp <= 0) {
      all.push({ name, current: current.raw, latest: result.latest!, status: "up-to-date" })
      continue
    }

    const status: OutdatedStatus =
      latestTuple[0] > current.tuple[0] ? "major" : latestTuple[1] > current.tuple[1] ? "minor" : "patch"
    all.push({ name, current: current.raw, latest: result.latest!, status })
  }

  const sortedAll = [...all].sort(
    (a, b) => SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status] || a.name.localeCompare(b.name)
  )

  return {
    all: sortedAll,
    outdated: sortedAll.filter((r) => r.status === "major" || r.status === "minor" || r.status === "patch"),
    unpublished: sortedAll.filter((r) => r.status === "not-published").map((r) => r.name),
    networkErrors: sortedAll
      .filter((r) => r.status === "error")
      .map((r) => ({ name: r.name, error: r.error ?? "unknown error" })),
    upToDate: sortedAll.filter((r) => r.status === "up-to-date"),
  }
}
