import { useCallback, useEffect, useRef, useState } from "preact/hooks"
import { Shell } from "./components/shell"
import { Dashboard } from "./components/dashboard"
import { Matrix } from "./components/matrix"
import { Conflicts } from "./components/conflicts"
import { Hygiene } from "./components/hygiene"
import { Workspaces } from "./components/workspaces"
import { WorkspaceDetails } from "./components/workspace-details"
import { Packages } from "./components/packages"
import { Outdated } from "./components/outdated"
import { Drawer } from "./components/drawer"
import { CommandPalette } from "./components/command-palette"
import { Picker } from "./components/picker"
import { Toast } from "./components/toast"
import { useScan, getToken } from "./hooks/use-scan"
import type { ScanResult } from "../../types"
import type { DrawerState, ScanUiOptions, TabId, Theme } from "./types"

const THEME_KEY = "pkg-audit-theme"
const TAB_IDS: TabId[] = [
  "dashboard",
  "matrix",
  "conflicts",
  "outdated",
  "hygiene",
  "workspaces",
  "workspace-details",
  "packages",
]

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === "dark" || saved === "light") return saved
  } catch {
    // Storage unavailable.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

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
  const { result, loading, error, scan } = useScan()
  const [tab, setTab] = useState<TabId>("dashboard")
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(initialTheme)
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
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Storage unavailable.
    }
  }, [theme])

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
      <div class="app" data-theme={theme}>
        <Picker onScan={handleScan} />
      </div>
    )
  }

  return (
    <div class="app" data-theme={theme}>
      <Shell
        dir={data?.root ?? ""}
        tab={tab}
        onTabChange={setTab}
        loading={loading}
        data={data}
        theme={theme}
        onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onScan={() => void handleScan(data?.root)}
        onScanDir={(dir) => void handleScan(dir)}
        onOutdated={() => void handleScan(data?.root, { outdated: true, changelog: true })}
        onExportHtml={() => void handleCommand("export-html")}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <main class="shell content">
        {loading && (
          <div class="loading">
            <div class="spinner" />
            <p>Scanning…</p>
          </div>
        )}
        {error && (
          <div class="error-banner">
            {error.message}
            {error.code === "NO_DIR" && " — choose a folder below"}
          </div>
        )}
        {data && tab === "dashboard" && (
          <Dashboard
            data={data}
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
        {data && tab === "conflicts" && <Conflicts data={data} notify={notify} />}
        {data && tab === "outdated" && (
          <Outdated
            data={data}
            onOutdated={() => void handleScan(data.root, { outdated: true, changelog: true })}
          />
        )}
        {data && tab === "hygiene" && <Hygiene data={data} />}
        {data && tab === "workspaces" && (
          <Workspaces data={data} onWorkspaceClick={(relPath) => setDrawer({ type: "workspace", relPath })} />
        )}
        {data && tab === "workspace-details" && (
          <WorkspaceDetails
            data={data}
            onWorkspaceClick={(relPath) => setDrawer({ type: "workspace", relPath })}
          />
        )}
        {data && tab === "packages" && (
          <Packages data={data} onWorkspaceClick={(relPath) => setDrawer({ type: "workspace", relPath })} />
        )}
      </main>
      <Drawer data={data} state={drawer} onClose={() => setDrawer(null)} notify={notify} />
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
