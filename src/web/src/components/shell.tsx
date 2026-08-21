import { useMemo, useRef, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import type { NavGroupId, TabId } from "../types"
import {
  IconBrain,
  IconDownload,
  IconGithub,
  IconLayers,
  IconLogo,
  IconRefreshCw,
  IconSearch,
  IconShield,
  IconZap,
  type IconComponent,
} from "./icons"

export interface SubTabDef {
  id: TabId
  label: string
  shortLabel?: string
  count?: (data: ScanResult) => number
  warn?: boolean
}

export interface NavGroupDef {
  id: NavGroupId
  label: string
  icon: IconComponent
  defaultTab: TabId
  tabs: SubTabDef[]
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "overview",
    label: "Overview & Graph",
    icon: IconLayers,
    defaultTab: "dashboard",
    tabs: [
      { id: "dashboard", label: "Dashboard", shortLabel: "Dashboard" },
      { id: "matrix", label: "Matrix Grid", shortLabel: "Matrix" },
      {
        id: "graph",
        label: "Dependency Graph",
        shortLabel: "Graph",
        warn: true,
        count: (d) => d.graph?.cycles.length ?? 0,
      },
      {
        id: "workspaces",
        label: "Workspaces",
        shortLabel: "Workspaces",
        count: (d) => d.workspaces.length,
      },
    ],
  },
  {
    id: "dependencies",
    label: "Dependencies & Hygiene",
    icon: IconZap,
    defaultTab: "conflicts",
    tabs: [
      {
        id: "conflicts",
        label: "Version Conflicts",
        shortLabel: "Conflicts",
        warn: true,
        count: (d) => d.conflicts.length,
      },
      {
        id: "dedupe",
        label: "Lockfile Dedupe",
        shortLabel: "Dedupe",
        warn: true,
        count: (d) => d.dedupe?.totalDuplicates ?? 0,
      },
      {
        id: "unused",
        label: "Unused & Phantoms",
        shortLabel: "Unused & Phantoms",
        warn: true,
        count: (d) =>
          (d.unused?.phantoms.length ?? 0) + (d.unused?.unused.filter((u) => u.type === "prod").length ?? 0),
      },
      {
        id: "outdated",
        label: "Outdated Releases",
        shortLabel: "Outdated",
        count: (d) => d.outdated?.outdated.length ?? 0,
      },
      {
        id: "hygiene",
        label: "Manifest Hygiene",
        shortLabel: "Hygiene",
        count: (d) => d.hygieneIssues.length,
      },
    ],
  },
  {
    id: "risk",
    label: "Risk & Governance",
    icon: IconShield,
    defaultTab: "security",
    tabs: [
      {
        id: "security",
        label: "Security Advisories",
        shortLabel: "Security",
        warn: true,
        count: (d) => (d.security?.criticalCount ?? 0) + (d.security?.highCount ?? 0),
      },
      {
        id: "deprecation",
        label: "Deprecation & Zombies",
        shortLabel: "Deprecation",
        warn: true,
        count: (d) => (d.deprecation?.totalDeprecated ?? 0) + (d.deprecation?.totalZombies ?? 0),
      },
      {
        id: "licenses",
        label: "License Compliance",
        shortLabel: "Licenses",
        warn: true,
        count: (d) => d.licenses?.prodCopyleftCount ?? 0,
      },
    ],
  },
  {
    id: "context",
    label: "AI Context",
    icon: IconBrain,
    defaultTab: "context",
    tabs: [
      {
        id: "context",
        label: "AI Agent Exporter",
        shortLabel: "Exporter",
      },
    ],
  },
]

