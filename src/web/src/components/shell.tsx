import { useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import type { FilterState, TabId, Theme } from "../types"
import {
  IconAlertTriangle,
  IconChevronDown,
  IconFileText,
  IconFolder,
  IconKeyboard,
  IconLayers,
  IconMoon,
  IconPackage,
  IconRefreshCw,
  IconSearch,
  IconSun,
  IconWrench,
  type IconComponent,
} from "./icons"

interface TabDef {
  id: TabId
  label: string
  icon: IconComponent
  count?: (data: ScanResult) => number
}

const TABS: TabDef[] = [
  { id: "matrix", label: "Matrix", icon: IconLayers, count: (d) => d.conflicts.length },
  {
    id: "conflicts",
    label: "Conflicts",
    icon: IconAlertTriangle,
    count: (d) => d.conflicts.length,
  },
  {
    id: "outdated",
    label: "Outdated",
    icon: IconPackage,
    count: (d) => d.outdated?.outdated.length ?? 0,
  },
  { id: "hygiene", label: "Hygiene", icon: IconWrench, count: (d) => d.hygieneIssues.length },
  { id: "workspaces", label: "Workspaces", icon: IconFolder, count: (d) => d.workspaces.length },
]

interface ShellProps {
  dir: string
  tab: TabId
  onTabChange: (tab: TabId) => void
  loading: boolean
  data: ScanResult | null
  search: string
  onSearchChange: (value: string) => void
  filter: FilterState
  onFilterChange: (filter: FilterState) => void
  compact: boolean
  onCompactChange: (compact: boolean) => void
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
    search,
    onSearchChange,
    filter,
    onFilterChange,
    compact,
    onCompactChange,
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

  const showFilters = tab === "matrix" || tab === "conflicts" || tab === "workspaces"

  return (
    <header class="shell">
      <div class="shell-top">
        <div class="shell-brand">
          <IconPackage size={18} />
          <span>pkg-audit</span>
        </div>

        <div class="shell-search">
          <div class="search-wrap">
            <IconSearch size={14} className="search-icon" />
            <input
              type="text"
              class="search-input"
              placeholder="Search packages, workspaces…"
              value={search}
              onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
            />
            <button class="search-kbd" onClick={onOpenPalette} title="Command palette (Ctrl+K)">
              <IconKeyboard size={14} />
            </button>
          </div>
        </div>

        <div class="shell-actions">
          <button class="btn" onClick={onOutdated} disabled={loading} title="Check against npm registry">
            <IconPackage size={14} />
            Outdated
          </button>
          <button class="btn" onClick={onExportHtml} disabled={loading} title="Export standalone HTML">
            <IconFileText size={14} />
            HTML
          </button>
          <button class="btn btn-primary" onClick={onScan} disabled={loading} title="Rescan">
            <IconRefreshCw size={14} />
            {loading ? "Scanning…" : "Scan"}
          </button>
          <button class="btn btn-icon" onClick={onThemeToggle} title="Toggle theme">
            {theme === "dark" ? <IconSun size={14} /> : <IconMoon size={14} />}
          </button>
        </div>
      </div>

      <div class="shell-dir">
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
            />
            <button type="submit" class="btn btn-sm">
              Go
            </button>
          </form>
        ) : (
          <button
            class="dir-display"
            onClick={() => {
              setDirValue(dir)
              setDirEditing(true)
            }}
          >
            <IconFolder size={14} />
            <span class="dir-path">{dir || "No folder selected"}</span>
            <IconChevronDown size={12} className="dir-chevron" />
          </button>
        )}
        {data && (
          <span class="scan-meta">
            {data.workspaces.length} manifests · scanned in {data.scannedMs}ms
          </span>
        )}
      </div>

      <nav class="shell-tabs">
        {TABS.map((t) => {
          const count = data && t.count ? t.count(data) : undefined
          return (
            <button
              class={`tab ${tab === t.id ? "tab-active" : ""}`}
              key={t.id}
              onClick={() => onTabChange(t.id)}
            >
              <t.icon size={14} />
              {t.label}
              {typeof count === "number" && count > 0 && <span class="tab-count">{count}</span>}
            </button>
          )
        })}
      </nav>

      {showFilters && (
        <div class="shell-filters">
          <select
            class="filter-select"
            value={filter.severity}
            onChange={(e) =>
              onFilterChange({
                ...filter,
                severity: (e.target as HTMLSelectElement).value as FilterState["severity"],
              })
            }
          >
            <option value="all">All severities</option>
            <option value="major">Major only</option>
            <option value="range">Range only</option>
          </select>
          <select
            class="filter-select"
            value={filter.type}
            onChange={(e) =>
              onFilterChange({
                ...filter,
                type: (e.target as HTMLSelectElement).value as FilterState["type"],
              })
            }
          >
            <option value="all">All types</option>
            <option value="prod">Prod only</option>
            <option value="dev">Dev only</option>
          </select>
          <label class="filter-toggle">
            <input
              type="checkbox"
              checked={compact}
              onChange={(e) => onCompactChange((e.target as HTMLInputElement).checked)}
            />
            Compact
          </label>
        </div>
      )}
    </header>
  )
}
