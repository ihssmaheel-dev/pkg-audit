import { useRef, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import type { TabId } from "../types"
import { IconDownload, IconRefreshCw, IconSearch, IconZap } from "./icons"

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
      <div class="flex items-center gap-3.5 h-[54px] px-6">
        {/* Brand */}
        <div class="flex items-center gap-2 font-mono font-bold text-[14px] tracking-tight text-[#ffffff] shrink-0">
          <div class="flex items-center justify-center w-6 h-6 rounded-[6px] bg-[#00d992]/10 border border-[#00d992]/30 text-[#00d992]">
            <IconZap size={14} />
          </div>
          <span>pkg-audit</span>
        </div>

        {/* Hairline vertical divider */}
        <div class="w-px h-5 bg-[#3d3a39]" />

        {/* Directory Bar */}
        <div class="flex items-center gap-2.5 flex-1 min-w-0 max-w-[500px]">
          {dirEditing ? (
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <input
                type="text"
                class="flex-1 h-[32px] px-3 bg-[#1a1a1a] border border-[#00d992] rounded-[6px] font-mono text-[12px] text-[#f2f2f2] outline-none min-w-0"
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
                class="shrink-0 h-[32px] px-3.5 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
                onMouseDown={() => {
                  submitRef.current = true
                }}
                onClick={() => handleSubmit()}
              >
                Go
              </button>
            </div>
          ) : (
            <button
              class="flex-1 min-w-0 h-[32px] px-3 bg-[#1a1a1a] border border-[#3d3a39] hover:border-[#8b949e] rounded-[6px] font-mono text-[12px] text-[#bdbdbd] hover:text-[#f2f2f2] text-left overflow-hidden text-ellipsis whitespace-nowrap transition-colors"
              onClick={() => {
                setDirValue(dir)
                setDirEditing(true)
              }}
              title="Click to change folder"
            >
              {dir || "No folder selected"}
            </button>
          )}
          {data && (
            <span class="text-[11.5px] text-[#8b949e] whitespace-nowrap shrink-0 font-mono">
              <span class="text-[#f2f2f2] font-semibold">{rootLabel(data.root)}</span>
              {" · "}
              {data.workspaces.length} ws
              {pm ? ` · ${pm}` : ""}
              {" · "}
              {data.scannedMs}ms
            </span>
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
        </div>
      </div>

      {/* Tabs navigation row */}
      <nav class="flex items-center gap-1 h-10 px-6 border-t border-[#3d3a39]/70 bg-[#101010]">
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
