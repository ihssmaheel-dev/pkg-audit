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

export interface CatalogEntry {
  name: string
  targetVersion: string
  workspacesCount: number
  workspaces: string[]
  previousVersions: Record<string, string>
}

export interface CatalogPlan {
  catalogEntries: CatalogEntry[]
  strategy: "highest" | "most-frequent"
  totalPackages: number
  totalWorkspacesUpdated: number
  pnpmWorkspaceYamlPath: string
  existingCatalogCount: number
  updatedWorkspaceFiles: string[]
}

export interface CatalogMigrationResult {
  ok: boolean
  pnpmWorkspaceYamlPath: string
  catalogCount: number
  modifiedFiles: string[]
  errors: Array<{ path: string; error: string }>
}

export type SecuritySeverity = "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | "UNKNOWN"

export interface SecurityVulnerability {
  id: string
  aliases: string[]
  pkg: string
  version: string
  severity: SecuritySeverity
  cvssScore?: number
  summary: string
  details?: string
  patchedVersion: string | null
  suggestedVersion: string | null
  advisoryUrl: string
  publishedAt?: string
  workspaces: Array<{
    workspace: string
    type: DepType
    currentVersion: string
  }>
}

export interface SecurityResult {
  vulnerabilities: SecurityVulnerability[]
  criticalCount: number
  highCount: number
  moderateCount: number
  lowCount: number
  totalVulnerablePackages: number
  scannedPackageCount: number
}

export interface DedupeVersionInstance {
  version: string
  dependents: string[]
}

export interface DedupePackage {
  name: string
  versions: DedupeVersionInstance[]
  suggestedVersion: string
  duplicateCount: number
  highestVersion: string
  mostFrequentVersion: string
  estimatedBytesPerInstance?: number
  estimatedSavingsBytes?: number
}

export interface DedupeSavings {
  estimatedBytes: number
  estimatedHuman: string
  redundantInstallsCount: number
}

export interface DedupeResult {
  packageManager: "pnpm" | "npm" | "yarn" | "bun" | "unknown"
  lockfilePath: string | null
  lockfileType: "pnpm-lock.yaml" | "package-lock.json" | "yarn.lock" | "bun.lock" | null
  duplicates: DedupePackage[]
  totalDuplicates: number
  totalWastedVersions: number
  totalInstalledPackages: number
  savings?: DedupeSavings
}

export type LicenseRiskLevel = "permissive" | "weak-copyleft" | "strong-copyleft" | "proprietary" | "unknown"

export interface PackageLicenseInfo {
  name: string
  version: string
  license: string
  spdxId: string
  riskLevel: LicenseRiskLevel
  isCopyleft: boolean
  isProd: boolean
  workspaces: Array<{
    workspace: string
    type: DepType
    spec: string
  }>
  author?: string
  repository?: string
  homepage?: string
  description?: string
}

export interface LicenseScanResult {
  packages: PackageLicenseInfo[]
  permissiveCount: number
  weakCopyleftCount: number
  strongCopyleftCount: number
  proprietaryCount: number
  unknownCount: number
  prodCopyleftCount: number
  totalScanned: number
}

export type InactivitySeverity = "critical" | "severe" | "moderate" | "recent"
export type PopularityTier = "zombie" | "high" | "medium" | "low"

export interface DeprecatedPackage {
  name: string
  version: string
  workspaces: Array<{ workspace: string; type: DepType; rawVersion: string }>
  isProd: boolean
  isDev: boolean
  deprecated: boolean
  deprecationReason?: string
  isAbandoned: boolean
  lastPublished?: string
  yearsSinceLastRelease?: number
  daysSinceLastRelease?: number
  inactivitySeverity: InactivitySeverity
  weeklyDownloads?: number
  popularityTier: PopularityTier
  isZombie: boolean
  replacementSuggestion?: string
  homepage?: string
  repository?: string
}

export interface DeprecationSummary {
  packages: DeprecatedPackage[]
  totalScanned: number
  totalDeprecated: number
  totalAbandoned: number
  totalZombies: number
  deprecatedInProd: number
  deprecatedInDev: number
  abandonedInProd: number
}

// -------------------------------------------------------------
// Suppressions & Expiry
// -------------------------------------------------------------
export type SuppressionKind =
  "security" | "license" | "unused" | "phantom" | "deprecation" | "boundary" | "all"

export interface SuppressionRule {
  id?: string // CVE / GHSA ID or rule ID
  pkg?: string // Package name or pattern
  workspace?: string // Workspace name, relative path, or "*"
  type?: SuppressionKind
  reason: string // Mandatory human explanation
  expires: string // Mandatory ISO expiration date (YYYY-MM-DD)
  created?: string
}

export interface ActiveSuppression {
  rule: SuppressionRule
  target: string
  daysUntilExpiry: number
}

export interface ExpiredSuppression {
  rule: SuppressionRule
  target: string
  expiredDaysAgo: number
}

export interface SuppressionResult {
  filePath?: string
  activeCount: number
  expiredCount: number
  active: ActiveSuppression[]
  expired: ExpiredSuppression[]
}

// -------------------------------------------------------------
// Vulnerability SLA Tracking
// -------------------------------------------------------------
export interface VulnerabilityHistoryEntry {
  id: string
  pkg: string
  version: string
  severity: string
  firstSeenAt: string // ISO date
  lastSeenAt: string // ISO date
  workspace?: string
}

export interface VulnerabilitySLAStatus {
  id: string
  pkg: string
  severity: string
  firstSeenAt: string
  ageInDays: number
  maxAgeDays: number
  isBreached: boolean
  remainingDays: number
}

// -------------------------------------------------------------
// Cross-Boundary Import Enforcement
// -------------------------------------------------------------
export interface BoundaryRule {
  from: string // Glob/path pattern (e.g. "packages/*", "apps/web")
  disallow: string[] // Forbidden target globs (e.g. ["apps/*", "packages/backend"])
  reason?: string
}

export interface BoundaryViolation {
  sourceFile: string
  sourceWorkspace: string
  importedSpecifier: string
  targetWorkspace: string
  ruleDescription: string
}

export interface BoundariesResult {
  violations: BoundaryViolation[]
  totalViolations: number
  rulesEvaluatedCount: number
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
  security: SecurityResult | null
  dedupe: DedupeResult | null
  licenses: LicenseScanResult | null
  deprecation?: DeprecationSummary | null
  boundaries?: BoundariesResult | null
  suppressions?: SuppressionResult | null
  vulnerabilitySLAs?: VulnerabilitySLAStatus[] | null
  errors: ScanError[]
  meta: ScanMeta
  catalog?: CatalogPlan | null
}

export interface ProgressEvent {
  phase: "outdated" | "security" | "deprecation" | "boundaries"
  done: number
  total: number
}

export type RegistryStatus = "ok" | "not-published" | "error" | "network-error"

export interface RegistryResult {
  name: string
  status: RegistryStatus
  latest?: string
  error?: string
  fromCache?: boolean
}
