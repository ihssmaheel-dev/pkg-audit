import { useEffect, useMemo, useState } from "preact/hooks"
import type { ScanResult, SecuritySeverity, SecurityVulnerability } from "../../../types"
import { IconCheckCircle, IconCopy, IconFileText, IconSearch, IconShield, IconWrench, IconZap } from "./icons"
import { AdvisoryModal } from "./advisory-modal"

interface SecurityViewProps {
  data: ScanResult
  loading?: boolean
  notify: (msg: string) => void
  onScanSecurity?: () => void
  onFix?: (payload: {
    action: "security-fix" | "align"
    fixes?: Array<{ name: string; targetVersion: string; workspaces?: string[] }>
  }) => Promise<void>
}

const SEVERITY_COLORS: Record<SecuritySeverity, { bg: string; text: string; border: string; label: string }> =
  {
    CRITICAL: {
      bg: "bg-[#f43f5e]/15",
      text: "text-[#f43f5e]",
      border: "border-[#f43f5e]/40",
      label: "CRITICAL",
    },
    HIGH: {
      bg: "bg-[#ea580c]/15",
      text: "text-[#f97316]",
      border: "border-[#ea580c]/40",
      label: "HIGH",
    },
    MODERATE: {
      bg: "bg-[#f59e0b]/15",
      text: "text-[#f59e0b]",
      border: "border-[#f59e0b]/40",
      label: "MODERATE",
    },
    LOW: {
      bg: "bg-[#8b949e]/15",
      text: "text-[#8b949e]",
      border: "border-[#8b949e]/40",
      label: "LOW",
    },
    UNKNOWN: {
      bg: "bg-[#8b949e]/15",
      text: "text-[#8b949e]",
      border: "border-[#8b949e]/40",
      label: "UNKNOWN",
    },
  }

