import { useMemo, useRef, useEffect } from "preact/hooks"
import type { JSX } from "preact"
import type { ScanResult } from "../../../types"
import type { TabId } from "../types"
import { Chart, registerables } from "chart.js"
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconFolder,
  IconPackage,
  IconRefreshCw,
  IconSearch,
  IconWrench,
} from "./icons"

Chart.register(...registerables)

type DepStatus = "aligned" | "range" | "major" | "linked"

function buildStatuses(data: ScanResult) {
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
  return [...map.entries()].map(([name, entry]) => {
    const real = [...entry.versions].filter(
      (v) => !v.startsWith("workspace:") && !v.startsWith("catalog:") && !v.startsWith("link:")
    )
    let status: DepStatus
    if (real.length === 0) status = "linked"
    else if (real.length > 1) {
      const majors = new Set(
        real.map((v) => v.replace(/^[^~<>=\s]+/, "").match(/^(\d+)/)?.[1]).filter(Boolean)
      )
      status = majors.size > 1 ? "major" : "range"
    } else status = "aligned"
    return { name, status, wsCount: entry.wsCount }
  })
}

function occurrencesOf(conflict: ScanResult["conflicts"][number]) {
  return conflict.versions.reduce((sum, v) => sum + v.occurrences.length, 0)
}

function byStatus(records: NonNullable<ScanResult["outdated"]>["all"], status: string) {
  return records.filter((r) => r.status === status).length
}

interface DashboardProps {
  data: ScanResult
  onOutdated: () => void
  onTabChange: (tab: TabId) => void
}

interface StatCardProps {
  icon: JSX.Element
  value: number | string
  label: string
  accent: string
  iconBg: string
}

