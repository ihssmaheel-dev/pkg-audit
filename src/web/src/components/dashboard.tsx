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
  accentColor: string
}

function StatCard({ icon, value, label, accentColor }: StatCardProps) {
  return (
    <div class="flex items-center gap-3.5 p-5 bg-[#101010] border border-[#3d3a39] rounded-[8px] hover:border-[#8b949e] transition-colors">
      <div
        class="flex items-center justify-center w-10 h-10 rounded-[6px] bg-[#1a1a1a] border border-[#3d3a39] shrink-0"
        style={{ color: accentColor }}
      >
        {icon}
      </div>
      <div>
        <div class="text-2xl font-bold font-mono tracking-tight text-[#ffffff] leading-none">{value}</div>
        <div class="text-[11px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] mt-1.5">{label}</div>
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
            backgroundColor: ["#00d992", "#f59e0b", "#f43f5e", "#8b5cf6"],
            borderColor: "#101010",
            borderWidth: 3,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        cutout: "72%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a1a1a",
            borderColor: "#3d3a39",
            borderWidth: 1,
            titleColor: "#ffffff",
            bodyColor: "#bdbdbd",
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
    { label: "Aligned", value: aligned, color: "bg-[#00d992]" },
    { label: "Range conflicts", value: range, color: "bg-[#f59e0b]" },
    { label: "Major conflicts", value: major, color: "bg-[#f43f5e]" },
    { label: "Linked workspaces", value: linked, color: "bg-[#8b5cf6]" },
  ]

  return (
    <div class="flex items-center gap-8">
      <div class="relative shrink-0" style="width:140px; height:140px">
        <canvas ref={canvasRef} />
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span class="font-mono text-2xl font-bold text-[#ffffff] leading-none">{total}</span>
          <span class="text-[10px] font-semibold uppercase tracking-[1.5px] text-[#8b949e] mt-1">
            packages
          </span>
        </div>
      </div>
      <div class="flex flex-col gap-2.5 flex-1">
        {items.map((item) => (
          <div key={item.label} class="flex items-center gap-2.5 text-xs">
            <span class={`w-2 h-2 rounded-full shrink-0 ${item.color}`} />
            <span class="text-[#bdbdbd] flex-1">{item.label}</span>
            <span class="font-mono font-semibold text-[#f2f2f2]">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HBarChart({
  rows,
  color = "#00d992",
}: {
  rows: { label: string; value: number; color?: string }[]
  color?: string
}) {
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
            backgroundColor: rows.map((r) => r.color ?? color),
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
            backgroundColor: "#1a1a1a",
            borderColor: "#3d3a39",
            borderWidth: 1,
            titleColor: "#ffffff",
            bodyColor: "#bdbdbd",
            padding: 10,
          },
        },
        scales: {
          x: {
            grid: { color: "#1a1a1a" },
            ticks: { color: "#8b949e", font: { family: "JetBrains Mono", size: 10 } },
            border: { color: "#3d3a39" },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: "#bdbdbd",
              font: { family: "JetBrains Mono", size: 11 },
              callback: (_, i) => {
                const label = rows[i]?.label ?? ""
                return label.length > 22 ? label.slice(0, 22) + "…" : label
              },
            },
            border: { color: "#3d3a39" },
          },
        },
      },
    })
    return () => {
      chartRef.current?.destroy()
    }
  }, [rows, color])

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
            backgroundColor: "#1a1a1a",
            borderColor: "#3d3a39",
            borderWidth: 1,
            titleColor: "#ffffff",
            bodyColor: "#bdbdbd",
            padding: 10,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#bdbdbd", font: { size: 11 } },
            border: { color: "#3d3a39" },
          },
          y: {
            grid: { color: "#1a1a1a" },
            ticks: { color: "#8b949e", font: { family: "JetBrains Mono", size: 10 } },
            border: { color: "#3d3a39" },
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
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow?: string
  title: string
  sub?: string
  children: preact.ComponentChildren
}) {
  return (
    <div class="bg-[#101010] border border-[#3d3a39] rounded-[8px] p-6 hover:border-[#8b949e] transition-colors">
      <div class="mb-5">
        {eyebrow && (
          <div class="text-[11px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] mb-1">
            {eyebrow}
          </div>
        )}
        <div class="flex items-baseline justify-between">
          <span class="text-[15px] font-semibold text-[#ffffff]">{title}</span>
          {sub && <span class="text-xs font-mono text-[#8b949e]">{sub}</span>}
        </div>
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
    <div class="space-y-6">
      {/* Eyebrow and Section Header */}
      <div>
        <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">
          MONOREPO AUDIT
        </div>
        <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff]">
          Dependency Health & Drift Overview
        </h1>
      </div>

      {/* 5-up Stat Cards Grid */}
      <div class="grid grid-cols-5 gap-3.5 max-[1024px]:grid-cols-3 max-[640px]:grid-cols-2">
        <StatCard
          icon={<IconFolder size={17} />}
          value={data.workspaces.length}
          label="Workspaces"
          accentColor="#00d992"
        />
        <StatCard
          icon={<IconPackage size={17} />}
          value={data.meta.totalDepDeclarations}
          label="Declarations"
          accentColor="#2fd6a1"
        />
        <StatCard
          icon={<IconAlertTriangle size={17} />}
          value={data.conflicts.length}
          label="Conflicts"
          accentColor={data.conflicts.length > 0 ? "#f43f5e" : "#00d992"}
        />
        <StatCard
          icon={<IconSearch size={17} />}
          value={outdated ? outdated.outdated.length : "—"}
          label="Outdated"
          accentColor="#f59e0b"
        />
        <StatCard
          icon={<IconWrench size={17} />}
          value={data.hygieneIssues.length}
          label="Hygiene"
          accentColor="#8b5cf6"
        />
      </div>

      {/* Dashed line rhythm divider */}
      <div class="dashed-divider" />

      {/* 2-up Chart Grid */}
      <div class="grid grid-cols-2 gap-4 max-[860px]:grid-cols-1">
        {/* Dependency health donut */}
        <DashCard eyebrow="DISTRIBUTION" title="Dependency Health" sub={`${total} unique packages`}>
          {total > 0 ? (
            <DonutChart aligned={aligned} range={range} major={major} linked={linked} total={total} />
          ) : (
            <div class="flex items-center justify-center h-36 text-[#8b949e] text-sm font-mono">
              No dependencies found.
            </div>
          )}
        </DashCard>

        {/* Top packages horizontal bar */}
        <DashCard eyebrow="FREQUENCY" title="Top Packages by Usage" sub="workspaces using each">
          {topPackages.length > 0 ? (
            <HBarChart
              rows={topPackages.map((p) => ({ label: p.name, value: p.wsCount, color: "#00d992" }))}
            />
          ) : (
            <div class="flex items-center justify-center h-36 text-[#8b949e] text-sm font-mono">
              No packages found.
            </div>
          )}
        </DashCard>

        {/* Outdated breakdown vertical bar */}
        <DashCard
          eyebrow="UPSTREAM"
          title="Outdated Breakdown"
          sub={outdated ? `${outdated.all.length} checked` : "not run yet"}
        >
          {outdated ? (
            <VBarChart
              rows={[
                { label: "Major", value: byStatus(outdated.all, "major"), color: "#f43f5e" },
                { label: "Minor", value: byStatus(outdated.all, "minor"), color: "#f59e0b" },
                { label: "Patch", value: byStatus(outdated.all, "patch"), color: "#00d992" },
                { label: "Up to date", value: byStatus(outdated.all, "up-to-date"), color: "#2fd6a1" },
              ]}
            />
          ) : (
            <div class="flex flex-col items-center justify-center gap-3 h-36 text-[#8b949e] text-sm text-center">
              <span class="text-xs">Run the outdated check to see version drift against npm.</span>
              <button
                class="flex items-center gap-1.5 h-8 px-3.5 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
                onClick={onOutdated}
              >
                <IconRefreshCw size={12} />
                <span>Check outdated</span>
              </button>
            </div>
          )}
        </DashCard>

        {/* Conflicts by package */}
        <DashCard eyebrow="DRIFT" title="Conflicts by Package" sub="declared versions differ">
          {conflicts.length > 0 ? (
            <HBarChart
              rows={conflicts.map((c) => ({
                label: c.name,
                value: occurrencesOf(c),
                color: c.severity === "major" ? "#f43f5e" : "#f59e0b",
              }))}
            />
          ) : (
            <div class="flex flex-col items-center justify-center gap-2.5 h-36 text-[#8b949e] text-sm text-center">
              <IconCheckCircle size={28} className="text-[#00d992]" />
              <span class="text-xs text-[#f2f2f2]">No conflicts — all shared dependencies are aligned.</span>
              <button
                class="text-xs text-[#00d992] hover:text-[#2fd6a1] hover:underline font-medium"
                onClick={() => onTabChange("matrix")}
              >
                View version matrix →
              </button>
            </div>
          )}
        </DashCard>
      </div>
    </div>
  )
}
