import { useMemo, useState } from "preact/hooks"
import type { DepMap, ScanResult } from "../../../types"
import type { DrawerState } from "../types"
import { IconSearch } from "./icons"

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

const STATUS_LABEL: Record<string, string> = {
  "cell-major": "✗ major",
  "cell-range": "⚠ range",
  "cell-ok": "",
  linked: "linked",
}

type Chip = "all" | "major" | "prod"

interface MatrixProps {
  data: ScanResult
  onCellClick: (state: DrawerState) => void
  onWorkspaceClick: (relPath: string) => void
}

export function Matrix(props: MatrixProps) {
  const { data, onCellClick, onWorkspaceClick } = props
  const [chip, setChip] = useState<Chip>("all")
  const [query, setQuery] = useState("")
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

    if (query) {
      const q = query.toLowerCase()
      r = r.filter((row) => row.name.toLowerCase().includes(q))
    }

    if (hideAligned) r = r.filter((row) => row.cellClass !== "cell-ok")

    if (chip === "major") r = r.filter((row) => row.cellClass === "cell-major")
    else if (chip === "prod") r = r.filter((row) => row.types.has("prod"))

    return [...r].sort(
      (a, b) => CELL_ORDER[a.cellClass] - CELL_ORDER[b.cellClass] || a.name.localeCompare(b.name)
    )
  }, [rows, query, chip, hideAligned])

  const pagedRows = filteredRows.slice(0, (page + 1) * pageSize)

  const majors = data.conflicts.filter((c) => c.severity === "major").length
  const ranges = data.conflicts.length - majors

  return (
    <div>
      <div class="filterbar">
        <button class={`chip ${chip === "all" ? "active" : ""}`} onClick={() => setChip("all")}>
          All
        </button>
        <button class={`chip ${chip === "major" ? "active" : ""}`} onClick={() => setChip("major")}>
          Major only
        </button>
        <button class={`chip ${chip === "prod" ? "active" : ""}`} onClick={() => setChip("prod")}>
          Prod only
        </button>
        <div class="filter-sep" />
        <div class="filter-search">
          <IconSearch size={12} />
          <input
            type="text"
            placeholder="Filter dependencies…"
            value={query}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value)
              setPage(0)
            }}
          />
        </div>
        <div class="filterbar-spacer" />
        <div class="toggle-row">
          Hide aligned rows
          <div
            class={`switch ${hideAligned ? "on" : ""}`}
            role="switch"
            aria-checked={hideAligned}
            tabIndex={0}
            onClick={() => {
              setHideAligned((v) => !v)
              setPage(0)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setHideAligned((v) => !v)
                setPage(0)
              }
            }}
          />
        </div>
      </div>

      <div class="matrix-scroll">
        <table class="matrix">
          <thead>
            <tr>
              <th>Dependency</th>
              {wsNames.map((ws) => (
                <th class="ws-head" key={ws} onClick={() => onWorkspaceClick(ws)} title={ws}>
                  {ws}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row) => (
              <tr key={row.name}>
                <th
                  onClick={() => onCellClick({ type: "package", name: row.name })}
                  title={`${row.name} in ${row.wsCount} workspace${row.wsCount === 1 ? "" : "s"}`}
                >
                  <div class="pkgname">
                    <span
                      class={`status-dot ${
                        row.cellClass === "cell-ok"
                          ? "ok"
                          : row.cellClass === "cell-major"
                            ? "major"
                            : "range"
                      }`}
                    />
                    {row.name}
                  </div>
                </th>
                {wsNames.map((ws) => {
                  const hit = row.versions.filter(([, occs]) => occs.some((o) => o.workspace === ws))
                  if (!hit.length) {
                    return (
                      <td class="v-empty" key={ws}>
                        —
                      </td>
                    )
                  }
                  const version = hit[0][0]
                  const isLinked =
                    version.startsWith("workspace:") ||
                    version.startsWith("catalog:") ||
                    version.startsWith("link:")
                  const cls = isLinked ? "v-linked" : `v-${row.cellClass.slice(5)}`
                  return (
                    <td
                      class={cls}
                      key={ws}
                      onClick={() => onCellClick({ type: "cell", dep: row.name, workspace: ws, version })}
                      title={`${row.name} @ ${ws}: ${version}`}
                    >
                      {isLinked ? (
                        <>
                          <span class="cell-version">{version.split(":")[0] + ":"}</span>
                          <span class="cell-tag">{STATUS_LABEL.linked}</span>
                        </>
                      ) : (
                        <>
                          <span class="cell-version">{version}</span>
                          {row.cellClass !== "cell-ok" && (
                            <span class="cell-tag">{STATUS_LABEL[row.cellClass]}</span>
                          )}
                        </>
                      )}
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

      <div class="status-strip">
        <span>
          <b>{data.workspaces.length}</b> manifests
        </span>
        <span class="sep">·</span>
        <span>
          <b>{data.meta.totalDepDeclarations}</b> declarations
        </span>
        <span class="sep">·</span>
        <span>
          <span class="status-dot-inline" style={{ background: "var(--red)" }} />
          <b>{majors}</b> major conflicts
        </span>
        <span>
          <span class="status-dot-inline" style={{ background: "var(--amber)" }} />
          <b>{ranges}</b> range conflicts
        </span>
        <span class="sep">·</span>
        <span>scanned in {data.scannedMs}ms</span>
      </div>
    </div>
  )
}
