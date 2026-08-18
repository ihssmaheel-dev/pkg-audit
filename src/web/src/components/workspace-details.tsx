import type { ScanResult } from "../../../types"

interface WorkspaceDetailsProps {
  data: ScanResult
  onWorkspaceClick: (relPath: string) => void
}

export function WorkspaceDetails({ data, onWorkspaceClick }: WorkspaceDetailsProps) {
  if (!data.workspaces.length) {
    return (
      <div class="empty-state">
        <h3>No workspaces</h3>
        <p>No package.json files were found in this folder.</p>
      </div>
    )
  }

  return (
    <div class="stack">
      {data.workspaces.map((ws) => (
        <div class="card" key={ws.relPath}>
          <div class="pkg-ws-head" style={{ cursor: "pointer" }} onClick={() => onWorkspaceClick(ws.relPath)}>
            <div class="pkg-ws-title">
              <span class="n">{ws.name}</span>
              <span class="p">{ws.relPath}</span>
            </div>
            <div class="pkg-ws-meta">
              <span class="pkg-ws-count">{ws.depCount} dependencies</span>
              {[ws.isRoot ? "root" : null, ws.private ? "private" : null]
                .filter((t): t is string => t !== null)
                .map((t) => (
                  <span class="tag-pill" key={t}>
                    {t}
                  </span>
                ))}
            </div>
          </div>
          {ws.depCount === 0 ? (
            <div class="pkg-ws-empty">No dependencies</div>
          ) : (
            <table class="ws-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Version</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(ws.deps).map(([name, dep]) => (
                  <tr key={name}>
                    <td>
                      <span class="ws-dep-name">{name}</span>
                    </td>
                    <td class="mono" style={{ color: "var(--text-muted)" }}>
                      {dep.version}
                    </td>
                    <td>
                      <span class={`tag-pill ${dep.type}`}>{dep.type}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}
