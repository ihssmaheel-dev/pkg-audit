import type { HygieneIssue, HygieneKind, ScanResult } from "../../../types"
import { IconAlertTriangle, IconCheckCircle } from "./icons"

const KIND_LABELS: Record<HygieneKind, string> = {
  unnamed: "Unnamed manifest",
  "duplicate-name": "Duplicate name",
  packageManager: "packageManager differs across manifests",
  engines: "engines.node differs across manifests",
}

interface HygieneProps {
  data: ScanResult
}

export function Hygiene({ data }: HygieneProps) {
  const issues: HygieneIssue[] = data.hygieneIssues ?? []

  if (!issues.length) {
    return (
      <div class="empty-state">
        <IconCheckCircle size={48} className="empty-icon" />
        <h3>No hygiene issues</h3>
        <p>All workspaces have consistent configuration.</p>
      </div>
    )
  }

  return (
    <div class="stack">
      {issues.map((issue, i) => (
        <div class="card hygiene-card" key={`${issue.kind}-${i}`}>
          <div class="status-icon range">
            <IconAlertTriangle size={14} />
          </div>
          <div>
            <div class="hygiene-title">{KIND_LABELS[issue.kind] ?? issue.kind}</div>
            <div class="hygiene-desc">{issue.message}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
