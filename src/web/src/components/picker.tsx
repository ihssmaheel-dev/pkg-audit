import { useEffect, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import { getToken } from "../hooks/use-scan"
import { IconChevronRight, IconFolder, IconFolderOpen, IconRefreshCw, IconStar, IconZap } from "./icons"

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
    const token = getToken()
    void fetch(`/api/recents${token ? `?token=${token}` : ""}`)
      .then((res) => res.json())
      .then((body: RecentsResponse) => setRecents(body))
      .catch(() => {})
  }, [])

  const scanDir = async (dir: string) => {
    setLoading(true)
    setError(null)
    const result = await onScan(dir)
    setLoading(false)
    if (!result) setError("Could not scan that folder. Verify that package.json exists.")
  }

  const browse = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = getToken()
      const res = await fetch(`/api/pick-folder${token ? `?token=${token}` : ""}`, { method: "POST" })
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
    <div class="flex items-center justify-center min-h-screen px-6 bg-[#101010]">
      <div class="w-full max-w-[540px] bg-[#101010] border border-[#3d3a39] rounded-[8px] p-8">
        {/* Brand Header */}
        <div class="flex items-center gap-2.5 mb-2">
          <div class="flex items-center justify-center w-7 h-7 rounded-[6px] bg-[#00d992]/10 border border-[#00d992]/30 text-[#00d992]">
            <IconZap size={16} />
          </div>
          <h1 class="font-mono font-bold text-xl tracking-tight text-[#ffffff]">pkg-audit</h1>
        </div>
        <p class="text-sm text-[#bdbdbd] mb-6 leading-relaxed">
          Developer-first monorepo dependency drift & conflict auditor.
        </p>

        {/* Scan Input Form */}
        <form
          class="flex items-center gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (path.trim()) void scanDir(path.trim())
          }}
        >
          <input
            type="text"
            class="flex-1 h-9 px-3 bg-[#1a1a1a] border border-[#3d3a39] focus:border-[#00d992] rounded-[6px] font-mono text-[12.5px] text-[#f2f2f2] placeholder-[#8b949e] outline-none transition-colors"
            placeholder="~/code/my-monorepo or F:\projects\my-app"
            value={path}
            onInput={(e) => setPath((e.target as HTMLInputElement).value)}
          />
          <button
            type="submit"
            class="flex items-center gap-1.5 h-9 px-4 bg-[#00d992] hover:bg-[#2fd6a1] disabled:opacity-40 text-[#101010] rounded-[6px] text-xs font-semibold transition-colors shrink-0"
            disabled={loading || !path.trim()}
          >
            <IconRefreshCw size={13} className={loading ? "spinner" : ""} />
            <span>Scan</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 h-9 px-3.5 bg-[#1a1a1a] hover:bg-[#101010] border border-[#3d3a39] hover:border-[#8b949e] disabled:opacity-40 text-[#f2f2f2] rounded-[6px] text-xs font-medium transition-colors shrink-0"
            onClick={() => void browse()}
            disabled={loading}
          >
            <IconFolderOpen size={13} className="text-[#8b949e]" />
            <span>Browse…</span>
          </button>
        </form>

        {error && (
          <div class="mb-4 px-3.5 py-2.5 bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-[6px] text-xs font-mono text-[#f43f5e]">
            {error}
          </div>
        )}

        {/* Favorites section */}
        {recents.favorites.length > 0 && (
          <div class="mt-6 pt-4 border-t border-[#3d3a39]/50">
            <h2 class="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] mb-2">
              <IconStar size={11} className="text-[#00d992]" />
              <span>FAVORITES</span>
            </h2>
            <div class="space-y-1">
              {recents.favorites.map((dir) => (
                <button
                  key={dir}
                  class="flex items-center gap-2 w-full px-3 py-2 rounded-[6px] font-mono text-xs text-[#bdbdbd] hover:text-[#f2f2f2] hover:bg-[#1a1a1a] border border-transparent hover:border-[#3d3a39] transition-colors text-left"
                  onClick={() => void scanDir(dir)}
                >
                  <IconFolder size={13} className="text-[#8b949e]" />
                  <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{dir}</span>
                  <IconChevronRight size={11} className="text-[#8b949e]" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recents section */}
        {recentsList.length > 0 && (
          <div class="mt-4 pt-4 border-t border-[#3d3a39]/50">
            <h2 class="text-[10.5px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] mb-2">
              RECENT MONOREPOS
            </h2>
            <div class="space-y-1">
              {recentsList.map((dir) => (
                <button
                  key={dir}
                  class="flex items-center gap-2 w-full px-3 py-2 rounded-[6px] font-mono text-xs text-[#bdbdbd] hover:text-[#f2f2f2] hover:bg-[#1a1a1a] border border-transparent hover:border-[#3d3a39] transition-colors text-left"
                  onClick={() => void scanDir(dir)}
                >
                  <IconFolder size={13} className="text-[#8b949e]" />
                  <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{dir}</span>
                  <IconChevronRight size={11} className="text-[#8b949e]" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
