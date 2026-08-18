import { useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import type { TabId, Theme } from "../types"
import { IconChevronDown, IconDownload, IconMoon, IconRefreshCw, IconSearch, IconSun } from "./icons"

interface TabDef {
  id: TabId
  label: string
  count?: (data: ScanResult) => number
  warn?: boolean
}

const TABS: TabDef[] = [
  { id: "matrix", label: "Matrix" },
  {
    id: "conflicts",
    label: "Conflicts",
    warn: true,
    count: (d) => d.conflicts.length,
  },
  {
    id: "outdated",
    label: "Outdated",
    count: (d) => d.outdated?.outdated.length ?? 0,
  },
  { id: "hygiene", label: "Hygiene", count: (d) => d.hygieneIssues.length },
  { id: "workspaces", label: "Workspaces", count: (d) => d.workspaces.length },
]

function rootLabel(dir: string): string {
  const parts = dir.split(/[\\/]/).filter(Boolean)
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
    onOutdated,
    onExportHtml,
    onOpenPalette,
  } = props

  const [dirEditing, setDirEditing] = useState(false)
  const [dirValue, setDirValue] = useState(dir)

  const rootWs = data?.workspaces.find((w) => w.isRoot)
  const pm = rootWs?.packageManager ?? null

  return (
    <div class="shell">
      <header class="header">
        <div class="header-row">
          <div class="brand">
            <span class="dot" />
            pkg-audit
          </div>

          <button class="search-trigger" onClick={onOpenPalette}>
            <IconSearch size={14} />
            <span>Search packages, workspaces…</span>
            <span class="kbd-hint">
              <kbd>Ctrl</kbd>
              <kbd>K</kbd>
            </span>
          </button>

          <div class="header-spacer" />

          <div class="header-actions">
            <button
              class="btn btn-icon"
              onClick={onThemeToggle}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
            </button>
            <button
              class="btn btn-icon"
              onClick={onExportHtml}
              disabled={loading}
              title="Export standalone HTML"
              aria-label="Export HTML"
            >
              <IconDownload size={15} />
            </button>
            <button class="btn" onClick={onScan} disabled={loading}>
              <IconRefreshCw size={13} />
              {loading ? "Scanning…" : "Rescan"}
            </button>
            <button class="btn btn-primary" onClick={onOutdated} disabled={loading}>
              <IconSearch size={13} />
              Check outdated
            </button>
          </div>
        </div>

        <div class="header-row breadcrumb-row">
          {dirEditing ? (
            <form
              class="dir-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (dirValue.trim()) onScanDir(dirValue.trim())
                setDirEditing(false)
              }}
            >
              <input
                type="text"
                class="dir-input"
                value={dirValue}
                onInput={(e) => setDirValue((e.target as HTMLInputElement).value)}
                autoFocus
                onBlur={() => setDirEditing(false)}
                placeholder="~/code/my-monorepo"
              />
              <button type="submit" class="btn">
                Go
              </button>
            </form>
          ) : (
            <button
              class="breadcrumb"
              onClick={() => {
                setDirValue(dir)
                setDirEditing(true)
              }}
              title="Change folder"
            >
              <span>{dir || "No folder selected"}</span>
              <IconChevronDown size={12} />
            </button>
          )}
          {data && (
            <span class="meta">
              <b>{rootLabel(data.root)}</b> · {data.workspaces.length} packages
              {pm ? ` · ${pm}` : ""} · scanned in {data.scannedMs}ms
            </span>
          )}
        </div>

        <nav class="tabs">
          {TABS.map((t) => {
            const count = data && t.count ? t.count(data) : undefined
            return (
              <button
                class={`tab ${tab === t.id ? "active" : ""}`}
                key={t.id}
                onClick={() => onTabChange(t.id)}
              >
                {t.label}
                {typeof count === "number" && count > 0 && (
                  <span class={`count ${t.warn ? "warn" : ""}`}>{count}</span>
                )}
              </button>
            )
          })}
        </nav>
      </header>
    </div>
  )
}
