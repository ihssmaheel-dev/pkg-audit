import { useState, useMemo } from "preact/hooks"
import type { DeprecationSummary } from "../types.js"
import {
  IconAlertTriangle,
  IconExternalLink,
  IconFolder,
  IconSearch,
  IconShield,
  IconXCircle,
} from "./icons.js"

interface DeprecationProps {
  deprecation: DeprecationSummary | null
}

type FilterType = "all" | "deprecated" | "abandoned" | "prod" | "dev"

function normalizePath(p: string): string {
  return p === "." ? "root" : p.replace(/\\/g, "/")
}

export function DeprecationView({ deprecation }: DeprecationProps) {
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<FilterType>("all")

  const packages = useMemo(() => deprecation?.packages ?? [], [deprecation])

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      // Filter by type
      if (filterType === "deprecated" && !pkg.deprecated) return false
      if (filterType === "abandoned" && !pkg.isAbandoned) return false
      if (filterType === "prod" && !pkg.isProd) return false
      if (filterType === "dev" && !pkg.isDev) return false

      // Filter by search query
      if (search.trim()) {
        const q = search.toLowerCase().trim()
        const matchesName = pkg.name.toLowerCase().includes(q)
        const matchesReason = pkg.deprecationReason?.toLowerCase().includes(q)
        const matchesReplacement = pkg.replacementSuggestion?.toLowerCase().includes(q)
        const matchesWs = pkg.workspaces.some((w) => w.workspace.toLowerCase().includes(q))
        return matchesName || matchesReason || matchesReplacement || matchesWs
      }

      return true
    })
  }, [packages, filterType, search])

  const totalScanned = deprecation?.totalScanned ?? 0
  const totalDeprecated = deprecation?.totalDeprecated ?? 0
  const totalAbandoned = deprecation?.totalAbandoned ?? 0
  const prodDeprecated = deprecation?.deprecatedInProd ?? 0
  const healthyCount = Math.max(0, totalScanned - totalDeprecated)

  return (
    <div class="space-y-6">
      {/* View Header */}
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">
            PACKAGE HEALTH & DEPRECATION
          </div>
          <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff]">
            Deprecated & Abandoned Packages
          </h1>
          <p class="text-xs text-[#8b949e] mt-1">
            Audit dependencies for official npm author deprecation notices and unmaintained packages.
          </p>
        </div>
      </div>

      {/* KPI Summary Scorecard */}
      <div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[500px]:grid-cols-1">
        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-4 flex flex-col justify-between">
          <div class="flex items-center justify-between text-[#8b949e]">
            <span class="text-xs uppercase font-mono tracking-wider">Deprecated</span>
            <IconXCircle size={15} className="text-[#f43f5e]" />
          </div>
          <div class="mt-2">
            <span class="text-2xl font-mono font-bold text-[#f43f5e]">{totalDeprecated}</span>
            <span class="text-xs text-[#8b949e] ml-2 font-mono">({prodDeprecated} in prod)</span>
          </div>
        </div>

        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-4 flex flex-col justify-between">
          <div class="flex items-center justify-between text-[#8b949e]">
            <span class="text-xs uppercase font-mono tracking-wider">Abandoned</span>
            <IconAlertTriangle size={15} className="text-[#f59e0b]" />
          </div>
          <div class="mt-2">
            <span class="text-2xl font-mono font-bold text-[#f59e0b]">{totalAbandoned}</span>
            <span class="text-xs text-[#8b949e] ml-2 font-mono">&gt;2 yrs unmaintained</span>
          </div>
        </div>

        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-4 flex flex-col justify-between">
          <div class="flex items-center justify-between text-[#8b949e]">
            <span class="text-xs uppercase font-mono tracking-wider">Healthy</span>
            <IconShield size={15} className="text-[#00d992]" />
          </div>
          <div class="mt-2">
            <span class="text-2xl font-mono font-bold text-[#00d992]">{healthyCount}</span>
            <span class="text-xs text-[#8b949e] ml-2 font-mono">active packages</span>
          </div>
        </div>

        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-4 flex flex-col justify-between">
          <div class="flex items-center justify-between text-[#8b949e]">
            <span class="text-xs uppercase font-mono tracking-wider">Total Scanned</span>
            <span class="w-2 h-2 rounded-full bg-[#8b949e]" />
          </div>
          <div class="mt-2">
            <span class="text-2xl font-mono font-bold text-[#ffffff]">{totalScanned}</span>
            <span class="text-xs text-[#8b949e] ml-2 font-mono">unique packages</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-1.5 bg-[#121212] border border-[#2e2a28] p-1 rounded-[6px]">
          {(
            [
              ["all", `All (${packages.length})`],
              ["deprecated", `Deprecated (${totalDeprecated})`],
              ["abandoned", `Abandoned (${totalAbandoned})`],
              ["prod", "Production"],
              ["dev", "Dev"],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              class={`px-3 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                filterType === type
                  ? "bg-[#252525] text-[#ffffff]"
                  : "text-[#8b949e] hover:text-[#ffffff] hover:bg-[#1a1a1a]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div class="relative w-64 max-[640px]:w-full">
          <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]" />
          <input
            type="text"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            placeholder="Search package or replacement..."
            class="w-full h-8 pl-8 pr-3 bg-[#121212] border border-[#2e2a28] rounded-[6px] text-xs font-mono text-[#ffffff] placeholder-[#8b949e] focus:outline-none focus:border-[#00d992]"
          />
        </div>
      </div>

      {/* Package Deprecation Cards List */}
      {filteredPackages.length === 0 ? (
        <div class="p-8 text-center bg-[#121212] border border-[#2e2a28] rounded-[8px]">
          <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#00d992]/10 text-[#00d992] mb-3">
            <IconShield size={20} />
          </div>
          <h3 class="text-sm font-bold text-[#ffffff]">No Deprecated or Abandoned Packages Found</h3>
          <p class="text-xs text-[#8b949e] mt-1">
            {packages.length === 0
              ? "All declared dependencies across your monorepo are actively maintained and non-deprecated."
              : "No packages match the current filter or search criteria."}
          </p>
        </div>
      ) : (
        <div class="grid grid-cols-2 gap-4 max-[1000px]:grid-cols-1">
          {filteredPackages.map((pkg) => {
            const npmUrl = `https://www.npmjs.com/package/${pkg.name}`

            return (
              <div
                key={`${pkg.name}-${pkg.version}`}
                class="bg-[#101010] border border-[#2b2726] hover:border-[#4d4845] rounded-[8px] overflow-hidden flex flex-col justify-between transition-all duration-150 shadow-sm"
              >
                <div>
                  {/* Card Header */}
                  <div class="flex items-center justify-between gap-2 px-4 py-3 bg-[#151515] border-b border-[#242120]">
                    <div class="flex items-center gap-2 min-w-0 flex-wrap">
                      <span class="text-sm font-bold font-mono text-[#ffffff] truncate">{pkg.name}</span>
                      <span class="text-xs font-mono text-[#8b949e]">v{pkg.version}</span>
                      {pkg.deprecated && (
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30 shrink-0">
                          DEPRECATED
                        </span>
                      )}
                      {pkg.isAbandoned && (
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30 shrink-0">
                          ABANDONED
                        </span>
                      )}
                      <span
                        class={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                          pkg.isProd
                            ? "bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30"
                            : "bg-[#1c1c1c] text-[#8b949e] border border-[#3d3a39]"
                        }`}
                      >
                        {pkg.isProd ? "PROD" : "DEV"}
                      </span>
                    </div>

                    <div class="font-mono text-xs text-[#8b949e] shrink-0">
                      {pkg.workspaces.length} workspace{pkg.workspaces.length > 1 ? "s" : ""}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div class="p-4 space-y-3">
                    {/* Deprecation Notice */}
                    {pkg.deprecationReason && (
                      <div class="bg-[#181818] border border-[#2e2a28] rounded-[6px] p-3 space-y-1">
                        <span class="text-[10px] uppercase font-mono font-bold text-[#f43f5e] block">
                          Official Deprecation Notice:
                        </span>
                        <div class="text-xs text-[#f2f2f2] font-mono leading-relaxed break-words">
                          {pkg.deprecationReason}
                        </div>
                      </div>
                    )}

                    {/* Replacement Recommendation */}
                    {pkg.replacementSuggestion && (
                      <div class="flex items-center gap-2 text-xs bg-[#00d992]/10 border border-[#00d992]/25 rounded-[6px] px-3 py-2">
                        <span class="font-bold text-[#00d992] text-[11px] shrink-0">
                          💡 Recommended Replacement:
                        </span>
                        <span class="font-mono text-[#ffffff] font-semibold truncate">
                          {pkg.replacementSuggestion}
                        </span>
                      </div>
                    )}

                    {/* Last Release Date */}
                    {pkg.lastPublished && (
                      <div class="text-xs text-[#8b949e] flex items-center justify-between font-mono">
                        <span>Last Published:</span>
                        <span class="text-[#bdbdbd]">
                          {new Date(pkg.lastPublished).toISOString().slice(0, 10)}{" "}
                          <span class="text-[#f59e0b]">({pkg.yearsSinceLastRelease} years ago)</span>
                        </span>
                      </div>
                    )}

                    {/* Workspace List */}
                    <div class="space-y-1">
                      <span class="text-[10px] uppercase font-mono text-[#8b949e] font-bold block">
                        Declared In:
                      </span>
                      <div class="flex flex-wrap gap-1.5">
                        {pkg.workspaces.map((w, i) => (
                          <span
                            key={i}
                            class="inline-flex items-center gap-1 px-2 py-0.5 bg-[#181818] border border-[#2c2a29] rounded text-[11px] font-mono text-[#bdbdbd]"
                          >
                            <IconFolder size={10} className="text-[#605c5a]" />
                            <span>{normalizePath(w.workspace)}</span>
                            <span class="text-[9px] text-[#8b949e]">({w.type})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div class="px-4 py-2.5 bg-[#151515] border-t border-[#242120] flex items-center justify-between text-xs">
                  <div class="text-[11px] text-[#8b949e] font-mono">npm registry status</div>

                  <div class="flex items-center gap-3">
                    {pkg.repository && (
                      <a
                        href={pkg.repository}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1 text-[11.5px] text-[#8b949e] hover:text-[#00d992] transition-colors"
                      >
                        <IconExternalLink size={11} />
                        <span>Repository</span>
                      </a>
                    )}
                    <a
                      href={npmUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 text-[11.5px] text-[#00d992] hover:underline"
                    >
                      <IconExternalLink size={11} />
                      <span>View on npm</span>
                    </a>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
