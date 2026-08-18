import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import {
  IconAlertTriangle,
  IconFileText,
  IconFolder,
  IconLayers,
  IconPackage,
  IconRefreshCw,
  IconTerminal,
  IconWrench,
  type IconComponent,
} from "./icons"

interface Command {
  type: "action" | "tab" | "package" | "workspace"
  label: string
  icon: IconComponent
  action?: string
  payload?: string
}

interface CommandPaletteProps {
  data: ScanResult | null
  onSelect: (action: string, payload?: string) => void
  onClose: () => void
}

export function CommandPalette({ data, onSelect, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      { type: "action", label: "Rescan", icon: IconRefreshCw, action: "rescan" },
      {
        type: "action",
        label: "Check outdated against npm",
        icon: IconPackage,
        action: "outdated",
      },
      { type: "action", label: "Export HTML", icon: IconFileText, action: "export-html" },
      {
        type: "action",
        label: "Copy conflicts as markdown",
        icon: IconTerminal,
        action: "copy-conflicts",
      },
      { type: "tab", label: "Go to Matrix", icon: IconLayers, action: "goto", payload: "matrix" },
      {
        type: "tab",
        label: "Go to Conflicts",
        icon: IconAlertTriangle,
        action: "goto",
        payload: "conflicts",
      },
      { type: "tab", label: "Go to Outdated", icon: IconPackage, action: "goto", payload: "outdated" },
      { type: "tab", label: "Go to Hygiene", icon: IconWrench, action: "goto", payload: "hygiene" },
      {
        type: "tab",
        label: "Go to Workspaces",
        icon: IconFolder,
        action: "goto",
        payload: "workspaces",
      },
    ]

    if (data) {
      const names = new Set<string>()
      for (const ws of data.workspaces) {
        for (const dep of Object.keys(ws.deps)) names.add(dep)
      }
      for (const name of [...names].sort().slice(0, 50)) {
        list.push({ type: "package", label: name, icon: IconPackage })
      }
      for (const ws of data.workspaces.slice(0, 30)) {
        list.push({
          type: "workspace",
          label: `${ws.name} (${ws.relPath})`,
          icon: IconFolder,
        })
      }
    }

    return list
  }, [data])

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const cmd = filtered[selected]
      if (cmd?.action) onSelect(cmd.action, cmd.payload)
      onClose()
    } else if (e.key === "Escape") {
      onClose()
    }
  }

  return (
    <div
      class="palette-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div class="palette">
        <div class="palette-header">
          <input
            ref={inputRef}
            type="text"
            class="palette-input"
            placeholder="Search packages, workspaces, actions…"
            value={query}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value)
              setSelected(0)
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div class="palette-results">
          {filtered.slice(0, 20).map((cmd, i) => (
            <div
              class={`palette-item ${i === selected ? "palette-selected" : ""}`}
              key={`${cmd.type}-${cmd.label}`}
              onClick={() => {
                if (cmd.action) onSelect(cmd.action, cmd.payload)
                onClose()
              }}
              onMouseEnter={() => setSelected(i)}
            >
              <span class="palette-icon">
                <cmd.icon size={14} />
              </span>
              <span class="palette-label">{cmd.label}</span>
              <span class="palette-type">{cmd.type}</span>
            </div>
          ))}
          {!filtered.length && <div class="palette-empty">No matches</div>}
        </div>
      </div>
    </div>
  )
}
