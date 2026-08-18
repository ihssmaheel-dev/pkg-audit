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
        <Field label="Manifest path">
          <PathRow path={ws.absPath ?? ws.relPath} notify={notify} />
        </Field>,
        <Field label="Version">
          <Mono>{ws.version || "—"}</Mono>
        </Field>,
        <Field label="Visibility">
          <span class="text-[13px] text-zinc-300">
            {ws.private ? "private" : "public"}
            {ws.isRoot ? " · root" : ""}
          </span>
        </Field>,
        <Field label={`Dependencies (${deps.length})`}>
          {deps.length ? (
            <div class="space-y-0 divide-y divide-zinc-800/40">
              {deps.map(([name, { version, type }]) => (
                <div key={name} class="flex items-center justify-between gap-3 py-1.5">
                  <span class="font-mono text-[11.5px] text-zinc-300 overflow-hidden text-ellipsis whitespace-nowrap">
                    {name}
                  </span>
                  <span class="font-mono text-[11px] text-zinc-500 shrink-0">
                    {version} <span class="text-zinc-700">· {type}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span class="text-xs text-zinc-600">No dependencies declared.</span>
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
        <Field label="Workspace">
          <Mono>{state.workspace}</Mono>
        </Field>,
        <Field label="Declared version">
          <Mono>{state.version}</Mono>
        </Field>,
        <Field label="Field">
          <span class="text-[13px] text-zinc-300">{usage ? fieldName(usage.type) : "—"}</span>
        </Field>,
        <Field label="Manifest path">
          <PathRow path={ws?.absPath ?? state.workspace} notify={notify} />
        </Field>,
        ...(others.length
          ? [
              <Field label="Other workspaces">
                <div class="space-y-0 divide-y divide-zinc-800/40">
                  {others.map((r) => (
                    <div key={r.ws.relPath} class="flex items-center justify-between gap-3 py-1.5">
                      <span class="font-mono text-[11.5px] text-zinc-400 overflow-hidden text-ellipsis whitespace-nowrap">
                        {r.ws.relPath}
                      </span>
                      <span class="font-mono text-[11px] text-zinc-500 shrink-0">{r.version}</span>
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
    pathToCopy: rows[0].ws.absPath ?? null,
    pin,
    fields: [
      <Field label="Declared across workspaces">
        <div class="space-y-0 divide-y divide-zinc-800/40">
          {rows.map((r) => (
            <div key={r.ws.relPath} class="flex items-center justify-between gap-3 py-1.5">
              <span class="font-mono text-[11.5px] text-zinc-400 overflow-hidden text-ellipsis whitespace-nowrap">
                {r.ws.relPath}
              </span>
              <span class="font-mono text-[11px] text-zinc-500 shrink-0">{r.version}</span>
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
    <div class="mb-4">
      <div class="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">{label}</div>
      {children}
    </div>
  )
}

function Mono({ children }: { children: preact.ComponentChildren }) {
  return <span class="font-mono text-[12px] text-zinc-300">{children}</span>
}

function PathRow({ path, notify }: { path: string; notify: (m: string) => void }) {
  return (
    <div class="flex items-center gap-2">
      <span class="font-mono text-[11.5px] text-zinc-400 break-all flex-1">{path}</span>
      <button
        class="flex items-center justify-center w-6 h-6 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
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
    <Field label="Suggested alignment">
      <div class="flex items-center gap-2 px-3 py-2 bg-emerald-500/8 border border-emerald-500/20 rounded-lg">
        <span class="text-xs text-zinc-500">Pin every workspace to</span>
        <code class="font-mono text-[12px] text-emerald-400 font-semibold">{pin}</code>
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

  if (!data || !state)
    return (
      <>
        <div class="fixed inset-0 z-40 pointer-events-none opacity-0 transition-opacity" />
        <div class="fixed top-0 right-0 bottom-0 w-[360px] z-50 translate-x-full transition-transform duration-200" />
      </>
    )

  const content = buildContent(data, state, notify)
  if (!content) return null

  return (
    <>
      <div
        ref={overlayRef}
        class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === overlayRef.current) onClose()
        }}
      />
      <div
        class="fixed top-0 right-0 bottom-0 w-[360px] z-50 bg-zinc-900 border-l border-zinc-800 flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Head */}
        <div class="flex items-center gap-3 px-5 py-4 border-b border-zinc-800 shrink-0">
          <div class="font-mono font-bold text-sm text-zinc-100 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
            {content.title}
          </div>
          <button
            class="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={onClose}
            title="Close (Esc)"
          >
            <IconX size={15} />
          </button>
        </div>

        {/* Body */}
        <div class="flex-1 overflow-y-auto px-5 py-5">{content.fields}</div>

        {/* Actions */}
        <div class="flex gap-2 px-5 py-4 border-t border-zinc-800 shrink-0">
          <button
            class="flex items-center gap-1.5 h-8 px-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors disabled:opacity-40"
            disabled={!content.pathToCopy}
            onClick={() => content.pathToCopy && copy(content.pathToCopy, "Path copied", notify)}
          >
            <IconCopy size={11} /> Copy path
          </button>
          <button
            class="flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs text-white font-semibold transition-colors disabled:opacity-40"
            disabled={!content.pin}
            onClick={() => content.pin && copy(content.pin, "Suggested pin copied", notify)}
          >
            Copy suggested pin
          </button>
        </div>
      </div>
    </>
  )
}
