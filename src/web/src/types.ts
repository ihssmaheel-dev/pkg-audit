export type TabId = "matrix" | "conflicts" | "outdated" | "hygiene" | "workspaces"

export type Theme = "dark" | "light"

export interface FilterState {
  severity: "all" | "major" | "range"
  type: "all" | "prod" | "dev"
}

export type DrawerState =
  | { type: "cell"; dep: string; workspace: string; version: string }
  | { type: "package"; name: string }
  | { type: "workspace"; relPath: string }

export interface ScanUiOptions {
  outdated?: boolean
  changelog?: boolean
}
