import fs from "node:fs"
import path from "node:path"
import type { SecurityVulnerability, VulnerabilityHistoryEntry, VulnerabilitySLAStatus } from "../types.js"

export const DEFAULT_SLA_DAYS: Record<string, number> = {
  CRITICAL: 7,
  HIGH: 14,
  MODERATE: 30,
  LOW: 60,
}

export const SLA_HISTORY_FILE = ".pkg-audit/vulnerability-history.json"

export interface ParsedFailOn {
  mode: "conflict" | "sla" | "copyleft" | "none"
  conflictSeverity?: "major" | "range"
  slaSeverity?: string
  slaMaxDays?: number
}

/**
 * Parses the CLI --fail-on argument:
 * - "major" / "range" -> conflict severity check
 * - "critical:7d" / "high:14d" / "CRITICAL:7" -> vulnerability SLA check
 * - "copyleft" -> license copyleft check
 */
export function parseFailOnOption(arg?: string | null): ParsedFailOn {
  if (!arg || typeof arg !== "string") return { mode: "none" }
  const clean = arg.trim()

  if (clean === "major" || clean === "range") {
    return { mode: "conflict", conflictSeverity: clean }
  }

  if (clean === "copyleft") {
    return { mode: "copyleft" }
  }

  if (clean.includes(":")) {
    const [sevPart = "", agePart = ""] = clean.split(":")
    const sev = sevPart.toUpperCase()
    const match = agePart.match(/^(\d+)(?:d|days)?$/i)
    if (match && match[1]) {
      const days = Number.parseInt(match[1], 10)
      if (Number.isFinite(days) && days >= 0) {
        return {
          mode: "sla",
          slaSeverity: sev,
          slaMaxDays: days,
        }
      }
    }
  }

  return { mode: "none" }
}

/**
 * Loads and updates vulnerability history for the scanned monorepo, computing age in days.
 */
export function evaluateVulnerabilitySLAs(
  rootDir: string,
  vulns: SecurityVulnerability[],
  slaDaysConfig: Record<string, number> = DEFAULT_SLA_DAYS,
  now: Date = new Date()
): {
  history: Record<string, VulnerabilityHistoryEntry>
  slaStatuses: VulnerabilitySLAStatus[]
  breachedCount: number
} {
  const historyPath = path.join(rootDir, SLA_HISTORY_FILE)
  let history: Record<string, VulnerabilityHistoryEntry> = {}

  if (fs.existsSync(historyPath)) {
    try {
      const raw = fs.readFileSync(historyPath, "utf8")
      history = JSON.parse(raw) as Record<string, VulnerabilityHistoryEntry>
    } catch {
      // Ignore corrupted history file
    }
  }

  const nowIso = now.toISOString()
  const currentMs = now.getTime()
  const slaStatuses: VulnerabilitySLAStatus[] = []
  let breachedCount = 0

  for (const v of vulns) {
    const key = `${v.id}::${v.pkg}::${v.version}`
    let entry = history[key]

    if (!entry) {
      entry = {
        id: v.id,
        pkg: v.pkg,
        version: v.version,
        severity: v.severity,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        workspace: v.workspaces.map((w) => w.workspace).join(", "),
      }
      history[key] = entry
    } else {
      entry.lastSeenAt = nowIso
      if (!entry.severity) entry.severity = v.severity
    }

    const firstSeenMs = Date.parse(entry.firstSeenAt) || currentMs
    const ageInDays = Math.max(0, Math.floor((currentMs - firstSeenMs) / (1000 * 60 * 60 * 24)))

    const maxAgeDays =
      slaDaysConfig[v.severity.toUpperCase()] ?? DEFAULT_SLA_DAYS[v.severity.toUpperCase()] ?? 30
    const isBreached = ageInDays > maxAgeDays
    const remainingDays = maxAgeDays - ageInDays

    if (isBreached) breachedCount++

    slaStatuses.push({
      id: v.id,
      pkg: v.pkg,
      severity: v.severity,
      firstSeenAt: entry.firstSeenAt,
      ageInDays,
      maxAgeDays,
      isBreached,
      remainingDays,
    })
  }

  // Persist updated history
  try {
    const dir = path.dirname(historyPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf8")
  } catch {
    // Non-fatal write error
  }

  return {
    history,
    slaStatuses,
    breachedCount,
  }
}
