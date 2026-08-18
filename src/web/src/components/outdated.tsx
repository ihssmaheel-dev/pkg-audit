import { useState } from "preact/hooks"
import type { Changelog, OutdatedRecord, ScanResult } from "../../../types"
import {
  IconCheckCircle,
  IconChevronRight,
  IconExternalLink,
  IconInfo,
  IconPackage,
  IconRefreshCw,
} from "./icons"

const NO_CHANGELOG_MESSAGES: Record<string, string> = {
  "rate-limited": "GitHub API rate limit hit — try again later.",
  "no-release": "No GitHub releases found for this repository.",
  "no-repo": "No changelog available — no GitHub repository listed on npm.",
}

type Filter = "all" | "major" | "minor" | "patch"

function statusStyle(status: OutdatedRecord["status"]): string {
  switch (status) {
    case "major":
      return "bg-rose-500/10 text-rose-400"
    case "minor":
      return "bg-amber-500/10 text-amber-400"
    case "patch":
      return "bg-indigo-500/10 text-indigo-400"
    case "up-to-date":
      return "bg-emerald-500/10 text-emerald-400"
    default:
      return "bg-zinc-700/50 text-zinc-500"
  }
}

function dotColor(status: OutdatedRecord["status"]): string {
  switch (status) {
    case "major":
      return "bg-rose-500"
    case "minor":
      return "bg-amber-400"
    case "up-to-date":
      return "bg-emerald-500"
    default:
      return "bg-zinc-600"
  }
}

interface OutdatedProps {
  data: ScanResult
  onOutdated: () => void
}

export function Outdated({ data, onOutdated }: OutdatedProps) {
  const [filter, setFilter] = useState<Filter>("all")
  const [showUpToDate, setShowUpToDate] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const outdated = data.outdated
  if (!outdated) {
    return (
      <div class="flex flex-col items-center justify-center gap-3 py-20 text-zinc-500 text-center">
        <IconPackage size={40} className="text-zinc-700" />
        <h3 class="text-sm font-semibold text-zinc-400">Outdated check not run</h3>
        <p class="text-xs">Check dependency versions against the npm registry.</p>
        <button
          class="flex items-center gap-1.5 h-8 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold mt-1 transition-colors"
          onClick={onOutdated}
        >
          <IconRefreshCw size={12} />
          Check outdated
        </button>
      </div>
    )
  }

  const items = outdated.all.filter((item) => {
    if (!showUpToDate && (item.status === "up-to-date" || item.status === "not-published")) return false
    if (filter === "all") return true
    return item.status === filter
  })

  if (!items.length) {
    return (
      <div class="flex flex-col items-center justify-center gap-3 py-20 text-zinc-500 text-center">
        <IconCheckCircle size={40} className="text-emerald-500/40" />
        <h3 class="text-sm font-semibold text-zinc-400">Everything is up to date</h3>
        <p class="text-xs">All dependencies are at their latest versions.</p>
      </div>
    )
  }

  return (
    <div>
      {outdated.networkErrors.length > 0 && (
        <div class="flex items-center gap-2 mb-3 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
          <IconInfo size={14} />
          {outdated.networkErrors.length} package(s) could not be checked — network/registry issue
        </div>
      )}

      <div class="flex items-center gap-2 mb-4 flex-wrap">
        {(["all", "major", "minor", "patch"] as const).map((f) => (
          <button
            key={f}
            class={`inline-flex items-center h-7 px-3 rounded-lg text-xs font-medium border transition-colors ${
              filter === f
                ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div class="flex-1" />
        <div class="flex items-center gap-2 text-xs text-zinc-500">
          Show up-to-date
          <div
            class={`relative w-7 h-4 rounded-full cursor-pointer transition-colors ${showUpToDate ? "bg-indigo-600" : "bg-zinc-700"}`}
            role="switch"
            aria-checked={showUpToDate}
            tabIndex={0}
            onClick={() => setShowUpToDate((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setShowUpToDate((v) => !v)
              }
            }}
          >
            <span
              class={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showUpToDate ? "translate-x-3.5" : "translate-x-0.5"}`}
            />
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.name} class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div
              class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-800/30 transition-colors"
              onClick={() => setExpanded(expanded === item.name ? null : item.name)}
            >
              <span class={`w-2 h-2 rounded-full shrink-0 ${dotColor(item.status)}`} />
              <span class="font-mono text-[12.5px] font-semibold text-zinc-200 flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {item.name}
              </span>
              <span class="font-mono text-xs text-zinc-500">{item.current ?? "—"}</span>
              <span class="text-zinc-700 text-xs">→</span>
              <span class="font-mono text-xs text-zinc-300">{item.latest ?? "—"}</span>
              <span
                class={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusStyle(item.status)}`}
              >
                {item.status}
              </span>
              <IconChevronRight
                size={13}
                className={`text-zinc-600 transition-transform shrink-0 ${expanded === item.name ? "rotate-90" : ""}`}
              />
            </div>
            {expanded === item.name && (
              <div class="border-t border-zinc-800/60 px-4 py-3">
                <ChangelogBlock changelog={item.changelog} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ChangelogBlock({ changelog }: { changelog?: Changelog }) {
  if (!changelog || (changelog.status !== "ok" && changelog.status !== "approx")) {
    const status = changelog?.status ?? "no-release"
    return (
      <div class="flex items-center gap-2 text-xs text-zinc-500">
        <IconInfo size={12} />
        {NO_CHANGELOG_MESSAGES[status] ?? "Release notes not fetched."}
      </div>
    )
  }
  return (
    <div class="text-xs">
      <div class="flex items-baseline gap-2 mb-1 flex-wrap">
        <span class="font-semibold text-zinc-300">{changelog.title}</span>
        {changelog.status === "approx" && <span class="text-zinc-600">(closest release)</span>}
        {changelog.repo && <span class="text-zinc-600">{changelog.repo}</span>}
      </div>
      {changelog.publishedAt && (
        <div class="text-zinc-600 mb-2">{new Date(changelog.publishedAt).toISOString().slice(0, 10)}</div>
      )}
      {changelog.bodyLines && changelog.bodyLines.length > 0 && (
        <ul class="list-disc pl-4 text-zinc-400 leading-relaxed space-y-0.5">
          {changelog.bodyLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {changelog.url && (
        <a
          class="inline-flex items-center gap-1 mt-2 text-indigo-400 hover:text-indigo-300 hover:underline underline-offset-2"
          href={changelog.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <IconExternalLink size={10} />
          View full release notes
        </a>
      )}
    </div>
  )
}
