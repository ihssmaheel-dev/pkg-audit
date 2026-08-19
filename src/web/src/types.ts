export type TabId =
  | "dashboard"
  | "matrix"
  | "conflicts"
  | "graph"
  | "unused"
  | "security"
  | "outdated"
  | "hygiene"
  | "workspaces"

export type Theme = "dark" | "light"

export type DrawerState =
  | { type: "cell"; dep: string; workspace: string; version: string }
  | { type: "package"; name: string }
  | { type: "workspace"; relPath: string }

export interface ScanUiOptions {
  outdated?: boolean
  changelog?: boolean
  security?: boolean
}
