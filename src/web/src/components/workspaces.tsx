import type { ScanResult } from "../../../types"

interface WorkspacesProps {
  data: ScanResult
  onWorkspaceClick: (relPath: string) => void
}

export function Workspaces({ data, onWorkspaceClick }: WorkspacesProps) {
  if (!data.workspaces.length) {
    return (
      <div class="empty-state">
        <h3>No workspaces</h3>
        <p>No package.json files were found in this folder.</p>
      </div>
    )
  }

  return (
    <div class="card">
      <table class="ws-table">
        <thead>
          <tr>
            <th>Workspace</th>
            <th>Version</th>
            <th>Deps</th>
            <th>Dev</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {data.workspaces.map((ws) => (
            <tr key={ws.relPath} onClick={() => onWorkspaceClick(ws.relPath)}>
              <td>
                <div class="ws-name-cell">
                  <span class="n">{ws.name}</span>
                  <span class="p">{ws.relPath}</span>
                </div>
              </td>
              <td class="mono">{ws.version || "—"}</td>
              <td class="mono">{ws.depCount - ws.devCount}</td>
              <td class="mono">{ws.devCount}</td>
              <td>
                {[ws.isRoot ? "root" : null, ws.private ? "private" : null]
                  .filter((t): t is string => t !== null)
                  .map((t) => (
                    <span class="tag-pill" key={t}>
                      {t}
                    </span>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
