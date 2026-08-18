import { useEffect, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import { IconChevronRight, IconFolder, IconFolderOpen, IconPackage, IconRefreshCw, IconStar } from "./icons"

interface RecentsResponse {
  recents: string[]
  favorites: string[]
}

interface PickerProps {
  onScan: (dir: string, opts?: { outdated?: boolean }) => Promise<ScanResult | null>
}

export function Picker({ onScan }: PickerProps) {
  const [path, setPath] = useState("")
  const [recents, setRecents] = useState<RecentsResponse>({ recents: [], favorites: [] })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void fetch("/api/recents")
      .then((res) => res.json())
      .then((body: RecentsResponse) => setRecents(body))
      .catch(() => {})
  }, [])

  const scanDir = async (dir: string) => {
    setLoading(true)
    setError(null)
    const result = await onScan(dir)
    setLoading(false)
    if (!result) setError("Could not scan that folder.")
  }

  const browse = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/pick-folder", { method: "POST" })
      const body = (await res.json()) as { path?: string | null }
      if (body.path) {
        await scanDir(body.path)
        return
      }
      setError("No folder selected.")
    } catch {
      setError("Could not open the folder picker.")
    }
    setLoading(false)
  }

  const recentsList = recents.recents.filter((r) => !recents.favorites.includes(r))

  return (
    <main class="picker-view">
      <div class="picker-card">
        <div class="picker-brand">
          <IconPackage size={28} />
          <h1>pkg-audit</h1>
        </div>
        <p class="picker-subtitle">Scan a JS/TS monorepo and see dependency drift instantly.</p>

        <form
          class="picker-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (path.trim()) void scanDir(path.trim())
          }}
        >
          <input
            type="text"
            class="picker-input"
            placeholder="~/code/my-monorepo"
            value={path}
            onInput={(e) => setPath((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn btn-primary" disabled={loading || !path.trim()}>
            <IconRefreshCw size={14} />
            Scan
          </button>
          <button type="button" class="btn" onClick={() => void browse()} disabled={loading}>
            <IconFolderOpen size={14} />
            Browse…
          </button>
        </form>

        {error && <div class="error-banner">{error}</div>}

        {recents.favorites.length > 0 && (
          <div class="picker-section">
            <h2>
              <IconStar size={14} />
              Favorites
            </h2>
            {recents.favorites.map((dir) => (
              <button class="picker-recent" key={dir} onClick={() => void scanDir(dir)}>
                <IconFolder size={14} />
                <span>{dir}</span>
                <IconChevronRight size={12} />
              </button>
            ))}
          </div>
        )}

        {recentsList.length > 0 && (
          <div class="picker-section">
            <h2>Recent</h2>
            {recentsList.map((dir) => (
              <button class="picker-recent" key={dir} onClick={() => void scanDir(dir)}>
                <IconFolder size={14} />
                <span>{dir}</span>
                <IconChevronRight size={12} />
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
