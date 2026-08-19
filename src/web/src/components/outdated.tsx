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
      return "bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/25"
    case "minor":
      return "bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/25"
    case "patch":
      return "bg-[#00d992]/10 text-[#00d992] border border-[#00d992]/25"
    case "up-to-date":
      return "bg-[#00d992]/10 text-[#00d992] border border-[#00d992]/25"
    default:
      return "bg-[#1a1a1a] text-[#8b949e] border border-[#3d3a39]"
  }
}

function dotColor(status: OutdatedRecord["status"]): string {
  switch (status) {
    case "major":
      return "bg-[#f43f5e]"
    case "minor":
      return "bg-[#f59e0b]"
    case "up-to-date":
      return "bg-[#00d992]"
    default:
      return "bg-[#3d3a39]"
  }
}

interface OutdatedProps {
  data: ScanResult
  loading?: boolean
  onOutdated: () => void
}

export function Outdated({ data, onOutdated, loading }: OutdatedProps) {
  const [filter, setFilter] = useState<Filter>("all")
  const [showUpToDate, setShowUpToDate] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const outdated = data.outdated
  if (!outdated) {
    return (
      <div class="flex flex-col items-center justify-center gap-3.5 py-24 text-[#8b949e] text-center">
        <IconPackage size={40} className="text-[#3d3a39]" />
        <h3 class="text-sm font-semibold text-[#ffffff]">Outdated check not run</h3>
        <p class="text-xs text-[#8b949e] max-w-sm">
          Query the npm registry and GitHub release logs to detect version drift across all dependencies.
        </p>
        <button
          class="flex items-center gap-1.5 h-8 px-4 bg-[#00d992] hover:bg-[#2fd6a1] disabled:opacity-50 text-[#101010] rounded-[6px] text-xs font-semibold mt-2 transition-colors"
          onClick={onOutdated}
          disabled={loading}
        >
          <IconRefreshCw size={13} className={loading ? "spinner" : ""} />
          <span>{loading ? "Scanning dependencies…" : "Check outdated"}</span>
        </button>
      </div>
    )
  }

  const items = outdated.all.filter((item) => {
    if (!showUpToDate && (item.status === "up-to-date" || item.status === "not-published")) {
      return false
    }
    if (filter === "all") return true
    return item.status === filter
  })

  if (!items.length) {
    return (
      <div class="flex flex-col items-center justify-center gap-3 py-20 text-[#8b949e] text-center">
        <IconCheckCircle size={40} className="text-[#00d992]" />
        <h3 class="text-sm font-semibold text-[#ffffff]">Everything is up to date</h3>
        <p class="text-xs text-[#8b949e]">All dependencies are aligned with their latest releases.</p>
      </div>
    )
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">
            REGISTRY SYNC
          </div>
          <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff]">Outdated Packages</h1>
        </div>
        <button
          class="flex items-center gap-1.5 h-8 px-3.5 bg-[#00d992] hover:bg-[#2fd6a1] disabled:opacity-50 text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
          onClick={onOutdated}
          disabled={loading}
        >
          <IconRefreshCw size={12} className={loading ? "spinner" : ""} />
          <span>{loading ? "Scanning dependencies…" : "Sync Registry"}</span>
        </button>
      </div>

      {outdated.networkErrors.length > 0 && (
        <div class="flex items-center gap-2 px-4 py-2.5 bg-[#f59e0b]/10 border border-[#f59e0b]/25 rounded-[6px] text-xs text-[#f59e0b]">
          <IconInfo size={14} />
          <span>
            {outdated.networkErrors.length} package(s) could not be queried due to network or registry limits.
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div class="flex items-center gap-2 flex-wrap">
        {(["all", "major", "minor", "patch"] as const).map((f) => (
          <button
            key={f}
            class={`inline-flex items-center h-7 px-3 rounded-[6px] text-xs font-medium border transition-colors ${
              filter === f
                ? "bg-[#1a1a1a] border-[#8b949e] text-[#ffffff]"
                : "bg-[#101010] border-[#3d3a39] text-[#8b949e] hover:text-[#f2f2f2] hover:border-[#8b949e]"
            }`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All updates" : `${f[0].toUpperCase() + f.slice(1)} only`}
          </button>
        ))}
        <div class="flex-1" />
        <div class="flex items-center gap-2 text-xs text-[#8b949e]">
          <span>Show up-to-date</span>
          <div
            class={`relative w-8 h-4 rounded-full cursor-pointer transition-colors ${
              showUpToDate ? "bg-[#00d992]" : "bg-[#3d3a39]"
            }`}
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
              class={`absolute top-0.5 w-3 h-3 rounded-full bg-[#101010] transition-transform ${
                showUpToDate ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </div>
        </div>
      </div>

      {/* Outdated cards 2-in-a-row grid */}
      <div class="grid grid-cols-2 gap-4 max-[1000px]:grid-cols-1">
        {items.map((item) => (
          <div
            key={item.name}
            class="bg-[#101010] border border-[#2b2726] hover:border-[#4d4845] rounded-[8px] overflow-hidden flex flex-col justify-between transition-all duration-150 shadow-sm"
          >
            <div>
              {/* Card Header */}
              <div
                class="flex items-center justify-between gap-2 px-4 py-3 bg-[#151515] border-b border-[#242120] cursor-pointer hover:bg-[#1a1a1a] transition-colors"
                onClick={() => setExpanded(expanded === item.name ? null : item.name)}
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span class={`w-2 h-2 rounded-full shrink-0 ${dotColor(item.status)}`} />
                  <span class="font-mono text-sm font-bold text-[#ffffff] truncate">{item.name}</span>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <span
                    class={`inline-flex items-center justify-center h-5 px-2 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusStyle(
                      item.status
                    )}`}
                  >
                    {item.status}
                  </span>
                  <IconChevronRight
                    size={13}
                    className={`text-[#8b949e] transition-transform ${
                      expanded === item.name ? "rotate-90" : ""
                    }`}
                  />
                </div>
              </div>

              {/* Card Semver Drift Row */}
              <div class="p-4 space-y-3">
                <div class="flex items-center justify-between p-2.5 bg-[#161616] border border-[#262626] rounded-[6px] text-xs font-mono">
                  <div>
                    <span class="text-[#8b949e] text-[10.5px] uppercase block">Current</span>
                    <span class="text-[#f43f5e] font-semibold">{item.current ?? "—"}</span>
                  </div>
                  <span class="text-[#8b949e] font-bold">➔</span>
                  <div class="text-right">
                    <span class="text-[#8b949e] text-[10.5px] uppercase block">Latest</span>
                    <span class="text-[#00d992] font-bold">{item.latest ?? "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Expandable Changelog Preview */}
            {expanded === item.name && (
              <div class="border-t border-[#262626] bg-[#161616] p-4 text-xs">
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
      <div class="flex items-center gap-2 text-xs text-[#8b949e]">
        <IconInfo size={13} />
        <span>{NO_CHANGELOG_MESSAGES[status] ?? "Release notes not fetched."}</span>
      </div>
    )
  }
  return (
    <div class="text-xs">
      <div class="flex items-baseline gap-2.5 mb-1.5 flex-wrap">
        <span class="font-semibold text-[#ffffff] text-[13px]">{changelog.title}</span>
        {changelog.status === "approx" && (
          <span class="text-[#8b949e] font-mono text-[11px]">(closest release)</span>
        )}
        {changelog.repo && <span class="text-[#8b949e] font-mono text-[11px]">{changelog.repo}</span>}
      </div>
      {changelog.publishedAt && (
        <div class="text-[#8b949e] font-mono text-[11px] mb-2.5">
          {new Date(changelog.publishedAt).toISOString().slice(0, 10)}
        </div>
      )}
      {changelog.bodyLines && changelog.bodyLines.length > 0 && (
        <ul class="list-disc pl-4 text-[#bdbdbd] leading-relaxed space-y-1 font-mono text-[11.5px]">
          {changelog.bodyLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {changelog.url && (
        <a
          class="inline-flex items-center gap-1 mt-3 text-[#00d992] hover:text-[#2fd6a1] hover:underline text-xs font-medium"
          href={changelog.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <IconExternalLink size={11} />
          <span>View full release notes on GitHub</span>
        </a>
      )}
    </div>
  )
}
