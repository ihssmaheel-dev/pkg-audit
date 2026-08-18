import { useEffect, useRef } from "preact/hooks"
import type { JSX } from "preact"
import type { ScanResult, Workspace } from "../../../types"
import type { DrawerState } from "../types"
import { IconCopy, IconFolder, IconX } from "./icons"

interface DrawerProps {
  data: ScanResult | null
  state: DrawerState
  onClose: () => void
}

export function Drawer({ data, state, onClose }: DrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  if (!data) return null

  let title = ""
  let body: JSX.Element | null = null

  if (state.type === "workspace") {
    const ws = data.workspaces.find((w) => w.relPath === state.relPath)
    if (ws) {
      title = ws.name
      body = <WorkspaceDetail ws={ws} />
    }
  } else if (state.type === "package") {
    title = state.name
    const usage = collectUsage(data, state.name)
    body = <UsageTable rows={usage} />
  } else {
    title = state.dep
    const usage = collectUsage(data, state.dep)
    body = <UsageTable rows={usage} />
  }

  return (
    <div
      class="drawer-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div class="drawer-panel">
        <div class="drawer-content">
          <div class="drawer-header">
            <h2 class="drawer-title">{title}</h2>
            <button class="drawer-close" onClick={onClose} title="Close (Esc)">
              <IconX size={18} />
            </button>
          </div>
          {body}
        </div>
      </div>
    </div>
  )
}

function collectUsage(
  data: ScanResult,
  dep: string
): Array<{ ws: Workspace; version: string; type: string }> {
  const rows: Array<{ ws: Workspace; version: string; type: string }> = []
  for (const ws of data.workspaces) {
    const depRecord = ws.deps[dep]
    if (depRecord) rows.push({ ws, version: depRecord.version, type: depRecord.type })
  }
  return rows
}

interface UsageTableProps {
  rows: Array<{ ws: Workspace; version: string; type: string }>
}

function UsageTable({ rows }: UsageTableProps) {
  return (
    <div class="drawer-section">
      <h3>
        Used in {rows.length} workspace{rows.length === 1 ? "" : "s"}
      </h3>
      <div class="drawer-table">
        {rows.map(({ ws, version, type }) => (
          <div class="drawer-row" key={ws.relPath}>
            <IconFolder size={12} />
            <span class="drawer-ws">{ws.relPath}</span>
            <span class="drawer-version">{version}</span>
            <span class={`drawer-type drawer-type-${type}`}>{type}</span>
          </div>
        ))}
      </div>
      <button
        class="btn btn-sm"
        onClick={() => void navigator.clipboard.writeText(rows[0]?.ws.absPath ?? "")}
      >
        <IconCopy size={12} />
        Copy path
      </button>
    </div>
  )
}

interface WorkspaceDetailProps {
  ws: Workspace
}

function WorkspaceDetail({ ws }: WorkspaceDetailProps) {
  const deps = Object.entries(ws.deps).sort(([a], [b]) => a.localeCompare(b))
  return (
    <div class="drawer-section">
      <h3>
        {ws.relPath} · v{ws.version}
        {ws.private ? " · private" : ""}
      </h3>
      <div class="drawer-table">
        {deps.map(([name, { version, type }]) => (
          <div class="drawer-row" key={name}>
            <span class="drawer-ws">{name}</span>
            <span class="drawer-version">{version}</span>
            <span class={`drawer-type drawer-type-${type}`}>{type}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
