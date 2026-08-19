export type DepType = "prod" | "dev" | "peer" | "optional"

export interface DepRecord {
  version: string
  type: DepType
}

export interface Workspace {
  relPath: string
  absPath?: string
  name: string
  version: string
  private: boolean
  isRoot: boolean
  packageManager: string | null
  enginesNode: string | null
  deps: Record<string, DepRecord>
  depCount: number
  devCount: number
}

export interface DepOccurrence {
  workspace: string
  type: DepType
}

export type DepMap = Map<string, Map<string, DepOccurrence[]>>

export type ConflictSeverity = "major" | "range"

export interface ConflictVersion {
  version: string
  occurrences: DepOccurrence[]
}

export interface Conflict {
  name: string
  severity: ConflictSeverity
  versions: ConflictVersion[]
}

export type HygieneKind = "unnamed" | "duplicate-name" | "packageManager" | "engines"

export interface HygieneIssue {
  kind: HygieneKind
  message: string
}

export type OutdatedStatus =
  "major" | "minor" | "patch" | "unknown" | "not-published" | "error" | "up-to-date"

export type ChangelogStatus = "ok" | "approx" | "no-release" | "no-repo" | "rate-limited"

export interface Changelog {
  status: ChangelogStatus
  repo?: string
  reason?: string
  tag?: string
  title?: string
  url?: string
  publishedAt?: string
  bodyLines?: string[]
}

export interface OutdatedRecord {
  name: string
  current: string | null
  latest: string | null
  status: OutdatedStatus
  error?: string
  changelog?: Changelog
}

export interface OutdatedResult {
  all: OutdatedRecord[]
  outdated: OutdatedRecord[]
  unpublished: string[]
  networkErrors: { name: string; error: string }[]
  upToDate: OutdatedRecord[]
}

export interface ScanError {
  path: string
  error: string
}

export interface ScanMeta {
  ignoredDirs: string[]
  skippedGitignored: number
  toolVersion: string
  totalDepDeclarations: number
  totalUniquePackages: number
}

export interface WorkspaceGraphNode {
  name: string
  relPath: string
  isRoot: boolean
  deps: string[]
  dependedBy: string[]
  depth: number
  hasCycle: boolean
}

export interface WorkspaceGraphEdge {
  from: string
  to: string
  type: DepType
  version: string
  isCircular: boolean
}

export interface WorkspaceCycle {
  path: string[]
  length: number
}

export interface WorkspaceGraph {
  nodes: WorkspaceGraphNode[]
  edges: WorkspaceGraphEdge[]
  cycles: WorkspaceCycle[]
  hasCycles: boolean
  maxDepth: number
}

export interface PhantomDependency {
  name: string
  workspace: string
  files: string[]
  suggestedVersion: string | null
  hoistedFrom: string | null
}

export interface UnusedDependency {
  name: string
  workspace: string
  version: string
  type: DepType
  isDevTool: boolean
}

export interface UnusedScanResult {
  phantoms: PhantomDependency[]
  unused: UnusedDependency[]
  scannedFilesCount: number
}

export interface ScanResult {
  version: 1
  root: string
  scannedMs: number
  workspaces: Workspace[]
  conflicts: Conflict[]
  hygieneIssues: HygieneIssue[]
  graph: WorkspaceGraph
  unused: UnusedScanResult
  outdated: OutdatedResult | null
  errors: ScanError[]
  meta: ScanMeta
}

export interface ProgressEvent {
  phase: "outdated"
  done: number
  total: number
}

export type RegistryStatus = "ok" | "not-published" | "error" | "network-error"

export interface RegistryResult {
  name: string
  status: RegistryStatus
  latest?: string
  error?: string
}
