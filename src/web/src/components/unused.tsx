import { useMemo, useState } from "preact/hooks"
import type { PhantomDependency, ScanResult, UnusedDependency } from "../../../types"
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconFileText,
  IconFolder,
  IconPlus,
  IconSearch,
  IconTrash,
  IconZap,
} from "./icons"

interface UnusedProps {
  data: ScanResult
  notify: (message: string) => void
  onFix?: (payload: {
    action?: "align" | "remove-unused" | "declare-phantom"
    unused?: Array<{ workspace: string; pkg: string; type?: string }>
    phantoms?: Array<{ workspace: string; pkg: string; version: string; type?: "prod" | "dev" }>
  }) => Promise<void>
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/")
}

export function UnusedView({ data, notify, onFix }: UnusedProps) {
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<"all" | "phantoms" | "unused-prod" | "unused-dev">("all")
  const [fixing, setFixing] = useState<string | null>(null)
  const [phantomVersions, setPhantomVersions] = useState<Record<string, string>>({})

  const unusedResult = data.unused ?? { phantoms: [], unused: [], scannedFilesCount: 0 }
  const { phantoms, unused, scannedFilesCount } = unusedResult

  const prodUnused = useMemo(() => unused.filter((u) => u.type === "prod"), [unused])
  const devUnused = useMemo(() => unused.filter((u) => u.type !== "prod"), [unused])

  // Filtered lists based on search and tab filter
  const filteredPhantoms = useMemo(() => {
    if (filterType === "unused-prod" || filterType === "unused-dev") return []
    return phantoms.filter((p) => {
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.workspace.toLowerCase().includes(q)
    })
  }, [phantoms, search, filterType])

  const filteredUnused = useMemo(() => {
    if (filterType === "phantoms") return []
    return unused.filter((u) => {
      if (filterType === "unused-prod" && u.type !== "prod") return false
      if (filterType === "unused-dev" && u.type === "prod") return false
      if (filterType === "all" && u.type !== "prod") return false // In 'All', show active issues (Phantoms + Unused Prod)
      const q = search.toLowerCase()
      return u.name.toLowerCase().includes(q) || u.workspace.toLowerCase().includes(q)
    })
  }, [unused, search, filterType])

  // Handle Declare Single Phantom
  const handleDeclarePhantom = async (p: PhantomDependency) => {
    if (!onFix) {
      notify("Remediation is only available in interactive UI server mode.")
      return
    }
    const version = phantomVersions[`${p.workspace}:${p.name}`] || p.suggestedVersion || "^latest"
    const isRootOrScript =
      p.workspace === "." || p.files.some((f) => f.includes("scripts/") || f.includes("migrations/"))
    const depType = isRootOrScript ? "dev" : "prod"
    const fixKey = `phantom:${p.workspace}:${p.name}`
    setFixing(fixKey)
    try {
      await onFix({
        action: "declare-phantom",
        phantoms: [
          {
            workspace: p.workspace,
            pkg: p.name,
            version,
            type: depType,
          },
        ],
      })
      notify(`✔ Declared ${p.name}@${version} in ${p.workspace}/package.json (${depType}Dependencies)`)
    } catch (err) {
      notify(`Failed to declare ${p.name}: ${String(err)}`)
    } finally {
      setFixing(null)
    }
  }

  // Handle Remove Single Unused
  const handleRemoveUnused = async (u: UnusedDependency) => {
    if (!onFix) {
      notify("Remediation is only available in interactive UI server mode.")
      return
    }
    const fixKey = `unused:${u.workspace}:${u.name}`
    setFixing(fixKey)
    try {
      await onFix({
        action: "remove-unused",
        unused: [
          {
            workspace: u.workspace,
            pkg: u.name,
            type: u.type,
          },
        ],
      })
      notify(`✔ Removed ${u.name} from ${u.workspace}/package.json`)
    } catch (err) {
      notify(`Failed to remove ${u.name}: ${String(err)}`)
    } finally {
      setFixing(null)
    }
  }

  // Handle Batch Declare All Phantoms
  const handleBatchDeclarePhantoms = async () => {
    if (!onFix || phantoms.length === 0) return
    setFixing("batch-phantoms")
    try {
      const items = phantoms.map((p) => {
        const isRootOrScript =
          p.workspace === "." || p.files.some((f) => f.includes("scripts/") || f.includes("migrations/"))
        return {
          workspace: p.workspace,
          pkg: p.name,
          version: phantomVersions[`${p.workspace}:${p.name}`] || p.suggestedVersion || "^latest",
          type: (isRootOrScript ? "dev" : "prod") as "dev" | "prod",
        }
      })
      await onFix({
        action: "declare-phantom",
        phantoms: items,
      })
      notify(`✔ Declared ${items.length} phantom dependencies across workspaces`)
    } catch (err) {
      notify(`Batch fix failed: ${String(err)}`)
    } finally {
      setFixing(null)
    }
  }

  // Handle Batch Remove All Unused Prod Deps
  const handleBatchRemoveUnusedProd = async () => {
    if (!onFix || prodUnused.length === 0) return
    setFixing("batch-unused-prod")
    try {
      const items = prodUnused.map((u) => ({
        workspace: u.workspace,
        pkg: u.name,
        type: u.type,
      }))
      await onFix({
        action: "remove-unused",
        unused: items,
      })
      notify(`✔ Removed ${items.length} unused production dependencies`)
    } catch (err) {
      notify(`Batch removal failed: ${String(err)}`)
    } finally {
      setFixing(null)
    }
  }

  const activeIssuesCount = phantoms.length + prodUnused.length

  return (
    <div class="space-y-6 w-full">
      {/* Top Header */}
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">
            SOURCE CODE HYGIENE & DEPENDENCIES
          </div>
          <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff]">Phantom & Unused Dependencies</h1>
        </div>

        {/* Top KPI Metrics Bar */}
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-2 h-8 px-3 bg-[#101010] border border-[#3d3a39] rounded-[6px] text-xs">
            <span class="text-[#8b949e]">Files Scanned:</span>
            <span class="font-mono font-bold text-[#ffffff]">{scannedFilesCount}</span>
          </div>

          <div
            class={`flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-xs font-semibold border ${
              phantoms.length > 0
                ? "bg-[#f43f5e]/10 text-[#f43f5e] border-[#f43f5e]/30"
                : "bg-[#00d992]/10 text-[#00d992] border-[#00d992]/30"
            }`}
          >
            {phantoms.length > 0 ? <IconAlertTriangle size={13} /> : <IconCheckCircle size={13} />}
            <span>{phantoms.length > 0 ? `${phantoms.length} Phantom (Undeclared)` : "0 Phantoms"}</span>
          </div>

          <div
            class={`flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-xs font-semibold border ${
              prodUnused.length > 0
                ? "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30"
                : "bg-[#00d992]/10 text-[#00d992] border-[#00d992]/30"
            }`}
          >
            {prodUnused.length > 0 ? <IconAlertTriangle size={13} /> : <IconCheckCircle size={13} />}
            <span>{prodUnused.length > 0 ? `${prodUnused.length} Unused Prod Deps` : "0 Unused Prod"}</span>
          </div>

          {devUnused.length > 0 && (
            <div class="flex items-center gap-2 h-8 px-3 bg-[#101010] border border-[#3d3a39] rounded-[6px] text-xs">
              <span class="text-[#8b949e]">Dev / Tools:</span>
              <span class="font-mono font-bold text-[#8b949e]">{devUnused.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Fix Banner */}
      {onFix && activeIssuesCount > 0 && (
        <div class="bg-[#151515] border border-[#3d3a39] rounded-[8px] p-4 flex items-center justify-between gap-4 flex-wrap">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-[6px] bg-[#00d992]/10 text-[#00d992] flex items-center justify-center shrink-0">
              <IconZap size={16} />
            </div>
            <div>
              <div class="text-xs font-semibold text-[#ffffff]">Automated Quick Remediation Available:</div>
              <div class="text-[11px] text-[#8b949e] mt-0.5">
                Automatically declare missing phantom imports and remove dead packages across workspace
                manifests.
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            {phantoms.length > 0 && (
              <button
                disabled={fixing !== null}
                onClick={handleBatchDeclarePhantoms}
                class="h-7 px-3 bg-[#00d992]/15 hover:bg-[#00d992]/25 border border-[#00d992]/40 text-[#00d992] rounded-[6px] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <IconPlus size={12} />
                <span>
                  {fixing === "batch-phantoms" ? "Declaring..." : `Declare All Phantoms (${phantoms.length})`}
                </span>
              </button>
            )}

            {prodUnused.length > 0 && (
              <button
                disabled={fixing !== null}
                onClick={handleBatchRemoveUnusedProd}
                class="h-7 px-3 bg-[#f43f5e]/15 hover:bg-[#f43f5e]/25 border border-[#f43f5e]/40 text-[#f43f5e] rounded-[6px] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <IconTrash size={12} />
                <span>
                  {fixing === "batch-unused-prod"
                    ? "Removing..."
                    : `Remove All Unused Prod (${prodUnused.length})`}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toolbar: Search and Filter Tabs */}
      <div class="flex items-center justify-between gap-3 bg-[#101010] border border-[#3d3a39] px-4 py-2.5 rounded-[8px] flex-wrap">
        <div class="flex items-center gap-3">
          <div class="relative w-64">
            <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8b949e]" />
            <input
              type="text"
              placeholder="Search package or workspace..."
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              class="w-full h-7 pl-8 pr-2.5 bg-[#1a1a1a] border border-[#3d3a39] rounded-[6px] text-xs text-[#ffffff] placeholder-[#8b949e] focus:outline-none focus:border-[#00d992]"
            />
          </div>

          <div class="flex items-center bg-[#1a1a1a] p-0.5 border border-[#3d3a39] rounded-[6px]">
            <button
              class={`px-2.5 py-1 text-xs font-medium rounded-[4px] transition-colors ${
                filterType === "all"
                  ? "bg-[#252525] text-[#ffffff] shadow-sm"
                  : "text-[#8b949e] hover:text-[#f2f2f2]"
              }`}
              onClick={() => setFilterType("all")}
            >
              All Active ({activeIssuesCount})
            </button>
            <button
              class={`px-2.5 py-1 text-xs font-medium rounded-[4px] transition-colors ${
                filterType === "phantoms"
                  ? "bg-[#252525] text-[#f43f5e] font-semibold shadow-sm"
                  : "text-[#8b949e] hover:text-[#f2f2f2]"
              }`}
              onClick={() => setFilterType("phantoms")}
            >
              Phantoms ({phantoms.length})
            </button>
            <button
              class={`px-2.5 py-1 text-xs font-medium rounded-[4px] transition-colors ${
                filterType === "unused-prod"
                  ? "bg-[#252525] text-[#f59e0b] font-semibold shadow-sm"
                  : "text-[#8b949e] hover:text-[#f2f2f2]"
              }`}
              onClick={() => setFilterType("unused-prod")}
            >
              Unused Prod ({prodUnused.length})
            </button>
            <button
              class={`px-2.5 py-1 text-xs font-medium rounded-[4px] transition-colors ${
                filterType === "unused-dev"
                  ? "bg-[#252525] text-[#ffffff] shadow-sm"
                  : "text-[#8b949e] hover:text-[#f2f2f2]"
              }`}
              onClick={() => setFilterType("unused-dev")}
            >
              Dev Tools ({devUnused.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Sections */}
      {filteredPhantoms.length === 0 && filteredUnused.length === 0 ? (
        <div class="p-12 text-center bg-[#101010] border border-[#3d3a39] rounded-[8px] space-y-3">
          <div class="w-12 h-12 rounded-full bg-[#00d992]/10 text-[#00d992] flex items-center justify-center mx-auto">
            <IconCheckCircle size={24} />
          </div>
          <h3 class="text-base font-semibold text-[#ffffff]">Flawless Source Code Dependency Hygiene</h3>
          <p class="text-xs text-[#8b949e] max-w-md mx-auto leading-relaxed">
            All imported packages are properly declared in their respective workspace manifests, and no dead
            or undeclared phantom dependencies were found across {scannedFilesCount} scanned source & config
            files.
          </p>
        </div>
      ) : (
        <div class="space-y-8">
          {/* 1. Phantom Dependencies Section */}
          {filteredPhantoms.length > 0 && (
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-[#f43f5e]" />
                  <h2 class="text-sm font-bold text-[#ffffff] uppercase tracking-wider">
                    Phantom (Undeclared) Dependencies ({filteredPhantoms.length})
                  </h2>
                </div>
                <span class="text-xs text-[#8b949e]">
                  Imported in source files but missing from <code class="text-[#f2f2f2]">package.json</code>
                </span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {filteredPhantoms.map((p) => {
                  const fixKey = `phantom:${p.workspace}:${p.name}`
                  const isFixing = fixing === fixKey
                  const targetVer =
                    phantomVersions[`${p.workspace}:${p.name}`] ?? p.suggestedVersion ?? "^latest"
                  const isRootScript =
                    p.workspace === "." &&
                    p.files.some((f) => f.includes("scripts/") || f.includes("migrations/"))

                  return (
                    <div
                      key={fixKey}
                      class="bg-[#121212] border border-[#f43f5e]/40 rounded-[8px] p-4 flex flex-col justify-between space-y-3 relative group hover:border-[#f43f5e] transition-colors"
                    >
                      <div>
                        <div class="flex items-start justify-between gap-2 mb-1.5">
                          <div class="min-w-0">
                            <span class="font-mono font-bold text-sm text-[#ffffff] flex items-center gap-1.5">
                              <span>{p.name}</span>
                              <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30">
                                UNDECLARED
                              </span>
                              {isRootScript && (
                                <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-[#00d992]/15 text-[#00d992] border border-[#00d992]/30">
                                  SCRIPT / TOOLING
                                </span>
                              )}
                            </span>
                            <div class="font-mono text-xs text-[#8b949e] flex items-center gap-1 mt-0.5">
                              <IconFolder size={11} className="text-[#605c5a]" />
                              <span>{normalizePath(p.workspace)}</span>
                            </div>
                          </div>

                          {p.hoistedFrom && (
                            <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-[#1c1c1c] border border-[#3d3a39] text-[#8b949e] shrink-0">
                              hoisted from {p.hoistedFrom}
                            </span>
                          )}
                        </div>

                        {/* List of imported files */}
                        <div class="mt-2.5 space-y-1">
                          <div class="text-[10px] uppercase font-bold text-[#8b949e]">
                            Imported in ({p.files.length} file{p.files.length > 1 ? "s" : ""}):
                          </div>
                          <div class="max-h-20 overflow-y-auto space-y-1 pr-1 font-mono text-[11px] text-[#bdbdbd]">
                            {p.files.map((file, i) => (
                              <div key={i} class="flex items-center gap-1.5 truncate">
                                <IconFileText size={11} className="text-[#8b949e] shrink-0" />
                                <span class="truncate">{normalizePath(file)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Action Footer */}
                      <div class="flex items-center justify-between gap-2 pt-2.5 border-t border-[#2e2a28]">
                        <div class="flex items-center gap-1.5">
                          <span class="text-[11px] text-[#8b949e]">Version:</span>
                          <input
                            type="text"
                            value={targetVer}
                            onInput={(e) =>
                              setPhantomVersions({
                                ...phantomVersions,
                                [`${p.workspace}:${p.name}`]: (e.target as HTMLInputElement).value,
                              })
                            }
                            class="w-24 h-6 px-2 bg-[#1a1a1a] border border-[#3d3a39] rounded text-xs font-mono text-[#ffffff] focus:outline-none focus:border-[#00d992]"
                          />
                        </div>

                        {onFix && (
                          <button
                            disabled={fixing !== null}
                            onClick={() => handleDeclarePhantom(p)}
                            class="h-6 px-2.5 bg-[#00d992]/15 hover:bg-[#00d992]/25 border border-[#00d992]/40 text-[#00d992] rounded text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            <IconPlus size={12} />
                            <span>
                              {isFixing
                                ? "Declaring..."
                                : isRootScript
                                  ? "Declare in root devDeps"
                                  : "Declare in package.json"}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 2. Unused Dependencies Section */}
          {filteredUnused.length > 0 && (
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
                  <h2 class="text-sm font-bold text-[#ffffff] uppercase tracking-wider">
                    {filterType === "unused-dev"
                      ? `Dev Tooling & Build Config (${filteredUnused.length})`
                      : `Unused (Dead) Dependencies (${filteredUnused.length})`}
                  </h2>
                </div>
                <span class="text-xs text-[#8b949e]">
                  {filterType === "unused-dev"
                    ? "Configured build tools, plugins, and CLI packages"
                    : "Declared in manifests but never imported in any scanned source or config file"}
                </span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {filteredUnused.map((u) => {
                  const fixKey = `unused:${u.workspace}:${u.name}`
                  const isFixing = fixing === fixKey
                  const isProd = u.type === "prod"

                  return (
                    <div
                      key={fixKey}
                      class={`bg-[#121212] border rounded-[8px] p-3.5 flex items-center justify-between gap-3 transition-colors ${
                        isProd
                          ? "border-[#f59e0b]/40 hover:border-[#f59e0b]"
                          : "border-[#3d3a39] hover:border-[#8b949e]"
                      }`}
                    >
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="font-mono font-bold text-sm text-[#ffffff] truncate">{u.name}</span>
                          <span class="font-mono text-xs text-[#8b949e]">{u.version}</span>
                          <span
                            class={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                              isProd
                                ? "bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30"
                                : "bg-[#1c1c1c] text-[#8b949e] border border-[#3d3a39]"
                            }`}
                          >
                            {u.type}
                          </span>
                          {u.isDevTool && (
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-mono text-[#8b949e] bg-[#1c1c1c] border border-[#3d3a39]">
                              dev tool
                            </span>
                          )}
                        </div>

                        <div class="font-mono text-xs text-[#8b949e] flex items-center gap-1 mt-1">
                          <IconFolder size={11} className="text-[#605c5a]" />
                          <span>{normalizePath(u.workspace)}</span>
                        </div>
                      </div>

                      {onFix && (
                        <button
                          disabled={fixing !== null}
                          onClick={() => handleRemoveUnused(u)}
                          class="h-6 px-2.5 bg-[#f43f5e]/15 hover:bg-[#f43f5e]/25 border border-[#f43f5e]/40 text-[#f43f5e] rounded text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 shrink-0"
                        >
                          <IconTrash size={12} />
                          <span>{isFixing ? "Removing..." : "Remove"}</span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
