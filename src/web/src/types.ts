export type TabId =
  | "dashboard"
  | "matrix"
  | "conflicts"
  | "outdated"
  | "hygiene"
  | "workspaces"
  | "workspace-details"
  | "packages"

export type Theme = "dark" | "light"

export type DrawerState =
  | { type: "cell"; dep: string; workspace: string; version: string }
  | { type: "package"; name: string }
  | { type: "workspace"; relPath: string }

export interface ScanUiOptions {
  outdated?: boolean
  changelog?: boolean
}
