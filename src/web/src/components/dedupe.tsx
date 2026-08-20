import { useMemo, useState } from "preact/hooks"
import type { DedupePackage, DedupeResult, ScanResult } from "../../../types"
import { IconCheckCircle, IconCopy, IconScissors, IconSearch, IconWrench, IconX, IconZap } from "./icons"

interface DedupeViewProps {
  data: ScanResult
  loading?: boolean
  notify: (msg: string) => void
  onFix?: (payload: {
    action: "dedupe-apply"
    overrides?: Record<string, string>
    dedupeStrategy?: "highest" | "most-frequent"
  }) => Promise<void>
}

export function DedupeView({ data, loading, notify, onFix }: DedupeViewProps) {
  const [strategy, setStrategy] = useState<"highest" | "most-frequent">("highest")
  const [search, setSearch] = useState("")
  const [applyingPkg, setApplyingPkg] = useState<string | null>(null)
  const [showJsonModal, setShowJsonModal] = useState(false)

  const dedupe: DedupeResult | null = data.dedupe

  const duplicates = useMemo(() => dedupe?.duplicates ?? [], [dedupe])

  const filteredDuplicates = useMemo(() => {
    if (!search) return duplicates
    const q = search.toLowerCase()
    return duplicates.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.versions.some(
          (v) =>
            v.version.toLowerCase().includes(q) || v.dependents.some((dep) => dep.toLowerCase().includes(q))
        )
    )
  }, [duplicates, search])

  // Generate target overrides dictionary for all duplicates based on strategy
  const overridesDict = useMemo(() => {
    const dict: Record<string, string> = {}
    for (const d of duplicates) {
      dict[d.name] = strategy === "highest" ? d.highestVersion : d.mostFrequentVersion
    }
    return dict
  }, [duplicates, strategy])

  const pm = dedupe?.packageManager ?? "npm"

  const overridesSnippet = useMemo(() => {
    if (pm === "pnpm") {
      return JSON.stringify({ pnpm: { overrides: overridesDict } }, null, 2)
    }
    if (pm === "yarn") {
      return JSON.stringify({ resolutions: overridesDict }, null, 2)
    }
    return JSON.stringify({ overrides: overridesDict }, null, 2)
  }, [pm, overridesDict])

  const handleApplyAll = async () => {
    if (!onFix || duplicates.length === 0) return
    setApplyingPkg("__all__")
    try {
      await onFix({
        action: "dedupe-apply",
        overrides: overridesDict,
        dedupeStrategy: strategy,
      })
      notify(`✔ Applied ${Object.keys(overridesDict).length} overrides into root package.json!`)
    } catch (err) {
      notify(`Error applying overrides: ${String(err)}`)
    } finally {
      setApplyingPkg(null)
    }
  }

  const handleApplySingle = async (pkg: DedupePackage) => {
    if (!onFix) return
    setApplyingPkg(pkg.name)
    const targetVer = strategy === "highest" ? pkg.highestVersion : pkg.mostFrequentVersion
    try {
      await onFix({
        action: "dedupe-apply",
        overrides: { [pkg.name]: targetVer },
      })
      notify(`✔ Overrode ${pkg.name} ➔ ${targetVer} in root package.json`)
    } catch (err) {
      notify(`Error applying override: ${String(err)}`)
    } finally {
      setApplyingPkg(null)
    }
  }

  const copyOverrides = async () => {
    try {
      await navigator.clipboard.writeText(overridesSnippet)
      notify("Copied overrides JSON to clipboard")
    } catch {
      // Clipboard unavailable
    }
  }

  const copyMarkdownReport = async () => {
    if (!duplicates.length) return
    let md = `## Monorepo Lockfile Deduplication Report\n\n`
    md += `Lockfile: \`${dedupe?.lockfileType}\` (${pm})\n`
    md += `Found **${duplicates.length} duplicate packages** with **${dedupe?.totalWastedVersions} redundant version instances**:\n\n`
    for (const d of duplicates) {
      const target = strategy === "highest" ? d.highestVersion : d.mostFrequentVersion
      md += `- **${d.name}** (${d.duplicateCount} versions): \`${d.versions.map((v) => v.version).join("`, `")}\` ➔ Override: \`${target}\`\n`
    }
    try {
      await navigator.clipboard.writeText(md)
      notify("Copied deduplication report as markdown")
    } catch {
      // Clipboard unavailable
    }
  }

  if (!dedupe || !dedupe.lockfilePath) {
    return (
      <div class="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div class="w-12 h-12 rounded-full bg-[#3d3a39]/20 text-[#8b949e] flex items-center justify-center">
          <IconScissors size={26} />
        </div>
        <div>
          <h2 class="text-base font-semibold text-[#ffffff]">No Monorepo Lockfile Found</h2>
          <p class="text-xs text-[#8b949e] max-w-md mt-1">
            Could not find <code class="text-[#f2f2f2]">pnpm-lock.yaml</code>,{" "}
            <code class="text-[#f2f2f2]">package-lock.json</code>,{" "}
            <code class="text-[#f2f2f2]">yarn.lock</code>, or <code class="text-[#f2f2f2]">bun.lock</code> in
            the monorepo root.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div class="space-y-5 w-full">
      {/* Header */}
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">
            LOCKFILE DEDUPLICATION
          </div>
          <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff] flex items-center gap-2.5">
            <span>Transitive Bloat & Overrides</span>
            <span class="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#1a1a1a] text-[#00d992] border border-[#3d3a39]">
              {dedupe.lockfileType} ({pm})
            </span>
          </h1>
        </div>

        {/* Header Action Buttons */}
        <div class="flex items-center gap-2 flex-wrap">
          {duplicates.length > 0 && onFix && (
            <button
              class="flex items-center gap-1.5 h-8 px-4 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] rounded-[6px] text-xs font-semibold transition-colors disabled:opacity-50"
              onClick={() => void handleApplyAll()}
              disabled={applyingPkg !== null || loading}
            >
              <IconZap size={13} className={applyingPkg === "__all__" ? "spinner" : ""} />
              <span>Apply All Overrides</span>
            </button>
          )}
          {duplicates.length > 0 && (
            <button
              class="flex items-center gap-1.5 h-8 px-3 bg-[#151515] border border-[#3d3a39] hover:bg-[#202020] rounded-[6px] text-xs text-[#f2f2f2] font-medium transition-colors"
              onClick={() => setShowJsonModal(true)}
            >
              <IconCopy size={13} />
              <span>Preview Overrides JSON</span>
            </button>
          )}
          {duplicates.length > 0 && (
            <button
              class="flex items-center gap-1.5 h-8 px-3 bg-[#151515] border border-[#3d3a39] hover:bg-[#202020] rounded-[6px] text-xs text-[#8b949e] hover:text-[#ffffff] font-medium transition-colors"
              onClick={() => void copyMarkdownReport()}
            >
              <IconCopy size={13} />
              <span>Copy Report</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
          <div class="text-[11px] font-medium text-[#8b949e]">Duplicate Packages</div>
          <div class="text-xl font-bold text-[#ffffff] mt-1">{duplicates.length}</div>
        </div>
        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
          <div class="text-[11px] font-medium text-[#f59e0b]">Wasted Versions</div>
          <div class="text-xl font-bold text-[#f59e0b] mt-1">{dedupe.totalWastedVersions}</div>
        </div>
        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
          <div class="text-[11px] font-medium text-[#38bdf8]">Est. Disk Savings</div>
          <div class="text-xl font-bold font-mono text-[#38bdf8] mt-1">
            {dedupe.savings ? `~${dedupe.savings.estimatedHuman}` : "—"}
          </div>
        </div>
        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
          <div class="text-[11px] font-medium text-[#00d992]">Target Override Config</div>
          <div class="text-xl font-bold font-mono text-[#00d992] mt-1">
            {pm === "pnpm" ? "pnpm.overrides" : pm === "yarn" ? "resolutions" : "overrides"}
          </div>
        </div>
      </div>

      {/* Top Bloat Distribution Bar */}
      {duplicates.length > 0 && (
        <div class="bg-[#141414] border border-[#2e2a28] rounded-[8px] p-4 space-y-2.5">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-[#ffffff]">Top Duplicated Transitive Packages</span>
            <span class="text-[#8b949e]">
              Collapsing duplicates saves node_modules footprint & Docker image size
            </span>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            {duplicates.slice(0, 8).map((d) => (
              <button
                key={d.name}
                onClick={() => setSearch(d.name)}
                class="flex items-center gap-1.5 px-2.5 py-1 bg-[#1c1c1c] hover:bg-[#252525] border border-[#333] rounded-[6px] text-xs font-mono text-[#e6edf3] transition-colors"
              >
                <span class="text-[#00d992] font-bold">{d.duplicateCount}x</span>
                <span>{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div class="flex items-center justify-between gap-3 flex-wrap bg-[#141414] p-2.5 rounded-[8px] border border-[#2c2826]">
        <div class="flex items-center gap-3 flex-wrap">
          <div class="flex items-center gap-2 text-xs">
            <span class="text-[#8b949e]">Override Strategy:</span>
            <div class="flex items-center bg-[#101010] p-0.5 border border-[#302c2a] rounded-[6px]">
              <button
                class={`px-2.5 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                  strategy === "highest"
                    ? "bg-[#00d992]/15 text-[#00d992] font-semibold border border-[#00d992]/30"
                    : "text-[#8b949e] hover:text-[#f2f2f2]"
                }`}
                onClick={() => setStrategy("highest")}
              >
                Highest Semver (Recommended)
              </button>
              <button
                class={`px-2.5 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                  strategy === "most-frequent"
                    ? "bg-[#00d992]/15 text-[#00d992] font-semibold border border-[#00d992]/30"
                    : "text-[#8b949e] hover:text-[#f2f2f2]"
                }`}
                onClick={() => setStrategy("most-frequent")}
              >
                Most Frequent
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 h-7 px-2.5 bg-[#1a1a1a] border border-[#3d3a39] rounded-[6px] text-[#8b949e] w-64">
          <IconSearch size={12} />
          <input
            type="text"
            placeholder="Search duplicate package or dependent..."
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            class="bg-transparent border-none outline-none text-xs text-[#f2f2f2] placeholder-[#8b949e] w-full font-mono"
          />
        </div>
      </div>

      {/* Duplicate Packages List */}
      {duplicates.length === 0 ? (
        <div class="flex flex-col items-center justify-center gap-3 py-16 text-center border border-[#2e2a28] rounded-[8px] bg-[#121212]">
          <IconCheckCircle size={38} className="text-[#00d992]" />
          <h3 class="text-sm font-semibold text-[#ffffff]">100% Lockfile Deduplication</h3>
          <p class="text-xs text-[#8b949e]">
            All {dedupe.totalInstalledPackages} packages resolved in {dedupe.lockfileType} are single, clean
            versions without any transitive duplicate bloat.
          </p>
        </div>
      ) : filteredDuplicates.length === 0 ? (
        <div class="text-center py-12 text-xs text-[#8b949e] border border-[#2e2a28] rounded-[8px] bg-[#121212]">
          No duplicate packages match your search filter.
        </div>
      ) : (
        <div class="grid grid-cols-2 gap-4 max-[1000px]:grid-cols-1">
          {filteredDuplicates.map((pkg) => {
            const targetVersion = strategy === "highest" ? pkg.highestVersion : pkg.mostFrequentVersion
            const isApplying = applyingPkg === pkg.name

            return (
              <div
                key={pkg.name}
                class="bg-[#101010] border border-[#2b2726] hover:border-[#4d4845] rounded-[8px] overflow-hidden flex flex-col justify-between transition-all duration-150 shadow-sm"
              >
                <div>
                  {/* Card Header */}
                  <div class="flex items-center justify-between gap-2 px-4 py-3 bg-[#151515] border-b border-[#242120]">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="text-sm font-bold font-mono text-[#ffffff] truncate">{pkg.name}</span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#8b5cf6]/15 text-[#a78bfa] border border-[#8b5cf6]/30 shrink-0">
                        {pkg.duplicateCount} versions
                      </span>
                    </div>
                  </div>

                  {/* Card Body with Versions List */}
                  <div class="p-4 space-y-2">
                    <div class="text-[10.5px] text-[#8b949e] font-mono uppercase tracking-wider">
                      Transitive Installations:
                    </div>
                    <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {pkg.versions.map((verInst) => {
                        const isTarget = verInst.version === targetVersion
                        return (
                          <div
                            key={verInst.version}
                            class={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-[5px] border ${
                              isTarget
                                ? "bg-[#00d992]/10 border-[#00d992]/30 text-[#ffffff]"
                                : "bg-[#161616] border-[#252525] text-[#8b949e]"
                            }`}
                          >
                            <div class="flex items-center gap-2">
                              <span
                                class={`font-mono font-bold ${isTarget ? "text-[#00d992]" : "text-[#d1d5db]"}`}
                              >
                                {verInst.version}
                              </span>
                              {isTarget && (
                                <span class="text-[10px] uppercase font-mono tracking-wider font-semibold text-[#00d992]">
                                  (Target)
                                </span>
                              )}
                            </div>

                            {verInst.dependents.length > 0 && (
                              <div class="text-[10.5px] text-[#6e7681] truncate max-w-[150px] font-mono">
                                via {verInst.dependents.join(", ")}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* 1-Click Single Override Footer */}
                {onFix && (
                  <div class="p-3 bg-[#151515] border-t border-[#262626] flex items-center justify-between">
                    <span class="text-[11px] text-[#8b949e] font-mono">
                      Collapse to: <span class="text-[#00d992] font-bold">{targetVersion}</span>
                    </span>
                    <button
                      class="flex items-center gap-1.5 h-6 px-2.5 bg-[#8b5cf6]/20 hover:bg-[#8b5cf6]/30 border border-[#8b5cf6]/40 text-[#a78bfa] rounded-[5px] text-xs font-semibold transition-colors disabled:opacity-50"
                      onClick={() => void handleApplySingle(pkg)}
                      disabled={isApplying}
                    >
                      <IconWrench size={11} className={isApplying ? "spinner" : ""} />
                      <span>Override to {targetVersion}</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Overrides JSON Modal */}
      {showJsonModal && (
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
          <div
            class="bg-[#121212] border border-[#2e2a28] rounded-[10px] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="px-6 py-4 border-b border-[#2e2a28] flex items-center justify-between bg-[#161616]">
              <div class="flex items-center gap-2.5">
                <IconScissors size={18} className="text-[#00d992]" />
                <h3 class="text-sm font-semibold text-[#ffffff]">
                  Root package.json Overrides Configuration
                </h3>
              </div>
              <button
                onClick={() => setShowJsonModal(false)}
                class="text-[#8b949e] hover:text-[#ffffff] p-1.5 rounded-md hover:bg-[#252525]"
              >
                <IconX size={16} />
              </button>
            </div>

            <div class="px-6 py-4 bg-[#0a0a0a] overflow-y-auto max-h-[50vh] border-b border-[#2e2a28]">
              <pre class="text-xs font-mono text-[#00d992] whitespace-pre leading-relaxed">
                <code>{overridesSnippet}</code>
              </pre>
            </div>

            <div class="px-6 py-3.5 bg-[#161616] flex items-center justify-between gap-3">
              <button
                onClick={() => void copyOverrides()}
                class="flex items-center gap-1.5 h-8 px-3.5 bg-[#202020] hover:bg-[#282828] text-[#d1d5db] hover:text-[#ffffff] rounded-[6px] text-xs font-medium transition-colors"
              >
                <IconCopy size={13} />
                <span>Copy JSON</span>
              </button>
              <div class="flex items-center gap-2">
                {onFix && duplicates.length > 0 && (
                  <button
                    onClick={async () => {
                      setShowJsonModal(false)
                      await handleApplyAll()
                    }}
                    class="flex items-center gap-1.5 h-8 px-4 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
                  >
                    <IconZap size={13} />
                    <span>Apply to package.json</span>
                  </button>
                )}
                <button
                  onClick={() => setShowJsonModal(false)}
                  class="h-8 px-4 bg-[#252525] hover:bg-[#303030] text-[#8b949e] hover:text-[#ffffff] rounded-[6px] text-xs font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
