import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import {
  IconAlertTriangle,
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
      .map((v) => v.replace(/^[\^~<>=\s]+/, "").match(/^(\d+)/)?.[1])
      .filter((m): m is string => m !== undefined)
  )
  return majors.size > 1 ? "major" : "range"
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
      { label: "Rescan", icon: IconRefreshCw, action: "rescan" },
      { label: "Check outdated", icon: IconSearch, action: "outdated" },
      { label: "Export HTML", icon: IconDownload, action: "export-html" },
      { label: "Copy conflicts as markdown", icon: IconCopy, action: "copy-conflicts" },
    ]
    const goto: Command[] = [
      { label: "Go to Dashboard", icon: IconStar, action: "goto", payload: "dashboard" },
      { label: "Go to Matrix", icon: IconLayers, action: "goto", payload: "matrix" },
      { label: "Go to Conflicts", icon: IconAlertTriangle, action: "goto", payload: "conflicts" },
      { label: "Go to Outdated", icon: IconPackage, action: "goto", payload: "outdated" },
      { label: "Go to Hygiene", icon: IconWrench, action: "goto", payload: "hygiene" },
      { label: "Go to Workspaces", icon: IconFolder, action: "goto", payload: "workspaces" },
      { label: "Go to Packages", icon: IconPackage, action: "goto", payload: "packages" },
    ]
    const result: Array<{ label: string; items: Command[] }> = [
      { label: "Actions", items: actions },
      { label: "Go to", items: goto },
    ]

    if (data) {
      const names = new Set<string>()
      for (const ws of data.workspaces) {
        for (const dep of Object.keys(ws.deps)) names.add(dep)
      }
      result.push({
        label: "Packages",
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
        label: "Workspaces",
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
      class="cmdk-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div class="cmdk">
        <div class="cmdk-input-row">
          <IconSearch size={15} />
          <input
            ref={inputRef}
            type="text"
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
        <div class="cmdk-list">
          {flat.slice(0, 40).map((entry, i) => {
            const showHead = i === 0 || flat[i - 1].groupLabel !== entry.groupLabel
            return (
              <div key={`${entry.groupLabel}-${entry.item.label}`}>
                {showHead && <div class="cmdk-group-label">{entry.groupLabel}</div>}
                <div
                  class={`cmdk-item ${i === selected ? "sel" : ""}`}
                  onClick={() => {
                    if (entry.item.action) onSelect(entry.item.action, entry.item.payload)
                    onClose()
                  }}
                  onMouseEnter={() => setSelected(i)}
                >
                  <entry.item.icon size={14} />
                  <span class="lbl">{entry.item.label}</span>
                  {entry.item.typeText && <span class="type">{entry.item.typeText}</span>}
                </div>
              </div>
            )
          })}
          {!flat.length && <div class="cmdk-empty">No matches</div>}
        </div>
      </div>
    </div>
  )
}
