import { useRef, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import type { TabId, Theme } from "../types"
import { IconDownload, IconMoon, IconRefreshCw, IconSearch, IconSun } from "./icons"

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
  theme: Theme
  onThemeToggle: () => void
  onScan: () => void
  onScanDir: (dir: string) => void
  onOutdated: () => void
  onExportHtml: () => void
  onOpenPalette: () => void
}

export function Shell(props: ShellProps) {
  const {
    dir,
    tab,
    onTabChange,
    loading,
    data,
    theme,
    onThemeToggle,
    onScan,
    onScanDir,
    onExportHtml,
    onOpenPalette,
  } = props

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
    <header class="sticky top-0 z-50 bg-zinc-950/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-800 dark:border-zinc-800 light:bg-white/95 light:border-zinc-200">
      {/* Top row */}
      <div class="flex items-center gap-3 h-13 px-5 h-[52px]">
        {/* Brand */}
        <div class="flex items-center gap-2 font-mono font-bold text-[13px] tracking-tight text-zinc-100 dark:text-zinc-100 shrink-0">
          <span class="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
          pkg-audit
        </div>

        {/* Dir bar */}
        <div class="flex items-center gap-2 flex-1 min-w-0 max-w-[480px]">
          {dirEditing ? (
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <input
                type="text"
                class="flex-1 h-[30px] px-2.5 bg-zinc-900 border border-indigo-500 rounded-lg font-mono text-[11.5px] text-zinc-100 outline-none min-w-0"
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
                class="shrink-0 h-[30px] px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
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
              class="flex-1 min-w-0 h-[30px] px-2.5 bg-zinc-900 border border-zinc-800 hover:border-indigo-500 rounded-lg font-mono text-[11.5px] text-zinc-400 text-left overflow-hidden text-ellipsis whitespace-nowrap transition-colors"
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
            <span class="text-[11px] text-zinc-500 whitespace-nowrap shrink-0">
              <span class="text-zinc-400 font-medium">{rootLabel(data.root)}</span>
              {" · "}
              {data.workspaces.length} ws
              {pm ? ` · ${pm}` : ""}
              {" · "}
              {data.scannedMs}ms
            </span>
          )}
        </div>

        <div class="flex-1" />

        {/* Search trigger */}
        <button
          class="flex items-center gap-2 h-[30px] px-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-500 hover:text-zinc-400 hover:border-zinc-700 transition-colors whitespace-nowrap min-w-[200px]"
          onClick={onOpenPalette}
        >
          <IconSearch size={12} />
          <span class="flex-1 text-left">Search packages, workspaces…</span>
          <span class="flex items-center gap-0.5 ml-auto">
            <kbd class="inline-flex items-center justify-center h-4 min-w-[16px] px-1 bg-zinc-800 border border-zinc-700 rounded text-[9px] font-mono text-zinc-500">
              Ctrl
            </kbd>
            <kbd class="inline-flex items-center justify-center h-4 min-w-[16px] px-1 bg-zinc-800 border border-zinc-700 rounded text-[9px] font-mono text-zinc-500">
              K
            </kbd>
          </span>
        </button>

        {/* Actions */}
        <div class="flex items-center gap-1.5 shrink-0">
          <button
            class="flex items-center justify-center w-[30px] h-[30px] bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
            onClick={onThemeToggle}
            title="Toggle theme"
          >
            {theme === "dark" ? <IconSun size={14} /> : <IconMoon size={14} />}
          </button>
          <button
            class="flex items-center justify-center w-[30px] h-[30px] bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors disabled:opacity-40"
            onClick={onExportHtml}
            disabled={loading}
            title="Export HTML"
          >
            <IconDownload size={14} />
          </button>
          <button
            class="flex items-center gap-1.5 h-[30px] px-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-lg text-[12.5px] font-medium text-zinc-300 transition-colors disabled:opacity-40"
            onClick={onScan}
            disabled={loading}
          >
            <IconRefreshCw size={13} />
            {loading ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </div>

      {/* Tabs row */}
      <nav class="flex items-center gap-0.5 h-10 px-4 border-t border-zinc-800/60">
        {TABS.map((t) => {
          const count = data && t.count ? t.count(data) : undefined
          const active = tab === t.id
          return (
            <button
              key={t.id}
              class={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12.5px] font-medium transition-colors ${
                active ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
              {typeof count === "number" && count > 0 && (
                <span
                  class={`inline-flex items-center justify-center min-w-[18px] h-4 px-1.5 rounded-full text-[10px] font-bold font-mono ${
                    t.warn ? "bg-rose-500/15 text-rose-400" : "bg-zinc-700 text-zinc-400"
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
