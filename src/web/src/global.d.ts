import type { ScanResult } from "../../types"

declare global {
  interface Window {
    __PKG_AUDIT__?: ScanResult
  }
}

export {}
