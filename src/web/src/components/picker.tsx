import { useEffect, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import { IconChevronRight, IconFolder, IconFolderOpen, IconRefreshCw, IconStar } from "./icons"

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
    <div class="flex items-center justify-center min-h-screen px-6">
      <div class="w-full max-w-[520px] bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
        <div class="flex items-center gap-2.5 mb-2">
          <span class="w-2.5 h-2.5 rounded-full bg-indigo-500" />
          <h1 class="font-mono font-bold text-xl tracking-tight text-zinc-100">pkg-audit</h1>
        </div>
        <p class="text-sm text-zinc-500 mb-7 leading-relaxed">
          Scan a JS/TS monorepo and see dependency drift instantly.
        </p>

        <form
          class="flex items-center gap-2 mb-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (path.trim()) void scanDir(path.trim())
          }}
        >
          <input
            type="text"
            class="flex-1 h-9 px-3 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-lg font-mono text-[13px] text-zinc-100 outline-none transition-colors"
            placeholder="~/code/my-monorepo or F:\projects\my-app"
            value={path}
            onInput={(e) => setPath((e.target as HTMLInputElement).value)}
          />
          <button
            type="submit"
            class="flex items-center gap-1.5 h-9 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors shrink-0"
            disabled={loading || !path.trim()}
          >
            <IconRefreshCw size={13} />
            Scan
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 h-9 px-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 rounded-lg text-sm font-medium transition-colors shrink-0"
            onClick={() => void browse()}
            disabled={loading}
          >
            <IconFolderOpen size={13} />
            Browse…
          </button>
        </form>

        {error && (
          <div class="mb-4 px-3 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-400">
            {error}
          </div>
        )}

        {recents.favorites.length > 0 && (
          <div class="mt-5">
            <h2 class="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">
              <IconStar size={10} /> Favorites
            </h2>
            {recents.favorites.map((dir) => (
              <button
                key={dir}
                class="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg font-mono text-xs text-zinc-400 hover:bg-zinc-800 transition-colors text-left"
                onClick={() => void scanDir(dir)}
              >
                <IconFolder size={12} />
                <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{dir}</span>
                <IconChevronRight size={11} />
              </button>
            ))}
          </div>
        )}

        {recentsList.length > 0 && (
          <div class="mt-4">
            <h2 class="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">Recent</h2>
            {recentsList.map((dir) => (
              <button
                key={dir}
                class="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg font-mono text-xs text-zinc-400 hover:bg-zinc-800 transition-colors text-left"
                onClick={() => void scanDir(dir)}
              >
                <IconFolder size={12} />
                <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{dir}</span>
                <IconChevronRight size={11} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
