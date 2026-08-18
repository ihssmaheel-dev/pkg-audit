import { useCallback, useEffect, useRef, useState } from "preact/hooks"
import { Shell } from "./components/shell"
import { Dashboard } from "./components/dashboard"
import { Matrix } from "./components/matrix"
import { Conflicts } from "./components/conflicts"
import { Hygiene } from "./components/hygiene"
import { Workspaces } from "./components/workspaces"
import { Outdated } from "./components/outdated"
import { Drawer } from "./components/drawer"
import { CommandPalette } from "./components/command-palette"
import { Picker } from "./components/picker"
import { Toast } from "./components/toast"
import { useScan, getToken } from "./hooks/use-scan"
import type { ScanResult } from "../../types"
import type { DrawerState, ScanUiOptions, TabId } from "./types"

const TAB_IDS: TabId[] = ["dashboard", "matrix", "conflicts", "outdated", "hygiene", "workspaces"]

function conflictsAsMarkdown(data: ScanResult): string {
  if (!data.conflicts.length) return ""
  let md = "## Version Conflicts\n\n"
  for (const conflict of data.conflicts) {
    md += `- **${conflict.name}** — ${conflict.severity} version differs\n`
    for (const v of conflict.versions) {
      for (const occ of v.occurrences) {
        md += `  - ${occ.workspace}: \`${v.version}\` (${occ.type})\n`
      }
    }
    md += "\n"
  }
  return md
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard unavailable.
  }
}

export function App() {
  const embedded = window.__PKG_AUDIT__
  const { result, loading, error, scan, applyFix } = useScan()
  const [tab, setTab] = useState<TabId>("dashboard")
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  const data: ScanResult | null = result ?? embedded ?? null

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

  useEffect(() => {
    if (!embedded) void scan()
  }, [embedded, scan])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      if (e.key === "Escape") {
        setDrawer(null)
        setPaletteOpen(false)
        return
      }
      const isTyping =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT"
      if (isTyping) return
      const index = Number(e.key) - 1
      if (index >= 0 && index < TAB_IDS.length) setTab(TAB_IDS[index])
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const handleScan = useCallback(
    async (dir?: string, opts?: ScanUiOptions) => {
      return scan(dir, opts)
    },
    [scan]
  )

  const handleFix = useCallback(
    async (fixes: Array<{ name: string; targetVersion: string; workspaces?: string[] }>) => {
      const res = await applyFix(fixes, data?.root)
      if (res.ok) {
        notify(`Applied fix across manifests`)
      }
    },
    [applyFix, data?.root, notify]
  )

  const handleCommand = useCallback(
    async (command: string, payload?: string) => {
      switch (command) {
        case "rescan":
          await handleScan(data?.root)
          break
        case "outdated":
          await handleScan(data?.root, { outdated: true, changelog: true })
          break
        case "goto":
          if (payload && TAB_IDS.includes(payload as TabId)) {
            setTab(payload as TabId)
          }
          break
        case "export-html": {
          const token = getToken()
          window.open(`/api/export.html${token ? `?token=${token}` : ""}`, "_blank")
          break
        }
        case "copy-conflicts":
          if (data) {
            await copyText(conflictsAsMarkdown(data))
            notify("Copied conflicts as markdown")
          }
          break
        case "open-package":
          if (payload) setDrawer({ type: "package", name: payload })
          break
        case "open-workspace":
          if (payload) setDrawer({ type: "workspace", relPath: payload })
          break
      }
    },
    [data, handleScan, notify]
  )

  const showPicker = !embedded && !data && !loading && !error

  if (showPicker) {
    return (
      <div class="bg-[#101010] min-h-screen text-[#f2f2f2]">
        <Picker onScan={handleScan} />
      </div>
    )
  }

  return (
    <div class="bg-[#101010] min-h-screen text-[#f2f2f2]">
      <Shell
        dir={data?.root ?? ""}
        tab={tab}
        onTabChange={setTab}
        loading={loading}
        data={data}
        onScan={() => void handleScan(data?.root)}
        onScanDir={(dir) => void handleScan(dir)}
        onExportHtml={() => void handleCommand("export-html")}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <main class="w-full px-8 py-8 max-[640px]:px-4">
        {loading && !data && (
          <div class="flex flex-col items-center justify-center gap-3 py-24 text-[#8b949e] text-sm">
            <div class="w-5 h-5 rounded-full border-2 border-[#3d3a39] border-t-[#00d992] spinner" />
            <p class="font-mono text-xs text-[#8b949e]">Scanning dependencies…</p>
          </div>
        )}
        {error && (
          <div class="flex items-center gap-2 mb-6 px-4 py-3 bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-[8px] text-sm text-[#f43f5e]">
            {error.message}
            {error.code === "NO_DIR" && " — choose a folder below"}
          </div>
        )}
        {data && tab === "dashboard" && (
          <Dashboard
            data={data}
            loading={loading}
            onOutdated={() => void handleScan(data.root, { outdated: true, changelog: true })}
            onTabChange={setTab}
          />
        )}
        {data && tab === "matrix" && (
          <Matrix
            data={data}
            onCellClick={setDrawer}
            onWorkspaceClick={(relPath) => setDrawer({ type: "workspace", relPath })}
          />
        )}
        {data && tab === "conflicts" && (
          <Conflicts data={data} notify={notify} onFix={embedded ? undefined : handleFix} />
        )}
        {data && tab === "outdated" && (
          <Outdated
            data={data}
            loading={loading}
            onOutdated={() => void handleScan(data.root, { outdated: true, changelog: true })}
          />
        )}
        {data && tab === "hygiene" && <Hygiene data={data} />}
        {data && tab === "workspaces" && (
          <Workspaces data={data} onWorkspaceClick={(relPath) => setDrawer({ type: "workspace", relPath })} />
        )}
      </main>
      <Drawer
        data={data}
        state={drawer}
        onClose={() => setDrawer(null)}
        notify={notify}
        onFix={embedded ? undefined : handleFix}
      />
      {paletteOpen && (
        <CommandPalette
          data={data}
          onSelect={(command, payload) => void handleCommand(command, payload)}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      <Toast message={toast} />
    </div>
  )
}
