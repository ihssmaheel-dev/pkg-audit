import { useMemo } from "preact/hooks"
import type { JSX } from "preact"
import type { ScanResult } from "../../../types"
import type { TabId } from "../types"
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconFolder,
  IconPackage,
  IconRefreshCw,
  IconSearch,
  IconWrench,
} from "./icons"

type DepStatus = "aligned" | "range" | "major" | "linked"

interface DepStat {
  name: string
  status: DepStatus
  wsCount: number
}

function buildStatuses(data: ScanResult): DepStat[] {
  const map = new Map<string, { versions: Set<string>; wsCount: number }>()
  for (const ws of data.workspaces) {
    for (const [name, dep] of Object.entries(ws.deps)) {
      let entry = map.get(name)
      if (!entry) {
        entry = { versions: new Set(), wsCount: 0 }
        map.set(name, entry)
      }
      entry.versions.add(dep.version)
      entry.wsCount += 1
    }
  }

  const out: DepStat[] = []
  for (const [name, entry] of map) {
    const real = [...entry.versions].filter(
      (v) => !v.startsWith("workspace:") && !v.startsWith("catalog:") && !v.startsWith("link:")
    )
    let status: DepStatus
    if (real.length === 0) status = "linked"
    else if (real.length > 1) {
      const majors = new Set(
        real
          .map((v) => v.replace(/^[\^~<>=\s]+/, "").match(/^(\d+)/)?.[1])
          .filter((m): m is string => m !== undefined)
      )
      status = majors.size > 1 ? "major" : "range"
    } else {
      status = "aligned"
    }
    out.push({ name, status, wsCount: entry.wsCount })
  }
  return out
}

interface DonutSegment {
  label: string
  color: string
  count: number
}

const DONUT_R = 54
const DONUT_C = 2 * Math.PI * DONUT_R
const DONUT_GAP = 2.5

interface DashboardProps {
  data: ScanResult
  onOutdated: () => void
  onTabChange: (tab: TabId) => void
}

