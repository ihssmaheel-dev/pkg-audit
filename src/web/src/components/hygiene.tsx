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

      {/* Hygiene issues 2-in-a-row grid */}
      <div class="grid grid-cols-2 gap-4 max-[1000px]:grid-cols-1">
        {issues.map((issue, i) => (
          <div
            key={`${issue.kind}-${i}`}
            class="bg-[#101010] border border-[#2b2726] hover:border-[#4d4845] rounded-[8px] overflow-hidden flex flex-col justify-between transition-all duration-150 shadow-sm"
          >
            <div>
              {/* Card Header */}
              <div class="flex items-center justify-between gap-2 px-4 py-3 bg-[#151515] border-b border-[#242120]">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="flex items-center justify-center w-6 h-6 rounded-[5px] bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30 shrink-0">
                    <IconAlertTriangle size={13} />
                  </div>
                  <span class="text-sm font-bold text-[#ffffff] truncate">
                    {KIND_LABELS[issue.kind] ?? issue.kind}
                  </span>
                </div>

                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30 shrink-0">
                  {issue.kind}
                </span>
              </div>

              {/* Card Body */}
              <div class="p-4">
                <div class="text-xs text-[#bdbdbd] leading-relaxed font-mono bg-[#141414] p-3 rounded-[6px] border border-[#22201f]">
                  {issue.message}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
