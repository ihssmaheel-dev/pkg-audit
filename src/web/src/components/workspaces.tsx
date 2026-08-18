import type { ScanResult } from "../../../types"
import { IconCheckCircle } from "./icons"

interface WorkspacesProps {
  data: ScanResult
  onWorkspaceClick: (relPath: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  prod: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  dev: "bg-zinc-700/50 text-zinc-400 border border-zinc-700",
  peer: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  optional: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
}

export function Workspaces({ data, onWorkspaceClick }: WorkspacesProps) {
  if (!data.workspaces.length) {
    return (
      <div class="flex flex-col items-center justify-center gap-3 py-20 text-zinc-500 text-center">
        <IconCheckCircle size={40} className="text-zinc-700" />
        <h3 class="text-sm font-semibold text-zinc-400">No workspaces found</h3>
        <p class="text-xs">No package.json files were found in this folder.</p>
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-3">
      {data.workspaces.map((ws) => (
        <div key={ws.relPath} class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {/* Card header */}
          <div
            class="flex items-center justify-between gap-4 px-4 py-3 border-b border-zinc-800/60 cursor-pointer hover:bg-zinc-800/30 transition-colors"
            onClick={() => onWorkspaceClick(ws.relPath)}
          >
            <div class="min-w-0">
              <div class="font-semibold text-[13.5px] text-zinc-100">{ws.name}</div>
              <div class="font-mono text-[11px] text-zinc-500 mt-0.5">{ws.relPath}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs text-zinc-500">{ws.depCount} deps</span>
              {ws.isRoot && (
                <span class="inline-flex items-center h-5 px-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 uppercase tracking-wide">
                  root
                </span>
              )}
              {ws.private && (
                <span class="inline-flex items-center h-5 px-2 rounded-full bg-zinc-700/50 border border-zinc-700 text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                  private
                </span>
              )}
            </div>
          </div>

          {/* Deps table */}
          {ws.depCount === 0 ? (
            <div class="px-4 py-3 text-xs text-zinc-600">No dependencies declared.</div>
          ) : (
            <table class="w-full border-collapse" style="table-layout: fixed">
              <colgroup>
                <col style="width: 60%" />
                <col style="width: 26%" />
                <col style="width: 14%" />
              </colgroup>
              <thead>
                <tr class="border-b border-zinc-800/40">
                  <th class="text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-4 py-2">
                    Package
                  </th>
                  <th class="text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-4 py-2">
                    Version
                  </th>
                  <th class="text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-4 py-2">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(ws.deps).map(([name, dep]) => (
                  <tr
                    key={name}
                    class="border-b border-zinc-800/30 last:border-0 hover:bg-zinc-800/20 transition-colors"
                  >
                    <td class="px-4 py-2 overflow-hidden">
                      <span class="font-mono text-[12px] font-medium text-zinc-200 block overflow-hidden text-ellipsis whitespace-nowrap">
                        {name}
                      </span>
                    </td>
                    <td class="px-4 py-2 overflow-hidden">
                      <span class="font-mono text-[11.5px] text-zinc-400 block overflow-hidden text-ellipsis whitespace-nowrap">
                        {dep.version}
                      </span>
                    </td>
                    <td class="px-4 py-2">
                      <span
                        class={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wide ${TYPE_COLORS[dep.type] ?? "bg-zinc-700/50 text-zinc-400 border border-zinc-700"}`}
                      >
                        {dep.type}
                      </span>
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
