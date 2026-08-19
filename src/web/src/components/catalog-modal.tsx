import { useMemo, useState } from "preact/hooks"
import type { CatalogPlan, ScanResult } from "../../../types"
import { IconCheckCircle, IconXCircle, IconZap } from "./icons"

interface CatalogModalProps {
  data: ScanResult
  isOpen: boolean
  onClose: () => void
  notify: (msg: string) => void
  onMigrate: (options: {
    action: "catalog-migrate"
    catalogStrategy: "highest" | "most-frequent"
    catalogAll: boolean
  }) => Promise<{ ok: boolean; count: number; result: ScanResult | null }>
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

export function CatalogModal({ data, isOpen, onClose, notify, onMigrate }: CatalogModalProps) {
  const [strategy, setStrategy] = useState<"highest" | "most-frequent">("highest")
  const [catalogAll, setCatalogAll] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [search, setSearch] = useState("")

  // Calculate live preview plan based on chosen strategy and toggle
  const plan = useMemo<CatalogPlan>(() => {
    const internalWorkspaceNames = new Set<string>()
    for (const ws of data.workspaces) {
      if (ws.name) internalWorkspaceNames.add(ws.name)
    }

    const pkgUsages = new Map<string, Array<{ workspace: string; version: string; type: string }>>()

    for (const ws of data.workspaces) {
      for (const [depName, depRecord] of Object.entries(ws.deps)) {
        if (internalWorkspaceNames.has(depName)) continue
        if (depRecord.version.startsWith("catalog:") || depRecord.version.startsWith("workspace:")) {
          continue
        }
        if (depRecord.type === "peer" || depRecord.type === "optional") continue

        if (!pkgUsages.has(depName)) {
          pkgUsages.set(depName, [])
        }
        pkgUsages.get(depName)!.push({
          workspace: ws.relPath,
          version: depRecord.version,
          type: depRecord.type,
        })
      }
    }

    const catalogEntries = []
    const affectedWorkspaceFiles = new Set<string>()

    for (const [pkgName, usages] of pkgUsages.entries()) {
      const workspaces = Array.from(new Set(usages.map((u) => u.workspace))).sort()
      const isConflicted = data.conflicts.some((c) => c.name === pkgName)
      const isShared = workspaces.length >= 2
      if (!catalogAll && !isShared && !isConflicted) {
        continue
      }

      const previousVersions: Record<string, string> = {}
      for (const u of usages) {
        previousVersions[u.workspace] = u.version
        affectedWorkspaceFiles.add(u.workspace)
      }

      let targetVersion = ""
      if (strategy === "most-frequent") {
        const counts = new Map<string, number>()
        for (const u of usages) {
          counts.set(u.version, (counts.get(u.version) ?? 0) + 1)
        }
        let maxCount = 0
        for (const [ver, count] of counts.entries()) {
          if (count > maxCount || (count === maxCount && compareSemver(ver, targetVersion) > 0)) {
            maxCount = count
            targetVersion = ver
          }
        }
      } else {
        targetVersion = usages[0]!.version
        for (const u of usages) {
          if (compareSemver(u.version, targetVersion) > 0) {
            targetVersion = u.version
          }
        }
      }

      catalogEntries.push({
        name: pkgName,
        targetVersion,
        workspacesCount: workspaces.length,
        workspaces,
        previousVersions,
      })
    }

    catalogEntries.sort((a, b) => b.workspacesCount - a.workspacesCount || a.name.localeCompare(b.name))

    return {
      catalogEntries,
      strategy,
      totalPackages: catalogEntries.length,
      totalWorkspacesUpdated: affectedWorkspaceFiles.size,
      pnpmWorkspaceYamlPath: "pnpm-workspace.yaml",
      existingCatalogCount: 0,
      updatedWorkspaceFiles: Array.from(affectedWorkspaceFiles).sort(),
    }
  }, [data, strategy, catalogAll])

  const filteredEntries = useMemo(() => {
    if (!search) return plan.catalogEntries
    const q = search.toLowerCase()
    return plan.catalogEntries.filter(
      (e) => e.name.toLowerCase().includes(q) || e.workspaces.some((w) => w.toLowerCase().includes(q))
    )
  }, [plan, search])

  if (!isOpen) return null

  const handleApply = async () => {
    setMigrating(true)
    try {
      const res = await onMigrate({
        action: "catalog-migrate",
        catalogStrategy: strategy,
        catalogAll,
      })
      if (res.ok) {
        notify(
          `✔ Successfully centralized ${plan.totalPackages} dependencies into pnpm-workspace.yaml catalog:!`
        )
        onClose()
      } else {
        notify("Migration failed. Check server logs.")
      }
    } catch (err) {
      notify(`Migration error: ${String(err)}`)
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in">
      <div
        class="bg-[#121212] border border-[#3d3a39] rounded-[10px] w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="px-6 py-4 border-b border-[#2e2a28] flex items-center justify-between bg-[#171717]">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-[6px] bg-[#00d992]/15 text-[#00d992] flex items-center justify-center">
              <IconZap size={16} />
            </div>
            <div>
              <h2 class="text-base font-semibold text-[#ffffff] flex items-center gap-2">
                <span>Migrate to Centralized Monorepo Catalog</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#00d992]/15 text-[#00d992] border border-[#00d992]/30">
                  pnpm catalog:
                </span>
              </h2>
              <p class="text-xs text-[#8b949e] mt-0.5">
                Centralizes dependency versions in <code class="text-[#f2f2f2]">pnpm-workspace.yaml</code> and
                converts workspace manifests to <code class="text-[#f2f2f2]">"catalog:"</code>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            class="text-[#8b949e] hover:text-[#ffffff] p-1 rounded hover:bg-[#252525] transition-colors"
          >
            <IconXCircle size={18} />
          </button>
        </div>

        {/* Configuration Controls Bar */}
        <div class="px-6 py-3 bg-[#151515] border-b border-[#2e2a28] flex items-center justify-between gap-4 flex-wrap text-xs">
          {/* Strategy Selector */}
          <div class="flex items-center gap-2">
            <span class="text-[#8b949e]">Version Strategy:</span>
            <div class="flex items-center bg-[#1a1a1a] p-0.5 border border-[#3d3a39] rounded-[6px]">
              <button
                class={`px-2.5 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                  strategy === "highest"
                    ? "bg-[#00d992]/15 text-[#00d992] font-semibold border border-[#00d992]/30 shadow-xs"
                    : "text-[#8b949e] hover:text-[#ffffff]"
                }`}
                onClick={() => setStrategy("highest")}
              >
                Highest Semver
              </button>
              <button
                class={`px-2.5 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                  strategy === "most-frequent"
                    ? "bg-[#00d992]/15 text-[#00d992] font-semibold border border-[#00d992]/30 shadow-xs"
                    : "text-[#8b949e] hover:text-[#ffffff]"
                }`}
                onClick={() => setStrategy("most-frequent")}
              >
                Most Frequent
              </button>
            </div>
          </div>

          {/* Scope Toggle */}
          <label class="flex items-center gap-2 cursor-pointer text-[#8b949e] hover:text-[#ffffff]">
            <input
              type="checkbox"
              checked={catalogAll}
              onChange={(e) => setCatalogAll((e.target as HTMLInputElement).checked)}
              class="rounded bg-[#1a1a1a] border-[#3d3a39] text-[#00d992] focus:ring-0 focus:ring-offset-0"
            />
            <span>Include single-workspace packages</span>
          </label>
        </div>

        {/* Search & KPI Summary */}
        <div class="px-6 py-2.5 bg-[#101010] border-b border-[#252525] flex items-center justify-between gap-3 flex-wrap">
          <div class="text-xs text-[#8b949e]">
            Found <span class="font-bold text-[#ffffff]">{plan.totalPackages}</span> packages to catalog
            across <span class="font-bold text-[#ffffff]">{plan.totalWorkspacesUpdated}</span> workspaces
          </div>
          <input
            type="text"
            placeholder="Search packages..."
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            class="h-7 w-48 px-2.5 bg-[#1a1a1a] border border-[#3d3a39] rounded text-xs text-[#ffffff] placeholder-[#8b949e] focus:outline-none focus:border-[#00d992]"
          />
        </div>

        {/* Preview List */}
        <div class="flex-1 overflow-y-auto p-6 space-y-2.5">
          {filteredEntries.length === 0 ? (
            <div class="text-center py-10 text-xs text-[#8b949e]">No packages match your search filter.</div>
          ) : (
            filteredEntries.map((entry) => (
              <div
                key={entry.name}
                class="bg-[#171717] border border-[#2e2a28] rounded-[6px] p-3 flex items-center justify-between gap-3 text-xs"
              >
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-sm text-[#ffffff]">{entry.name}</span>
                    <span class="font-mono text-[#00d992] bg-[#00d992]/10 border border-[#00d992]/25 px-1.5 py-0.5 rounded text-[11px] font-semibold">
                      ➔ {entry.targetVersion}
                    </span>
                    <span class="text-[#8b949e] text-[11px]">
                      ({entry.workspacesCount} workspace{entry.workspacesCount > 1 ? "s" : ""})
                    </span>
                  </div>
                  <div class="text-[11px] text-[#8b949e] mt-1 flex items-center gap-2 flex-wrap font-mono">
                    {entry.workspaces.map((ws) => (
                      <span key={ws} class="bg-[#101010] px-1.5 py-0.5 rounded border border-[#2c2826]">
                        {ws}: <span class="text-[#bdbdbd]">{entry.previousVersions[ws]}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div class="shrink-0 text-right">
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono text-[#8b949e] bg-[#1a1a1a] border border-[#3d3a39]">
                    "catalog:"
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div class="px-6 py-4 border-t border-[#2e2a28] bg-[#171717] flex items-center justify-between gap-4">
          <div class="text-[11px] text-[#8b949e]">
            Creates <code class="text-[#f2f2f2]">pnpm-workspace.yaml</code> and updates manifests atomically.
          </div>

          <div class="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={migrating}
              class="h-8 px-3.5 bg-[#202020] hover:bg-[#282828] border border-[#3d3a39] text-[#f2f2f2] rounded-[6px] text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={migrating || plan.totalPackages === 0}
              class="h-8 px-4 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] font-semibold rounded-[6px] text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <IconCheckCircle size={14} />
              <span>
                {migrating ? "Migrating..." : `Apply Catalog Migration (${plan.totalPackages} pkgs)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
