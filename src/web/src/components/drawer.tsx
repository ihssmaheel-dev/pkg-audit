import { useEffect, useRef } from "preact/hooks"
import type { JSX } from "preact"
import type { DepType, ScanResult, Workspace } from "../../../types"
import type { DrawerState } from "../types"
import { IconCopy, IconX } from "./icons"

interface DrawerProps {
  data: ScanResult | null
  state: DrawerState | null
  onClose: () => void
  notify: (message: string) => void
}

interface Usage {
  ws: Workspace
  version: string
  type: DepType
}

function collectUsage(data: ScanResult, dep: string): Usage[] {
  return data.workspaces.flatMap((ws) => {
    const d = ws.deps[dep]
    return d ? [{ ws, version: d.version, type: d.type }] : []
  })
}

function fieldName(type: DepType): string {
  const names: Record<DepType, string> = {
    prod: "dependencies",
    dev: "devDependencies",
    peer: "peerDependencies",
    optional: "optionalDependencies",
  }
  return names[type]
}

function suggestedPin(rows: Usage[]): string | null {
  const real = rows.filter(
    (r) =>
      !r.version.startsWith("workspace:") &&
      !r.version.startsWith("catalog:") &&
      !r.version.startsWith("link:")
  )
  if (real.length <= 1) return null
  const counts = new Map<string, number>()
  for (const r of real) counts.set(r.version, (counts.get(r.version) ?? 0) + 1)
  let best = ""
  let bestCount = 0
  for (const [version, count] of counts) {
    if (count > bestCount) {
      best = version
      bestCount = count
    }
  }
  return best
}

function copy(text: string, message: string, notify: (m: string) => void) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => notify(message))
    .catch(() => {})
}

interface Content {
  title: string
  fields: JSX.Element[]
  pathToCopy: string | null
  pin: string | null
}

