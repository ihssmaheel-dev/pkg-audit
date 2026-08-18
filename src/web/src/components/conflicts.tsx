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

type Severity = "all" | "major" | "range"

interface ConflictsProps {
  data: ScanResult
  notify: (message: string) => void
}

export function Conflicts({ data, notify }: ConflictsProps) {
  const [severity, setSeverity] = useState<Severity>("all")

  const conflicts = (data.conflicts ?? []).filter((c) => {
    if (severity === "major" && c.severity !== "major") return false
    if (severity === "range" && c.severity !== "range") return false
    return true
  })

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notify(message)
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
    <div>
      <div class="filterbar">
        {(["all", "major", "range"] as const).map((s) => (
          <button class={`chip ${severity === s ? "active" : ""}`} key={s} onClick={() => setSeverity(s)}>
            {s === "all" ? "All" : s === "major" ? "Major" : "Range"}
          </button>
        ))}
        <div class="filterbar-spacer" />
        <button
          class="btn"
          onClick={() => void copy(conflictsAsMarkdown(data.conflicts), "Copied conflicts as markdown")}
        >
          <IconCopy size={13} />
          Copy all as markdown
        </button>
      </div>

      <div class="stack">
        {conflicts.map((conflict) => (
          <div class="card" key={conflict.name}>
            <div class="conflict-head">
              <div class={`status-icon ${conflict.severity}`}>
                {conflict.severity === "major" ? <IconXCircle size={13} /> : <IconAlertTriangle size={13} />}
              </div>
              <div class="conflict-titles">
                <span class="conflict-name">{conflict.name}</span>
                <span class="conflict-tag">
                  {conflict.severity === "major" ? "major version differs" : "range differs"}
                </span>
              </div>
              <div class="conflict-head-spacer" />
              <button
                class="icon-btn"
                title="Copy as markdown"
                onClick={() => void copy(conflictsAsMarkdown([conflict]), "Copied conflict as markdown")}
              >
                <IconCopy size={13} />
              </button>
            </div>
            <div class="conflict-rows">
              {conflict.versions.flatMap((v) =>
                v.occurrences.map((occ) => (
                  <div class="conflict-row" key={`${occ.workspace}-${v.version}`}>
                    <span class="ws-name">{occ.workspace}</span>
                    <span class="ws-version">{v.version}</span>
                    <span class="ws-type">{occ.type}</span>
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
