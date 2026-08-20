import { encodeNpmName } from "./registry.js"
import type { Changelog, OutdatedRecord } from "../types.js"

interface GithubRelease {
  name?: string
  tag_name?: string
  html_url?: string
  published_at?: string
  body?: string
}

interface GithubRepo {
  owner: string
  repo: string
}

interface FetchResult {
  ok: boolean
  status?: number
  data?: unknown
  error?: string
}

function extractGithubRepo(repoField: unknown): GithubRepo | null {
  if (!repoField) return null
  const url = typeof repoField === "string" ? repoField : (repoField as { url?: string }).url
  if (!url) return null

  const cleaned = url
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "")
    .replace(/^git@github\.com:/, "https://github.com/")

  const m = cleaned.match(/github\.com[/:]([^/]+)\/([^/#]+)/)
  if (!m) return null
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") }
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<FetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "pkg-audit",
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token && url.includes("api.github.com")) {
    headers["Authorization"] = `Bearer ${token}`
  }
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers,
    })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, data: (await res.json()) as unknown }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

function candidateTags(name: string, version: string): string[] {
  return [`v${version}`, version, `${name}@${version}`, `${name}-v${version}`]
}

async function fetchNpmFullMetadata(
  name: string,
  timeoutMs = 8000
): Promise<{ ok: boolean; repository?: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeNpmName(name)}`, {
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false }
    const data = (await res.json()) as {
      "dist-tags"?: { latest?: string }
      versions?: Record<string, { repository?: unknown }>
      repository?: unknown
    }
    const latest = data["dist-tags"]?.latest
    const repository = (latest && data.versions?.[latest]?.repository) || data.repository
    return { ok: true, repository }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

function makeSemaphore(max: number) {
  let active = 0
  const queue: Array<() => void> = []
  return {
    async acquire(): Promise<void> {
      if (active < max) {
        active++
        return
      }
      await new Promise<void>((resolve) => queue.push(resolve))
      active++
    },
    release(): void {
      active--
      const next = queue.shift()
      if (next) next()
    },
  }
}

function cleanReleaseBody(body: string | undefined, maxLines: number): string[] {
  if (!body) return []
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trimEnd())
    .filter((l) => l.trim().length > 0 && !/^https?:\/\/\S+$/.test(l.trim()))
    .slice(0, maxLines)
}

function changelogFromRelease(
  status: "ok" | "approx",
  repo: GithubRepo,
  release: GithubRelease,
  tag: string | null,
  maxLines: number
): Changelog {
  return {
    status,
    repo: `${repo.owner}/${repo.repo}`,
    tag: tag ?? release.tag_name,
    title: release.name || release.tag_name || tag || "",
    url: release.html_url,
    publishedAt: release.published_at,
    bodyLines: cleanReleaseBody(release.body, maxLines),
  }
}

export async function fetchReleaseNotesForPackage(
  name: string,
  latestVersion: string,
  concurrencyGuard: { acquire(): Promise<void>; release(): void },
  maxLines: number
): Promise<Changelog> {
  await concurrencyGuard.acquire()
  try {
    const pkgMeta = await fetchNpmFullMetadata(name)
    if (!pkgMeta.ok) {
      return { status: "no-repo", reason: "could not load npm metadata" }
    }
    const repo = extractGithubRepo(pkgMeta.repository)
    if (!repo) {
      return { status: "no-repo", reason: "no GitHub repository listed on npm" }
    }

    for (const tag of candidateTags(name, latestVersion)) {
      const res = await fetchJson(
        `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/tags/${encodeURIComponent(tag)}`
      )
      if (res.ok) {
        return changelogFromRelease("ok", repo, res.data as GithubRelease, tag, maxLines)
      }
      if (res.status === 403) {
        return { status: "rate-limited", repo: `${repo.owner}/${repo.repo}` }
      }
    }

    const listRes = await fetchJson(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=1`
    )
    if (listRes.ok && Array.isArray(listRes.data) && listRes.data.length > 0) {
      return changelogFromRelease("approx", repo, (listRes.data as GithubRelease[])[0], null, maxLines)
    }
    if (listRes.status === 403) {
      return { status: "rate-limited", repo: `${repo.owner}/${repo.repo}` }
    }

    return { status: "no-release", repo: `${repo.owner}/${repo.repo}` }
  } finally {
    concurrencyGuard.release()
  }
}

export async function fetchChangelogs(
  outdatedList: OutdatedRecord[],
  changelogLines = 6
): Promise<OutdatedRecord[]> {
  const guard = makeSemaphore(4)
  const results = await Promise.all(
    outdatedList.map((pkg) => fetchReleaseNotesForPackage(pkg.name, pkg.latest ?? "", guard, changelogLines))
  )
  const byName = new Map(outdatedList.map((pkg, i) => [pkg.name, results[i]]))
  for (const pkg of outdatedList) {
    const changelog = byName.get(pkg.name)
    if (changelog) pkg.changelog = changelog
  }
  return outdatedList
}
