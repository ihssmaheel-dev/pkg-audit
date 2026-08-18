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
  const rows: Usage[] = []
  for (const ws of data.workspaces) {
    const depRecord = ws.deps[dep]
    if (depRecord) rows.push({ ws, version: depRecord.version, type: depRecord.type })
  }
  return rows
}

function fieldName(type: DepType): string {
  switch (type) {
    case "prod":
      return "dependencies"
    case "dev":
      return "devDependencies"
    case "peer":
      return "peerDependencies"
    case "optional":
      return "optionalDependencies"
  }
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
        <div class="drawer-field">
          <div class="drawer-label">Manifest path</div>
          <PathRow path={ws.absPath ?? ws.relPath} notify={notify} />
        </div>,
        <div class="drawer-field">
          <div class="drawer-label">Version</div>
          <div class="drawer-value mono">{ws.version || "—"}</div>
        </div>,
        <div class="drawer-field">
          <div class="drawer-label">Visibility</div>
          <div class="drawer-value">
            {ws.private ? "private" : "public"}
            {ws.isRoot ? " · root" : ""}
          </div>
        </div>,
        <div class="drawer-field">
          <div class="drawer-label">Dependencies ({deps.length})</div>
          {deps.length ? (
            <div>
              {deps.map(([name, { version, type }]) => (
                <div class="drawer-kv" key={name}>
                  <span class="kv-key">{name}</span>
                  <span class="kv-value">
                    {version}
                    <span class="dim"> · {type}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div class="drawer-value dim">No dependencies declared.</div>
          )}
        </div>,
      ],
    }
  }

  const dep = state.type === "package" ? state.name : state.dep
  const rows = collectUsage(data, dep)
  if (!rows.length) return null

  const title = dep
  const pin = suggestedPin(rows)

  if (state.type === "cell") {
    const ws = data.workspaces.find((w) => w.relPath === state.workspace)
    const usage = ws ? rows.find((r) => r.ws.relPath === ws.relPath) : undefined
    const others = rows.filter((r) => r.ws.relPath !== state.workspace)
    return {
      title,
      pathToCopy: ws?.absPath ?? null,
      pin,
      fields: [
        <div class="drawer-field">
          <div class="drawer-label">Workspace</div>
          <div class="drawer-value mono">{state.workspace}</div>
        </div>,
        <div class="drawer-field">
          <div class="drawer-label">Declared version</div>
          <div class="drawer-value mono">{state.version}</div>
        </div>,
        <div class="drawer-field">
          <div class="drawer-label">Field</div>
          <div class="drawer-value">{usage ? fieldName(usage.type) : "—"}</div>
        </div>,
        <div class="drawer-field">
          <div class="drawer-label">Manifest path</div>
          <PathRow path={ws?.absPath ?? state.workspace} notify={notify} />
        </div>,
        ...(others.length
          ? [
              <div class="drawer-field">
                <div class="drawer-label">Other workspaces</div>
                <div>
                  {others.map((r) => (
                    <div class="drawer-kv" key={r.ws.relPath}>
                      <span class="kv-key">{r.ws.relPath}</span>
                      <span class="kv-value">{r.version}</span>
                    </div>
                  ))}
                </div>
              </div>,
            ]
          : []),
        ...(pin
          ? [
              <div class="drawer-field">
                <div class="drawer-label">Suggested alignment</div>
                <div class="drawer-suggest">
                  <div class="lbl">Pin every workspace to</div>
                  <code>{pin}</code>
                </div>
              </div>,
            ]
          : []),
      ],
    }
  }

  return {
    title,
    pathToCopy: rows[0].ws.absPath ?? null,
    pin,
    fields: [
      <div class="drawer-field">
        <div class="drawer-label">Declared across workspaces</div>
        <div>
          {rows.map((r) => (
            <div class="drawer-kv" key={r.ws.relPath}>
              <span class="kv-key">{r.ws.relPath}</span>
              <span class="kv-value">{r.version}</span>
            </div>
          ))}
        </div>
      </div>,
      ...(pin
        ? [
            <div class="drawer-field">
              <div class="drawer-label">Suggested alignment</div>
              <div class="drawer-suggest">
                <div class="lbl">Pin every workspace to</div>
                <code>{pin}</code>
              </div>
            </div>,
          ]
        : []),
    ],
  }
}

interface PathRowProps {
  path: string
  notify: (message: string) => void
}

function PathRow({ path, notify }: PathRowProps) {
  return (
    <div class="drawer-path-row">
      <span>{path}</span>
      <button
        class="icon-btn"
        title="Copy path"
        onClick={() =>
          navigator.clipboard
            ?.writeText(path)
            .then(() => notify("Path copied"))
            .catch(() => {})
        }
      >
        <IconCopy size={13} />
      </button>
    </div>
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
        class={`overlay ${state ? "show" : ""}`}
        ref={overlayRef}
        onClick={(e) => {
          if (e.target === overlayRef.current) onClose()
        }}
      />
      <div class={`drawer ${state ? "show" : ""}`} role="dialog" aria-modal="true">
        <div class="drawer-head">
          <div class="drawer-title">{content.title}</div>
          <button class="icon-btn" onClick={onClose} title="Close (Esc)">
            <IconX size={16} />
          </button>
        </div>
        <div class="drawer-body">{content.fields}</div>
        <div class="drawer-actions">
          <button
            class="btn"
            disabled={!content.pathToCopy}
            onClick={() => content.pathToCopy && copy(content.pathToCopy, "Path copied", notify)}
          >
            <IconCopy size={12} />
            Copy path
          </button>
          <button
            class="btn btn-primary"
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
