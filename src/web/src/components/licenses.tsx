import { useMemo, useState } from "preact/hooks"
import type { LicenseScanResult, ScanResult } from "../../../types"
import {
  IconAlertTriangle,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconScale,
  IconSearch,
  IconX,
} from "./icons"
import { getToken } from "../hooks/use-scan"

interface LicensesViewProps {
  data: ScanResult
  loading?: boolean
  notify: (msg: string) => void
}

export function LicensesView({ data, notify }: LicensesViewProps) {
  const [riskFilter, setRiskFilter] = useState<"all" | "copyleft" | "permissive" | "unknown">("all")
  const [scopeFilter, setScopeFilter] = useState<"all" | "prod" | "dev">("all")
  const [search, setSearch] = useState("")
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFormat, setExportFormat] = useState<"notice" | "spdx" | "csv">("notice")

  const licenses: LicenseScanResult | null = data.licenses
  const packages = useMemo(() => licenses?.packages ?? [], [licenses])

  const filteredPackages = useMemo(() => {
    let list = packages

    if (riskFilter === "copyleft") {
      list = list.filter((p) => p.isCopyleft)
    } else if (riskFilter === "permissive") {
      list = list.filter((p) => p.riskLevel === "permissive")
    } else if (riskFilter === "unknown") {
      list = list.filter((p) => p.riskLevel === "unknown" || p.riskLevel === "proprietary")
    }

    if (scopeFilter === "prod") {
      list = list.filter((p) => p.isProd)
    } else if (scopeFilter === "dev") {
      list = list.filter((p) => !p.isProd)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.spdxId.toLowerCase().includes(q) ||
          p.license.toLowerCase().includes(q) ||
          (p.author && p.author.toLowerCase().includes(q)) ||
          p.workspaces.some((w) => w.workspace.toLowerCase().includes(q))
      )
    }

    return list
  }, [packages, riskFilter, scopeFilter, search])

  const handleDownload = (format: "notice" | "spdx" | "csv") => {
    const token = getToken()
    const url = `/api/license/export?dir=${encodeURIComponent(data.root)}&format=${format}${
      token ? `&token=${token}` : ""
    }`
    window.open(url, "_blank")
    notify(`Downloading ${format.toUpperCase()} compliance document`)
  }

  const copyNoticeToClipboard = async () => {
    if (!licenses) return
    let text = `THIRD-PARTY SOFTWARE NOTICES\n\n`
    for (const pkg of licenses.packages) {
      text += `Package: ${pkg.name} (${pkg.version})\n`
      text += `License: ${pkg.spdxId} (${pkg.license})\n`
      if (pkg.author) text += `Author: ${pkg.author}\n`
      if (pkg.repository) text += `Repository: ${pkg.repository}\n`
      text += `Workspaces: ${pkg.workspaces.map((w) => w.workspace).join(", ")}\n\n`
    }
    try {
      await navigator.clipboard.writeText(text)
      notify("Copied NOTICE disclosure to clipboard")
    } catch {
      // Clipboard unavailable
    }
  }

  if (!licenses || licenses.totalScanned === 0) {
    return (
      <div class="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div class="w-12 h-12 rounded-full bg-[#3d3a39]/20 text-[#8b949e] flex items-center justify-center">
          <IconScale size={26} />
        </div>
        <div>
          <h2 class="text-base font-semibold text-[#ffffff]">No External Dependencies Found</h2>
          <p class="text-xs text-[#8b949e] max-w-md mt-1">
            No external third-party package dependencies were detected across monorepo workspaces.
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
            LEGAL & COMPLIANCE
          </div>
          <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff] flex items-center gap-2.5">
            <span>Open-Source License Scanner</span>
            <span class="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#1a1a1a] text-[#00d992] border border-[#3d3a39]">
              {licenses.totalScanned} Packages
            </span>
          </h1>
        </div>

        {/* Action Buttons */}
        <div class="flex items-center gap-2 flex-wrap">
          <button
            class="flex items-center gap-1.5 h-8 px-4 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
            onClick={() => setShowExportModal(true)}
          >
            <IconDownload size={13} />
            <span>Export Disclosures (NOTICE / SPDX)</span>
          </button>
          <button
            class="flex items-center gap-1.5 h-8 px-3 bg-[#151515] border border-[#3d3a39] hover:bg-[#202020] rounded-[6px] text-xs text-[#8b949e] hover:text-[#ffffff] font-medium transition-colors"
            onClick={() => void copyNoticeToClipboard()}
          >
            <IconCopy size={13} />
            <span>Copy NOTICE</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
          <div class="text-[11px] font-medium text-[#00d992]">🟢 Permissive (Safe)</div>
          <div class="text-xl font-bold text-[#00d992] mt-1">{licenses.permissiveCount}</div>
        </div>
        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
          <div class="text-[11px] font-medium text-[#f59e0b]">🟡 Weak Copyleft</div>
          <div class="text-xl font-bold text-[#f59e0b] mt-1">{licenses.weakCopyleftCount}</div>
        </div>
        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
          <div class="text-[11px] font-medium text-[#f43f5e]">🔴 Strong Copyleft (Viral)</div>
          <div class="text-xl font-bold text-[#f43f5e] mt-1">{licenses.strongCopyleftCount}</div>
        </div>
        <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
          <div class="text-[11px] font-medium text-[#8b949e]">⚪ Unknown / Proprietary</div>
          <div class="text-xl font-bold text-[#ffffff] mt-1">
            {licenses.proprietaryCount + licenses.unknownCount}
          </div>
        </div>
      </div>

      {/* High Legal Risk Warning Banner */}
      {licenses.prodCopyleftCount > 0 && (
        <div class="flex items-center justify-between p-4 bg-[#f43f5e]/10 border border-[#f43f5e]/40 rounded-[8px] gap-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-[6px] bg-[#f43f5e]/20 text-[#f43f5e] flex items-center justify-center shrink-0">
              <IconAlertTriangle size={16} />
            </div>
            <div>
              <div class="text-sm font-bold text-[#ffffff] flex items-center gap-2">
                <span>{licenses.prodCopyleftCount} Copyleft License(s) in Production Dependencies</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-[#f43f5e]/20 text-[#f43f5e] font-mono">
                  HIGH LEGAL RISK
                </span>
              </div>
              <div class="text-xs text-[#bdbdbd] mt-0.5">
                Viral copyleft licenses (GPL, AGPL, SSPL) in production builds may obligate your organization
                to open-source proprietary source code.
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setRiskFilter("copyleft")
              setScopeFilter("prod")
            }}
            class="h-7 px-3 bg-[#f43f5e] hover:bg-[#ff5270] text-[#ffffff] font-semibold text-xs rounded-[6px] transition-colors shrink-0"
          >
            Filter Production Copyleft ➔
          </button>
        </div>
      )}

      {/* Filter & Search Controls Bar */}
      <div class="flex items-center justify-between gap-3 flex-wrap bg-[#141414] p-2.5 rounded-[8px] border border-[#2c2826]">
        <div class="flex items-center gap-3 flex-wrap">
          {/* Risk Level Filter */}
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-[#8b949e]">Risk:</span>
            <div class="flex items-center bg-[#101010] p-0.5 border border-[#302c2a] rounded-[6px]">
              <button
                class={`px-2.5 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                  riskFilter === "all"
                    ? "bg-[#00d992]/15 text-[#00d992] font-semibold border border-[#00d992]/30"
                    : "text-[#8b949e] hover:text-[#f2f2f2]"
                }`}
                onClick={() => setRiskFilter("all")}
              >
                All ({packages.length})
              </button>
              <button
                class={`px-2.5 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                  riskFilter === "copyleft"
                    ? "bg-[#f43f5e]/15 text-[#f43f5e] font-semibold border border-[#f43f5e]/30"
                    : "text-[#8b949e] hover:text-[#f2f2f2]"
                }`}
                onClick={() => setRiskFilter("copyleft")}
              >
                Copyleft ({licenses.strongCopyleftCount + licenses.weakCopyleftCount})
              </button>
              <button
                class={`px-2.5 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                  riskFilter === "permissive"
                    ? "bg-[#00d992]/15 text-[#00d992] font-semibold border border-[#00d992]/30"
                    : "text-[#8b949e] hover:text-[#f2f2f2]"
                }`}
                onClick={() => setRiskFilter("permissive")}
              >
                Permissive ({licenses.permissiveCount})
              </button>
            </div>
          </div>

          {/* Scope Filter */}
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-[#8b949e]">Scope:</span>
            <div class="flex items-center bg-[#101010] p-0.5 border border-[#302c2a] rounded-[6px]">
              <button
                class={`px-2.5 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                  scopeFilter === "all"
                    ? "bg-[#252525] text-[#ffffff] font-semibold"
                    : "text-[#8b949e] hover:text-[#f2f2f2]"
                }`}
                onClick={() => setScopeFilter("all")}
              >
                All
              </button>
              <button
                class={`px-2.5 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                  scopeFilter === "prod"
                    ? "bg-[#252525] text-[#f43f5e] font-semibold"
                    : "text-[#8b949e] hover:text-[#f2f2f2]"
                }`}
                onClick={() => setScopeFilter("prod")}
              >
                Production
              </button>
              <button
                class={`px-2.5 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                  scopeFilter === "dev"
                    ? "bg-[#252525] text-[#8b949e] font-semibold"
                    : "text-[#8b949e] hover:text-[#f2f2f2]"
                }`}
                onClick={() => setScopeFilter("dev")}
              >
                Dev Only
              </button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div class="flex items-center gap-2 h-7 px-2.5 bg-[#1a1a1a] border border-[#3d3a39] rounded-[6px] text-[#8b949e] w-64">
          <IconSearch size={12} />
          <input
            type="text"
            placeholder="Search package, license, author..."
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            class="bg-transparent border-none outline-none text-xs text-[#f2f2f2] placeholder-[#8b949e] w-full font-mono"
          />
        </div>
      </div>

      {/* Packages List */}
      {filteredPackages.length === 0 ? (
        <div class="text-center py-12 text-xs text-[#8b949e] border border-[#2e2a28] rounded-[8px] bg-[#121212]">
          No packages match the selected license and scope filters.
        </div>
      ) : (
        <div class="space-y-2.5">
          {filteredPackages.map((pkg) => {
            const isStrong = pkg.riskLevel === "strong-copyleft"
            const isWeak = pkg.riskLevel === "weak-copyleft"

            let badgeClass = "bg-[#00d992]/15 text-[#00d992] border-[#00d992]/30"
            let badgeText = "Permissive"

            if (isStrong) {
              badgeClass = "bg-[#f43f5e]/15 text-[#f43f5e] border-[#f43f5e]/30 font-bold"
              badgeText = "Strong Copyleft"
            } else if (isWeak) {
              badgeClass = "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30"
              badgeText = "Weak Copyleft"
            } else if (pkg.riskLevel === "proprietary") {
              badgeClass = "bg-[#8b949e]/15 text-[#8b949e] border-[#8b949e]/30"
              badgeText = "Proprietary"
            } else if (pkg.riskLevel === "unknown") {
              badgeClass = "bg-[#8b949e]/15 text-[#8b949e] border-[#8b949e]/30"
              badgeText = "Unknown"
            }

            return (
              <div
                key={pkg.name}
                class={`bg-[#121212] border rounded-[8px] p-4 flex items-start justify-between gap-4 flex-wrap hover:border-[#3d3a39] transition-colors ${
                  isStrong && pkg.isProd ? "border-[#f43f5e]/40 bg-[#f43f5e]/5" : "border-[#2e2a28]"
                }`}
              >
                <div class="space-y-1.5 min-w-0 flex-1">
                  <div class="flex items-center gap-2.5 flex-wrap">
                    <span class="text-sm font-bold font-mono text-[#ffffff]">{pkg.name}</span>
                    <span class="text-xs font-mono text-[#8b949e]">v{pkg.version}</span>
                    <span class={`px-2 py-0.5 rounded text-[10px] font-mono border ${badgeClass}`}>
                      {pkg.spdxId} ({badgeText})
                    </span>
                    {pkg.isProd ? (
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30">
                        PROD
                      </span>
                    ) : (
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-mono text-[#8b949e] bg-[#202020] border border-[#303030]">
                        dev
                      </span>
                    )}
                  </div>

                  {pkg.description && <p class="text-xs text-[#8b949e] line-clamp-1">{pkg.description}</p>}

                  {/* Metadata Row */}
                  <div class="flex items-center gap-4 text-xs text-[#6e7681] flex-wrap pt-0.5">
                    {pkg.author && (
                      <div>
                        <span class="text-[#8b949e]">Author:</span> {pkg.author}
                      </div>
                    )}
                    <div>
                      <span class="text-[#8b949e]">Used in:</span>{" "}
                      <span class="font-mono text-[#d1d5db]">
                        {pkg.workspaces.map((w) => w.workspace).join(", ")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* External links */}
                <div class="flex items-center gap-2 shrink-0 pt-0.5">
                  {pkg.repository && (
                    <a
                      href={pkg.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#ffffff] px-2 py-1 bg-[#181818] border border-[#303030] rounded-[5px] transition-colors"
                    >
                      <IconExternalLink size={11} />
                      <span>Repo</span>
                    </a>
                  )}
                  {pkg.homepage && (
                    <a
                      href={pkg.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center gap-1 text-xs text-[#8b949e] hover:text-[#ffffff] px-2 py-1 bg-[#181818] border border-[#303030] rounded-[5px] transition-colors"
                    >
                      <IconExternalLink size={11} />
                      <span>Docs</span>
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
          <div
            class="bg-[#121212] border border-[#2e2a28] rounded-[10px] w-full max-w-xl flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="px-6 py-4 border-b border-[#2e2a28] flex items-center justify-between bg-[#161616]">
              <div class="flex items-center gap-2.5">
                <IconScale size={18} className="text-[#00d992]" />
                <h3 class="text-sm font-semibold text-[#ffffff]">Export Legal Compliance Documents</h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                class="text-[#8b949e] hover:text-[#ffffff] p-1.5 rounded-md hover:bg-[#252525]"
              >
                <IconX size={16} />
              </button>
            </div>

            <div class="p-6 space-y-4">
              <p class="text-xs text-[#8b949e]">
                Select a compliance disclosure format to download or use for corporate legal audits:
              </p>

              <div class="space-y-2">
                <label
                  onClick={() => setExportFormat("notice")}
                  class={`flex items-start gap-3 p-3.5 rounded-[8px] border cursor-pointer transition-colors ${
                    exportFormat === "notice"
                      ? "bg-[#00d992]/10 border-[#00d992]/40 text-[#ffffff]"
                      : "bg-[#161616] border-[#2c2826] text-[#8b949e] hover:border-[#3d3a39]"
                  }`}
                >
                  <input type="radio" name="exportFormat" checked={exportFormat === "notice"} class="mt-1" />
                  <div>
                    <div class="text-xs font-semibold text-[#ffffff]">
                      NOTICE.txt (Third-Party Attribution)
                    </div>
                    <div class="text-[11px] text-[#8b949e] mt-0.5">
                      Standard text document required for App Stores, Docker images, and binary distributions.
                    </div>
                  </div>
                </label>

                <label
                  onClick={() => setExportFormat("spdx")}
                  class={`flex items-start gap-3 p-3.5 rounded-[8px] border cursor-pointer transition-colors ${
                    exportFormat === "spdx"
                      ? "bg-[#00d992]/10 border-[#00d992]/40 text-[#ffffff]"
                      : "bg-[#161616] border-[#2c2826] text-[#8b949e] hover:border-[#3d3a39]"
                  }`}
                >
                  <input type="radio" name="exportFormat" checked={exportFormat === "spdx"} class="mt-1" />
                  <div>
                    <div class="text-xs font-semibold text-[#ffffff]">
                      SPDX 2.3 JSON (SBOM - Software Bill of Materials)
                    </div>
                    <div class="text-[11px] text-[#8b949e] mt-0.5">
                      Standardized machine-readable SBOM format for enterprise compliance pipelines.
                    </div>
                  </div>
                </label>

                <label
                  onClick={() => setExportFormat("csv")}
                  class={`flex items-start gap-3 p-3.5 rounded-[8px] border cursor-pointer transition-colors ${
                    exportFormat === "csv"
                      ? "bg-[#00d992]/10 border-[#00d992]/40 text-[#ffffff]"
                      : "bg-[#161616] border-[#2c2826] text-[#8b949e] hover:border-[#3d3a39]"
                  }`}
                >
                  <input type="radio" name="exportFormat" checked={exportFormat === "csv"} class="mt-1" />
                  <div>
                    <div class="text-xs font-semibold text-[#ffffff]">CSV Spreadsheet Report</div>
                    <div class="text-[11px] text-[#8b949e] mt-0.5">
                      Full table export with license risk levels, authors, and workspace scopes for legal
                      reviews.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div class="px-6 py-3.5 bg-[#161616] flex items-center justify-end gap-2 border-t border-[#2e2a28]">
              <button
                onClick={() => setShowExportModal(false)}
                class="h-8 px-4 bg-[#252525] hover:bg-[#303030] text-[#8b949e] hover:text-[#ffffff] rounded-[6px] text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowExportModal(false)
                  handleDownload(exportFormat)
                }}
                class="flex items-center gap-1.5 h-8 px-4 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
              >
                <IconDownload size={13} />
                <span>Download File</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
