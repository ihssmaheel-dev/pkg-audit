import fs from "node:fs"
import path from "node:path"
import type {
  ActiveSuppression,
  ExpiredSuppression,
  SuppressionKind,
  SuppressionResult,
  SuppressionRule,
} from "../types.js"

export const DEFAULT_IGNORE_FILE = ".pkg-audit-ignore.json"

export interface LoadedSuppressions {
  rules: SuppressionRule[]
  active: ActiveSuppression[]
  expired: ExpiredSuppression[]
  filePath?: string
}

/**
 * Parses and normalizes an expiration date string (YYYY-MM-DD or ISO 8601).
 * Returns the timestamp at the end of that day (23:59:59.999Z).
 */
export function parseExpiryDate(dateStr: string): number {
  if (!dateStr || typeof dateStr !== "string") return 0
  const clean = dateStr.trim().split("T")[0]!
  const [yearStr, monthStr, dayStr] = clean.split("-")
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  if (!year || !month || !day || Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    const fallback = Date.parse(dateStr)
    return Number.isNaN(fallback) ? 0 : fallback
  }

  // End of day UTC
  return Date.UTC(year, month - 1, day, 23, 59, 59, 999)
}

/**
 * Loads suppression rules from `.pkg-audit-ignore.json` or custom config in `rootDir`.
 */
export function loadSuppressions(
  rootDir: string,
  extraRules?: SuppressionRule[],
  now: Date = new Date()
): LoadedSuppressions {
  const rules: SuppressionRule[] = []
  let foundFilePath: string | undefined

  const ignorePath = path.join(rootDir, DEFAULT_IGNORE_FILE)
  if (fs.existsSync(ignorePath)) {
    try {
      foundFilePath = ignorePath
      const raw = fs.readFileSync(ignorePath, "utf8")
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object" && typeof (item as SuppressionRule).reason === "string") {
            rules.push(item as SuppressionRule)
          }
        }
      } else if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { suppressions?: unknown[] }).suppressions)
      ) {
        for (const item of (parsed as { suppressions: SuppressionRule[] }).suppressions) {
          if (item && typeof item === "object" && typeof item.reason === "string") {
            rules.push(item)
          }
        }
      }
    } catch {
      // Ignore parse error on corrupt ignore file
    }
  }

  if (extraRules && Array.isArray(extraRules)) {
    rules.push(...extraRules)
  }

  const active: ActiveSuppression[] = []
  const expired: ExpiredSuppression[] = []

  const currentMs = now.getTime()

  for (const rule of rules) {
    const expiryMs = parseExpiryDate(rule.expires)
    const targetDesc = [
      rule.type ? `[${rule.type}]` : "",
      rule.id ? `ID:${rule.id}` : "",
      rule.pkg ? `pkg:${rule.pkg}` : "",
      rule.workspace ? `ws:${rule.workspace}` : "",
    ]
      .filter(Boolean)
      .join(" ")

    if (expiryMs === 0 || expiryMs < currentMs) {
      const diffMs = currentMs - (expiryMs === 0 ? currentMs : expiryMs)
      const expiredDaysAgo = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)))
      expired.push({
        rule,
        target: targetDesc || rule.reason,
        expiredDaysAgo,
      })
    } else {
      const diffMs = expiryMs - currentMs
      const daysUntilExpiry = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
      active.push({
        rule,
        target: targetDesc || rule.reason,
        daysUntilExpiry,
      })
    }
  }

  return {
    rules,
    active,
    expired,
    filePath: foundFilePath,
  }
}

/**
 * Helper to match pattern (supports "*" wildcard).
 */
function matchGlob(pattern?: string, value?: string): boolean {
  if (!pattern || pattern === "*") return true
  if (!value) return false
  if (pattern === value) return true
  if (pattern.includes("*")) {
    const regex = new RegExp(
      `^${pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, "\\$&").replace(/\*/g, ".*")}$`,
      "i"
    )
    return regex.test(value)
  }
  return pattern.toLowerCase() === value.toLowerCase()
}

/**
 * Checks if a candidate issue matches a specific suppression rule.
 */
export function ruleMatches(
  rule: SuppressionRule,
  candidate: {
    id?: string
    pkg?: string
    workspace?: string
    type?: SuppressionKind
  }
): boolean {
  if (rule.type && rule.type !== "all" && candidate.type && rule.type !== candidate.type) {
    return false
  }
  if (rule.id && candidate.id) {
    if (!matchGlob(rule.id, candidate.id)) return false
  } else if (rule.id && !candidate.id) {
    return false
  }

  if (rule.pkg && candidate.pkg) {
    if (!matchGlob(rule.pkg, candidate.pkg)) return false
  } else if (rule.pkg && !candidate.pkg) {
    return false
  }

  if (rule.workspace && candidate.workspace) {
    if (!matchGlob(rule.workspace, candidate.workspace)) return false
  }

  return true
}

/**
 * Evaluates whether an issue is actively suppressed (has valid non-expired rule).
 */
export function isSuppressed(
  loaded: LoadedSuppressions | undefined,
  candidate: {
    id?: string
    pkg?: string
    workspace?: string
    type?: SuppressionKind
  }
): { suppressed: boolean; activeRule?: ActiveSuppression; expiredRule?: ExpiredSuppression } {
  if (!loaded) return { suppressed: false }

  for (const active of loaded.active) {
    if (ruleMatches(active.rule, candidate)) {
      return { suppressed: true, activeRule: active }
    }
  }

  for (const exp of loaded.expired) {
    if (ruleMatches(exp.rule, candidate)) {
      return { suppressed: false, expiredRule: exp }
    }
  }

  return { suppressed: false }
}

export function toSuppressionResult(loaded: LoadedSuppressions): SuppressionResult {
  return {
    filePath: loaded.filePath,
    activeCount: loaded.active.length,
    expiredCount: loaded.expired.length,
    active: loaded.active,
    expired: loaded.expired,
  }
}
