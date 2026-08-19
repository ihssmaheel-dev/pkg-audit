import { useMemo, useRef, useState } from "preact/hooks"
import type { ScanResult, WorkspaceGraphNode } from "../../../types"
import {
  IconAlertTriangle,
  IconCheckCircle,
  IconCopy,
  IconMaximize,
  IconRepeat,
  IconSearch,
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
}

const CARD_WIDTH = 230
const CARD_HEIGHT = 76
const COL_SPACING = 340
const ROW_SPACING = 100
const PADDING = 60

export function Graph({ data, onWorkspaceClick, notify }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [startPan, setStartPan] = useState({ x: 0, y: 0 })
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedCycleIdx, setSelectedCycleIdx] = useState<number | null>(null)

  const graph = data.graph ?? { nodes: [], edges: [], cycles: [], hasCycles: false, maxDepth: 0 }

  // Compute layered layout positions
  const layout = useMemo(() => {
    const nodes = graph.nodes
    const layers = new Map<number, WorkspaceGraphNode[]>()

    // Group nodes by depth
    for (const node of nodes) {
      const d = node.depth ?? 0
      if (!layers.has(d)) layers.set(d, [])
      layers.get(d)!.push(node)
    }

    const positionedNodes: LayoutNode[] = []
    const nodePositionMap = new Map<string, LayoutNode>()

    const sortedDepths = Array.from(layers.keys()).sort((a, b) => b - a) // Highest depth (apps) on left, lowest (helpers) on right
    let maxColY = 0

    sortedDepths.forEach((depth, colIdx) => {
      const colNodes = layers.get(depth) ?? []
      colNodes.sort((a, b) => a.relPath.localeCompare(b.relPath))

      colNodes.forEach((node, rowIdx) => {
        const x = PADDING + colIdx * COL_SPACING
        const y = PADDING + rowIdx * ROW_SPACING
        const layoutNode: LayoutNode = {
          ...node,
          x,
          y,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
        }
        positionedNodes.push(layoutNode)
        nodePositionMap.set(node.relPath, layoutNode)
        if (y + CARD_HEIGHT > maxColY) maxColY = y + CARD_HEIGHT
      })
    })

    const totalWidth = PADDING * 2 + Math.max(1, sortedDepths.length) * COL_SPACING
    const totalHeight = PADDING * 2 + maxColY

    return {
      nodes: positionedNodes,
      nodeMap: nodePositionMap,
      width: Math.max(900, totalWidth),
      height: Math.max(600, totalHeight),
    }
  }, [graph])

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
      // find relPaths
      const uWs = data.workspaces.find((w) => w.name === uName || w.relPath === uName)
      const vWs = data.workspaces.find((w) => w.name === vName || w.relPath === vName)
      if (uWs && vWs) {
        cycleEdges.add(`${uWs.relPath}->${vWs.relPath}`)
      }
    }

    return { cycleNodeNames, cycleEdges }
  }, [selectedCycleIdx, graph.cycles, data.workspaces])

  // Pan and Zoom handlers
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    setIsPanning(true)
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isPanning) return
    setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y })
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    const newZoom = Math.min(Math.max(0.3, zoom * zoomFactor), 2.5)
    setZoom(newZoom)
  }

  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setSelectedNode(null)
    setSelectedCycleIdx(null)
  }

  const copyCycleAsText = (path: string[]) => {
    const text = path.join(" -> ")
    navigator.clipboard?.writeText(text).catch(() => {})
    notify(`Copied cycle: ${text}`)
  }

  return (
    <div class="space-y-4 w-full select-none">
      {/* Header */}
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
            <span class="text-[#8b949e]">Connections:</span>
            <span class="font-mono font-bold text-[#00d992]">{graph.edges.length}</span>
          </div>
          <div class="flex items-center gap-2 h-8 px-3 bg-[#101010] border border-[#3d3a39] rounded-[6px] text-xs">
            <span class="text-[#8b949e]">Max Depth:</span>
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

      {/* Graph Toolbar & Search */}
      <div class="flex items-center justify-between gap-3 bg-[#101010] border border-[#3d3a39] px-4 py-2.5 rounded-[8px] flex-wrap">
        <div class="flex items-center gap-3">
          <div class="relative w-64">
            <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8b949e]" />
            <input
              type="text"
              placeholder="Search workspaces in graph..."
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              class="w-full h-7 pl-8 pr-2.5 bg-[#1a1a1a] border border-[#3d3a39] rounded-[6px] text-xs text-[#ffffff] placeholder-[#8b949e] focus:outline-none focus:border-[#00d992]"
            />
          </div>
          {search && (
            <button class="text-xs text-[#8b949e] hover:text-[#ffffff]" onClick={() => setSearch("")}>
              Clear
            </button>
          )}
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
          <button
            class="p-1.5 bg-[#1a1a1a] border border-[#3d3a39] hover:border-[#8b949e] text-[#8b949e] hover:text-[#ffffff] rounded-[6px] transition-colors"
            title="Zoom In"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
          >
            <IconZoomIn size={14} />
          </button>
          <button
            class="p-1.5 bg-[#1a1a1a] border border-[#3d3a39] hover:border-[#8b949e] text-[#8b949e] hover:text-[#ffffff] rounded-[6px] transition-colors"
            title="Zoom Out"
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
          >
            <IconZoomOut size={14} />
          </button>
          <button
            class="p-1.5 bg-[#1a1a1a] border border-[#3d3a39] hover:border-[#8b949e] text-[#8b949e] hover:text-[#ffffff] rounded-[6px] transition-colors"
            title="Reset View"
            onClick={resetView}
          >
            <IconMaximize size={14} />
          </button>
          <span class="font-mono text-xs text-[#8b949e] w-12 text-right">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Interactive SVG Canvas */}
      <div
        ref={containerRef}
        class="relative w-full h-[620px] bg-[#0c0c0c] border border-[#3d3a39] rounded-[8px] overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Subtle background grid pattern */}
        <div
          class="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `radial-gradient(#3d3a39 1px, transparent 1px)`,
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        <svg
          class="w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <defs>
            {/* Standard Arrow Marker */}
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3d3a39" />
            </marker>

            {/* Active Green Arrow Marker */}
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#00d992" />
            </marker>

            {/* Circular Red Arrow Marker */}
            <marker
              id="arrow-circular"
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

          {/* Edges / Curved Connectors */}
          <g>
            {graph.edges.map((edge) => {
              const fromNode = layout.nodeMap.get(edge.from)
              const toNode = layout.nodeMap.get(edge.to)
              if (!fromNode || !toNode) return null

              const edgeKey = `${edge.from}->${edge.to}`
              const isCircular = edge.isCircular
              const isActive = activeRelations?.activeEdges.has(edgeKey)
              const isCycleFocus = focusedCycle?.cycleEdges.has(edgeKey)

              const x1 = fromNode.x + fromNode.width
              const y1 = fromNode.y + fromNode.height / 2
              const x2 = toNode.x
              const y2 = toNode.y + toNode.height / 2

              // Compute Bezier Curve
              let pathData = ""
              if (x1 <= x2) {
                // Forward L-to-R connection
                const midX = (x1 + x2) / 2
                pathData = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
              } else {
                // Backward / Loop connection (circular or cross-layer)
                const curveOffset = 60
                pathData = `M ${x1} ${y1} C ${x1 + curveOffset} ${y1 - 60}, ${x2 - curveOffset} ${y2 - 60}, ${x2} ${y2}`
              }

              let strokeColor = "#3d3a39"
              let strokeWidth = 1.5
              let markerEnd = "url(#arrow)"
              let opacity = 0.5

              if (isCycleFocus) {
                strokeColor = "#f43f5e"
                strokeWidth = 2.5
                markerEnd = "url(#arrow-circular)"
                opacity = 1
              } else if (isCircular) {
                strokeColor = "#f43f5e"
                strokeWidth = 2
                markerEnd = "url(#arrow-circular)"
                opacity = 0.9
              } else if (isActive) {
                strokeColor = "#00d992"
                strokeWidth = 2.2
                markerEnd = "url(#arrow-active)"
                opacity = 1
              } else if (activeRelPath) {
                opacity = 0.12
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
                  class="transition-opacity duration-200"
                />
              )
            })}
          </g>

          {/* Nodes (Workspace Cards) */}
          <g>
            {layout.nodes.map((node) => {
              const isSelected = selectedNode === node.relPath
              const isHovered = hoveredNode === node.relPath
              const isSearching =
                search &&
                (node.name.toLowerCase().includes(search.toLowerCase()) ||
                  node.relPath.toLowerCase().includes(search.toLowerCase()))
              const isCycleNode =
                focusedCycle?.cycleNodeNames.has(node.name) || focusedCycle?.cycleNodeNames.has(node.relPath)

              let opacity = 1
              if (activeRelPath) {
                const isDirect =
                  activeRelPath === node.relPath ||
                  activeRelations?.outgoing.has(node.relPath) ||
                  activeRelations?.incoming.has(node.relPath)
                opacity = isDirect ? 1 : 0.25
              } else if (focusedCycle) {
                opacity = isCycleNode ? 1 : 0.2
              } else if (search && !isSearching) {
                opacity = 0.25
              }

              const isOutgoing = activeRelations?.outgoing.has(node.relPath)
              const isIncoming = activeRelations?.incoming.has(node.relPath)

              let borderColor = "#3d3a39"
              if (node.hasCycle) borderColor = "#f43f5e"
              if (isSelected) borderColor = "#00d992"
              else if (isOutgoing) borderColor = "#00d992"
              else if (isIncoming) borderColor = "#38bdf8"
              else if (isHovered) borderColor = "#8b949e"

              return (
                <g
                  key={node.relPath}
                  transform={`translate(${node.x}, ${node.y})`}
                  opacity={opacity}
                  class="cursor-pointer transition-opacity duration-200"
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
                  {/* Card Background */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx="8"
                    fill="#141414"
                    stroke={borderColor}
                    strokeWidth={isSelected || node.hasCycle || isOutgoing || isIncoming ? 2 : 1}
                  />

                  {/* Top Bar / Status */}
                  {node.hasCycle && (
                    <circle cx={node.width - 14} cy={14} r="4" fill="#f43f5e" class="animate-pulse" />
                  )}

                  {/* Name */}
                  <text x="14" y="24" fill="#ffffff" fontFamily="monospace" fontWeight="bold" fontSize="12.5">
                    {node.name.length > 22 ? `${node.name.slice(0, 20)}...` : node.name}
                  </text>

                  {/* RelPath */}
                  <text x="14" y="40" fill="#8b949e" fontFamily="monospace" fontSize="10.5">
                    {node.relPath.length > 26 ? `${node.relPath.slice(0, 24)}...` : node.relPath}
                  </text>

                  {/* Bottom Stats: dependencies & dependents */}
                  <g transform="translate(14, 52)">
                    <rect x="0" y="0" width="60" height="16" rx="3" fill="#1e1e1e" />
                    <text x="6" y="11" fill="#8b949e" fontSize="9.5" fontWeight="600">
                      deps: <tspan fill="#ffffff">{node.deps.length}</tspan>
                    </text>

                    <rect x="66" y="0" width="75" height="16" rx="3" fill="#1e1e1e" />
                    <text x="72" y="11" fill="#8b949e" fontSize="9.5" fontWeight="600">
                      used by: <tspan fill="#00d992">{node.dependedBy.length}</tspan>
                    </text>

                    {node.isRoot && (
                      <text x="150" y="11" fill="#8b949e" fontSize="9.5" fontWeight="600">
                        ROOT
                      </text>
                    )}
                  </g>
                </g>
              )
            })}
          </g>
        </svg>

        {/* Legend Overlay at bottom-left */}
        <div class="absolute bottom-3 left-3 bg-[#101010]/90 border border-[#3d3a39] backdrop-blur-md px-3 py-2 rounded-[6px] text-[11px] text-[#8b949e] flex items-center gap-4">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-[#00d992]" />
            <span>Selected / Dependency</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" />
            <span>Dependent (Used By)</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-[#f43f5e]" />
            <span>Circular Loop</span>
          </div>
          <div class="text-[10px] text-[#8b949e]">Double-click card to open details</div>
        </div>
      </div>
    </div>
  )
}
