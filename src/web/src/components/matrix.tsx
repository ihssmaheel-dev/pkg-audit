import { useMemo, useState } from "preact/hooks"
import type { DepMap, ScanResult } from "../../../types"
import type { DrawerState, FilterState } from "../types"

interface MatrixRow {
  name: string
  cellClass: "cell-ok" | "cell-range" | "cell-major"
  wsCount: number
  types: Set<string>
  versions: Array<[string, Array<{ workspace: string; type: string }>]>
}

function buildRows(depMap: DepMap): MatrixRow[] {
  const rows: MatrixRow[] = []
  for (const [name, versions] of depMap) {
    const realVersions = [...versions.entries()].filter(
      ([v]) => !v.startsWith("workspace:") && !v.startsWith("catalog:") && !v.startsWith("link:")
    )

    let cellClass: MatrixRow["cellClass"] = "cell-ok"
    if (realVersions.length > 1) {
      const majors = new Set(
        realVersions
          .map(([v]) => v.replace(/^[\^~<>=\s]+/, "").match(/^(\d+)/)?.[1])
          .filter((m): m is string => m !== undefined)
      )
      cellClass = majors.size > 1 ? "cell-major" : "cell-range"
    }

    const wsSet = new Set<string>()
    const types = new Set<string>()
    for (const [, occurrences] of versions) {
      for (const occ of occurrences) {
        wsSet.add(occ.workspace)
        types.add(occ.type)
      }
    }

    rows.push({
      name,
      cellClass,
      wsCount: wsSet.size,
      types,
      versions: [...versions.entries()],
    })
  }
  return rows
}

const CELL_ORDER: Record<MatrixRow["cellClass"], number> = {
  "cell-major": 0,
  "cell-range": 1,
  "cell-ok": 2,
}

interface MatrixProps {
  data: ScanResult
  search: string
  filter: FilterState
  compact: boolean
  onCellClick: (state: DrawerState) => void
  onWorkspaceClick: (relPath: string) => void
}

export function Matrix(props: MatrixProps) {
  const { data, search, filter, compact, onCellClick, onWorkspaceClick } = props
  const [sortBy, setSortBy] = useState<"conflicts" | "name" | "workspaces">("conflicts")
  const [hideAligned, setHideAligned] = useState(true)
  const [page, setPage] = useState(0)
  const pageSize = 50

  const workspaces = data.workspaces
  const wsNames = workspaces.map((w) => w.relPath)

  const depMap = useMemo(() => {
    const map: DepMap = new Map()
    for (const ws of workspaces) {
      for (const [name, { version, type }] of Object.entries(ws.deps)) {
        if (!map.has(name)) map.set(name, new Map())
        const versions = map.get(name)!
        if (!versions.has(version)) versions.set(version, [])
        versions.get(version)!.push({ workspace: ws.relPath, type })
      }
    }
    return map
  }, [workspaces])

  const rows = useMemo(() => buildRows(depMap), [depMap])

  const filteredRows = useMemo(() => {
    let r = rows

    if (search) {
      const q = search.toLowerCase()
      r = r.filter((row) => row.name.toLowerCase().includes(q))
    }

    if (hideAligned) r = r.filter((row) => row.cellClass !== "cell-ok")

    if (filter.severity === "major") r = r.filter((row) => row.cellClass === "cell-major")
    else if (filter.severity === "range") r = r.filter((row) => row.cellClass === "cell-range")

    if (filter.type === "prod") r = r.filter((row) => row.types.has("prod"))
    else if (filter.type === "dev") r = r.filter((row) => row.types.has("dev") && !row.types.has("prod"))

    const sorted = [...r]
    if (sortBy === "conflicts") {
      sorted.sort((a, b) => CELL_ORDER[a.cellClass] - CELL_ORDER[b.cellClass] || a.name.localeCompare(b.name))
    } else if (sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      sorted.sort((a, b) => b.wsCount - a.wsCount || a.name.localeCompare(b.name))
    }
    return sorted
  }, [rows, search, filter, hideAligned, sortBy])

  const pagedRows = filteredRows.slice(0, (page + 1) * pageSize)

  return (
    <div class="matrix-container">
      <div class="matrix-toolbar">
        <span class="matrix-info">
          {filteredRows.length} of {rows.length} packages shown
        </span>
        <label class="filter-toggle">
          <input
            type="checkbox"
            checked={hideAligned}
            onChange={(e) => {
              setHideAligned((e.target as HTMLInputElement).checked)
              setPage(0)
            }}
          />
          Hide aligned
        </label>
        <div class="matrix-sort">
          <span class="sort-label">Sort:</span>
          {(["conflicts", "name", "workspaces"] as const).map((s) => (
            <button
              class={`btn btn-sm ${sortBy === s ? "btn-active" : ""}`}
              key={s}
              onClick={() => setSortBy(s)}
            >
              {s === "conflicts" ? "Conflicts" : s === "name" ? "A-Z" : "Workspaces"}
            </button>
          ))}
        </div>
      </div>

      <div class="matrix-scroll">
        <table class={`matrix-table ${compact ? "compact" : ""}`}>
          <thead>
            <tr>
              <th class="matrix-th sticky-col">Package</th>
              {wsNames.map((ws) => (
                <th class="matrix-th" key={ws} onClick={() => onWorkspaceClick(ws)}>
                  {ws}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row) => (
              <tr class={`matrix-row ${row.cellClass}`} key={row.name}>
                <td
                  class="matrix-td sticky-col dep-name"
                  onClick={() => onCellClick({ type: "package", name: row.name })}
                >
                  {row.name}
                </td>
                {wsNames.map((ws) => {
                  const hit = row.versions.filter(([, occs]) => occs.some((o) => o.workspace === ws))
                  if (!hit.length) {
                    return (
                      <td class="matrix-cell cell-empty" key={ws}>
                        —
                      </td>
                    )
                  }
                  const version = hit[0][0]
                  const isLinked =
                    version.startsWith("workspace:") ||
                    version.startsWith("catalog:") ||
                    version.startsWith("link:")
                  return (
                    <td
                      class={`matrix-cell ${isLinked ? "cell-linked" : ""}`}
                      key={ws}
                      onClick={() => onCellClick({ type: "cell", dep: row.name, workspace: ws, version })}
                      title={`${row.name} @ ${ws}: ${version}`}
                    >
                      {isLinked ? version.split(":")[0] + ":" : version}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagedRows.length < filteredRows.length && (
        <div class="matrix-more">
          <button class="btn" onClick={() => setPage(page + 1)}>
            Show more ({pagedRows.length} of {filteredRows.length})
          </button>
        </div>
      )}
    </div>
  )
}
