import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

export interface CacheOptions {
  rootDir?: string
  offline?: boolean
  noCache?: boolean
  defaultTtlMs?: number
}

export interface CacheEntry<T = unknown> {
  key: string
  cachedAt: number
  ttlMs: number
  data: T
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export class ScanCache {
  private cacheDir: string
  private offline: boolean
  private noCache: boolean
  private defaultTtlMs: number
  private inMemory: Map<string, CacheEntry> = new Map()

  constructor(opts: CacheOptions = {}) {
    const root = opts.rootDir ? path.resolve(opts.rootDir) : process.cwd()
    this.cacheDir = path.join(root, ".pkg-audit", "cache")
    this.offline = Boolean(opts.offline)
    this.noCache = Boolean(opts.noCache)
    this.defaultTtlMs = opts.defaultTtlMs ?? DEFAULT_TTL_MS
  }

  public isOfflineMode(): boolean {
    return this.offline
  }

  public isNoCacheMode(): boolean {
    return this.noCache
  }

  private safeFilename(key: string): string {
    // If key has safe characters, preserve readability; otherwise hash
    const clean = key.replace(/[/\\?%*:|"<>]/g, "__")
    if (clean.length < 100 && !/[^\w.@-]/.test(clean)) {
      return `${clean}.json`
    }
    const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16)
    return `${clean.slice(0, 40)}_${hash}.json`
  }

  private getFilePath(namespace: string, key: string): string {
    return path.join(this.cacheDir, namespace, this.safeFilename(key))
  }

  public get<T>(namespace: string, key: string, maxAgeMs?: number): T | null {
    if (this.noCache && !this.offline) return null

    const memKey = `${namespace}::${key}`
    const mem = this.inMemory.get(memKey)
    const now = Date.now()
    const ttl = maxAgeMs ?? this.defaultTtlMs

    if (mem) {
      if (this.offline || now - mem.cachedAt < (mem.ttlMs || ttl)) {
        return mem.data as T
      }
    }

    const filePath = this.getFilePath(namespace, key)
    if (!fs.existsSync(filePath)) return null

    try {
      const raw = fs.readFileSync(filePath, "utf8")
      const entry = JSON.parse(raw) as CacheEntry<T>
      if (this.offline || now - entry.cachedAt < (entry.ttlMs || ttl)) {
        this.inMemory.set(memKey, entry as CacheEntry)
        return entry.data
      }
    } catch {
      // Ignore corrupt cache file
    }

    return null
  }

  public set<T>(namespace: string, key: string, data: T, ttlMs?: number): void {
    if (this.noCache) return

    const now = Date.now()
    const entry: CacheEntry<T> = {
      key,
      cachedAt: now,
      ttlMs: ttlMs ?? this.defaultTtlMs,
      data,
    }

    const memKey = `${namespace}::${key}`
    this.inMemory.set(memKey, entry as CacheEntry)

    try {
      const filePath = this.getFilePath(namespace, key)
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(filePath, JSON.stringify(entry), "utf8")
    } catch {
      // Non-fatal cache write error
    }
  }

  public clear(namespace?: string): void {
    this.inMemory.clear()
    try {
      const target = namespace ? path.join(this.cacheDir, namespace) : this.cacheDir
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true })
      }
    } catch {
      // Ignore cleanup error
    }
  }
}

let defaultCacheInstance: ScanCache | null = null

export function getScanCache(opts?: CacheOptions): ScanCache {
  if (!defaultCacheInstance || opts) {
    defaultCacheInstance = new ScanCache(opts)
  }
  return defaultCacheInstance
}

export function resetScanCache(): void {
  defaultCacheInstance = null
}
