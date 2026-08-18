import type { HygieneIssue, HygieneKind, ScanResult } from "../../../types"
import {
  IconCheckCircle,
  IconCircleDot,
  IconLayers,
  IconPackage,
  IconSettings,
  IconWrench,
  type IconComponent,
} from "./icons"

const KIND_META: Record<HygieneKind, { icon: IconComponent; label: string }> = {
  unnamed: { icon: IconCircleDot, label: "Unnamed manifest" },
  "duplicate-name": { icon: IconLayers, label: "Duplicate name" },
  packageManager: { icon: IconWrench, label: "packageManager mismatch" },
  engines: { icon: IconSettings, label: "engines.node mismatch" },
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
    <div class="hygiene-view">
      <div class="hygiene-list">
        {issues.map((issue, i) => {
          const meta = KIND_META[issue.kind]
          const Icon = meta ? meta.icon : IconPackage
          return (
            <div class="hygiene-card" key={`${issue.kind}-${i}`}>
              <div class="hygiene-icon">
                <Icon size={18} />
              </div>
              <div class="hygiene-body">
                <div class="hygiene-kind">{meta ? meta.label : issue.kind}</div>
                <div class="hygiene-message">{issue.message}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