function StatCard({ icon, value, label, accent, iconBg }: StatCardProps) {
  return (
    <div class="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors">
      <div class={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${iconBg}`}>
        <span class={accent}>{icon}</span>
      </div>
      <div>
        <div class="text-[22px] font-bold font-mono tracking-tight text-zinc-100 leading-none">{value}</div>
        <div class="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500 mt-1">{label}</div>
      </div>
    </div>
  )
}

function DonutChart({
  aligned,
  range,
  major,
  linked,
  total,
}: {
  aligned: number
  range: number
  major: number
  linked: number
  total: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    chartRef.current?.destroy()
    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: ["Aligned", "Range conflicts", "Major conflicts", "Linked"],
        datasets: [
          {
            data: [aligned, range, major, linked],
            backgroundColor: ["#10b981", "#f59e0b", "#f43f5e", "#8b5cf6"],
            borderColor: "#18181b",
            borderWidth: 3,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        cutout: "70%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#27272a",
            borderColor: "#3f3f46",
            borderWidth: 1,
            titleColor: "#fafafa",
            bodyColor: "#a1a1aa",
            padding: 10,
          },
        },
      },
    })
    return () => {
      chartRef.current?.destroy()
    }
  }, [aligned, range, major, linked])

  const items = [
    { label: "Aligned", value: aligned, color: "bg-emerald-500" },
    { label: "Range", value: range, color: "bg-amber-400" },
    { label: "Major", value: major, color: "bg-rose-500" },
    { label: "Linked", value: linked, color: "bg-violet-500" },
  ]

  return (
    <div class="flex items-center gap-6">
      <div class="relative shrink-0" style="width:140px; height:140px">
        <canvas ref={canvasRef} />
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span class="font-mono text-xl font-bold text-zinc-100 leading-none">{total}</span>
          <span class="text-[9px] font-semibold uppercase tracking-widest text-zinc-500 mt-1">packages</span>
        </div>
      </div>
      <div class="flex flex-col gap-2 flex-1">
        {items.map((item) => (
          <div key={item.label} class="flex items-center gap-2 text-xs">
            <span class={`w-2 h-2 rounded-full shrink-0 ${item.color}`} />
            <span class="text-zinc-400 flex-1">{item.label}</span>
            <span class="font-mono font-semibold text-zinc-200">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HBarChart({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    chartRef.current?.destroy()
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          {
            data: rows.map((r) => r.value),
            backgroundColor: rows.map((r) => r.color),
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#27272a",
            borderColor: "#3f3f46",
            borderWidth: 1,
            titleColor: "#fafafa",
            bodyColor: "#a1a1aa",
            padding: 10,
          },
        },
        scales: {
          x: {
            grid: { color: "#27272a" },
            ticks: { color: "#71717a", font: { family: "JetBrains Mono", size: 10 } },
            border: { color: "#3f3f46" },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: "#a1a1aa",
              font: { family: "JetBrains Mono", size: 11 },
              callback: (_, i) => {
                const label = rows[i]?.label ?? ""
                return label.length > 22 ? label.slice(0, 22) + "…" : label
              },
            },
            border: { color: "#3f3f46" },
          },
        },
      },
    })
    return () => {
      chartRef.current?.destroy()
    }
  }, [rows])

  return (
    <div style="height: 200px; position: relative">
      <canvas ref={canvasRef} />
    </div>
  )
}

function VBarChart({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    chartRef.current?.destroy()
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          {
            data: rows.map((r) => r.value),
            backgroundColor: rows.map((r) => r.color),
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#27272a",
            borderColor: "#3f3f46",
            borderWidth: 1,
            titleColor: "#fafafa",
            bodyColor: "#a1a1aa",
            padding: 10,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#a1a1aa", font: { size: 11 } },
            border: { color: "#3f3f46" },
          },
          y: {
            grid: { color: "#27272a" },
            ticks: { color: "#71717a", font: { family: "JetBrains Mono", size: 10 } },
            border: { color: "#3f3f46" },
          },
        },
      },
    })
    return () => {
      chartRef.current?.destroy()
    }
  }, [rows])

  return (
    <div style="height: 200px; position: relative">
      <canvas ref={canvasRef} />
    </div>
  )
}

function DashCard({
  title,
  sub,
  children,
}: {
  title: string
  sub?: string
  children: preact.ComponentChildren
}) {
  return (
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div class="flex items-baseline justify-between mb-4">
        <span class="text-[13px] font-semibold text-zinc-200">{title}</span>
        {sub && <span class="text-[11px] text-zinc-500">{sub}</span>}
      </div>
      {children}
    </div>
  )
}

export function Dashboard({ data, onOutdated, onTabChange }: DashboardProps) {
  const statuses = useMemo(() => buildStatuses(data), [data])

  const aligned = useMemo(() => statuses.filter((d) => d.status === "aligned").length, [statuses])
  const range = useMemo(() => statuses.filter((d) => d.status === "range").length, [statuses])
  const major = useMemo(() => statuses.filter((d) => d.status === "major").length, [statuses])
  const linked = useMemo(() => statuses.filter((d) => d.status === "linked").length, [statuses])
  const total = aligned + range + major + linked

  const topPackages = useMemo(
    () => [...statuses].sort((a, b) => b.wsCount - a.wsCount).slice(0, 8),
    [statuses]
  )

  const conflicts = useMemo(
    () =>
      [...data.conflicts]
        .sort((a, b) => (a.severity === "major" ? 0 : 1) - (b.severity === "major" ? 0 : 1))
        .slice(0, 8),
    [data.conflicts]
  )

  const outdated = data.outdated

  return (
    <div>
      {/* Stat cards */}
      <div class="grid grid-cols-5 gap-3 mb-5 max-[900px]:grid-cols-3 max-[600px]:grid-cols-2">
        <StatCard
          icon={<IconFolder size={16} />}
          value={data.workspaces.length}
          label="Workspaces"
          accent="text-indigo-400"
          iconBg="bg-indigo-500/10"
        />
        <StatCard
          icon={<IconPackage size={16} />}
          value={data.meta.totalDepDeclarations}
          label="Declarations"
          accent="text-emerald-400"
          iconBg="bg-emerald-500/10"
        />
        <StatCard
          icon={<IconAlertTriangle size={16} />}
          value={data.conflicts.length}
          label="Conflicts"
          accent="text-rose-400"
          iconBg="bg-rose-500/10"
        />
        <StatCard
          icon={<IconSearch size={16} />}
          value={outdated ? outdated.outdated.length : "—"}
          label="Outdated"
          accent="text-amber-400"
          iconBg="bg-amber-500/10"
        />
        <StatCard
          icon={<IconWrench size={16} />}
          value={data.hygieneIssues.length}
          label="Hygiene"
          accent="text-violet-400"
          iconBg="bg-violet-500/10"
        />
      </div>

      {/* Chart grid */}
      <div class="grid grid-cols-2 gap-4 max-[860px]:grid-cols-1">
        {/* Dependency health donut */}
        <DashCard title="Dependency health" sub={`${total} unique packages`}>
          {total > 0 ? (
            <DonutChart aligned={aligned} range={range} major={major} linked={linked} total={total} />
          ) : (
            <div class="flex items-center justify-center h-32 text-zinc-600 text-sm">
              No dependencies found.
            </div>
          )}
        </DashCard>

        {/* Top packages horizontal bar */}
        <DashCard title="Top packages by usage" sub="workspaces using each">
          {topPackages.length > 0 ? (
            <HBarChart
              rows={topPackages.map((p) => ({ label: p.name, value: p.wsCount, color: "#6366f1" }))}
            />
          ) : (
            <div class="flex items-center justify-center h-32 text-zinc-600 text-sm">No packages found.</div>
          )}
        </DashCard>

        {/* Outdated breakdown vertical bar */}
        <DashCard
          title="Outdated breakdown"
          sub={outdated ? `${outdated.all.length} checked` : "not run yet"}
        >
          {outdated ? (
            <VBarChart
              rows={[
                { label: "Major", value: byStatus(outdated.all, "major"), color: "#f43f5e" },
                { label: "Minor", value: byStatus(outdated.all, "minor"), color: "#f59e0b" },
                { label: "Patch", value: byStatus(outdated.all, "patch"), color: "#6366f1" },
                { label: "Up to date", value: byStatus(outdated.all, "up-to-date"), color: "#10b981" },
              ]}
            />
          ) : (
            <div class="flex flex-col items-center justify-center gap-3 h-32 text-zinc-500 text-sm text-center">
              <span>Run the outdated check to see version drift.</span>
              <button
                class="flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
                onClick={onOutdated}
              >
                <IconRefreshCw size={12} />
                Check outdated
              </button>
            </div>
          )}
        </DashCard>

        {/* Conflicts by package */}
        <DashCard title="Conflicts by package" sub="declared versions differ">
          {conflicts.length > 0 ? (
            <HBarChart
              rows={conflicts.map((c) => ({
                label: c.name,
                value: occurrencesOf(c),
                color: c.severity === "major" ? "#f43f5e" : "#f59e0b",
              }))}
            />
          ) : (
            <div class="flex flex-col items-center justify-center gap-3 h-32 text-zinc-500 text-sm text-center">
              <IconCheckCircle size={28} className="text-emerald-500/40" />
              <span>No conflicts — all dependencies are aligned.</span>
              <button
                class="text-xs text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline"
                onClick={() => onTabChange("matrix")}
              >
                View matrix
              </button>
            </div>
          )}
        </DashCard>
      </div>
    </div>
  )
}
