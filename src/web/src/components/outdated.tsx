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

function badgeClass(status: OutdatedRecord["status"]): string {
  switch (status) {
    case "major":
      return "major"
    case "minor":
      return "minor"
    case "patch":
      return "patch"
    case "up-to-date":
      return "ok"
    default:
      return "muted"
  }
}

function dotClass(status: OutdatedRecord["status"]): string {
  switch (status) {
    case "major":
      return "major"
    case "minor":
      return "minor"
    case "up-to-date":
      return "ok"
    default:
      return "muted"
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
      <div class="empty-state">
        <IconPackage size={48} className="empty-icon" />
        <h3>Outdated check not run</h3>
        <p>Check dependency versions against the npm registry.</p>
        <button class="btn btn-primary" onClick={onOutdated}>
          <IconRefreshCw size={13} />
          Check outdated
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
      <div class="empty-state">
        <IconCheckCircle size={48} className="empty-icon" />
        <h3>Everything is up to date</h3>
        <p>All dependencies are at their latest versions.</p>
      </div>
    )
  }

  return (
    <div>
      {outdated.networkErrors.length > 0 && (
        <div class="rate-limit-banner">
          <IconInfo size={15} />
          {outdated.networkErrors.length} package(s) could not be checked — network/registry issue
        </div>
      )}

      <div class="filterbar">
        {(["all", "major", "minor", "patch"] as const).map((f) => (
          <button class={`chip ${filter === f ? "active" : ""}`} key={f} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div class="filterbar-spacer" />
        <div class="toggle-row">
          Show up-to-date
          <div
            class={`switch ${showUpToDate ? "on" : ""}`}
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
          />
        </div>
      </div>

      <div class="stack">
        {items.map((item) => (
          <div class={`card od-row ${expanded === item.name ? "open" : ""}`} key={item.name}>
            <div class="od-summary" onClick={() => setExpanded(expanded === item.name ? null : item.name)}>
              <span class={`od-dot ${dotClass(item.status)}`} />
              <span class="od-name">{item.name}</span>
              <span class="od-current">{item.current ?? "—"}</span>
              <span class="od-arrow">→</span>
              <span class="od-latest">{item.latest ?? "—"}</span>
              <span class={`od-badge ${badgeClass(item.status)}`}>{item.status}</span>
              <IconChevronRight size={14} className="od-chevron" />
            </div>
            {expanded === item.name && (
              <div class="od-detail">
                <ChangelogBlock changelog={item.changelog} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface ChangelogBlockProps {
  changelog?: Changelog
}

function ChangelogBlock({ changelog }: ChangelogBlockProps) {
  if (!changelog || (changelog.status !== "ok" && changelog.status !== "approx")) {
    const status = changelog?.status ?? "no-release"
    return (
      <div class="od-no-changelog">
        <IconInfo size={13} />
        {NO_CHANGELOG_MESSAGES[status] ?? "Release notes not fetched."}
      </div>
    )
  }

  return (
    <div class="od-changelog">
      <div class="od-changelog-head">
        <span class="od-changelog-title">
          {changelog.title}
          {changelog.status === "approx" && <span class="od-changelog-approx"> (closest release)</span>}
        </span>
        {changelog.repo && <span class="od-changelog-repo">{changelog.repo}</span>}
      </div>
      {changelog.publishedAt && (
        <div class="od-changelog-date">{new Date(changelog.publishedAt).toISOString().slice(0, 10)}</div>
      )}
      {changelog.bodyLines && changelog.bodyLines.length > 0 && (
        <ul class="od-changelog-body">
          {changelog.bodyLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {changelog.url && (
        <a class="od-changelog-link" href={changelog.url} target="_blank" rel="noopener noreferrer">
          <IconExternalLink size={11} />
          View full release notes
        </a>
      )}
    </div>
  )
}
