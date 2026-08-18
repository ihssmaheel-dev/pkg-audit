import { useState } from "preact/hooks"
import type { Conflict, ScanResult } from "../../../types"
import { IconAlertTriangle, IconCheckCircle, IconCopy, IconXCircle } from "./icons"

function conflictsAsMarkdown(conflicts: Conflict[]): string {
  let md = "## Version Conflicts\n\n"
  for (const conflict of conflicts) {
    md += `- **${conflict.name}** — ${conflict.severity} version differs\n`
    for (const v of conflict.versions) {
      for (const occ of v.occurrences) {
        md += `  - ${occ.workspace}: \`${v.version}\` (${occ.type})\n`
      }
    }
    md += "\n"
  }
  return md
}

function suggestedPin(conflict: Conflict): string {
  const counts = new Map<string, number>()
  for (const v of conflict.versions) {
    counts.set(v.version, (counts.get(v.version) ?? 0) + v.occurrences.length)
  }
  let best = ""
  let bestCount = 0
  for (const [version, count] of counts) {
    if (count > bestCount) {
      best = version
      bestCount = count
    }
  }
  return `"${conflict.name}": "${best}"`
}

interface ConflictsProps {
  data: ScanResult
  search: string
}

export function Conflicts({ data, search }: ConflictsProps) {
  const [severity, setSeverity] = useState<"all" | "major" | "range">("all")
  const [copied, setCopied] = useState<string | null>(null)

  const conflicts = (data.conflicts ?? []).filter((c) => {
    if (severity === "major" && c.severity !== "major") return false
    if (severity === "range" && c.severity !== "range") return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard unavailable.
    }
  }

  if (!data.conflicts?.length) {
    return (
      <div class="empty-state">
        <IconCheckCircle size={48} className="empty-icon" />
        <h3>No version conflicts</h3>
        <p>Every shared dependency is aligned across all workspaces.</p>
      </div>
    )
  }

  return (
    <div class="conflicts-view">
      <div class="conflicts-toolbar">
        <div class="filter-group">
          {(["all", "major", "range"] as const).map((s) => (
            <button
              class={`btn btn-sm ${severity === s ? "btn-active" : ""}`}
              key={s}
              onClick={() => setSeverity(s)}
            >
              {s === "all" ? "All" : s === "major" ? "Major" : "Range"}
            </button>
          ))}
        </div>
        <button class="btn" onClick={() => void copy(conflictsAsMarkdown(data.conflicts), "all")}>
          <IconCopy size={14} />
          {copied === "all" ? "Copied!" : "Copy as Markdown"}
        </button>
      </div>

      <div class="conflicts-list">
        {conflicts.map((conflict) => (
          <div class={`conflict-card conflict-${conflict.severity}`} key={conflict.name}>
            <div class="conflict-header">
              {conflict.severity === "major" ? (
                <IconXCircle size={18} className="conflict-marker major" />
              ) : (
                <IconAlertTriangle size={18} className="conflict-marker range" />
              )}
              <span class="conflict-name">{conflict.name}</span>
              <span class={`conflict-tag ${conflict.severity}`}>
                {conflict.severity === "major" ? "major version differs" : "range differs"}
              </span>
              <button
                class="btn btn-sm"
                onClick={() => void copy(suggestedPin(conflict), `pin-${conflict.name}`)}
                title="Copy suggested pin"
              >
                <IconCopy size={12} />
                {copied === `pin-${conflict.name}` ? "Copied!" : "Pin"}
              </button>
            </div>
            <div class="conflict-versions">
              {conflict.versions.flatMap((v) =>
                v.occurrences.map((occ) => (
                  <div class="conflict-row" key={`${occ.workspace}-${v.version}`}>
                    <span class="conflict-ws">{occ.workspace}</span>
                    <span class="conflict-version">{v.version}</span>
                    <span class={`conflict-type conflict-type-${occ.type}`}>{occ.type}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