function buildContent(data: ScanResult, state: DrawerState, notify: (m: string) => void): Content | null {
  if (state.type === "workspace") {
    const ws = data.workspaces.find((w) => w.relPath === state.relPath)
    if (!ws) return null
    const deps = Object.entries(ws.deps).sort(([a], [b]) => a.localeCompare(b))
    return {
      title: ws.name,
      pathToCopy: ws.absPath ?? null,
      pin: null,
      fields: [
        <Field label="MANIFEST PATH">
          <PathRow path={ws.absPath ?? ws.relPath} notify={notify} />
        </Field>,
        <Field label="VERSION">
          <Mono>{ws.version || "—"}</Mono>
        </Field>,
        <Field label="VISIBILITY">
          <span class="text-[13px] font-mono text-[#bdbdbd]">
            {ws.private ? "private" : "public"}
            {ws.isRoot ? " · root" : ""}
          </span>
        </Field>,
        <Field label={`DECLARED DEPENDENCIES (${deps.length})`}>
          {deps.length ? (
            <div class="space-y-0 divide-y divide-[#3d3a39]/40 border border-[#3d3a39] rounded-[6px] bg-[#1a1a1a]/30 px-3">
              {deps.map(([name, { version, type }]) => (
                <div key={name} class="flex items-center justify-between gap-3 py-2">
                  <span class="font-mono text-[11.5px] text-[#f2f2f2] overflow-hidden text-ellipsis whitespace-nowrap">
                    {name}
                  </span>
                  <span class="font-mono text-[11px] text-[#8b949e] shrink-0">
                    {version} <span class="text-[#3d3a39]">· {type}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span class="text-xs font-mono text-[#8b949e]">No dependencies declared.</span>
          )}
        </Field>,
      ],
    }
  }

  const dep = state.type === "package" ? state.name : state.dep
  const rows = collectUsage(data, dep)
  if (!rows.length) return null
  const pin = suggestedPin(rows)

  if (state.type === "cell") {
    const ws = data.workspaces.find((w) => w.relPath === state.workspace)
    const usage = ws ? rows.find((r) => r.ws.relPath === ws.relPath) : undefined
    const others = rows.filter((r) => r.ws.relPath !== state.workspace)
    return {
      title: dep,
      pathToCopy: ws?.absPath ?? null,
      pin,
      fields: [
        <Field label="TARGET WORKSPACE">
          <Mono>{state.workspace}</Mono>
        </Field>,
        <Field label="DECLARED VERSION">
          <Mono>{state.version}</Mono>
        </Field>,
        <Field label="DEPENDENCY FIELD">
          <span class="text-[13px] font-mono text-[#bdbdbd]">{usage ? fieldName(usage.type) : "—"}</span>
        </Field>,
        <Field label="MANIFEST PATH">
          <PathRow path={ws?.absPath ?? state.workspace} notify={notify} />
        </Field>,
        ...(others.length
          ? [
              <Field label="OTHER WORKSPACES">
                <div class="space-y-0 divide-y divide-[#3d3a39]/40 border border-[#3d3a39] rounded-[6px] bg-[#1a1a1a]/30 px-3">
                  {others.map((r) => (
                    <div key={r.ws.relPath} class="flex items-center justify-between gap-3 py-2">
                      <span class="font-mono text-[11.5px] text-[#bdbdbd] overflow-hidden text-ellipsis whitespace-nowrap">
                        {r.ws.relPath}
                      </span>
                      <span class="font-mono text-[11px] text-[#f2f2f2] shrink-0 font-medium">
                        {r.version}
                      </span>
                    </div>
                  ))}
                </div>
              </Field>,
            ]
          : []),
        ...(pin ? [<PinField pin={pin} />] : []),
      ],
    }
  }

  return {
    title: dep,
    pathToCopy: rows[0]?.ws.absPath ?? null,
    pin,
    fields: [
      <Field label="DECLARED ACROSS WORKSPACES">
        <div class="space-y-0 divide-y divide-[#3d3a39]/40 border border-[#3d3a39] rounded-[6px] bg-[#1a1a1a]/30 px-3">
          {rows.map((r) => (
            <div key={r.ws.relPath} class="flex items-center justify-between gap-3 py-2">
              <span class="font-mono text-[11.5px] text-[#bdbdbd] overflow-hidden text-ellipsis whitespace-nowrap">
                {r.ws.relPath}
              </span>
              <span class="font-mono text-[11px] text-[#f2f2f2] shrink-0 font-medium">{r.version}</span>
            </div>
          ))}
        </div>
      </Field>,
      ...(pin ? [<PinField pin={pin} />] : []),
    ],
  }
}

function Field({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="mb-5">
      <div class="text-[10.5px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] mb-2">{label}</div>
      {children}
    </div>
  )
}

function Mono({ children }: { children: preact.ComponentChildren }) {
  return <span class="font-mono text-[12.5px] text-[#f2f2f2]">{children}</span>
}

function PathRow({ path, notify }: { path: string; notify: (m: string) => void }) {
  return (
    <div class="flex items-center gap-2">
      <span class="font-mono text-[11.5px] text-[#8b949e] break-all flex-1">{path}</span>
      <button
        class="flex items-center justify-center w-6 h-6 rounded-[4px] hover:bg-[#1a1a1a] border border-transparent hover:border-[#3d3a39] text-[#8b949e] hover:text-[#f2f2f2] transition-colors shrink-0"
        title="Copy path"
        onClick={() =>
          navigator.clipboard
            ?.writeText(path)
            .then(() => notify("Path copied"))
            .catch(() => {})
        }
      >
        <IconCopy size={12} />
      </button>
    </div>
  )
}

function PinField({ pin }: { pin: string }) {
  return (
    <Field label="SUGGESTED ALIGNMENT PIN">
      <div class="flex items-center gap-2.5 px-3.5 py-2.5 bg-[#00d992]/8 border border-[#00d992]/25 rounded-[6px]">
        <span class="text-xs text-[#8b949e]">Pin every workspace to</span>
        <code class="font-mono text-[12px] text-[#00d992] font-bold">{pin}</code>
      </div>
    </Field>
  )
}

export function Drawer({ data, state, onClose, notify }: DrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  if (!data || !state) return null

  const content = buildContent(data, state, notify)
  if (!content) return null

  return (
    <>
      <div
        ref={overlayRef}
        class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === overlayRef.current) onClose()
        }}
      />
      <div
        class="fixed top-0 right-0 bottom-0 w-[380px] z-50 bg-[#101010] border-l border-[#3d3a39] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div class="flex items-center gap-3 px-6 py-4.5 border-b border-[#3d3a39] bg-[#1a1a1a]/30 shrink-0">
          <div class="font-mono font-bold text-sm text-[#ffffff] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {content.title}
          </div>
          <button
            class="flex items-center justify-center w-7 h-7 rounded-[6px] hover:bg-[#1a1a1a] border border-transparent hover:border-[#3d3a39] text-[#8b949e] hover:text-[#f2f2f2] transition-colors"
            onClick={onClose}
            title="Close (Esc)"
          >
            <IconX size={15} />
          </button>
        </div>

        {/* Content body */}
        <div class="flex-1 overflow-y-auto px-6 py-5">{content.fields}</div>

        {/* Bottom Actions */}
        <div class="flex gap-2.5 px-6 py-4 border-t border-[#3d3a39] bg-[#1a1a1a]/20 shrink-0">
          <button
            class="flex items-center gap-1.5 h-8 px-3 bg-[#101010] hover:bg-[#1a1a1a] border border-[#3d3a39] hover:border-[#8b949e] rounded-[6px] text-xs font-medium text-[#f2f2f2] transition-colors disabled:opacity-40"
            disabled={!content.pathToCopy}
            onClick={() => content.pathToCopy && copy(content.pathToCopy, "Path copied", notify)}
          >
            <IconCopy size={11} className="text-[#8b949e]" />
            <span>Copy path</span>
          </button>
          <button
            class="flex items-center gap-1.5 h-8 px-3.5 bg-[#00d992] hover:bg-[#2fd6a1] rounded-[6px] text-xs text-[#101010] font-semibold transition-colors disabled:opacity-40"
            disabled={!content.pin}
            onClick={() => content.pin && copy(content.pin, "Suggested pin copied", notify)}
          >
            <span>Copy suggested pin</span>
          </button>
        </div>
      </div>
    </>
  )
}
