import { useMemo, useRef, useEffect } from "preact/hooks"
import type { JSX } from "preact"
import type { ScanResult } from "../../../types"
import type { TabId } from "../types"
import { Chart, registerables } from "chart.js"
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconFolder,
  IconGhost,
  IconLayers,
  IconLogo,
  IconPackage,
  IconRefreshCw,
  IconRepeat,
  IconSearch,
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
  loading?: boolean
  onOutdated: () => void
  onTabChange: (tab: TabId) => void
}

interface StatCardProps {
  icon: JSX.Element
  value: number | string
  label: string
  accentColor: string
  sub?: string
}

function StatCard({ icon, value, label, accentColor, sub }: StatCardProps) {
  return (
    <div class="flex items-center gap-3.5 p-5 bg-[#101010] border border-[#3d3a39] rounded-[8px] hover:border-[#8b949e] transition-colors">
      <div
        class="flex items-center justify-center w-10 h-10 rounded-[6px] bg-[#1a1a1a] border border-[#3d3a39] shrink-0"
        style={{ color: accentColor }}
      >
        {icon}
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-bold font-mono tracking-tight text-[#ffffff] leading-none">{value}</span>
          {sub && <span class="text-[11px] font-mono text-[#8b949e]">{sub}</span>}
        </div>
        <div class="text-[10.5px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] mt-1.5 truncate">
          {label}
        </div>
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
        labels: ["Aligned", "Range conflicts", "Major conflicts", "Linked workspaces"],
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
    <div class="flex items-center gap-6">
      <div class="relative shrink-0" style="width:130px; height:130px">
        <canvas ref={canvasRef} />
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span class="font-mono text-xl font-bold text-[#ffffff] leading-none">{total}</span>
          <span class="text-[9.5px] font-semibold uppercase tracking-[1.5px] text-[#8b949e] mt-1">
            packages
          </span>
        </div>
      </div>
      <div class="flex flex-col gap-2 flex-1 min-w-0">
        {items.map((item) => (
          <div key={item.label} class="flex items-center gap-2 text-xs">
            <span class={`w-2 h-2 rounded-full shrink-0 ${item.color}`} />
            <span class="text-[#bdbdbd] flex-1 truncate">{item.label}</span>
            <span class="font-mono font-semibold text-[#f2f2f2]">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TypeDoughnutChart({
  prod,
  dev,
  peer,
  optional,
  total,
}: {
  prod: number
  dev: number
  peer: number
  optional: number
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
        labels: ["Production", "Development", "Peer dependencies", "Optional"],
        datasets: [
          {
            data: [prod, dev, peer, optional],
            backgroundColor: ["#00d992", "#8b949e", "#8b5cf6", "#f59e0b"],
            borderColor: "#101010",
            borderWidth: 3,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        cutout: "72%",
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
      },
    })
    return () => {
      chartRef.current?.destroy()
    }
  }, [prod, dev, peer, optional])

  const items = [
    { label: "Production", value: prod, color: "bg-[#00d992]" },
    { label: "Development", value: dev, color: "bg-[#8b949e]" },
    { label: "Peer deps", value: peer, color: "bg-[#8b5cf6]" },
    { label: "Optional", value: optional, color: "bg-[#f59e0b]" },
  ]

  return (
    <div class="flex items-center gap-6">
      <div class="relative shrink-0" style="width:130px; height:130px">
        <canvas ref={canvasRef} />
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span class="font-mono text-xl font-bold text-[#ffffff] leading-none">{total}</span>
          <span class="text-[9.5px] font-semibold uppercase tracking-[1.5px] text-[#8b949e] mt-1">
            declared
          </span>
        </div>
      </div>
      <div class="flex flex-col gap-2 flex-1 min-w-0">
        {items.map((item) => (
          <div key={item.label} class="flex items-center gap-2 text-xs">
            <span class={`w-2 h-2 rounded-full shrink-0 ${item.color}`} />
            <span class="text-[#bdbdbd] flex-1 truncate">{item.label}</span>
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
                return label.length > 20 ? label.slice(0, 20) + "…" : label
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
    <div style="height: 190px; position: relative">
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
    <div style="height: 190px; position: relative">
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
    <div class="bg-[#101010] border border-[#3d3a39] rounded-[8px] p-6 hover:border-[#8b949e] transition-colors flex flex-col justify-between">
      <div class="mb-4">
        {eyebrow && (
          <div class="text-[10.5px] font-semibold uppercase tracking-[2.52px] text-[#8b949e] mb-1">
            {eyebrow}
          </div>
        )}
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-[15px] font-semibold text-[#ffffff] truncate">{title}</span>
          {sub && <span class="text-xs font-mono text-[#8b949e] shrink-0">{sub}</span>}
        </div>
      </div>
      <div class="flex-1 flex flex-col justify-center">{children}</div>
    </div>
  )
}

export function Dashboard({ data, onOutdated, onTabChange, loading }: DashboardProps) {
  const statuses = useMemo(() => buildStatuses(data), [data])

  const aligned = useMemo(() => statuses.filter((d) => d.status === "aligned").length, [statuses])
  const range = useMemo(() => statuses.filter((d) => d.status === "range").length, [statuses])
  const major = useMemo(() => statuses.filter((d) => d.status === "major").length, [statuses])
  const linked = useMemo(() => statuses.filter((d) => d.status === "linked").length, [statuses])
  const total = aligned + range + major + linked

  const typeCounts = useMemo(() => {
    let prod = 0
    let dev = 0
    let peer = 0
    let optional = 0
    for (const ws of data.workspaces) {
      for (const dep of Object.values(ws.deps)) {
        if (dep.type === "prod") prod++
        else if (dep.type === "dev") dev++
        else if (dep.type === "peer") peer++
        else if (dep.type === "optional") optional++
      }
    }
    return { prod, dev, peer, optional }
  }, [data.workspaces])

  const topPackages = useMemo(
    () => [...statuses].sort((a, b) => b.wsCount - a.wsCount).slice(0, 8),
    [statuses]
  )

  const workspaceDensities = useMemo(() => {
    return [...data.workspaces]
      .map((w) => ({ label: w.relPath, value: w.depCount }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [data.workspaces])

  const conflicts = useMemo(
    () =>
      [...data.conflicts]
        .sort((a, b) => (a.severity === "major" ? 0 : 1) - (b.severity === "major" ? 0 : 1))
        .slice(0, 8),
    [data.conflicts]
  )

  const outdated = data.outdated
  const alignmentRate = total > 0 ? Math.round((aligned / total) * 100) : 100

  return (
    <div class="space-y-6 w-full">
      {/* Eyebrow and Section Header */}
      <div class="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">
            <span class="w-1.5 h-1.5 rounded-full bg-[#00d992]" />
            <span>MONOREPO INTELLIGENCE</span>
          </div>
          <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff]">
            Dependency Health, Drift & Structure
          </h1>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 px-3.5 py-1.5 bg-[#1a1a1a] border border-[#3d3a39] rounded-[6px] font-mono text-xs text-[#f2f2f2]">
            <span class="text-[#8b949e]">Status:</span>
            <span class={`font-bold ${alignmentRate >= 90 ? "text-[#00d992]" : "text-[#f59e0b]"}`}>
              {alignmentRate}% Aligned
            </span>
          </div>
          <button
            class="flex items-center gap-1.5 h-8 px-3.5 bg-[#00d992] hover:bg-[#2fd6a1] disabled:opacity-50 text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
            onClick={onOutdated}
            disabled={loading}
          >
            <IconRefreshCw size={12} className={loading ? "spinner" : ""} />
            <span>{loading ? "Scanning dependencies…" : "Sync Registry"}</span>
          </button>
        </div>
      </div>

      {/* Circular Dependency Warning Banner */}
      {data.graph && data.graph.hasCycles && (
        <div
          class="flex items-center justify-between p-4 bg-[#f43f5e]/10 border border-[#f43f5e]/40 rounded-[8px] cursor-pointer hover:bg-[#f43f5e]/15 transition-colors gap-4"
          onClick={() => onTabChange("graph")}
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-[6px] bg-[#f43f5e]/20 text-[#f43f5e] flex items-center justify-center shrink-0">
              <IconRepeat size={16} />
            </div>
            <div>
              <div class="text-sm font-bold text-[#ffffff] flex items-center gap-2">
                <span>
                  {data.graph.cycles.length} Circular Dependency Loop{data.graph.cycles.length > 1 ? "s" : ""}{" "}
                  Detected
                </span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-[#f43f5e]/20 text-[#f43f5e] font-mono">
                  CRITICAL
                </span>
              </div>
              <div class="text-xs text-[#bdbdbd] mt-0.5">
                Potential build tool deadlocks in Turborepo/Nx/pnpm. Click to inspect topology and resolution
                paths in the Graph view.
              </div>
            </div>
          </div>
          <button class="h-7 px-3 bg-[#f43f5e] hover:bg-[#ff5270] text-[#ffffff] font-semibold text-xs rounded-[6px] transition-colors shrink-0">
            View Graph ➔
          </button>
        </div>
      )}

      {/* Phantom & Unused Dependencies Warning Banner */}
      {data.unused &&
        (data.unused.phantoms.length > 0 ||
          data.unused.unused.filter((u) => u.type === "prod").length > 0) && (
          <div
            class="flex items-center justify-between p-4 bg-[#f59e0b]/10 border border-[#f59e0b]/40 rounded-[8px] cursor-pointer hover:bg-[#f59e0b]/15 transition-colors gap-4"
            onClick={() => onTabChange("unused")}
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-[6px] bg-[#f59e0b]/20 text-[#f59e0b] flex items-center justify-center shrink-0">
                <IconGhost size={16} />
              </div>
              <div>
                <div class="text-sm font-bold text-[#ffffff] flex items-center gap-2">
                  <span>
                    {data.unused.phantoms.length > 0
                      ? `${data.unused.phantoms.length} Phantom (Undeclared) & ${data.unused.unused.filter((u) => u.type === "prod").length} Unused Dependencies`
                      : `${data.unused.unused.filter((u) => u.type === "prod").length} Unused Production Dependencies`}
                  </span>
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-[#f59e0b]/20 text-[#f59e0b] font-mono">
                    ACTION REQUIRED
                  </span>
                </div>
                <div class="text-xs text-[#bdbdbd] mt-0.5">
                  Undeclared imports cause Docker/CI build failures, while unused packages bloat install
                  times. Click for 1-click remediation.
                </div>
              </div>
            </div>
            <button class="h-7 px-3 bg-[#f59e0b] hover:bg-[#fbb724] text-[#101010] font-semibold text-xs rounded-[6px] transition-colors shrink-0">
              Fix in Unused Tab ➔
            </button>
          </div>
        )}

      {/* 6-up Stat Cards Grid spanning full width */}
      <div class="grid grid-cols-6 gap-3.5 max-[1400px]:grid-cols-3 max-[768px]:grid-cols-2">
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
          icon={<IconLayers size={17} />}
          value={data.meta.totalUniquePackages}
          label="Unique pkgs"
          accentColor="#ffffff"
        />
        <StatCard
          icon={<IconCheckCircle size={17} />}
          value={`${alignmentRate}%`}
          label="Alignment"
          accentColor="#00d992"
        />
        <StatCard
          icon={<IconAlertTriangle size={17} />}
          value={data.conflicts.length}
          label="Conflicts"
          accentColor={data.conflicts.length > 0 ? "#f43f5e" : "#00d992"}
          sub={
            data.conflicts.length > 0
              ? `${data.conflicts.filter((c) => c.severity === "major").length} major`
              : "clean"
          }
        />
        <StatCard
          icon={<IconSearch size={17} />}
          value={outdated ? outdated.outdated.length : "—"}
          label="Outdated"
          accentColor="#f59e0b"
          sub={outdated ? `${outdated.all.length} checked` : "not run"}
        />
      </div>

      {/* Dashed line rhythm divider */}
      <div class="dashed-divider" />

      {/* Row 1 Charts: 3-up Grid */}
      <div class="grid grid-cols-3 gap-4 max-[1200px]:grid-cols-2 max-[768px]:grid-cols-1">
        {/* Chart 1: Dependency Health Doughnut */}
        <DashCard eyebrow="HEALTH BREAKDOWN" title="Version Alignment" sub={`${total} unique packages`}>
          {total > 0 ? (
            <DonutChart aligned={aligned} range={range} major={major} linked={linked} total={total} />
          ) : (
            <div class="flex items-center justify-center h-36 text-[#8b949e] text-sm font-mono">
              No dependencies found.
            </div>
          )}
        </DashCard>

        {/* Chart 2: Dependency Type Composition */}
        <DashCard
          eyebrow="TYPE BREAKDOWN"
          title="Dependency Composition"
          sub={`${data.meta.totalDepDeclarations} declarations`}
        >
          <TypeDoughnutChart
            prod={typeCounts.prod}
            dev={typeCounts.dev}
            peer={typeCounts.peer}
            optional={typeCounts.optional}
            total={data.meta.totalDepDeclarations}
          />
        </DashCard>

        {/* Chart 3: Workspace Density */}
        <DashCard eyebrow="WORKSPACE DENSITY" title="Dependencies by Workspace" sub="declared dependencies">
          {workspaceDensities.length > 0 ? (
            <HBarChart rows={workspaceDensities} color="#2fd6a1" />
          ) : (
            <div class="flex items-center justify-center h-36 text-[#8b949e] text-sm font-mono">
              No workspaces found.
            </div>
          )}
        </DashCard>
      </div>

      {/* Row 2 Charts: 3-up Grid */}
      <div class="grid grid-cols-3 gap-4 max-[1200px]:grid-cols-2 max-[768px]:grid-cols-1">
        {/* Chart 4: Top packages by frequency */}
        <DashCard eyebrow="FREQUENCY" title="Top Shared Dependencies" sub="workspace references">
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

        {/* Chart 5: Outdated breakdown vertical bar */}
        <DashCard
          eyebrow="UPSTREAM DRIFT"
          title="Outdated Breakdown"
          sub={outdated ? `${outdated.all.length} queried` : "registry query pending"}
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
              <span class="text-xs">Query npm to view semver drift against registry releases.</span>
              <button
                class="flex items-center gap-1.5 h-8 px-3.5 bg-[#00d992] hover:bg-[#2fd6a1] disabled:opacity-50 text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
                onClick={onOutdated}
                disabled={loading}
              >
                <IconRefreshCw size={12} className={loading ? "spinner" : ""} />
                <span>{loading ? "Scanning dependencies…" : "Check outdated"}</span>
              </button>
            </div>
          )}
        </DashCard>

        {/* Chart 6: Conflicts by package */}
        <DashCard eyebrow="VERSION MISMATCHES" title="Active Version Conflicts" sub="differing semver specs">
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

      {/* Monorepo Quick Details & Actions Banner */}
      <div class="p-6 bg-[#101010] border border-[#3d3a39] rounded-[8px] flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-4">
          <div class="flex items-center justify-center w-10 h-10 rounded-[6px] bg-[#1a1a1a] border border-[#3d3a39] text-[#00d992]">
            <IconLogo size={24} />
          </div>
          <div>
            <div class="text-sm font-semibold text-[#ffffff]">{data.root}</div>
            <div class="text-xs font-mono text-[#8b949e] mt-0.5">
              {data.workspaces.length} workspaces · {data.meta.totalUniquePackages} unique dependencies ·{" "}
              {data.scannedMs}ms scan time
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2.5">
          <button
            class="flex items-center gap-1.5 h-8 px-3 bg-[#1a1a1a] hover:bg-[#101010] border border-[#3d3a39] hover:border-[#8b949e] rounded-[6px] text-xs font-medium text-[#f2f2f2] transition-colors"
            onClick={() => onTabChange("matrix")}
          >
            <IconLayers size={13} className="text-[#8b949e]" />
            <span>Matrix Grid</span>
          </button>
          <button
            class="flex items-center gap-1.5 h-8 px-3 bg-[#1a1a1a] hover:bg-[#101010] border border-[#3d3a39] hover:border-[#8b949e] rounded-[6px] text-xs font-medium text-[#f2f2f2] transition-colors"
            onClick={() => onTabChange("conflicts")}
          >
            <IconAlertTriangle size={13} className="text-[#f43f5e]" />
            <span>Review Conflicts ({data.conflicts.length})</span>
          </button>
        </div>
      </div>
    </div>
  )
}
