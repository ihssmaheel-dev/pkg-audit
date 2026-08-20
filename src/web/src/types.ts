export type TabId =
  | "dashboard"
  | "matrix"
  | "conflicts"
  | "graph"
  | "unused"
  | "security"
  | "dedupe"
  | "licenses"
  | "deprecation"
  | "context"
  | "outdated"
  | "hygiene"
  | "workspaces"

export type NavGroupId = "overview" | "dependencies" | "risk" | "context"

export type Theme = "dark" | "light"

export type DrawerState =
  | { type: "cell"; dep: string; workspace: string; version: string }
  | { type: "package"; name: string }
  | { type: "workspace"; relPath: string }

export interface ScanUiOptions {
  outdated?: boolean
  changelog?: boolean
  security?: boolean
  deprecation?: boolean
}

export type { DeprecatedPackage, DeprecationSummary } from "../../types.js"
