import { useMemo } from "preact/hooks"
import type { ScanResult } from "../../../types"
import { IconFolder } from "./icons"

interface PackagesProps {
  data: ScanResult
  onWorkspaceClick: (relPath: string) => void
}

export function Packages({ data, onWorkspaceClick }: PackagesProps) {
  const workspaces = useMemo(
    () => [...data.workspaces].sort((a, b) => a.relPath.localeCompare(b.relPath)),
    [data.workspaces]
  )

  if (!workspaces.length) {
    return (
      <div class="empty-state">
        <h3>No workspaces</h3>
        <p>No package.json files were found in this folder.</p>
      </div>
    )
  }

  return (
    <div class="stack">
      {workspaces.map((ws) => {
        const deps = Object.entries(ws.deps).sort(([a], [b]) => a.localeCompare(b))
        return (
          <div class="card" key={ws.relPath}>
            <div class="pkg-ws-head">
              <IconFolder size={14} />
              <div class="pkg-ws-title">
                <span class="n">{ws.name}</span>
                <span class="p">{ws.relPath}</span>
              </div>
              <div class="pkg-ws-meta">
                <span class="pkg-ws-count">{deps.length} deps</span>
                <span class="mono dim">{ws.version || "—"}</span>
                {ws.isRoot && <span class="tag-pill">root</span>}
                {ws.private && <span class="tag-pill">private</span>}
              </div>
            </div>
            {deps.length > 0 ? (
              <table class="ws-table">
                <thead>
                  <tr>
                    <th>Dependency</th>
                    <th>Version</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {deps.map(([name, { version, type }]) => (
                    <tr key={name} onClick={() => onWorkspaceClick(ws.relPath)}>
                      <td class="ws-dep-name">{name}</td>
                      <td class="mono">{version}</td>
                      <td>
                        <span class={`tag-pill ${type}`}>{type}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div class="pkg-ws-empty">No dependencies declared.</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
