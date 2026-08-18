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

const CELL_ORDER: Record<MatrixRow["cellClass"], number> = { "cell-major": 0, "cell-range": 1, "cell-ok": 2 }
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
    <div>
      {/* Filter bar */}
      <div class="flex items-center gap-2 mb-4 flex-wrap">
        {(["all", "major", "prod"] as const).map((c) => (
          <button
            key={c}
            class={`inline-flex items-center h-7 px-3 rounded-lg text-xs font-medium border transition-colors ${
              chip === c
                ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
            onClick={() => setChip(c)}
          >
            {c === "all" ? "All" : c === "major" ? "Major only" : "Prod only"}
          </button>
        ))}
        <div class="w-px h-4 bg-zinc-800 mx-1" />
        <div class="flex items-center gap-2 h-7 px-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500">
          <IconSearch size={12} />
          <input
            type="text"
            class="bg-transparent border-none outline-none text-xs text-zinc-200 w-36"
            placeholder="Filter dependencies…"
            value={query}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value)
              setPage(0)
            }}
          />
        </div>
        <div class="flex-1" />
        <div class="flex items-center gap-2 text-xs text-zinc-500">
          Hide aligned
          <div
            class={`relative w-7 h-4 rounded-full cursor-pointer transition-colors ${hideAligned ? "bg-indigo-600" : "bg-zinc-700"}`}
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
              class={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${hideAligned ? "translate-x-3.5" : "translate-x-0.5"}`}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div class="overflow-x-auto border border-zinc-800 rounded-xl">
        <table class="w-full border-collapse text-xs whitespace-nowrap">
          <thead>
            <tr class="border-b border-zinc-800">
              <th class="sticky left-0 bg-zinc-900 text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600 min-w-[200px] z-10">
                Dependency
              </th>
              {wsNames.map((ws) => (
                <th
                  key={ws}
                  class="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-zinc-600 max-w-[120px] overflow-hidden text-ellipsis cursor-pointer hover:text-indigo-400 transition-colors"
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
                class="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors"
              >
                <th
                  class="sticky left-0 bg-zinc-900 text-left px-3 py-2 font-medium cursor-pointer z-10"
                  onClick={() => onCellClick({ type: "package", name: row.name })}
                  title={`${row.name} in ${row.wsCount} workspace${row.wsCount === 1 ? "" : "s"}`}
                >
                  <div class="flex items-center gap-2">
                    <span
                      class={`w-1.5 h-1.5 rounded-full shrink-0 ${row.cellClass === "cell-ok" ? "bg-emerald-500" : row.cellClass === "cell-major" ? "bg-rose-500" : "bg-amber-400"}`}
                    />
                    <span class="font-mono text-[11.5px] text-zinc-300">{row.name}</span>
                  </div>
                </th>
                {wsNames.map((ws) => {
                  const hit = row.versions.filter(([, occs]) => occs.some((o) => o.workspace === ws))
                  if (!hit.length)
                    return (
                      <td key={ws} class="px-3 py-2 text-center text-zinc-700">
                        —
                      </td>
                    )
                  const version = hit[0][0]
                  const isLinked =
                    version.startsWith("workspace:") ||
                    version.startsWith("catalog:") ||
                    version.startsWith("link:")
                  let cellCls = "text-zinc-400 hover:bg-zinc-800/40"
                  if (isLinked) cellCls = "text-violet-400 bg-violet-500/5 hover:bg-violet-500/10"
                  else if (row.cellClass === "cell-major")
                    cellCls = "text-rose-400 bg-rose-500/5 hover:bg-rose-500/10"
                  else if (row.cellClass === "cell-range")
                    cellCls = "text-amber-400 bg-amber-500/5 hover:bg-amber-500/10"
                  else cellCls = "text-emerald-400/70 bg-emerald-500/3 hover:bg-emerald-500/8"
                  return (
                    <td
                      key={ws}
                      class={`px-3 py-2 text-center cursor-pointer transition-colors ${cellCls}`}
                      onClick={() => onCellClick({ type: "cell", dep: row.name, workspace: ws, version })}
                      title={`${row.name} @ ${ws}: ${version}`}
                    >
                      <span class="font-mono text-[11px] block">
                        {isLinked ? version.split(":")[0] + ":" : version}
                      </span>
                      {!isLinked && row.cellClass !== "cell-ok" && (
                        <span class="text-[9.5px] opacity-70 block">{STATUS_LABEL[row.cellClass]}</span>
                      )}
                      {isLinked && <span class="text-[9.5px] opacity-70 block">{STATUS_LABEL.linked}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagedRows.length < filteredRows.length && (
        <div class="flex justify-center py-4">
          <button
            class="h-8 px-4 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-lg text-xs text-zinc-400 transition-colors"
            onClick={() => setPage(page + 1)}
          >
            Show more ({pagedRows.length} of {filteredRows.length})
          </button>
        </div>
      )}

      {/* Status strip */}
      <div class="flex items-center gap-2.5 pt-3 text-xs text-zinc-600">
        <span>
          <span class="font-semibold text-zinc-400">{data.workspaces.length}</span> manifests
        </span>
        <span class="text-zinc-800">·</span>
        <span>
          <span class="font-semibold text-zinc-400">{data.meta.totalDepDeclarations}</span> declarations
        </span>
        <span class="text-zinc-800">·</span>
        <span class="flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
          <span class="font-semibold text-zinc-400">{majors}</span> major
        </span>
        <span class="flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
          <span class="font-semibold text-zinc-400">{ranges}</span> range
        </span>
        <span class="text-zinc-800">·</span>
        <span>scanned in {data.scannedMs}ms</span>
      </div>
    </div>
  )
}
