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

  const applyFix = useCallback(
    async (
      payload:
        | Array<{ name: string; targetVersion: string; workspaces?: string[] }>
        | {
            action?: "align" | "remove-unused" | "declare-phantom" | "catalog-migrate"
            fixes?: Array<{ name: string; targetVersion: string; workspaces?: string[] }>
            unused?: Array<{ workspace: string; pkg: string; type?: string }>
            phantoms?: Array<{ workspace: string; pkg: string; version: string; type?: "prod" | "dev" }>
            catalogStrategy?: "highest" | "most-frequent"
            catalogAll?: boolean
          },
      dir?: string
    ): Promise<{ ok: boolean; count: number; result: ScanResult | null }> => {
      setLoading(true)
      setError(null)
      try {
        const token = getToken()
        const url = `/api/fix${token ? `?token=${token}` : ""}`
        const bodyPayload = Array.isArray(payload)
          ? { dir, fixes: payload, action: "align" }
          : { dir, ...payload }

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        })
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          result?: ScanResult
          changes?: Array<{ pkg: string; from: string; to: string; workspace: string }>
          error?: string
        }
        if (!res.ok || !body.result) {
          setError({ message: body.error ?? `Fix request failed (${res.status})` })
          return { ok: false, count: 0, result: null }
        }
        setResult(body.result)
        return { ok: true, count: body.changes?.length ?? 0, result: body.result }
      } catch (err) {
        setError({
          message: err instanceof Error ? err.message : "Fix request network error",
        })
        return { ok: false, count: 0, result: null }
      } finally {
        setLoading(false)
      }
    },
    []
  )

  return { result, loading, error, scan, applyFix }
}
