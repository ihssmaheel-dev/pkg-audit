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
      <div class="flex flex-col items-center justify-center gap-3 py-20 text-zinc-500 text-center">
        <IconCheckCircle size={40} className="text-emerald-500/40" />
        <h3 class="text-sm font-semibold text-zinc-400">No hygiene issues</h3>
        <p class="text-xs">All workspaces have consistent configuration.</p>
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-2">
      {issues.map((issue, i) => (
        <div
          key={`${issue.kind}-${i}`}
          class="flex items-start gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-xl"
        >
          <div class="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
            <IconAlertTriangle size={14} />
          </div>
          <div>
            <div class="text-[13px] font-semibold text-zinc-200 mb-1">
              {KIND_LABELS[issue.kind] ?? issue.kind}
            </div>
            <div class="text-xs text-zinc-500 leading-relaxed">{issue.message}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
