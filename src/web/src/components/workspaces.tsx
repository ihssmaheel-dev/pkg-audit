import type { ScanResult } from "../../../types"
import { IconCheckCircle } from "./icons"

interface WorkspacesProps {
  data: ScanResult
  onWorkspaceClick: (relPath: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  prod: "bg-[#00d992]/10 text-[#00d992] border border-[#00d992]/25",
  dev: "bg-[#1a1a1a] text-[#8b949e] border border-[#3d3a39]",
  peer: "bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/25",
  optional: "bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/25",
}

export function Workspaces({ data, onWorkspaceClick }: WorkspacesProps) {
  if (!data.workspaces.length) {
    return (
      <div class="flex flex-col items-center justify-center gap-3 py-20 text-[#8b949e] text-center">
        <IconCheckCircle size={40} className="text-[#3d3a39]" />
        <h3 class="text-sm font-semibold text-[#f2f2f2]">No workspaces found</h3>
        <p class="text-xs text-[#8b949e]">No package.json files were found in this repository.</p>
      </div>
    )
  }

  return (
    <div class="space-y-4">
      <div>
        <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">MANIFESTS</div>
        <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff]">Workspaces & Dependencies</h1>
      </div>

      <div class="flex flex-col gap-4">
        {data.workspaces.map((ws) => (
          <div
            key={ws.relPath}
            class="bg-[#101010] border border-[#3d3a39] rounded-[8px] overflow-hidden hover:border-[#8b949e] transition-colors"
          >
            {/* Card header */}
            <div
              class="flex items-center justify-between gap-4 px-5 py-4 border-b border-[#3d3a39] bg-[#1a1a1a]/40 cursor-pointer hover:bg-[#1a1a1a] transition-colors"
              onClick={() => onWorkspaceClick(ws.relPath)}
            >
              <div class="min-w-0">
                <div class="font-mono font-semibold text-[14px] text-[#ffffff]">{ws.name}</div>
                <div class="font-mono text-xs text-[#8b949e] mt-0.5">{ws.relPath}</div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="font-mono text-xs text-[#8b949e]">{ws.depCount} deps</span>
                {ws.isRoot && (
                  <span class="inline-flex items-center h-5 px-2.5 rounded-full bg-[#00d992]/10 border border-[#00d992]/30 text-[10px] font-bold text-[#00d992] uppercase tracking-wider">
                    root
                  </span>
                )}
                {ws.private && (
                  <span class="inline-flex items-center h-5 px-2.5 rounded-full bg-[#1a1a1a] border border-[#3d3a39] text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">
                    private
                  </span>
                )}
              </div>
            </div>

            {/* Dependencies table with fixed column alignment */}
            {ws.depCount === 0 ? (
              <div class="px-5 py-4 text-xs font-mono text-[#8b949e]">No dependencies declared.</div>
            ) : (
              <table class="w-full border-collapse" style="table-layout: fixed">
                <colgroup>
                  <col style="width: 60%" />
                  <col style="width: 26%" />
                  <col style="width: 14%" />
                </colgroup>
                <thead>
                  <tr class="border-b border-[#3d3a39]">
                    <th class="text-left text-[10.5px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] px-5 py-2.5">
                      Package
                    </th>
                    <th class="text-left text-[10.5px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] px-5 py-2.5">
                      Version
                    </th>
                    <th class="text-left text-[10.5px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] px-5 py-2.5">
                      Type
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(ws.deps).map(([name, dep]) => (
                    <tr
                      key={name}
                      class="border-b border-[#3d3a39]/40 last:border-0 hover:bg-[#1a1a1a]/60 transition-colors"
                    >
                      <td class="px-5 py-2.5 overflow-hidden">
                        <span class="font-mono text-[12px] font-medium text-[#f2f2f2] block overflow-hidden text-ellipsis whitespace-nowrap">
                          {name}
                        </span>
                      </td>
                      <td class="px-5 py-2.5 overflow-hidden">
                        <span class="font-mono text-[11.5px] text-[#8b949e] block overflow-hidden text-ellipsis whitespace-nowrap">
                          {dep.version}
                        </span>
                      </td>
                      <td class="px-5 py-2.5">
                        <span
                          class={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            TYPE_COLORS[dep.type] ?? "bg-[#1a1a1a] text-[#8b949e] border border-[#3d3a39]"
                          }`}
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
    </div>
  )
}
