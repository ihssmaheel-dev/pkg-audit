import { useState } from "preact/hooks"
import type { OutdatedRecord, ScanResult } from "../../../types"
import type { JSX } from "preact"
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendar,
  IconCheckCircle,
  IconCircleDot,
  IconExternalLink,
  IconInfo,
  IconPackage,
  IconRefreshCw,
} from "./icons"

function statusMarker(record: OutdatedRecord): JSX.Element {
  switch (record.status) {
    case "major":
      return <IconAlertTriangle size={14} className="marker-major" />
    case "minor":
      return <IconAlertTriangle size={14} className="marker-minor" />
    case "up-to-date":
      return <IconCheckCircle size={14} className="marker-ok" />
    case "not-published":
      return <IconCircleDot size={14} className="marker-muted" />
    default:
      return <IconInfo size={14} className="marker-muted" />
  }
}

interface OutdatedProps {
  data: ScanResult
  onOutdated: () => void
}

export function Outdated({ data, onOutdated }: OutdatedProps) {
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const outdated = data.outdated
  if (!outdated) {
    return (
      <div class="empty-state">
        <IconPackage size={48} className="empty-icon" />
        <h3>Outdated check not run</h3>
        <p>Check dependency versions against the npm registry.</p>
        <button class="btn btn-primary" onClick={onOutdated}>
          <IconRefreshCw size={14} />
          Check Outdated
        </button>
      </div>
    )
  }

  const items = showAll ? outdated.all : outdated.outdated

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
    <div class="outdated-view">
      {outdated.networkErrors.length > 0 && (
        <div class="rate-limit-banner">
          <IconInfo size={14} />
          {outdated.networkErrors.length} package(s) could not be checked — network/registry issue
        </div>
      )}
      <div class="outdated-toolbar">
        <button class={`btn btn-sm ${!showAll ? "btn-active" : ""}`} onClick={() => setShowAll(false)}>
          Outdated ({outdated.outdated.length})
        </button>
        <button class={`btn btn-sm ${showAll ? "btn-active" : ""}`} onClick={() => setShowAll(true)}>
          All ({outdated.all.length})
        </button>
      </div>

      <div class="outdated-list">
        {items.map((item) => (
          <div class={`outdated-row outdated-${item.status}`} key={item.name}>
            <div class="outdated-main" onClick={() => setExpanded(expanded === item.name ? null : item.name)}>
              {statusMarker(item)}
              <span class="outdated-name">{item.name}</span>
              <span class="outdated-current">{item.current ?? "-"}</span>
              <IconArrowRight size={12} className="outdated-arrow" />
              <span class={`outdated-latest ${item.status === "major" ? "bold" : ""}`}>
                {item.latest ?? "-"}
              </span>
              <span class={`outdated-status outdated-status-${item.status}`}>{item.status}</span>
            </div>
            {expanded === item.name && item.changelog && <ChangelogBlock changelog={item.changelog} />}
          </div>
        ))}
      </div>
    </div>
  )
}

interface ChangelogBlockProps {
  changelog: NonNullable<OutdatedRecord["changelog"]>
}

function ChangelogBlock({ changelog }: ChangelogBlockProps) {
  if (changelog.status === "rate-limited") {
    return (
      <div class="outdated-changelog">
        <div class="changelog-error">
          <IconInfo size={12} /> GitHub API rate limit hit. Changelogs paused — try again later.
        </div>
      </div>
    )
  }

  if (changelog.status !== "ok" && changelog.status !== "approx") {
    return (
      <div class="outdated-changelog">
        <div class="changelog-error">
          No changelog available ({changelog.status}){changelog.reason ? ` — ${changelog.reason}` : ""}
        </div>
      </div>
    )
  }

  return (
    <div class="outdated-changelog">
      <div class="changelog-title">
        {changelog.title}
        {changelog.status === "approx" && (
          <span class="changelog-note"> (closest release — tag didn't match exactly)</span>
        )}
      </div>
      {changelog.repo && <div class="changelog-repo">{changelog.repo}</div>}
      {changelog.publishedAt && (
        <div class="changelog-date">
          <IconCalendar size={12} />
          {new Date(changelog.publishedAt).toISOString().slice(0, 10)}
        </div>
      )}
      {changelog.bodyLines && changelog.bodyLines.length > 0 && (
        <div class="changelog-body">
          {changelog.bodyLines.map((line, i) => (
            <div class="changelog-line" key={i}>
              {line}
            </div>
          ))}
        </div>
      )}
      {changelog.url && (
        <a class="changelog-link" href={changelog.url} target="_blank" rel="noreferrer">
          <IconExternalLink size={12} />
          {changelog.url}
        </a>
      )}
    </div>
  )
}
