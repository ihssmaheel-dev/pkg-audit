import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import {
  IconAlertTriangle,
  IconBrain,
  IconCopy,
  IconDownload,
  IconFolder,
  IconLayers,
  IconPackage,
  IconRefreshCw,
  IconSearch,
  IconStar,
  IconWrench,
  type IconComponent,
} from "./icons"

interface Command {
  label: string
  icon: IconComponent
  action?: string
  payload?: string
  typeText?: string
}

interface CommandPaletteProps {
  data: ScanResult | null
  onSelect: (action: string, payload?: string) => void
  onClose: () => void
}

function severityOf(data: ScanResult, name: string): "major" | "range" | "aligned" {
  const versions = new Set<string>()
  for (const ws of data.workspaces) {
    const dep = ws.deps[name]
    if (dep) versions.add(dep.version)
  }
  const real = [...versions].filter(
    (v) => !v.startsWith("workspace:") && !v.startsWith("catalog:") && !v.startsWith("link:")
  )
  if (real.length <= 1) return "aligned"
  const majors = new Set(
    real
      .map((v) => v.replace(/^[^~<>=\s]+/, "").match(/^(\d+)/)?.[1])
      .filter((m): m is string => m !== undefined)
  )
  return majors.size > 1 ? "major" : "range"
}

const SEV_COLORS: Record<string, string> = {
  major: "text-[#f43f5e]",
  range: "text-[#f59e0b]",
  aligned: "text-[#00d992]",
}

export function CommandPalette({ data, onSelect, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const groups = useMemo<Array<{ label: string; items: Command[] }>>(() => {
    const actions: Command[] = [
      { label: "Rescan Monorepo", icon: IconRefreshCw, action: "rescan" },
      { label: "Check Outdated Packages", icon: IconSearch, action: "outdated" },
      { label: "Export Standalone HTML Report", icon: IconDownload, action: "export-html" },
      { label: "Copy Version Conflicts as Markdown", icon: IconCopy, action: "copy-conflicts" },
    ]
    const goto: Command[] = [
      { label: "Go to Dashboard", icon: IconStar, action: "goto", payload: "dashboard" },
      { label: "Go to Matrix Grid", icon: IconLayers, action: "goto", payload: "matrix" },
      { label: "Go to Conflicts", icon: IconAlertTriangle, action: "goto", payload: "conflicts" },
      { label: "Go to Outdated", icon: IconPackage, action: "goto", payload: "outdated" },
      { label: "Go to Hygiene", icon: IconWrench, action: "goto", payload: "hygiene" },
      { label: "Go to AI Context", icon: IconBrain, action: "goto", payload: "context" },
      { label: "Go to Workspaces", icon: IconFolder, action: "goto", payload: "workspaces" },
    ]
    const result: Array<{ label: string; items: Command[] }> = [
      { label: "ACTIONS", items: actions },
      { label: "NAVIGATION", items: goto },
    ]
    if (data) {
      const names = new Set<string>()
      for (const ws of data.workspaces) {
        for (const dep of Object.keys(ws.deps)) names.add(dep)
      }
      result.push({
        label: "PACKAGES",
        items: [...names]
          .sort()
          .slice(0, 50)
          .map((name) => ({
            label: name,
            icon: IconPackage,
            action: "open-package",
            payload: name,
            typeText: severityOf(data, name),
          })),
      })
      result.push({
        label: "WORKSPACES",
        items: data.workspaces.slice(0, 30).map((ws) => ({
          label: ws.name,
          icon: IconFolder,
          action: "open-workspace",
          payload: ws.relPath,
          typeText: ws.relPath,
        })),
      })
    }
    return result
  }, [data])

  const flat = useMemo(() => {
    const q = query.toLowerCase()
    const items: Array<{ groupLabel: string; item: Command }> = []
    for (const group of groups) {
      const matches = q ? group.items.filter((c) => c.label.toLowerCase().includes(q)) : group.items
      for (const item of matches) items.push({ groupLabel: group.label, item })
    }
    return items
  }, [groups, query])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, flat.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const entry = flat[selected]
      if (entry?.item.action) onSelect(entry.item.action, entry.item.payload)
      onClose()
    } else if (e.key === "Escape") {
      onClose()
    }
  }

  return (
    <div
      class="fixed inset-0 z-[200] flex items-start justify-center pt-[90px] bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div class="w-full max-w-[580px] bg-[#101010] border border-[#3d3a39] rounded-[8px] overflow-hidden">
        {/* Search Input Bar */}
        <div class="flex items-center gap-3 px-4 py-3.5 border-b border-[#3d3a39] bg-[#1a1a1a]/40 text-[#8b949e]">
          <IconSearch size={15} />
          <input
            ref={inputRef}
            type="text"
            class="flex-1 text-sm text-[#f2f2f2] placeholder-[#8b949e] bg-transparent border-none outline-none font-mono"
            placeholder="Type a package, workspace, or action…"
            autocomplete="off"
            value={query}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value)
              setSelected(0)
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        {/* Results List */}
        <div class="max-h-[380px] overflow-y-auto p-2">
          {flat.slice(0, 40).map((entry, i) => {
            const showHead = i === 0 || flat[i - 1].groupLabel !== entry.groupLabel
            const sev = entry.item.typeText
            const sevColor = SEV_COLORS[sev ?? ""] ?? "text-[#8b949e]"
            return (
              <div key={`${entry.groupLabel}-${entry.item.label}`}>
                {showHead && (
                  <div class="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] mt-1.5 first:mt-0">
                    {entry.groupLabel}
                  </div>
                )}
                <div
                  class={`flex items-center gap-3 px-3 py-2 rounded-[6px] text-sm cursor-pointer transition-colors border ${
                    i === selected
                      ? "bg-[#1a1a1a] text-[#ffffff] border-[#3d3a39]"
                      : "text-[#bdbdbd] hover:bg-[#1a1a1a]/50 hover:text-[#f2f2f2] border-transparent"
                  }`}
                  onClick={() => {
                    if (entry.item.action) onSelect(entry.item.action, entry.item.payload)
                    onClose()
                  }}
                  onMouseEnter={() => setSelected(i)}
                >
                  <entry.item.icon
                    size={14}
                    className={i === selected ? "text-[#00d992]" : "text-[#8b949e]"}
                  />
                  <span class="flex-1 font-mono text-[12.5px]">{entry.item.label}</span>
                  {entry.item.typeText && (
                    <span class={`text-[11px] font-mono ${sevColor}`}>{entry.item.typeText}</span>
                  )}
                </div>
              </div>
            )
          })}
          {!flat.length && (
            <div class="py-10 text-center text-xs font-mono text-[#8b949e]">No matches found.</div>
          )}
        </div>
      </div>
    </div>
  )
}