export function Dashboard({ data, onOutdated, onTabChange }: DashboardProps) {
  const statuses = useMemo(() => buildStatuses(data), [data])

  const segments: DonutSegment[] = useMemo(() => {
    const count = (s: DepStatus) => statuses.filter((d) => d.status === s).length
    return [
      { label: "Major conflicts", color: "var(--red)", count: count("major") },
      { label: "Range conflicts", color: "var(--amber)", count: count("range") },
      { label: "Aligned", color: "var(--green)", count: count("aligned") },
      { label: "Linked", color: "var(--violet)", count: count("linked") },
    ]
  }, [statuses])

  const totalPackages = segments.reduce((sum, s) => sum + s.count, 0)

  const topPackages = useMemo(
    () => [...statuses].sort((a, b) => b.wsCount - a.wsCount || a.name.localeCompare(b.name)).slice(0, 8),
    [statuses]
  )
  const maxUsage = topPackages[0]?.wsCount ?? 1

  const conflicts = useMemo(
    () =>
      [...data.conflicts]
        .sort(
          (a, b) =>
            (a.severity === "major" ? 0 : 1) - (b.severity === "major" ? 0 : 1) ||
            occurrencesOf(b) - occurrencesOf(a) ||
            a.name.localeCompare(b.name)
        )
        .slice(0, 6),
    [data.conflicts]
  )
  const maxConflictRows = conflicts.reduce((m, c) => Math.max(m, occurrencesOf(c)), 1)

  const outdated = data.outdated

  return (
    <div>
      <div class="stats-grid">
        <StatCard
          icon={<IconFolder size={17} />}
          color="accent"
          value={data.workspaces.length}
          label="Workspaces"
        />
        <StatCard
          icon={<IconPackage size={17} />}
          color="green"
          value={data.meta.totalDepDeclarations}
          label="Declarations"
        />
        <StatCard
          icon={<IconAlertTriangle size={17} />}
          color="red"
          value={data.conflicts.length}
          label="Conflicts"
        />
        <StatCard
          icon={<IconSearch size={17} />}
          color="amber"
          value={outdated ? outdated.outdated.length : "—"}
          label="Outdated"
        />
        <StatCard
          icon={<IconWrench size={17} />}
          color="violet"
          value={data.hygieneIssues.length}
          label="Hygiene issues"
        />
      </div>

      <div class="dash-grid">
        <div class="dash-card">
          <div class="dash-title">
            <span>Dependency health</span>
            <span class="dim">{totalPackages} unique packages</span>
          </div>
          {totalPackages > 0 ? (
            <DonutChart segments={segments} total={totalPackages} />
          ) : (
            <div class="dash-empty">No dependencies found.</div>
          )}
        </div>

        <div class="dash-card">
          <div class="dash-title">
            <span>Outdated breakdown</span>
            <span class="dim">{outdated ? `${outdated.all.length} checked` : "not run"}</span>
          </div>
          {outdated ? (
            <Bars
              rows={[
                { label: "Major", count: byStatus(outdated.all, "major"), color: "red" },
                { label: "Minor", count: byStatus(outdated.all, "minor"), color: "amber" },
                { label: "Patch", count: byStatus(outdated.all, "patch"), color: "accent" },
                { label: "Up to date", count: byStatus(outdated.all, "up-to-date"), color: "green" },
              ]}
            />
          ) : (
            <div class="dash-empty">
              <span>Run the outdated check to see version drift.</span>
              <button class="btn btn-primary" onClick={onOutdated}>
                <IconRefreshCw size={13} />
                Check outdated
              </button>
            </div>
          )}
        </div>

        <div class="dash-card">
          <div class="dash-title">
            <span>Top packages by usage</span>
            <span class="dim">workspaces using each</span>
          </div>
          {topPackages.length > 0 ? (
            <Bars
              rows={topPackages.map((d) => ({
                label: d.name,
                count: d.wsCount,
                color: "accent",
                max: maxUsage,
              }))}
            />
          ) : (
            <div class="dash-empty">No packages found.</div>
          )}
        </div>

        <div class="dash-card">
          <div class="dash-title">
            <span>Conflicts by package</span>
            <span class="dim">declared versions differ</span>
          </div>
          {conflicts.length > 0 ? (
            <Bars
              rows={conflicts.map((c) => ({
                label: c.name,
                count: occurrencesOf(c),
                color: c.severity === "major" ? "red" : "amber",
                max: maxConflictRows,
              }))}
            />
          ) : (
            <div class="dash-empty">
              <IconCheckCircle size={22} />
              <span>No conflicts — every shared dependency is aligned.</span>
              <button class="btn" onClick={() => onTabChange("matrix")}>
                View matrix
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  icon: JSX.Element
  color: "accent" | "green" | "red" | "amber" | "violet"
  value: number | string
  label: string
}

function StatCard({ icon, color, value, label }: StatCardProps) {
  return (
    <div class="stat-card">
      <div class={`stat-icon ${color}`}>{icon}</div>
      <div class="stat-info">
        <span class="stat-value">{value}</span>
        <span class="stat-label">{label}</span>
      </div>
    </div>
  )
}

interface DonutChartProps {
  segments: DonutSegment[]
  total: number
}

function DonutChart({ segments, total }: DonutChartProps) {
  let offset = 0
  const arcs = segments
    .filter((s) => s.count > 0)
    .map((s) => {
      const frac = s.count / total
      const arc = { ...s, dash: Math.max(frac * DONUT_C - DONUT_GAP, 0), offset }
      offset += frac * DONUT_C
      return arc
    })

  return (
    <div class="donut-wrap">
      <div class="donut">
        <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true">
          <circle cx="64" cy="64" r={DONUT_R} fill="none" stroke="var(--surface-2)" stroke-width="14" />
          {arcs.map((s) => (
            <circle
              key={s.label}
              cx="64"
              cy="64"
              r={DONUT_R}
              fill="none"
              stroke={s.color}
              stroke-width="14"
              stroke-dasharray={`${s.dash} ${DONUT_C}`}
              stroke-dashoffset={-s.offset}
              transform="rotate(-90 64 64)"
            />
          ))}
        </svg>
        <div class="donut-center">
          <b>{total}</b>
          <span>packages</span>
        </div>
      </div>
      <div class="legend">
        {segments.map((s) => (
          <div class="legend-item" key={s.label}>
            <span class="legend-dot" style={{ background: s.color }} />
            {s.label}
            <b>{s.count}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

interface BarRow {
  label: string
  count: number
  color: string
  max?: number
}

function Bars({ rows }: { rows: BarRow[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.max ?? r.count), 1)
  return (
    <div>
      {rows.map((r) => {
        const pct = (r.count / (r.max ?? max)) * 100
        return (
          <div class="bar-row" key={r.label}>
            <span class="bar-label">{r.label}</span>
            <div class="bar-track">
              <div class={`bar-fill ${r.color === "accent" ? "" : r.color}`} style={{ width: `${pct}%` }} />
            </div>
            <span class="bar-value">{r.count}</span>
          </div>
        )
      })}
    </div>
  )
}

function occurrencesOf(conflict: ScanResult["conflicts"][number]): number {
  return conflict.versions.reduce((sum, v) => sum + v.occurrences.length, 0)
}

function byStatus(records: NonNullable<ScanResult["outdated"]>["all"], status: string): number {
  return records.filter((r) => r.status === status).length
}
