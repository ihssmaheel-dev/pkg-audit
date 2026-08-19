import { useState } from "preact/hooks"
import type { Conflict, ScanResult } from "../../../types"
import { IconAlertTriangle, IconCheckCircle, IconCopy, IconWrench, IconXCircle, IconZap } from "./icons"

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

import { CatalogModal } from "./catalog-modal"

export interface FixItem {
  name: string
  targetVersion: string
  workspaces?: string[]
}

interface ConflictsProps {
  data: ScanResult
  notify: (message: string) => void
  onFix?: (fixes: FixItem[]) => Promise<void>
  onCatalogMigrate?: (options: {
    action: "catalog-migrate"
    catalogStrategy: "highest" | "most-frequent"
    catalogAll: boolean
  }) => Promise<{ ok: boolean; count: number; result: ScanResult | null }>
}

const TYPE_COLORS: Record<string, string> = {
  prod: "bg-[#00d992]/10 text-[#00d992] border border-[#00d992]/25",
  dev: "bg-[#1a1a1a] text-[#8b949e] border border-[#3d3a39]",
  peer: "bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/25",
  optional: "bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/25",
}

function cleanSemver(v: string): string {
  return v.replace(/^[\^~>=<\s]+/, "").trim()
}

function parseSemver(v: string): [number, number, number] {
  const clean = cleanSemver(v).split("-")[0] ?? ""
  const parts = clean.split(".").map((n) => Number.parseInt(n, 10) || 0)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

function compareSemver(a: string, b: string): number {
  const [majA, minA, patA] = parseSemver(a)
  const [majB, minB, patB] = parseSemver(b)
  if (majA !== majB) return majA - majB
  if (minA !== minB) return minA - minB
  return patA - patB
}

function getHighestVersion(conflict: Conflict): string {
  if (!conflict.versions.length) return ""
  let highest = conflict.versions[0]!.version
  for (const v of conflict.versions) {
    if (compareSemver(v.version, highest) > 0) {
      highest = v.version
    }
  }
  return highest
}

function getMostFrequentVersion(conflict: Conflict): string {
  if (!conflict.versions.length) return ""
  let best = conflict.versions[0]!
  for (const v of conflict.versions) {
    if (v.occurrences.length > best.occurrences.length) {
      best = v
    } else if (v.occurrences.length === best.occurrences.length) {
      if (compareSemver(v.version, best.version) > 0) best = v
    }
  }
  return best.version
}

export function Conflicts({ data, notify, onFix, onCatalogMigrate }: ConflictsProps) {
  const [severity, setSeverity] = useState<Severity>("all")
  const [fixingPkg, setFixingPkg] = useState<string | null>(null)
  const [showCatalogModal, setShowCatalogModal] = useState(false)

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

  const handleApplyFix = async (fixes: FixItem[], label: string) => {
    if (!onFix) return
    const key = fixes.map((f) => f.name).join(",")
    setFixingPkg(key)
    try {
      await onFix(fixes)
      notify(label)
    } finally {
      setFixingPkg(null)
    }
  }

  const handleBatchFix = async (strategy: "highest" | "most-frequent") => {
    if (!onFix || !data.conflicts.length) return
    const fixes: FixItem[] = data.conflicts.map((c) => ({
      name: c.name,
      targetVersion: strategy === "highest" ? getHighestVersion(c) : getMostFrequentVersion(c),
    }))
    setFixingPkg("__batch__")
    try {
      await onFix(fixes)
      notify(`Auto-aligned ${fixes.length} conflicting packages (${strategy})`)
    } finally {
      setFixingPkg(null)
    }
  }

  if (!data.conflicts?.length) {
    return (
      <div class="flex flex-col items-center justify-center gap-3 py-20 text-[#8b949e] text-center">
        <IconCheckCircle size={40} className="text-[#00d992]" />
        <h3 class="text-sm font-semibold text-[#ffffff]">No version conflicts</h3>
        <p class="text-xs text-[#8b949e]">Every shared dependency is aligned across all workspaces.</p>
        {onCatalogMigrate && (
          <div class="mt-4">
            <button
              class="flex items-center gap-1.5 h-8 px-4 bg-[#1a1a1a] hover:bg-[#252525] border border-[#00d992]/40 text-[#00d992] rounded-[6px] text-xs font-semibold transition-colors"
              onClick={() => setShowCatalogModal(true)}
            >
              <IconZap size={13} />
              <span>Convert Monorepo to pnpm catalog:</span>
            </button>
            <CatalogModal
              data={data}
              isOpen={showCatalogModal}
              onClose={() => setShowCatalogModal(false)}
              notify={notify}
              onMigrate={onCatalogMigrate}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div class="space-y-4 w-full">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">
            VERSION DRIFT
          </div>
          <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff]">Dependency Conflicts</h1>
        </div>

        {/* Action Buttons */}
        <div class="flex items-center gap-2 flex-wrap">
          {onCatalogMigrate && (
            <button
              class="flex items-center gap-1.5 h-8 px-3.5 bg-[#00d992]/15 hover:bg-[#00d992]/25 border border-[#00d992]/40 text-[#00d992] rounded-[6px] text-xs font-semibold transition-colors"
              onClick={() => setShowCatalogModal(true)}
            >
              <IconZap size={13} />
              <span>Convert to pnpm catalog:</span>
            </button>
          )}
          {onFix && (
            <>
              <button
                class="flex items-center gap-1.5 h-8 px-3.5 bg-[#00d992] hover:bg-[#2fd6a1] disabled:opacity-50 text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
                onClick={() => void handleBatchFix("highest")}
                disabled={fixingPkg !== null}
              >
                <IconZap size={12} className={fixingPkg === "__batch__" ? "spinner" : ""} />
                <span>Auto-Align All (Highest)</span>
              </button>
              <button
                class="flex items-center gap-1.5 h-8 px-3 bg-[#101010] border border-[#3d3a39] hover:bg-[#1a1a1a] hover:border-[#8b949e] disabled:opacity-50 rounded-[6px] text-xs text-[#f2f2f2] font-medium transition-colors"
                onClick={() => void handleBatchFix("most-frequent")}
                disabled={fixingPkg !== null}
              >
                <IconWrench size={12} />
                <span>Auto-Align (Most Frequent)</span>
              </button>
            </>
          )}
          <button
            class="flex items-center gap-1.5 h-8 px-3 bg-[#101010] border border-[#3d3a39] hover:bg-[#1a1a1a] hover:border-[#8b949e] rounded-[6px] text-xs text-[#f2f2f2] font-medium transition-colors"
            onClick={() => void copy(conflictsAsMarkdown(data.conflicts), "Copied conflicts as markdown")}
          >
            <IconCopy size={13} className="text-[#8b949e]" />
            <span>Copy Markdown</span>
          </button>
        </div>
      </div>

      {onCatalogMigrate && (
        <CatalogModal
          data={data}
          isOpen={showCatalogModal}
          onClose={() => setShowCatalogModal(false)}
          notify={notify}
          onMigrate={onCatalogMigrate}
        />
      )}

      {/* Filter bar */}
      <div class="flex items-center gap-2">
        {(["all", "major", "range"] as const).map((s) => (
          <button
            key={s}
            class={`inline-flex items-center h-7 px-3 rounded-[6px] text-xs font-medium border transition-colors ${
              severity === s
                ? "bg-[#1a1a1a] border-[#8b949e] text-[#ffffff]"
                : "bg-[#101010] border-[#3d3a39] text-[#8b949e] hover:text-[#f2f2f2] hover:border-[#8b949e]"
            }`}
            onClick={() => setSeverity(s)}
          >
            {s === "all" ? "All conflicts" : s === "major" ? "Major conflicts" : "Range conflicts"}
          </button>
        ))}
      </div>

      {/* Conflict cards 2-in-a-row grid */}
      <div class="grid grid-cols-2 gap-4 max-[1000px]:grid-cols-1">
        {conflicts.map((conflict) => {
          const highest = getHighestVersion(conflict)
          const isFixingThis = fixingPkg === conflict.name

          return (
            <div
              key={conflict.name}
              class={`bg-[#121212] border rounded-[8px] overflow-hidden flex flex-col justify-between hover:border-[#4d4947] transition-all shadow-sm ${
                conflict.severity === "major"
                  ? "border-l-4 border-l-[#f43f5e] border-[#2e2a28]"
                  : "border-l-4 border-l-[#f59e0b] border-[#2e2a28]"
              }`}
            >
              <div>
                {/* Card Header */}
                <div class="flex items-center justify-between gap-3 px-4 py-3 bg-[#181818] border-b border-[#262626]">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div
                      class={`flex items-center justify-center w-6 h-6 rounded-[5px] shrink-0 ${
                        conflict.severity === "major"
                          ? "bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30"
                          : "bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30"
                      }`}
                    >
                      {conflict.severity === "major" ? (
                        <IconXCircle size={13} />
                      ) : (
                        <IconAlertTriangle size={13} />
                      )}
                    </div>
                    <div class="min-w-0">
                      <span class="font-mono font-bold text-sm text-[#ffffff] truncate block">
                        {conflict.name}
                      </span>
                      <span class="text-[10.5px] text-[#8b949e] font-mono">
                        {conflict.severity === "major" ? "Major semver mismatch" : "Range semver mismatch"}
                      </span>
                    </div>
                  </div>

                  <div class="flex items-center gap-1.5 shrink-0">
                    <button
                      class="flex items-center justify-center w-7 h-7 rounded-[5px] border border-[#303030] bg-[#141414] hover:bg-[#202020] text-[#8b949e] hover:text-[#f2f2f2] transition-colors"
                      title="Copy as markdown"
                      onClick={() =>
                        void copy(conflictsAsMarkdown([conflict]), "Copied conflict as markdown")
                      }
                    >
                      <IconCopy size={12} />
                    </button>
                  </div>
                </div>

                {/* Versions Occurrences List */}
                <div class="divide-y divide-[#262626] bg-[#121212]">
                  {conflict.versions.map((v) => (
                    <div key={v.version} class="p-3 space-y-2">
                      <div class="flex items-center justify-between text-xs">
                        <div class="flex items-center gap-2">
                          <code class="font-mono text-[12px] font-bold text-[#00d992] bg-[#00d992]/10 px-1.5 py-0.5 rounded border border-[#00d992]/25">
                            {v.version}
                          </code>
                          <span class="text-[11px] text-[#8b949e]">
                            ({v.occurrences.length} workspace{v.occurrences.length > 1 ? "s" : ""})
                          </span>
                        </div>
                        {onFix && (
                          <button
                            class="h-5 px-2 bg-[#1a1a1a] hover:bg-[#252525] border border-[#3d3a39] hover:border-[#8b949e] text-[#bdbdbd] hover:text-[#ffffff] rounded text-[10px] font-mono transition-colors disabled:opacity-50"
                            onClick={() =>
                              void handleApplyFix(
                                [{ name: conflict.name, targetVersion: v.version }],
                                `Aligned ${conflict.name} to ${v.version}`
                              )
                            }
                            disabled={fixingPkg !== null}
                            title={`Set all workspaces to ${v.version}`}
                          >
                            Set all
                          </button>
                        )}
                      </div>

                      <div class="flex flex-wrap gap-1.5">
                        {v.occurrences.map((occ) => (
                          <div
                            key={`${occ.workspace}-${v.version}`}
                            class="flex items-center gap-1.5 px-2 py-1 bg-[#181818] border border-[#2c2a29] rounded-[4px] text-[11px]"
                          >
                            <span class="font-medium text-[#bdbdbd]">{occ.workspace}</span>
                            <span
                              class={`text-[9px] px-1 py-0.2 rounded font-semibold uppercase ${
                                TYPE_COLORS[occ.type] ?? "text-[#8b949e]"
                              }`}
                            >
                              {occ.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom Quick Align Footer */}
              {onFix && highest && (
                <div class="p-3 bg-[#151515] border-t border-[#262626] flex items-center justify-between">
                  <span class="text-[11px] text-[#8b949e] font-mono">
                    Highest: <span class="text-[#f2f2f2] font-semibold">{highest}</span>
                  </span>
                  <button
                    class="flex items-center gap-1.5 h-6 px-2.5 bg-[#00d992]/15 hover:bg-[#00d992]/25 border border-[#00d992]/40 text-[#00d992] rounded-[5px] text-xs font-semibold transition-colors disabled:opacity-50"
                    onClick={() =>
                      void handleApplyFix(
                        [{ name: conflict.name, targetVersion: highest }],
                        `Aligned ${conflict.name} to ${highest}`
                      )
                    }
                    disabled={fixingPkg !== null}
                  >
                    <IconZap size={11} className={isFixingThis ? "spinner" : ""} />
                    <span>Align to {highest}</span>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
