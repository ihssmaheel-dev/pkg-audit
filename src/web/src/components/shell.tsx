import { useRef, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import type { TabId } from "../types"
import { IconDownload, IconGithub, IconLogo, IconRefreshCw, IconSearch } from "./icons"

interface TabDef {
  id: TabId
  label: string
  count?: (data: ScanResult) => number
  warn?: boolean
}

const TABS: TabDef[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "matrix", label: "Matrix" },
  { id: "conflicts", label: "Conflicts", warn: true, count: (d) => d.conflicts.length },
  {
    id: "graph",
    label: "Graph",
    warn: true,
    count: (d) => d.graph?.cycles.length ?? 0,
  },
  {
    id: "unused",
    label: "Unused & Phantom",
    warn: true,
    count: (d) =>
      (d.unused?.phantoms.length ?? 0) + (d.unused?.unused.filter((u) => u.type === "prod").length ?? 0),
  },
  {
    id: "security",
    label: "Security",
    warn: true,
    count: (d) => (d.security?.criticalCount ?? 0) + (d.security?.highCount ?? 0),
  },
  {
    id: "dedupe",
    label: "Dedupe",
    warn: true,
    count: (d) => d.dedupe?.totalDuplicates ?? 0,
  },
  {
    id: "licenses",
    label: "Licenses",
    warn: true,
    count: (d) => d.licenses?.prodCopyleftCount ?? 0,
  },
  {
    id: "deprecation",
    label: "Deprecation",
    warn: true,
    count: (d) => d.deprecation?.totalDeprecated ?? 0,
  },
  {
    id: "context",
    label: "AI Context",
  },
  { id: "outdated", label: "Outdated", count: (d) => d.outdated?.outdated.length ?? 0 },
  { id: "hygiene", label: "Hygiene", count: (d) => d.hygieneIssues.length },
  { id: "workspaces", label: "Workspaces", count: (d) => d.workspaces.length },
]

