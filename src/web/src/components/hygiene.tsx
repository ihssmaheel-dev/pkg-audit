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
      <div class="flex flex-col items-center justify-center gap-3 py-20 text-[#8b949e] text-center">
        <IconCheckCircle size={40} className="text-[#00d992]" />
        <h3 class="text-sm font-semibold text-[#ffffff]">No hygiene issues</h3>
        <p class="text-xs text-[#8b949e]">
          All workspace manifests have consistent packageManager, engines, and naming configuration.
        </p>
      </div>
    )
  }

  return (
    <div class="space-y-4">
      <div>
        <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">
          CONFIG HYGIENE
        </div>
        <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff]">Manifest Hygiene Issues</h1>
      </div>

      <div class="flex flex-col gap-3">
        {issues.map((issue, i) => (
          <div
            key={`${issue.kind}-${i}`}
            class="flex items-start gap-4 p-5 bg-[#101010] border border-[#3d3a39] rounded-[8px] hover:border-[#8b949e] transition-colors"
          >
            <div class="flex items-center justify-center w-8 h-8 rounded-[6px] bg-[#f59e0b]/10 border border-[#f59e0b]/25 text-[#f59e0b] shrink-0 mt-0.5">
              <IconAlertTriangle size={15} />
            </div>
            <div>
              <div class="text-[13.5px] font-semibold text-[#ffffff] mb-1">
                {KIND_LABELS[issue.kind] ?? issue.kind}
              </div>
              <div class="text-xs text-[#bdbdbd] leading-relaxed font-mono">{issue.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
