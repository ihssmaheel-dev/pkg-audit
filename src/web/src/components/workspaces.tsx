import { useMemo, useState } from "preact/hooks"
import type { ScanResult, Workspace } from "../../../types"
import { IconChevronDown, IconChevronRight, IconFolder } from "./icons"

interface WorkspacesProps {
  data: ScanResult
  search: string
  onWorkspaceClick: (relPath: string) => void
}

export function Workspaces({ data, search, onWorkspaceClick }: WorkspacesProps) {
  const [sortBy, setSortBy] = useState<"path" | "name" | "deps">("path")
  const [expanded, setExpanded] = useState<string | null>(null)

  const workspaces = useMemo(() => {
    let list = data.workspaces
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((w) => w.name.toLowerCase().includes(q) || w.relPath.toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sortBy === "path") sorted.sort((a, b) => a.relPath.localeCompare(b.relPath))
    else if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name))
    else
      sorted.sort(
        (a, b) => b.depCount - b.devCount - (a.depCount - a.devCount) || a.relPath.localeCompare(b.relPath)
      )
    return sorted
  }, [data.workspaces, search, sortBy])

  if (!data.workspaces.length) {
    return (
      <div class="empty-state">
        <IconFolder size={48} className="empty-icon" />
        <h3>No workspaces</h3>
        <p>No package.json files were found in this folder.</p>
      </div>
    )
  }

  const toggle = (relPath: string) => setExpanded(expanded === relPath ? null : relPath)

  return (
    <div class="workspaces-view">
      <div class="ws-toolbar">
        <div class="filter-group">
          {(["path", "name", "deps"] as const).map((s) => (
            <button
              class={`btn btn-sm ${sortBy === s ? "btn-active" : ""}`}
              key={s}
              onClick={() => setSortBy(s)}
            >
              {s === "path" ? "Path" : s === "name" ? "Name" : "Deps"}
            </button>
          ))}
        </div>
        <span class="matrix-info">{workspaces.length} workspaces</span>
      </div>

      <div class="ws-list">
        {workspaces.map((ws) => (
          <WsCard
            ws={ws}
            expanded={expanded === ws.relPath}
            onToggle={() => toggle(ws.relPath)}
            onOpen={() => onWorkspaceClick(ws.relPath)}
            key={ws.relPath}
          />
        ))}
      </div>
    </div>
  )
}

interface WsCardProps {
  ws: Workspace
  expanded: boolean
  onToggle: () => void
  onOpen: () => void
}

function WsCard({ ws, expanded, onToggle, onOpen }: WsCardProps) {
  const deps = Object.entries(ws.deps).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div class={`ws-card ${expanded ? "ws-expanded" : ""}`}>
      <div class="ws-header" onClick={onToggle}>
        <div class="ws-main">
          {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <IconFolder size={14} className="ws-icon" />
          <span class="ws-name">{ws.name}</span>
          {ws.isRoot && <span class="ws-badge">root</span>}
          {ws.private && <span class="ws-badge ws-private">private</span>}
        </div>
        <div class="ws-meta">
          <span class="ws-path">{ws.relPath}</span>
          <span class="ws-version">v{ws.version}</span>
          <span class="ws-deps">
            {ws.depCount - ws.devCount} deps / {ws.devCount} dev
          </span>
        </div>
      </div>
      {expanded && (
        <div class="ws-detail">
          <div class="ws-dep-list">
            {deps.map(([name, { version, type }]) => (
              <div class="ws-dep-row" key={name}>
                <span class="ws-dep-name">{name}</span>
                <span class="ws-dep-version">{version}</span>
                <span class={`ws-dep-type ws-dep-type-${type}`}>{type}</span>
              </div>
            ))}
          </div>
          <button class="btn btn-sm ws-open" onClick={onOpen}>
            Open in detail
          </button>
        </div>
      )}
    </div>
  )
}