export function SecurityView({ data, loading, notify, onScanSecurity, onFix }: SecurityViewProps) {
  const [filterSeverity, setFilterSeverity] = useState<SecuritySeverity | "ALL">("ALL")
  const [search, setSearch] = useState("")
  const [fixingPkg, setFixingPkg] = useState<string | null>(null)
  const [selectedVuln, setSelectedVuln] = useState<SecurityVulnerability | null>(null)

  const security = data.security

  // Auto-scan on initial visit if security data hasn't been fetched yet
  useEffect(() => {
    if (!security && !loading && onScanSecurity) {
      onScanSecurity()
    }
  }, [security, loading, onScanSecurity])

  const vulnerabilities = useMemo(() => security?.vulnerabilities ?? [], [security])

  const filteredVulns = useMemo(() => {
    let list = vulnerabilities
    if (filterSeverity !== "ALL") {
      list = list.filter((v) => v.severity === filterSeverity)
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (v) =>
          v.pkg.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q) ||
          v.summary.toLowerCase().includes(q) ||
          v.aliases.some((a) => a.toLowerCase().includes(q)) ||
          v.workspaces.some((w) => w.workspace.toLowerCase().includes(q))
      )
    }
    return list
  }, [vulnerabilities, filterSeverity, search])

  const handleFixAll = async () => {
    if (!onFix) return
    setFixingPkg("__all__")
    try {
      await onFix({ action: "security-fix" })
      notify("✔ Successfully upgraded vulnerable dependencies to safe patched versions!")
    } catch (err) {
      notify(`Fix error: ${String(err)}`)
    } finally {
      setFixingPkg(null)
    }
  }

  const handleFixSingle = async (vuln: SecurityVulnerability) => {
    if (!onFix || !vuln.suggestedVersion) return
    setFixingPkg(vuln.id)
    try {
      await onFix({
        action: "align",
        fixes: [
          {
            name: vuln.pkg,
            targetVersion: vuln.suggestedVersion,
            workspaces: vuln.workspaces.map((w) => w.workspace),
          },
        ],
      })
      notify(`✔ Upgraded ${vuln.pkg} to ${vuln.suggestedVersion}`)
    } catch (err) {
      notify(`Fix error: ${String(err)}`)
    } finally {
      setFixingPkg(null)
    }
  }

  const copyMarkdown = async () => {
    if (!vulnerabilities.length) return
    let md = `## Security Vulnerability Report (Google OSV)\n\n`
    md += `Found ${vulnerabilities.length} vulnerabilities across dependencies:\n\n`
    for (const v of vulnerabilities) {
      md += `- **[${v.severity}] ${v.pkg}@${v.version}** — [${v.id}](${v.advisoryUrl})\n`
      md += `  - Summary: ${v.summary}\n`
      if (v.suggestedVersion) md += `  - Recommended Fix: \`${v.suggestedVersion}\`\n`
      md += `  - Affected Workspaces: ${v.workspaces.map((w) => w.workspace).join(", ")}\n\n`
    }
    try {
      await navigator.clipboard.writeText(md)
      notify("Copied security report as markdown")
    } catch {
      // Clipboard unavailable
    }
  }

  // Full-page loading state during initial security scan
  if (loading && !security) {
    return (
      <div class="flex flex-col items-center justify-center gap-4 py-28 text-center animate-fade-in">
        <div class="relative flex items-center justify-center">
          <div class="w-16 h-16 rounded-full border-2 border-[#3d3a39] border-t-[#00d992] spinner" />
          <div class="absolute text-[#00d992]">
            <IconShield size={24} />
          </div>
        </div>
        <div>
          <h2 class="text-base font-semibold text-[#ffffff]">Scanning Google OSV Security Database…</h2>
          <p class="text-xs text-[#8b949e] mt-1 max-w-sm">
            Cross-referencing declared dependencies across all monorepo workspaces against public CVE & GitHub
            advisories.
          </p>
        </div>
      </div>
    )
  }

  if (!security && !loading) {
    return (
      <div class="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div class="w-12 h-12 rounded-full bg-[#00d992]/10 text-[#00d992] flex items-center justify-center">
          <IconShield size={26} />
        </div>
        <div>
          <h2 class="text-base font-semibold text-[#ffffff]">Zero-Config Security Audit</h2>
          <p class="text-xs text-[#8b949e] max-w-md mt-1">
            Query the public Google OSV database to detect CVEs, security advisories, and calculate 1-click
            safe patch versions across all workspaces.
          </p>
        </div>
        {onScanSecurity && (
          <button
            class="mt-2 flex items-center gap-2 h-9 px-5 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
            onClick={onScanSecurity}
          >
            <IconZap size={14} />
            <span>Scan Security Vulnerabilities (Google OSV)</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div class="space-y-5 w-full">
      {/* Header */}
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">
            SECURITY ADVISORIES
          </div>
          <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff] flex items-center gap-2.5">
            <span>Security Vulnerabilities</span>
            <span class="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#1a1a1a] text-[#8b949e] border border-[#3d3a39]">
              Google OSV
            </span>
          </h1>
        </div>

        {/* Header Action Buttons */}
        <div class="flex items-center gap-2 flex-wrap">
          {onScanSecurity && (
            <button
              class="flex items-center gap-1.5 h-8 px-3 bg-[#151515] border border-[#3d3a39] hover:bg-[#202020] rounded-[6px] text-xs text-[#f2f2f2] font-medium transition-colors"
              onClick={onScanSecurity}
              disabled={loading}
            >
              <IconZap size={12} className={loading ? "spinner" : ""} />
              <span>{loading ? "Scanning OSV…" : "Rescan Google OSV"}</span>
            </button>
          )}
          {vulnerabilities.length > 0 && onFix && (
            <button
              class="flex items-center gap-1.5 h-8 px-4 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] rounded-[6px] text-xs font-semibold transition-colors disabled:opacity-50"
              onClick={() => void handleFixAll()}
              disabled={fixingPkg !== null}
            >
              <IconWrench size={13} className={fixingPkg === "__all__" ? "spinner" : ""} />
              <span>Fix All Vulnerabilities</span>
            </button>
          )}
          {vulnerabilities.length > 0 && (
            <button
              class="flex items-center gap-1.5 h-8 px-3 bg-[#151515] border border-[#3d3a39] hover:bg-[#202020] rounded-[6px] text-xs text-[#8b949e] hover:text-[#ffffff] font-medium transition-colors"
              onClick={() => void copyMarkdown()}
            >
              <IconCopy size={13} />
              <span>Copy Report</span>
            </button>
          )}
        </div>
      </div>

      {/* Rescan In-Progress Alert Banner */}
      {loading && security && (
        <div class="flex items-center gap-3 p-3.5 bg-[#00d992]/10 border border-[#00d992]/30 rounded-[8px] text-xs text-[#00d992]">
          <div class="w-4 h-4 rounded-full border-2 border-[#00d992]/40 border-t-[#00d992] spinner" />
          <span>Refreshing vulnerability advisory data from Google OSV database…</span>
        </div>
      )}

      {/* KPI Cards */}
      {security && (
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
            <div class="text-[11px] font-medium text-[#8b949e]">Total Vulnerabilities</div>
            <div class="text-xl font-bold text-[#ffffff] mt-1">{vulnerabilities.length}</div>
          </div>
          <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
            <div class="text-[11px] font-medium text-[#f43f5e]">Critical Severity</div>
            <div class="text-xl font-bold text-[#f43f5e] mt-1">{security.criticalCount}</div>
          </div>
          <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
            <div class="text-[11px] font-medium text-[#f97316]">High Severity</div>
            <div class="text-xl font-bold text-[#f97316] mt-1">{security.highCount}</div>
          </div>
          <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
            <div class="text-[11px] font-medium text-[#f59e0b]">Moderate / Low</div>
            <div class="text-xl font-bold text-[#f59e0b] mt-1">
              {security.moderateCount + security.lowCount}
            </div>
          </div>
          <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-3.5">
            <div class="text-[11px] font-medium text-[#00d992]">Packages Scanned</div>
            <div class="text-xl font-bold text-[#00d992] mt-1">{security.scannedPackageCount}</div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div class="flex items-center justify-between gap-3 flex-wrap bg-[#141414] p-2.5 rounded-[8px] border border-[#2c2826]">
        <div class="flex items-center gap-1.5 flex-wrap">
          {(["ALL", "CRITICAL", "HIGH", "MODERATE", "LOW"] as const).map((sev) => {
            const count =
              sev === "ALL"
                ? vulnerabilities.length
                : sev === "CRITICAL"
                  ? (security?.criticalCount ?? 0)
                  : sev === "HIGH"
                    ? (security?.highCount ?? 0)
                    : sev === "MODERATE"
                      ? (security?.moderateCount ?? 0)
                      : (security?.lowCount ?? 0)
            return (
              <button
                key={sev}
                class={`px-2.5 py-1 text-xs rounded-[5px] font-medium border transition-colors ${
                  filterSeverity === sev
                    ? "bg-[#252525] text-[#ffffff] border-[#8b949e]"
                    : "bg-[#101010] text-[#8b949e] border-[#302c2a] hover:text-[#f2f2f2]"
                }`}
                onClick={() => setFilterSeverity(sev)}
              >
                {sev === "ALL" ? "All" : sev.charAt(0) + sev.slice(1).toLowerCase()} ({count})
              </button>
            )
          })}
        </div>

        <div class="flex items-center gap-2 h-7 px-2.5 bg-[#1a1a1a] border border-[#3d3a39] rounded-[6px] text-[#8b949e] w-56">
          <IconSearch size={12} />
          <input
            type="text"
            placeholder="Search CVE, package, workspace..."
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            class="bg-transparent border-none outline-none text-xs text-[#f2f2f2] placeholder-[#8b949e] w-full font-mono"
          />
        </div>
      </div>

      {/* Vulnerabilities List */}
      {vulnerabilities.length === 0 ? (
        <div class="flex flex-col items-center justify-center gap-3 py-16 text-center border border-[#2e2a28] rounded-[8px] bg-[#121212]">
          <IconCheckCircle size={38} className="text-[#00d992]" />
          <h3 class="text-sm font-semibold text-[#ffffff]">No Security Vulnerabilities</h3>
          <p class="text-xs text-[#8b949e]">
            All {security?.scannedPackageCount ?? 0} scanned dependency versions have zero known
            vulnerabilities in Google OSV.
          </p>
        </div>
      ) : filteredVulns.length === 0 ? (
        <div class="text-center py-12 text-xs text-[#8b949e] border border-[#2e2a28] rounded-[8px] bg-[#121212]">
          No vulnerabilities match the current filter.
        </div>
      ) : (
        <div class="grid grid-cols-2 gap-4 max-[1000px]:grid-cols-1">
          {filteredVulns.map((vuln) => {
            const sevInfo = SEVERITY_COLORS[vuln.severity]
            const isFixing = fixingPkg === vuln.id

            return (
              <div
                key={vuln.id}
                class={`bg-[#121212] border rounded-[8px] overflow-hidden flex flex-col justify-between hover:border-[#4d4947] transition-all shadow-sm ${
                  vuln.severity === "CRITICAL"
                    ? "border-l-4 border-l-[#f43f5e] border-[#2e2a28]"
                    : vuln.severity === "HIGH"
                      ? "border-l-4 border-l-[#f97316] border-[#2e2a28]"
                      : "border-l-4 border-l-[#f59e0b] border-[#2e2a28]"
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div class="flex items-center justify-between gap-2 px-4 py-3 bg-[#181818] border-b border-[#262626] flex-wrap">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span
                        class={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider font-mono border ${sevInfo.bg} ${sevInfo.text} ${sevInfo.border}`}
                      >
                        {sevInfo.label} {vuln.cvssScore ? `(${vuln.cvssScore.toFixed(1)})` : ""}
                      </span>
                      <button
                        onClick={() => setSelectedVuln(vuln)}
                        class="text-xs font-mono font-bold text-[#00d992] hover:underline"
                        title="Open Advisory Modal"
                      >
                        {vuln.id}
                      </button>
                    </div>

                    <button
                      class="inline-flex items-center gap-1 text-[11px] text-[#8b949e] hover:text-[#00d992] transition-colors"
                      onClick={() => setSelectedVuln(vuln)}
                    >
                      <IconFileText size={12} />
                      <span>Advisory ↗</span>
                    </button>
                  </div>

                  {/* Card Body */}
                  <div class="p-4 space-y-3">
                    {/* Package & Versions */}
                    <div class="flex items-baseline justify-between gap-2 flex-wrap">
                      <span class="text-sm font-bold font-mono text-[#ffffff]">{vuln.pkg}</span>
                      <div class="flex items-center gap-1.5 font-mono text-xs">
                        <span class="text-[#f43f5e] bg-[#f43f5e]/10 border border-[#f43f5e]/25 px-1.5 py-0.5 rounded">
                          {vuln.version}
                        </span>
                        {vuln.suggestedVersion && (
                          <span class="text-[#00d992] bg-[#00d992]/10 border border-[#00d992]/25 px-1.5 py-0.5 rounded font-semibold">
                            ➔ {vuln.suggestedVersion}
                          </span>
                        )}
                      </div>
                    </div>

                    <div class="text-xs text-[#bdbdbd] line-clamp-2 leading-relaxed">
                      {vuln.summary || "Security vulnerability detected in dependency manifest."}
                    </div>

                    {/* Affected Workspaces */}
                    <div class="flex items-center gap-1.5 flex-wrap pt-1">
                      <span class="text-[10.5px] text-[#8b949e]">Workspaces:</span>
                      {vuln.workspaces.map((w) => (
                        <span
                          key={w.workspace}
                          class="text-[10px] font-mono px-1.5 py-0.5 bg-[#181818] border border-[#2c2a29] rounded text-[#8b949e]"
                        >
                          {w.workspace} <span class="text-[#bdbdbd]">({w.type})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                {onFix && vuln.suggestedVersion && (
                  <div class="p-3 bg-[#151515] border-t border-[#262626] flex items-center justify-between">
                    <span class="text-[11px] text-[#8b949e] font-mono">
                      Safe target: <span class="text-[#00d992] font-bold">{vuln.suggestedVersion}</span>
                    </span>
                    <button
                      class="flex items-center gap-1.5 h-6 px-2.5 bg-[#00d992]/15 hover:bg-[#00d992]/25 border border-[#00d992]/40 text-[#00d992] rounded-[5px] text-xs font-semibold transition-colors disabled:opacity-50"
                      onClick={() => void handleFixSingle(vuln)}
                      disabled={isFixing}
                    >
                      <IconWrench size={11} className={isFixing ? "spinner" : ""} />
                      <span>Upgrade to {vuln.suggestedVersion}</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Spacious Full Advisory Markdown Modal */}
      <AdvisoryModal
        vuln={selectedVuln}
        isOpen={selectedVuln !== null}
        onClose={() => setSelectedVuln(null)}
        notify={notify}
        onFixSingle={onFix ? handleFixSingle : undefined}
        isFixing={fixingPkg === selectedVuln?.id}
      />
    </div>
  )
}
