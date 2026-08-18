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

const TYPE_COLORS: Record<string, string> = {
  prod: "bg-indigo-500/10 text-indigo-400",
  dev: "bg-zinc-700/50 text-zinc-400",
  peer: "bg-violet-500/10 text-violet-400",
  optional: "bg-amber-500/10 text-amber-400",
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
      <div class="flex flex-col items-center justify-center gap-3 py-20 text-zinc-500 text-center">
        <IconCheckCircle size={40} className="text-emerald-500/40" />
        <h3 class="text-sm font-semibold text-zinc-400">No version conflicts</h3>
        <p class="text-xs">Every shared dependency is aligned across all workspaces.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Filter bar */}
      <div class="flex items-center gap-2 mb-4 flex-wrap">
        {(["all", "major", "range"] as const).map((s) => (
          <button
            key={s}
            class={`inline-flex items-center h-7 px-3 rounded-lg text-xs font-medium border transition-colors ${
              severity === s
                ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
            onClick={() => setSeverity(s)}
          >
            {s === "all" ? "All" : s === "major" ? "Major" : "Range"}
          </button>
        ))}
        <div class="flex-1" />
        <button
          class="flex items-center gap-1.5 h-7 px-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-lg text-xs text-zinc-400 transition-colors"
          onClick={() => void copy(conflictsAsMarkdown(data.conflicts), "Copied conflicts as markdown")}
        >
          <IconCopy size={12} />
          Copy all as markdown
        </button>
      </div>

      {/* Conflict cards */}
      <div class="flex flex-col gap-3">
        {conflicts.map((conflict) => (
          <div
            key={conflict.name}
            class={`bg-zinc-900 border rounded-xl overflow-hidden ${
              conflict.severity === "major"
                ? "border-l-[3px] border-l-rose-500 border-zinc-800"
                : "border-l-[3px] border-l-amber-400 border-zinc-800"
            }`}
          >
            {/* Head */}
            <div class="flex items-center gap-3 px-4 py-3">
              <div
                class={`flex items-center justify-center w-6 h-6 rounded-md shrink-0 ${
                  conflict.severity === "major"
                    ? "bg-rose-500/15 text-rose-400"
                    : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {conflict.severity === "major" ? <IconXCircle size={13} /> : <IconAlertTriangle size={13} />}
              </div>
              <div class="min-w-0">
                <span class="font-mono font-bold text-[13px] text-zinc-100 block">{conflict.name}</span>
                <span class="text-[11px] text-zinc-500">
                  {conflict.severity === "major" ? "major version differs" : "range differs"}
                </span>
              </div>
              <div class="flex-1" />
              <button
                class="flex items-center justify-center w-7 h-7 rounded-lg border border-transparent hover:bg-zinc-800 hover:border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Copy as markdown"
                onClick={() => void copy(conflictsAsMarkdown([conflict]), "Copied conflict as markdown")}
              >
                <IconCopy size={13} />
              </button>
            </div>

            {/* Rows */}
            <div class="border-t border-zinc-800/60">
              {conflict.versions.flatMap((v) =>
                v.occurrences.map((occ) => (
                  <div
                    key={`${occ.workspace}-${v.version}`}
                    class="grid gap-3 px-4 py-2 text-xs border-b border-zinc-800/40 last:border-0"
                    style="grid-template-columns: minmax(0, 1fr) 120px 60px"
                  >
                    <span class="font-medium text-zinc-300 overflow-hidden text-ellipsis whitespace-nowrap">
                      {occ.workspace}
                    </span>
                    <span class="font-mono text-zinc-400">{v.version}</span>
                    <span
                      class={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wide w-fit ${TYPE_COLORS[occ.type] ?? "bg-zinc-700/50 text-zinc-400"}`}
                    >
                      {occ.type}
                    </span>
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