export function findNavGroupForTab(tab: TabId): NavGroupDef {
  for (const group of NAV_GROUPS) {
    if (group.tabs.some((t) => t.id === tab)) {
      return group
    }
  }
  return NAV_GROUPS[0]!
}

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
  const rootWs = useMemo(() => data?.workspaces.find((w) => w.isRoot), [data])
  const pm = rootWs?.packageManager ?? null

  const activeGroup = useMemo(() => findNavGroupForTab(tab), [tab])

  const handleSubmit = () => {
    if (dirValue.trim()) onScanDir(dirValue.trim())
    setDirEditing(false)
  }

  // Calculate aggregated warning & issue counts for each top-level group and individual tabs
  const { groupStats, subTabCounts } = useMemo(() => {
    const stats: Record<NavGroupId, { total: number; hasWarn: boolean }> = {
      overview: { total: 0, hasWarn: false },
      dependencies: { total: 0, hasWarn: false },
      risk: { total: 0, hasWarn: false },
      context: { total: 0, hasWarn: false },
    }
    const tabCounts = new Map<TabId, number>()
    if (!data) return { groupStats: stats, subTabCounts: tabCounts }

    for (const group of NAV_GROUPS) {
      let count = 0
      let warn = false
      for (const t of group.tabs) {
        if (t.count) {
          const n = t.count(data)
          tabCounts.set(t.id, n)
          if (n > 0) {
            count += n
            if (t.warn) warn = true
          }
        }
      }
      stats[group.id] = { total: count, hasWarn: warn }
    }
    return { groupStats: stats, subTabCounts: tabCounts }
  }, [data])

  return (
    <header class="sticky top-0 z-50 bg-[#101010] border-b border-[#3d3a39]">
      {/* Top Header Row: Branding, Directory input, Search & Actions */}
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

      {/* Tier 1: Primary Functional Domain Tabs */}
      <div class="flex items-center gap-1 h-10 px-8 max-[640px]:px-4 border-t border-[#262423] bg-[#0c0c0c] overflow-x-auto">
        {NAV_GROUPS.map((group) => {
          const isActiveGroup = activeGroup.id === group.id
          const GroupIcon = group.icon
          const stat = groupStats[group.id]
          const showBadge = stat && stat.total > 0

          return (
            <button
              key={group.id}
              onClick={() => {
                // If this group is already active, do nothing; otherwise jump to its default tab or first tab
                if (!isActiveGroup) {
                  onTabChange(group.defaultTab)
                }
              }}
              class={`relative inline-flex items-center gap-2 h-8 px-3.5 rounded-[6px] text-[13px] font-medium transition-all duration-150 ${
                isActiveGroup
                  ? "bg-[#181818] text-[#ffffff] border border-[#383432] shadow-sm"
                  : "text-[#8b949e] hover:text-[#e6e6e6] hover:bg-[#141414]"
              }`}
            >
              <GroupIcon size={14} className={isActiveGroup ? "text-[#00d992]" : "text-[#8b949e]"} />
              <span class="font-medium tracking-tight">{group.label}</span>
              {showBadge && (
                <span
                  class={`inline-flex items-center justify-center min-w-[18px] h-4 px-1.5 rounded-full text-[10px] font-bold font-mono ${
                    stat.hasWarn
                      ? "bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30"
                      : "bg-[#1f1f1f] text-[#a0a0a0] border border-[#33302e]"
                  }`}
                >
                  {stat.total}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tier 2: Contextual Sub-Nav Bar (Clean Segmented Sub-Pills) */}
      <nav class="flex items-center gap-1.5 h-9 px-8 max-[640px]:px-4 border-t border-[#1e1c1b] bg-[#121212] overflow-x-auto">
        <span class="text-[11px] font-mono uppercase tracking-wider text-[#605c5a] mr-2 shrink-0 hidden md:inline-block">
          {activeGroup.label}:
        </span>

        {activeGroup.tabs.map((subTab) => {
          const isActive = tab === subTab.id
          const count = subTabCounts.get(subTab.id)

          return (
            <button
              key={subTab.id}
              onClick={() => onTabChange(subTab.id)}
              class={`relative inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[4px] text-[12px] transition-colors shrink-0 ${
                isActive
                  ? "bg-[#22201f] text-[#ffffff] border border-[#403c3a] font-medium"
                  : "text-[#8b949e] hover:text-[#f2f2f2] hover:bg-[#181818]"
              }`}
            >
              {isActive && <span class="w-1.5 h-1.5 rounded-full bg-[#00d992] shrink-0" />}
              <span>{subTab.label}</span>
              {typeof count === "number" && count > 0 && (
                <span
                  class={`inline-flex items-center justify-center min-w-[16px] h-3.5 px-1 rounded-full text-[9.5px] font-mono font-bold ${
                    subTab.warn
                      ? "bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30"
                      : "bg-[#181818] text-[#8b949e] border border-[#2b2726]"
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