function rootLabel(dir: string): string {
  const parts = dir.split(/[\\//]/).filter(Boolean)
  return parts[parts.length - 1] ?? dir
}

interface ShellProps {
  dir: string
  tab: TabId
  onTabChange: (tab: TabId) => void
  loading: boolean
  data: ScanResult | null
  onScan: () => void
  onScanDir: (dir: string) => void
  onExportHtml: () => void
  onOpenPalette: () => void
}

export function Shell(props: ShellProps) {
  const { dir, tab, onTabChange, loading, data, onScan, onScanDir, onExportHtml, onOpenPalette } = props

  const [dirEditing, setDirEditing] = useState(false)
  const [dirValue, setDirValue] = useState(dir)
  const submitRef = useRef(false)
  const rootWs = data?.workspaces.find((w) => w.isRoot)
  const pm = rootWs?.packageManager ?? null

  const handleSubmit = () => {
    if (dirValue.trim()) onScanDir(dirValue.trim())
    setDirEditing(false)
  }

  return (
    <header class="sticky top-0 z-50 bg-[#101010] border-b border-[#3d3a39]">
      {/* Top row */}
      <div class="flex items-center gap-3.5 h-[54px] px-8 max-[640px]:px-4">
        {/* Brand */}
        <div class="flex items-center gap-2.5 font-mono font-bold text-[14px] tracking-tight text-[#ffffff] shrink-0">
          <div class="flex items-center justify-center w-7 h-7 rounded-[6px] bg-[#1a1a1a] border border-[#3d3a39] text-[#00d992]">
            <IconLogo size={18} />
          </div>
          <span>pkg-audit</span>
        </div>

        {/* Hairline vertical divider */}
        <div class="w-px h-5 bg-[#3d3a39] shrink-0" />

        {/* Directory Bar */}
        <div class="flex items-center gap-2.5 min-w-0 max-w-[640px] flex-1">
          {dirEditing ? (
            <div class="flex items-center gap-2 w-full min-w-[260px]">
              <input
                type="text"
                class="flex-1 min-w-0 h-[32px] px-3 bg-[#1a1a1a] border border-[#00d992] rounded-[6px] font-mono text-[12px] text-[#f2f2f2] outline-none"
                value={dirValue}
                onInput={(e) => setDirValue((e.target as HTMLInputElement).value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    submitRef.current = true
                    handleSubmit()
                  } else if (e.key === "Escape") {
                    setDirEditing(false)
                  }
                }}
                onBlur={() => {
                  setTimeout(() => {
                    if (!submitRef.current) setDirEditing(false)
                    submitRef.current = false
                  }, 150)
                }}
                placeholder="~/code/my-monorepo"
              />
              <button
                class="shrink-0 h-[32px] px-4 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
                onMouseDown={() => {
                  submitRef.current = true
                }}
                onClick={() => handleSubmit()}
              >
                Go
              </button>
            </div>
          ) : (
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <button
                class="min-w-[140px] max-w-[340px] h-[32px] px-3 bg-[#1a1a1a] border border-[#3d3a39] hover:border-[#8b949e] rounded-[6px] font-mono text-[12px] text-[#bdbdbd] hover:text-[#f2f2f2] text-left overflow-hidden text-ellipsis whitespace-nowrap transition-colors shrink"
                onClick={() => {
                  setDirValue(dir)
                  setDirEditing(true)
                }}
                title={`Current folder: ${dir || "none"} (Click to edit)`}
              >
                {dir || "No folder selected"}
              </button>
              {data && (
                <span class="text-[11.5px] text-[#8b949e] whitespace-nowrap shrink-0 font-mono hidden sm:inline-flex items-center gap-1.5">
                  <span class="text-[#f2f2f2] font-semibold">{rootLabel(data.root)}</span>
                  <span>·</span>
                  <span>{data.workspaces.length} ws</span>
                  {pm ? (
                    <>
                      <span>·</span>
                      <span>{pm}</span>
                    </>
                  ) : null}
                  <span>·</span>
                  <span>{data.scannedMs}ms</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div class="flex-1" />

        {/* Command Palette Search Trigger */}
        <button
          class="flex items-center gap-2 h-[32px] px-3 bg-[#1a1a1a] border border-[#3d3a39] hover:border-[#8b949e] rounded-[6px] text-xs text-[#8b949e] hover:text-[#f2f2f2] transition-colors whitespace-nowrap min-w-[210px]"
          onClick={onOpenPalette}
        >
          <IconSearch size={13} className="text-[#8b949e]" />
          <span class="flex-1 text-left">Search packages, workspaces…</span>
          <span class="flex items-center gap-0.5 ml-auto">
            <kbd class="inline-flex items-center justify-center h-4 min-w-[16px] px-1 bg-[#101010] border border-[#3d3a39] rounded-[4px] text-[9px] font-mono text-[#8b949e]">
              Ctrl
            </kbd>
            <kbd class="inline-flex items-center justify-center h-4 min-w-[16px] px-1 bg-[#101010] border border-[#3d3a39] rounded-[4px] text-[9px] font-mono text-[#8b949e]">
              K
            </kbd>
          </span>
        </button>

        {/* Action Buttons */}
        <div class="flex items-center gap-2 shrink-0">
          <button
            class="flex items-center gap-1.5 h-[32px] px-3 bg-[#101010] border border-[#3d3a39] hover:bg-[#1a1a1a] hover:border-[#8b949e] rounded-[6px] text-xs font-medium text-[#f2f2f2] transition-colors disabled:opacity-40"
            onClick={onExportHtml}
            disabled={loading}
            title="Export standalone HTML report"
          >
            <IconDownload size={13} className="text-[#8b949e]" />
            <span>Export</span>
          </button>
          <button
            class="flex items-center gap-1.5 h-[32px] px-3.5 bg-[#00d992] hover:bg-[#2fd6a1] rounded-[6px] text-xs font-semibold text-[#101010] transition-colors disabled:opacity-40"
            onClick={onScan}
            disabled={loading}
          >
            <IconRefreshCw size={13} className={loading ? "spinner" : ""} />
            <span>{loading ? "Scanning…" : "Rescan"}</span>
          </button>
          <a
            class="flex items-center justify-center w-[32px] h-[32px] bg-[#101010] border border-[#3d3a39] hover:bg-[#1a1a1a] hover:border-[#8b949e] rounded-[6px] text-[#8b949e] hover:text-[#f2f2f2] transition-colors"
            href="https://github.com/ihssmaheel-dev/pkg-audit"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub Repository"
            aria-label="GitHub Repository"
          >
            <IconGithub size={15} />
          </a>
        </div>
      </div>

      {/* Tabs navigation row */}
      <nav class="flex items-center gap-1 h-10 px-8 max-[640px]:px-4 border-t border-[#3d3a39]/70 bg-[#101010] overflow-x-auto">
        {TABS.map((t) => {
          const count = data && t.count ? t.count(data) : undefined
          const active = tab === t.id
          return (
            <button
              key={t.id}
              class={`relative inline-flex items-center gap-2 h-8 px-3 rounded-[6px] text-[13px] font-medium transition-colors ${
                active
                  ? "bg-[#1a1a1a] text-[#ffffff] border border-[#3d3a39]"
                  : "text-[#8b949e] hover:text-[#f2f2f2] hover:bg-[#1a1a1a]/50"
              }`}
              onClick={() => onTabChange(t.id)}
            >
              {active && <span class="w-1.5 h-1.5 rounded-full bg-[#00d992] shrink-0" />}
              <span>{t.label}</span>
              {typeof count === "number" && count > 0 && (
                <span
                  class={`inline-flex items-center justify-center min-w-[18px] h-4 px-1.5 rounded-full text-[10px] font-bold font-mono ${
                    t.warn
                      ? "bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30"
                      : "bg-[#1a1a1a] text-[#8b949e] border border-[#3d3a39]"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </header>
  )
}
