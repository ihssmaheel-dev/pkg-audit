import { useCallback, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import type { ScanUiOptions } from "../types"

export interface ScanErrorState {
  message: string
  code?: string
}

export function getToken(): string | null {
  const metaToken = document.querySelector('meta[name="pkg-audit-token"]')?.getAttribute("content")
  if (metaToken) return metaToken
  try {
    return new URLSearchParams(window.location.search).get("token") ?? null
  } catch {
    return null
  }
}

export function useScan() {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ScanErrorState | null>(null)

  const scan = useCallback(async (dir?: string, opts: ScanUiOptions = {}): Promise<ScanResult | null> => {
    setLoading(true)
    setError(null)
    try {
      const token = getToken()
      const params = new URLSearchParams()
      if (dir) params.set("dir", dir)
      if (opts.outdated) params.set("outdated", "true")
      if (opts.changelog) params.set("changelog", "true")
      const query = params.toString()
      const url = `/api/scan${query ? `?${query}` : ""}${token ? `${query ? "&" : "?"}token=${token}` : ""}`

      const res = await fetch(url)
      const body = (await res.json().catch(() => ({}))) as ScanResult & {
        error?: string
        code?: string
      }
      if (!res.ok) {
        setError({ message: body.error ?? `Request failed (${res.status})`, code: body.code })
        return null
      }
      setResult(body)
      return body
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : "Network error",
      })
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { result, loading, error, scan }
}
