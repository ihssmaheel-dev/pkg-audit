import { useCallback, useEffect, useRef, useState } from "preact/hooks"
import { Shell } from "./components/shell"
import { Dashboard } from "./components/dashboard"
import { Matrix } from "./components/matrix"
import { Conflicts } from "./components/conflicts"
import { Graph } from "./components/graph"
import { UnusedView } from "./components/unused"
import { SecurityView } from "./components/security"
import { DedupeView } from "./components/dedupe"
import { LicensesView } from "./components/licenses"
import { DeprecationView } from "./components/deprecation"
import { AiContextView } from "./components/ai-context"
import { Hygiene } from "./components/hygiene"
import { Workspaces } from "./components/workspaces"
import { Outdated } from "./components/outdated"
import { Drawer } from "./components/drawer"
import { CommandPalette } from "./components/command-palette"
import { Picker } from "./components/picker"
import { Toast } from "./components/toast"
import { SplashScreen } from "./components/splash-screen"
import { useScan, getToken } from "./hooks/use-scan"
import type { ScanResult } from "../../types"
import type { DrawerState, ScanUiOptions, TabId } from "./types"

const TAB_IDS: TabId[] = [
  // Overview & Architecture
  "dashboard",
  "matrix",
  "graph",
  "workspaces",
  // Dependencies & Hygiene
  "conflicts",
  "dedupe",
  "unused",
  "outdated",
  "hygiene",
  // Risk & Governance
  "security",
  "deprecation",
  "licenses",
  // AI Tools
  "context",
]

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
  const [toast, setToast] = useState<{ message: string; variant?: "success" | "error" | "info" } | null>(null)
  const toastTimer = useRef<number | null>(null)

  const [scanMessage, setScanMessage] = useState("Scanning monorepo dependencies…")
  const [scanTargetDir, setScanTargetDir] = useState<string | undefined>(undefined)
  const [isMainScan, setIsMainScan] = useState(!embedded)

  const data: ScanResult | null = result ?? embedded ?? null

  const notify = useCallback((message: string, variant?: "success" | "error" | "info") => {
    setToast({ message, variant })
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

  useEffect(() => {
    if (!embedded) {
      setIsMainScan(true)
      void scan().finally(() => setIsMainScan(false))
    }
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
      if (index >= 0 && index < TAB_IDS.length) setTab(TAB_IDS[index]!)
    }
    window.addEventListener("keydown", handler)
    ;(window as unknown as { __pkgAuditSetTab?: (t: TabId) => void }).__pkgAuditSetTab = (t: TabId) => {
      if (TAB_IDS.includes(t)) setTab(t)
    }
    ;(
      window as unknown as { __pkgAuditScan?: (opts?: ScanUiOptions) => Promise<ScanResult | null> }
    ).__pkgAuditScan = async (opts) => {
      return scan(undefined, opts)
    }

    const onHashChange = () => {
      const h = window.location.hash.replace(/^#/, "") as TabId
      if (TAB_IDS.includes(h)) setTab(h)
    }
    window.addEventListener("hashchange", onHashChange)
    if (window.location.hash) onHashChange()

    return () => {
      window.removeEventListener("keydown", handler)
      window.removeEventListener("hashchange", onHashChange)
    }
  }, [scan])

  const handleScan = useCallback(
    async (dir?: string, opts?: ScanUiOptions) => {
      if (opts?.outdated || opts?.security) {
        setIsMainScan(false)
        return scan(dir, opts)
      }

      setIsMainScan(true)
      if (dir && dir !== data?.root) {
        setScanMessage("Analyzing workspace dependencies…")
        setScanTargetDir(dir)
      } else {
        setScanMessage("Rescanning workspace dependencies…")
      }

      try {
        const [res] = await Promise.all([scan(dir, opts), new Promise((r) => setTimeout(r, 450))])
        return res
      } finally {
        setIsMainScan(false)
      }
    },
    [data?.root, scan]
  )

  const handleFix = useCallback(
    async (
      payload:
        | Array<{ name: string; targetVersion: string; workspaces?: string[] }>
        | {
            action?:
              | "align"
              | "remove-unused"
              | "declare-phantom"
              | "catalog-migrate"
              | "security-fix"
              | "dedupe-apply"
            fixes?: Array<{ name: string; targetVersion: string; workspaces?: string[] }>
            unused?: Array<{ workspace: string; pkg: string; type?: string }>
            phantoms?: Array<{ workspace: string; pkg: string; version: string; type?: "prod" | "dev" }>
            catalogStrategy?: "highest" | "most-frequent"
            catalogAll?: boolean
            overrides?: Record<string, string>
            dedupeStrategy?: "highest" | "most-frequent"
          }
    ) => {
      const res = await applyFix(payload, data?.root)
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
      <SplashScreen
        visible={isMainScan && (loading || (!data && !error && !embedded))}
        message={scanMessage}
        dir={scanTargetDir || data?.root}
      />
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
            notify={notify}
            onCatalogMigrate={embedded ? undefined : (opts) => applyFix(opts, data.root)}
          />
        )}
        {data && tab === "conflicts" && (
          <Conflicts
            data={data}
            notify={notify}
            onFix={embedded ? undefined : handleFix}
            onCatalogMigrate={embedded ? undefined : (opts) => applyFix(opts, data.root)}
          />
        )}
        {data && tab === "graph" && (
          <Graph
            data={data}
            notify={notify}
            onWorkspaceClick={(relPath) => setDrawer({ type: "workspace", relPath })}
          />
        )}
        {data && tab === "unused" && (
          <UnusedView data={data} notify={notify} onFix={embedded ? undefined : handleFix} />
        )}
        {data && tab === "security" && (
          <SecurityView
            data={data}
            loading={loading}
            notify={notify}
            onScanSecurity={() => void handleScan(data.root, { security: true })}
            onFix={embedded ? undefined : handleFix}
          />
        )}
        {data && tab === "dedupe" && (
          <DedupeView
            data={data}
            loading={loading}
            notify={notify}
            onFix={embedded ? undefined : handleFix}
          />
        )}
        {data && tab === "licenses" && <LicensesView data={data} loading={loading} notify={notify} />}
        {data && tab === "deprecation" && (
          <DeprecationView
            deprecation={data.deprecation ?? null}
            loading={loading}
            onRescan={() => void handleScan(data.root, { deprecation: true })}
          />
        )}
        {data && tab === "context" && <AiContextView data={data} notify={notify} />}
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
      <Toast message={toast?.message ?? null} variant={toast?.variant} />
    </div>
  )
}
