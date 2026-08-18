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
          .map(([v]) => v.replace(/^[^~<>=\s]+/, "").match(/^(\d+)/)?.[1])
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
    rows.push({ name, cellClass, wsCount: wsSet.size, types, versions: [...versions.entries()] })
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

export function Matrix({ data, onCellClick, onWorkspaceClick }: MatrixProps) {
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
    <div class="space-y-4">
      <div>
        <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">
          CROSS-WORKSPACE MATRIX
        </div>
        <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff]">Dependency Alignment Grid</h1>
      </div>

      {/* Filter bar */}
      <div class="flex items-center gap-2.5 flex-wrap">
        {(["all", "major", "prod"] as const).map((c) => (
          <button
            key={c}
            class={`inline-flex items-center h-8 px-3 rounded-[6px] text-xs font-medium border transition-colors ${
              chip === c
                ? "bg-[#1a1a1a] border-[#8b949e] text-[#ffffff]"
                : "bg-[#101010] border-[#3d3a39] text-[#8b949e] hover:text-[#f2f2f2] hover:border-[#8b949e]"
            }`}
            onClick={() => setChip(c)}
          >
            {c === "all" ? "All dependencies" : c === "major" ? "Major conflicts only" : "Production only"}
          </button>
        ))}

        <div class="w-px h-5 bg-[#3d3a39] mx-1" />

        <div class="flex items-center gap-2 h-8 px-3 bg-[#1a1a1a] border border-[#3d3a39] rounded-[6px] text-[#8b949e]">
          <IconSearch size={12} />
          <input
            type="text"
            class="bg-transparent border-none outline-none text-xs text-[#f2f2f2] placeholder-[#8b949e] w-40 font-mono"
            placeholder="Filter dependencies…"
            value={query}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value)
              setPage(0)
            }}
          />
        </div>

        <div class="flex-1" />

        {/* Toggle hide aligned */}
        <div class="flex items-center gap-2 text-xs text-[#8b949e]">
          <span>Hide aligned rows</span>
          <div
            class={`relative w-8 h-4 rounded-full cursor-pointer transition-colors ${
              hideAligned ? "bg-[#00d992]" : "bg-[#3d3a39]"
            }`}
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
          >
            <span
              class={`absolute top-0.5 w-3 h-3 rounded-full bg-[#101010] transition-transform ${
                hideAligned ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <div class="overflow-x-auto border border-[#3d3a39] rounded-[8px] bg-[#101010]">
        <table class="w-full border-collapse text-xs whitespace-nowrap">
          <thead>
            <tr class="border-b border-[#3d3a39] bg-[#1a1a1a]/60">
              <th class="sticky left-0 bg-[#101010] text-left px-4 py-3 text-[10.5px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] min-w-[220px] z-10 border-r border-[#3d3a39]">
                Dependency
              </th>
              {wsNames.map((ws) => (
                <th
                  key={ws}
                  class="px-4 py-3 text-center text-[10.5px] font-semibold uppercase tracking-[1.5px] text-[#8b949e] max-w-[130px] overflow-hidden text-ellipsis cursor-pointer hover:text-[#00d992] transition-colors border-r border-[#3d3a39]/40 last:border-r-0"
                  onClick={() => onWorkspaceClick(ws)}
                  title={ws}
                >
                  {ws}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row) => (
              <tr
                key={row.name}
                class="border-b border-[#3d3a39]/30 last:border-0 hover:bg-[#1a1a1a]/40 transition-colors"
              >
                <th
                  class="sticky left-0 bg-[#101010] text-left px-4 py-2.5 font-medium cursor-pointer z-10 border-r border-[#3d3a39]"
                  onClick={() => onCellClick({ type: "package", name: row.name })}
                  title={`${row.name} in ${row.wsCount} workspace${row.wsCount === 1 ? "" : "s"}`}
                >
                  <div class="flex items-center gap-2.5">
                    <span
                      class={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        row.cellClass === "cell-ok"
                          ? "bg-[#00d992]"
                          : row.cellClass === "cell-major"
                            ? "bg-[#f43f5e]"
                            : "bg-[#f59e0b]"
                      }`}
                    />
                    <span class="font-mono text-[12px] text-[#f2f2f2]">{row.name}</span>
                  </div>
                </th>
                {wsNames.map((ws) => {
                  const hit = row.versions.filter(([, occs]) => occs.some((o) => o.workspace === ws))
                  if (!hit.length) {
                    return (
                      <td
                        key={ws}
                        class="px-3 py-2 text-center text-[#3d3a39] font-mono border-r border-[#3d3a39]/30 last:border-r-0"
                      >
                        —
                      </td>
                    )
                  }
                  const version = hit[0][0]
                  const isLinked =
                    version.startsWith("workspace:") ||
                    version.startsWith("catalog:") ||
                    version.startsWith("link:")
                  let cellCls = "text-[#8b949e] hover:bg-[#1a1a1a]"
                  if (isLinked) {
                    cellCls = "text-[#8b5cf6] bg-[#8b5cf6]/5 hover:bg-[#8b5cf6]/10"
                  } else if (row.cellClass === "cell-major") {
                    cellCls = "text-[#f43f5e] bg-[#f43f5e]/5 hover:bg-[#f43f5e]/10"
                  } else if (row.cellClass === "cell-range") {
                    cellCls = "text-[#f59e0b] bg-[#f59e0b]/5 hover:bg-[#f59e0b]/10"
                  } else {
                    cellCls = "text-[#00d992] bg-[#00d992]/5 hover:bg-[#00d992]/10"
                  }
                  return (
                    <td
                      key={ws}
                      class={`px-3 py-2 text-center cursor-pointer transition-colors border-r border-[#3d3a39]/30 last:border-r-0 ${cellCls}`}
                      onClick={() => onCellClick({ type: "cell", dep: row.name, workspace: ws, version })}
                      title={`${row.name} @ ${ws}: ${version}`}
                    >
                      <span class="font-mono text-[11px] block">
                        {isLinked ? version.split(":")[0] + ":" : version}
                      </span>
                      {!isLinked && row.cellClass !== "cell-ok" && (
                        <span class="text-[9px] opacity-75 font-mono block">
                          {STATUS_LABEL[row.cellClass]}
                        </span>
                      )}
                      {isLinked && (
                        <span class="text-[9px] opacity-75 font-mono block">{STATUS_LABEL.linked}</span>
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
        <div class="flex justify-center py-2">
          <button
            class="h-8 px-4 bg-[#101010] border border-[#3d3a39] hover:bg-[#1a1a1a] hover:border-[#8b949e] rounded-[6px] text-xs font-medium text-[#f2f2f2] transition-colors"
            onClick={() => setPage(page + 1)}
          >
            Show more ({pagedRows.length} of {filteredRows.length})
          </button>
        </div>
      )}

      {/* Status strip */}
      <div class="flex items-center gap-3 pt-2 text-xs font-mono text-[#8b949e]">
        <span>
          <span class="font-bold text-[#ffffff]">{data.workspaces.length}</span> manifests
        </span>
        <span class="text-[#3d3a39]">·</span>
        <span>
          <span class="font-bold text-[#ffffff]">{data.meta.totalDepDeclarations}</span> declarations
        </span>
        <span class="text-[#3d3a39]">·</span>
        <span class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-[#f43f5e] inline-block" />
          <span class="font-bold text-[#ffffff]">{majors}</span> major
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-[#f59e0b] inline-block" />
          <span class="font-bold text-[#ffffff]">{ranges}</span> range
        </span>
        <span class="text-[#3d3a39]">·</span>
        <span>scanned in {data.scannedMs}ms</span>
      </div>
    </div>
  )
}
