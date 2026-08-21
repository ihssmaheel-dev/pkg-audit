import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import type { ScanResult, WorkspaceGraphNode } from "../../../types"
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconCopy,
  IconExternalLink,
  IconFolder,
  IconMaximize,
  IconRepeat,
  IconSearch,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "./icons"

interface GraphProps {
  data: ScanResult
  onWorkspaceClick?: (relPath: string) => void
  notify: (message: string) => void
}

interface LayoutNode extends WorkspaceGraphNode {
  x: number
  y: number
  width: number
  height: number
  category: "app" | "package" | "root" | "other"
}

const CARD_WIDTH = 250
const CARD_HEIGHT = 92
const COL_SPACING = 370
const ROW_SPACING = 118
const PADDING = 60

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/")
}

function cleanWorkspaceName(name: string): string {
  return name.replace(/\\/g, "/")
}

function getCategory(relPath: string, isRoot: boolean): "app" | "package" | "root" | "other" {
  if (isRoot) return "root"
  const norm = normalizePath(relPath).toLowerCase()
  if (norm.startsWith("apps/") || norm.includes("/apps/")) return "app"
  if (norm.startsWith("packages/") || norm.includes("/packages/")) return "package"
  return "other"
}

export function Graph({ data, onWorkspaceClick, notify }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [isPanning, setIsPanning] = useState(false)
  const [startPan, setStartPan] = useState({ x: 0, y: 0 })
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedCycleIdx, setSelectedCycleIdx] = useState<number | null>(null)
  const [filterMode, setFilterMode] = useState<"all" | "connected">("all")

  const graph = data.graph ?? { nodes: [], edges: [], cycles: [], hasCycles: false, maxDepth: 0 }

  // Filter nodes based on connected toggle or search
  const visibleNodes = useMemo(() => {
    return graph.nodes.filter((node) => {
      if (filterMode === "connected") {
        const hasLinks = node.deps.length > 0 || node.dependedBy.length > 0
        if (!hasLinks) return false
      }
      return true
    })
  }, [graph.nodes, filterMode])

  // Compute multi-column balanced topological layout
  const layout = useMemo(() => {
    // Separate connected nodes from standalone nodes for clean organization
    const connectedNodes = visibleNodes.filter((n) => n.deps.length > 0 || n.dependedBy.length > 0)
    const standaloneNodes = visibleNodes.filter((n) => n.deps.length === 0 && n.dependedBy.length === 0)

    const layers = new Map<number, WorkspaceGraphNode[]>()

    // Group connected nodes by depth
    for (const node of connectedNodes) {
      const d = node.depth ?? 0
      if (!layers.has(d)) layers.set(d, [])
      layers.get(d)!.push(node)
    }

    const positionedNodes: LayoutNode[] = []
    const nodePositionMap = new Map<string, LayoutNode>()

    const sortedDepths = Array.from(layers.keys()).sort((a, b) => b - a) // Highest depth (apps) on left
    let maxConnectedX = PADDING
    let maxConnectedY = PADDING

    sortedDepths.forEach((depth, colIdx) => {
      const colNodes = layers.get(depth) ?? []
      colNodes.sort((a, b) => a.relPath.localeCompare(b.relPath))

      const x = PADDING + colIdx * COL_SPACING
      if (x + CARD_WIDTH > maxConnectedX) maxConnectedX = x + CARD_WIDTH

      colNodes.forEach((node, rowIdx) => {
        const y = PADDING + rowIdx * ROW_SPACING
        const layoutNode: LayoutNode = {
          ...node,
          x,
          y,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          category: getCategory(node.relPath, node.isRoot),
        }
        positionedNodes.push(layoutNode)
        nodePositionMap.set(node.relPath, layoutNode)
        if (y + CARD_HEIGHT > maxConnectedY) maxConnectedY = y + CARD_HEIGHT
      })
    })

    // Layout standalone nodes in balanced 2-column grid to the right
    if (standaloneNodes.length > 0) {
      const startX = connectedNodes.length > 0 ? maxConnectedX + 110 : PADDING
      const cols = 2
      const standaloneColSpacing = CARD_WIDTH + 24

      standaloneNodes.forEach((node, idx) => {
        const col = idx % cols
        const row = Math.floor(idx / cols)
        const x = startX + col * standaloneColSpacing
        const y = PADDING + row * (CARD_HEIGHT + 24)

        const layoutNode: LayoutNode = {
          ...node,
          x,
          y,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          category: getCategory(node.relPath, node.isRoot),
        }
        positionedNodes.push(layoutNode)
        nodePositionMap.set(node.relPath, layoutNode)
        if (x + CARD_WIDTH > maxConnectedX) maxConnectedX = x + CARD_WIDTH
        if (y + CARD_HEIGHT > maxConnectedY) maxConnectedY = y + CARD_HEIGHT
      })
    }

    return {
      nodes: positionedNodes,
      nodeMap: nodePositionMap,
      width: Math.max(1000, maxConnectedX + PADDING),
      height: Math.max(650, maxConnectedY + PADDING),
      connectedCount: connectedNodes.length,
      standaloneCount: standaloneNodes.length,
    }
  }, [visibleNodes])

  // Fit to screen on initial mount
  useEffect(() => {
    if (!containerRef.current || layout.nodes.length === 0) return
    const containerW = containerRef.current.clientWidth || 900
    const containerH = containerRef.current.clientHeight || 600

    const scaleX = (containerW - 80) / layout.width
    const scaleY = (containerH - 80) / layout.height
    const initialZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.5), 1.05)

    setZoom(Number(initialZoom.toFixed(2)))
    setPan({
      x: Math.max(30, (containerW - layout.width * initialZoom) / 2),
      y: Math.max(30, (containerH - layout.height * initialZoom) / 2),
    })
  }, [layout.width, layout.height, layout.nodes.length])

  // Active highlighted relationships
  const activeRelPath = selectedNode || hoveredNode

  const activeRelations = useMemo(() => {
    if (!activeRelPath) return null
    const outgoing = new Set<string>()
    const incoming = new Set<string>()
    const activeEdges = new Set<string>()

    for (const edge of graph.edges) {
      if (edge.from === activeRelPath) {
        outgoing.add(edge.to)
        activeEdges.add(`${edge.from}->${edge.to}`)
      }
      if (edge.to === activeRelPath) {
        incoming.add(edge.from)
        activeEdges.add(`${edge.from}->${edge.to}`)
      }
    }

    return { outgoing, incoming, activeEdges }
  }, [activeRelPath, graph.edges])

  // Focused cycle nodes and edges
  const focusedCycle = useMemo(() => {
    if (selectedCycleIdx === null || !graph.cycles[selectedCycleIdx]) return null
    const cycle = graph.cycles[selectedCycleIdx]!
    const cycleNodeNames = new Set(cycle.path)
    const cycleEdges = new Set<string>()

    for (let i = 0; i < cycle.path.length - 1; i++) {
      const uName = cycle.path[i]!
      const vName = cycle.path[i + 1]!
      const uWs = data.workspaces.find((w) => w.name === uName || w.relPath === uName)
      const vWs = data.workspaces.find((w) => w.name === vName || w.relPath === vName)
      if (uWs && vWs) {
        cycleEdges.add(`${uWs.relPath}->${vWs.relPath}`)
      }
    }

    return { cycleNodeNames, cycleEdges }
  }, [selectedCycleIdx, graph.cycles, data.workspaces])

  const rafId = useRef<number | null>(null)

  // Pan and Zoom handlers
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    setIsPanning(true)
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isPanning) return
    const nextX = e.clientX - startPan.x
    const nextY = e.clientY - startPan.y
    if (rafId.current) cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      setPan({ x: nextX, y: nextY })
    })
  }

  const handleMouseUp = () => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
    setIsPanning(false)
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92
    const newZoom = Math.min(Math.max(0.25, zoom * zoomFactor), 2.5)
    setZoom(Number(newZoom.toFixed(2)))
  }

  const fitView = () => {
    if (!containerRef.current) return
    const containerW = containerRef.current.clientWidth || 900
    const containerH = containerRef.current.clientHeight || 600

    const scaleX = (containerW - 80) / layout.width
    const scaleY = (containerH - 80) / layout.height
    const targetZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 1.05)

    setZoom(Number(targetZoom.toFixed(2)))
    setPan({
      x: Math.max(30, (containerW - layout.width * targetZoom) / 2),
      y: Math.max(30, (containerH - layout.height * targetZoom) / 2),
    })
  }

  // Virtualized Viewport Frustum Culling for large monorepo graphs (600+ workspaces)
  const renderedNodes = useMemo(() => {
    // For small graphs (<= 45 nodes), render everything directly
    if (layout.nodes.length <= 45) return layout.nodes

    const containerW = containerRef.current?.clientWidth || 1000
    const containerH = containerRef.current?.clientHeight || 650
    const buffer = 240 // viewport safety boundary in graph units

    const minX = -pan.x / zoom - buffer
    const maxX = (-pan.x + containerW) / zoom + buffer
    const minY = -pan.y / zoom - buffer
    const maxY = (-pan.y + containerH) / zoom + buffer

    return layout.nodes.filter((node) => {
      // Always keep active/selected/hovered/searching/cycle nodes rendered
      if (
        selectedNode === node.relPath ||
        hoveredNode === node.relPath ||
        activeRelations?.outgoing.has(node.relPath) ||
        activeRelations?.incoming.has(node.relPath) ||
        focusedCycle?.cycleNodeNames.has(node.name) ||
        focusedCycle?.cycleNodeNames.has(node.relPath)
      ) {
        return true
      }

      if (
        search &&
        (node.name.toLowerCase().includes(search.toLowerCase()) ||
          node.relPath.toLowerCase().includes(search.toLowerCase()))
      ) {
        return true
      }

      // Check viewport bounding box intersection
      return node.x + node.width >= minX && node.x <= maxX && node.y + node.height >= minY && node.y <= maxY
    })
  }, [layout.nodes, pan.x, pan.y, zoom, selectedNode, hoveredNode, activeRelations, focusedCycle, search])

  const renderedNodePaths = useMemo(() => new Set(renderedNodes.map((n) => n.relPath)), [renderedNodes])

  const renderedEdges = useMemo(() => {
    if (graph.edges.length <= 45) return graph.edges

    return graph.edges.filter((edge) => {
      const edgeKey = `${edge.from}->${edge.to}`
      // If edge is part of active selection or cycle, always render
      if (activeRelations?.activeEdges.has(edgeKey) || focusedCycle?.cycleEdges.has(edgeKey)) {
        return true
      }
      // If either connected node is in visible viewport, render edge
      return renderedNodePaths.has(edge.from) || renderedNodePaths.has(edge.to)
    })
  }, [graph.edges, renderedNodePaths, activeRelations, focusedCycle])

  const copyCycleAsText = (path: string[]) => {
    const text = path.join(" -> ")
    navigator.clipboard?.writeText(text).catch(() => {})
    notify(`Copied cycle: ${text}`)
  }

  const selectedNodeObj = selectedNode ? data.workspaces.find((w) => w.relPath === selectedNode) : null

  return (
    <div class="space-y-4 w-full select-none">
      {/* Top Header */}
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1">
            ARCHITECTURE & TOPOLOGY
          </div>
          <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff]">Workspace Dependency Graph</h1>
        </div>

        {/* Top KPI Metrics Bar */}
        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex items-center gap-2 h-8 px-3 bg-[#101010] border border-[#3d3a39] rounded-[6px] text-xs">
            <span class="text-[#8b949e]">Workspaces:</span>
            <span class="font-mono font-bold text-[#ffffff]">{graph.nodes.length}</span>
          </div>
          <div class="flex items-center gap-2 h-8 px-3 bg-[#101010] border border-[#3d3a39] rounded-[6px] text-xs">
            <span class="text-[#8b949e]">Internal Links:</span>
            <span class="font-mono font-bold text-[#00d992]">{graph.edges.length}</span>
          </div>
          <div class="flex items-center gap-2 h-8 px-3 bg-[#101010] border border-[#3d3a39] rounded-[6px] text-xs">
            <span class="text-[#8b949e]">Hierarchy Depth:</span>
            <span class="font-mono font-bold text-[#f2f2f2]">{graph.maxDepth + 1} layers</span>
          </div>
          <div
            class={`flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-xs font-semibold border ${
              graph.hasCycles
                ? "bg-[#f43f5e]/10 text-[#f43f5e] border-[#f43f5e]/30 animate-pulse"
                : "bg-[#00d992]/10 text-[#00d992] border-[#00d992]/30"
            }`}
          >
            {graph.hasCycles ? <IconAlertTriangle size={13} /> : <IconCheckCircle size={13} />}
            <span>
              {graph.hasCycles ? `${graph.cycles.length} Circular Loop(s)` : "Clean DAG (0 Cycles)"}
            </span>
          </div>
        </div>
      </div>

      {/* Circular Dependency Warning Banner */}
      {graph.hasCycles && (
        <div class="bg-[#101010] border border-[#f43f5e]/50 rounded-[8px] p-4 bg-gradient-to-r from-[#f43f5e]/10 to-transparent">
          <div class="flex items-start gap-3">
            <div class="flex items-center justify-center w-7 h-7 rounded-[6px] bg-[#f43f5e]/20 text-[#f43f5e] shrink-0 mt-0.5">
              <IconRepeat size={15} />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-bold text-[#ffffff] flex items-center gap-2">
                <span>Circular Workspace Dependencies Detected</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-[#f43f5e]/20 text-[#f43f5e] font-mono">
                  {graph.cycles.length} cycle{graph.cycles.length > 1 ? "s" : ""}
                </span>
              </h3>
              <p class="text-xs text-[#bdbdbd] mt-1 leading-relaxed">
                Circular dependencies deadlock monorepo build tools (Turborepo, Nx, and pnpm). Workspaces in a
                cycle cannot determine a clean topological execution order.
              </p>

              {/* List of cycles */}
              <div class="mt-3 space-y-2">
                {graph.cycles.map((cycle, idx) => (
                  <div
                    key={idx}
                    class={`flex items-center justify-between gap-3 p-2.5 rounded-[6px] border text-xs transition-colors cursor-pointer ${
                      selectedCycleIdx === idx
                        ? "bg-[#f43f5e]/20 border-[#f43f5e] text-[#ffffff]"
                        : "bg-[#1a1a1a]/80 border-[#3d3a39] text-[#bdbdbd] hover:border-[#f43f5e]/50 hover:text-[#ffffff]"
                    }`}
                    onClick={() => setSelectedCycleIdx(selectedCycleIdx === idx ? null : idx)}
                  >
                    <div class="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                      <span class="font-mono text-[11px] text-[#f43f5e] font-bold">#{idx + 1}</span>
                      <div class="flex items-center gap-1.5 font-mono text-[11.5px]">
                        {cycle.path.map((node, i) => (
                          <span key={i} class="flex items-center gap-1.5">
                            <span class="font-bold text-[#ffffff]">{node}</span>
                            {i < cycle.path.length - 1 && <span class="text-[#f43f5e]">➔</span>}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <span class="text-[10px] uppercase font-semibold text-[#8b949e]">
                        {selectedCycleIdx === idx ? "Isolating on graph" : "Click to isolate"}
                      </span>
                      <button
                        class="p-1 hover:bg-[#252525] rounded text-[#8b949e] hover:text-[#ffffff]"
                        title="Copy cycle path"
                        onClick={(e) => {
                          e.stopPropagation()
                          copyCycleAsText(cycle.path)
                        }}
                      >
                        <IconCopy size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Graph Toolbar: Search, Focus Toggle, Zoom Controls */}
      <div class="flex items-center justify-between gap-3 bg-[#101010] border border-[#3d3a39] px-4 py-2.5 rounded-[8px] flex-wrap">
        <div class="flex items-center gap-3">
          {/* Search Box */}
          <div class="relative w-60">
            <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8b949e]" />
            <input
              type="text"
              placeholder="Filter workspaces..."
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              class="w-full h-7 pl-8 pr-2.5 bg-[#1a1a1a] border border-[#3d3a39] rounded-[6px] text-xs text-[#ffffff] placeholder-[#8b949e] focus:outline-none focus:border-[#00d992]"
            />
          </div>

          {/* Connected vs All Filter Switcher */}
          <div class="flex items-center bg-[#1a1a1a] p-0.5 border border-[#3d3a39] rounded-[6px]">
            <button
              class={`px-2.5 py-1 text-xs font-medium rounded-[4px] transition-colors ${
                filterMode === "all"
                  ? "bg-[#252525] text-[#ffffff] shadow-sm"
                  : "text-[#8b949e] hover:text-[#f2f2f2]"
              }`}
              onClick={() => setFilterMode("all")}
            >
              All ({graph.nodes.length})
            </button>
            <button
              class={`px-2.5 py-1 text-xs font-medium rounded-[4px] transition-colors ${
                filterMode === "connected"
                  ? "bg-[#252525] text-[#ffffff] shadow-sm"
                  : "text-[#8b949e] hover:text-[#f2f2f2]"
              }`}
              onClick={() => setFilterMode("connected")}
            >
              Connected ({layout.connectedCount})
            </button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          {selectedCycleIdx !== null && (
            <button
              class="h-7 px-2.5 bg-[#f43f5e]/10 border border-[#f43f5e]/40 text-[#f43f5e] rounded-[6px] text-xs font-medium hover:bg-[#f43f5e]/20 transition-colors"
              onClick={() => setSelectedCycleIdx(null)}
            >
              Exit Cycle Focus
            </button>
          )}
          {selectedNode && (
            <button
              class="h-7 px-2.5 bg-[#1a1a1a] border border-[#3d3a39] text-[#8b949e] hover:text-[#ffffff] rounded-[6px] text-xs font-medium transition-colors"
              onClick={() => setSelectedNode(null)}
            >
              Clear Selection
            </button>
          )}

          <div class="h-4 w-px bg-[#3d3a39]" />

          {/* Zoom Buttons */}
          <button
            class="p-1.5 bg-[#1a1a1a] border border-[#3d3a39] hover:border-[#8b949e] text-[#8b949e] hover:text-[#ffffff] rounded-[6px] transition-colors"
            title="Zoom In"
            onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
          >
            <IconZoomIn size={14} />
          </button>
          <button
            class="p-1.5 bg-[#1a1a1a] border border-[#3d3a39] hover:border-[#8b949e] text-[#8b949e] hover:text-[#ffffff] rounded-[6px] transition-colors"
            title="Zoom Out"
            onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.15).toFixed(2))))}
          >
            <IconZoomOut size={14} />
          </button>
          <button
            class="p-1.5 bg-[#1a1a1a] border border-[#3d3a39] hover:border-[#8b949e] text-[#8b949e] hover:text-[#ffffff] rounded-[6px] transition-colors"
            title="Fit to Screen"
            onClick={fitView}
          >
            <IconMaximize size={14} />
          </button>
          <span class="font-mono text-xs text-[#8b949e] w-12 text-right">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div class="relative w-full h-[640px] bg-[#0c0c0c] border border-[#3d3a39] rounded-[8px] overflow-hidden">
        {/* Drag/Pan Canvas Viewport */}
        <div
          ref={containerRef}
          class="w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* Subtle Grid Dot Pattern */}
          <div
            class="absolute inset-0 pointer-events-none opacity-25"
            style={{
              backgroundImage: `radial-gradient(#3d3a39 1px, transparent 1px)`,
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
          />

          <svg
            class="w-full h-full overflow-visible"
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: "0 0",
              willChange: isPanning ? "transform" : "auto",
            }}
          >
            <defs>
              {/* Directed Arrow Markers */}
              <marker
                id="arrow-default"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#4b4745" />
              </marker>

              <marker
                id="arrow-green"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#00d992" />
              </marker>

              <marker
                id="arrow-cyan"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8" />
              </marker>

              <marker
                id="arrow-red"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f43f5e" />
              </marker>
            </defs>

            {/* Render Connectors / Edges */}
            <g>
              {renderedEdges.map((edge) => {
                const fromNode = layout.nodeMap.get(edge.from)
                const toNode = layout.nodeMap.get(edge.to)
                if (!fromNode || !toNode) return null

                const edgeKey = `${edge.from}->${edge.to}`
                const isCircular = edge.isCircular
                const isOutgoing = activeRelPath === edge.from
                const isIncoming = activeRelPath === edge.to
                const isCycleFocus = focusedCycle?.cycleEdges.has(edgeKey)

                const x1 = fromNode.x + fromNode.width
                const y1 = fromNode.y + fromNode.height / 2
                const x2 = toNode.x
                const y2 = toNode.y + toNode.height / 2

                // Smooth S-Curve or Loop-Back Curve
                let pathData = ""
                if (x1 <= x2) {
                  const midX = (x1 + x2) / 2
                  pathData = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
                } else {
                  const curveOffset = 50
                  pathData = `M ${x1} ${y1} C ${x1 + curveOffset} ${y1 - 50}, ${x2 - curveOffset} ${y2 - 50}, ${x2} ${y2}`
                }

                let strokeColor = "#3d3a39"
                let strokeWidth = 1.5
                let markerEnd = "url(#arrow-default)"
                let opacity = 0.55

                if (isCycleFocus) {
                  strokeColor = "#f43f5e"
                  strokeWidth = 2.5
                  markerEnd = "url(#arrow-red)"
                  opacity = 1
                } else if (isCircular) {
                  strokeColor = "#f43f5e"
                  strokeWidth = 2
                  markerEnd = "url(#arrow-red)"
                  opacity = 0.95
                } else if (isOutgoing) {
                  strokeColor = "#00d992"
                  strokeWidth = 2.2
                  markerEnd = "url(#arrow-green)"
                  opacity = 1
                } else if (isIncoming) {
                  strokeColor = "#38bdf8"
                  strokeWidth = 2.2
                  markerEnd = "url(#arrow-cyan)"
                  opacity = 1
                } else if (activeRelPath) {
                  opacity = 0.1
                }

                return (
                  <path
                    key={edgeKey}
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={isCircular ? "5,3" : undefined}
                    markerEnd={markerEnd}
                    opacity={opacity}
                  />
                )
              })}
            </g>

            {/* Render Workspace Node Cards (Using ForeignObject for Pixel-Perfect Typography & Layout) */}
            <g>
              {renderedNodes.map((node) => {
                const isSelected = selectedNode === node.relPath
                const isHovered = hoveredNode === node.relPath
                const isSearching =
                  search &&
                  (node.name.toLowerCase().includes(search.toLowerCase()) ||
                    node.relPath.toLowerCase().includes(search.toLowerCase()))
                const isCycleNode =
                  focusedCycle?.cycleNodeNames.has(node.name) ||
                  focusedCycle?.cycleNodeNames.has(node.relPath)

                let opacity = 1
                if (activeRelPath) {
                  const isDirect =
                    activeRelPath === node.relPath ||
                    activeRelations?.outgoing.has(node.relPath) ||
                    activeRelations?.incoming.has(node.relPath)
                  opacity = isDirect ? 1 : 0.2
                } else if (focusedCycle) {
                  opacity = isCycleNode ? 1 : 0.2
                } else if (search && !isSearching) {
                  opacity = 0.2
                }

                const isOutgoing = activeRelations?.outgoing.has(node.relPath)
                const isIncoming = activeRelations?.incoming.has(node.relPath)

                const normRelPath = normalizePath(node.relPath)
                const cleanName = cleanWorkspaceName(node.name)

                // Category pill styles
                const categoryBadge =
                  node.category === "root"
                    ? { label: "ROOT", classes: "bg-[#8b5cf6]/20 text-[#a78bfa] border border-[#8b5cf6]/40" }
                    : node.category === "app"
                      ? { label: "APP", classes: "bg-[#00d992]/15 text-[#00d992] border border-[#00d992]/40" }
                      : node.category === "package"
                        ? {
                            label: "LIB",
                            classes: "bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/40",
                          }
                        : null

                return (
                  <foreignObject
                    key={node.relPath}
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    opacity={opacity}
                    class="overflow-visible"
                  >
                    <div
                      class={`w-full h-full rounded-[8px] p-2.5 flex flex-col justify-between border cursor-pointer select-none transition-all duration-150 ${
                        isSelected
                          ? "bg-[#161616] border-[#00d992] ring-1 ring-[#00d992]/50 shadow-lg shadow-[#00d992]/10"
                          : node.hasCycle
                            ? "bg-[#161616] border-[#f43f5e] ring-1 ring-[#f43f5e]/50 shadow-lg shadow-[#f43f5e]/10 animate-pulse"
                            : isOutgoing
                              ? "bg-[#161616] border-[#00d992]"
                              : isIncoming
                                ? "bg-[#161616] border-[#38bdf8]"
                                : isHovered
                                  ? "bg-[#181818] border-[#8b949e]"
                                  : "bg-[#121212] border-[#2e2a28] hover:border-[#4d4845]"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedNode(selectedNode === node.relPath ? null : node.relPath)
                      }}
                      onDblClick={(e) => {
                        e.stopPropagation()
                        onWorkspaceClick?.(node.relPath)
                      }}
                      onMouseEnter={() => setHoveredNode(node.relPath)}
                      onMouseLeave={() => setHoveredNode(null)}
                    >
                      {/* Top Header Row */}
                      <div class="flex items-center justify-between gap-1.5 min-w-0">
                        <span
                          class="font-mono font-bold text-[12.5px] text-[#ffffff] truncate tracking-tight"
                          title={cleanName}
                        >
                          {cleanName}
                        </span>

                        {categoryBadge && (
                          <span
                            class={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-wider shrink-0 leading-none ${categoryBadge.classes}`}
                          >
                            {categoryBadge.label}
                          </span>
                        )}
                      </div>

                      {/* Middle Row: Normalized Relative Path */}
                      <div
                        class="font-mono text-[10.5px] text-[#8b949e] truncate flex items-center gap-1 leading-none"
                        title={normRelPath}
                      >
                        <IconFolder size={11} className="shrink-0 text-[#605c5a]" />
                        <span class="truncate">{normRelPath}</span>
                      </div>

                      {/* Bottom Row: Exact Metadata Badges */}
                      <div class="flex items-center gap-1.5 text-[10px] font-mono leading-none">
                        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#2e2a28] text-[#8b949e]">
                          <span>→</span>
                          <strong class="text-[#f2f2f2] font-semibold">{node.deps.length}</strong>
                          <span>deps</span>
                        </span>

                        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#2e2a28] text-[#8b949e]">
                          <span>←</span>
                          <strong
                            class={`font-semibold ${node.dependedBy.length > 0 ? "text-[#00d992]" : "text-[#8b949e]"}`}
                          >
                            {node.dependedBy.length}
                          </strong>
                          <span>used by</span>
                        </span>
                      </div>
                    </div>
                  </foreignObject>
                )
              })}
            </g>
          </svg>
        </div>

        {/* Selected Workspace Interactive Detail Inspector (Floating Bottom-Right Card) */}
        {selectedNodeObj && (
          <div class="absolute bottom-4 right-4 w-80 bg-[#141414] border border-[#00d992]/50 shadow-2xl rounded-[8px] p-4 text-xs z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div class="flex items-start justify-between gap-2 border-b border-[#3d3a39] pb-2.5 mb-2.5">
              <div class="min-w-0">
                <div class="text-[10px] uppercase font-bold tracking-wider text-[#00d992]">
                  WORKSPACE DETAILS
                </div>
                <div class="font-mono font-bold text-sm text-[#ffffff] truncate">{selectedNodeObj.name}</div>
                <div class="font-mono text-[11px] text-[#8b949e] truncate">
                  {normalizePath(selectedNodeObj.relPath)}
                </div>
              </div>
              <button
                class="p-1 text-[#8b949e] hover:text-[#ffffff] rounded hover:bg-[#252525]"
                onClick={() => setSelectedNode(null)}
              >
                <IconX size={13} />
              </button>
            </div>

            <div class="space-y-2">
              <div>
                <div class="text-[10.5px] font-semibold text-[#8b949e] mb-1">
                  INTERNAL DEPENDENCIES (
                  {selectedNodeObj.deps
                    ? Object.keys(selectedNodeObj.deps).filter((d) => graph.nodes.some((n) => n.name === d))
                        .length
                    : 0}
                  ):
                </div>
                <div class="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {Object.keys(selectedNodeObj.deps)
                    .filter((d) => graph.nodes.some((n) => n.name === d))
                    .map((depName) => (
                      <span
                        key={depName}
                        class="px-2 py-0.5 rounded bg-[#00d992]/10 border border-[#00d992]/30 text-[#00d992] font-mono text-[10.5px]"
                      >
                        → {depName}
                      </span>
                    ))}
                  {Object.keys(selectedNodeObj.deps).filter((d) => graph.nodes.some((n) => n.name === d))
                    .length === 0 && <span class="text-[#8b949e] italic">No internal dependencies</span>}
                </div>
              </div>

              <div>
                <div class="text-[10.5px] font-semibold text-[#8b949e] mb-1">DEPENDENTS (USED BY):</div>
                <div class="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {graph.nodes
                    .find((n) => n.relPath === selectedNodeObj.relPath)
                    ?.dependedBy.map((depBy) => (
                      <span
                        key={depBy}
                        class="px-2 py-0.5 rounded bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-[#38bdf8] font-mono text-[10.5px]"
                      >
                        ← {depBy}
                      </span>
                    ))}
                  {(graph.nodes.find((n) => n.relPath === selectedNodeObj.relPath)?.dependedBy.length ??
                    0) === 0 && <span class="text-[#8b949e] italic">Not depended on by any workspace</span>}
                </div>
              </div>
            </div>

            <button
              class="w-full mt-3 h-7 bg-[#1e1e1e] hover:bg-[#252525] border border-[#3d3a39] hover:border-[#8b949e] text-[#f2f2f2] rounded-[4px] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              onClick={() => onWorkspaceClick?.(selectedNodeObj.relPath)}
            >
              <span>Inspect Manifest in Drawer</span>
              <IconExternalLink size={11} />
            </button>
          </div>
        )}

        {/* Legend Overlay at bottom-left */}
        <div class="absolute bottom-3 left-3 bg-[#101010]/95 border border-[#3d3a39] backdrop-blur-md px-3.5 py-2.5 rounded-[6px] text-[11px] text-[#8b949e] flex items-center gap-4 shadow-lg">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-[#00d992]" />
            <span class="text-[#f2f2f2]">Selected / Dependency (→)</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" />
            <span class="text-[#f2f2f2]">Dependent (←)</span>
          </div>
          {graph.hasCycles && (
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-[#f43f5e]" />
              <span class="text-[#f43f5e] font-semibold">Circular Loop</span>
            </div>
          )}
          <div class="text-[10px] text-[#8b949e] border-l border-[#3d3a39] pl-3">
            Click card to inspect · Double-click to open drawer
          </div>
        </div>
      </div>
    </div>
  )
}
