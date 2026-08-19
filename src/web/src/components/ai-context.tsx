import { useMemo, useState } from "preact/hooks"
import type { ScanResult } from "../../../types"
import { IconBrain, IconCopy, IconDownload, IconSparkles } from "./icons"
import { generateMonorepoContext } from "../../../scan/context"

interface AiContextViewProps {
  data: ScanResult
  notify: (msg: string) => void
}

export function AiContextView({ data, notify }: AiContextViewProps) {
  const [targetPreset, setTargetPreset] = useState<"generic" | "cursor" | "claude" | "json">("generic")

  const contextContent = useMemo(() => {
    if (targetPreset === "json") {
      return generateMonorepoContext(data, { format: "json" })
    }
    return generateMonorepoContext(data, {
      format: "markdown",
      target: targetPreset,
    })
  }, [data, targetPreset])

  const wordCount = useMemo(() => {
    return contextContent.trim().split(/\s+/).length
  }, [contextContent])

  const estimatedTokens = useMemo(() => {
    return Math.round(contextContent.length / 3.8)
  }, [contextContent])

  const fileName = useMemo(() => {
    if (targetPreset === "cursor") return "monorepo.mdc"
    if (targetPreset === "claude") return "CLAUDE.md"
    if (targetPreset === "json") return "monorepo-context.json"
    return "MONOREPO_CONTEXT.md"
  }, [targetPreset])

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(contextContent)
      notify(`Copied ${fileName} to clipboard!`)
    } catch {
      // Clipboard unavailable
    }
  }

  const downloadFile = () => {
    const blob = new Blob([contextContent], {
      type: targetPreset === "json" ? "application/json" : "text/markdown;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    notify(`Downloaded ${fileName}`)
  }

  return (
    <div class="space-y-5 w-full">
      {/* Header */}
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div class="text-xs font-semibold uppercase tracking-[2.52px] text-[#00d992] mb-1 flex items-center gap-1.5">
            <IconSparkles size={13} />
            <span>AI AGENT ARCHITECTURE CONTEXT</span>
          </div>
          <h1 class="text-2xl font-normal tracking-[-0.6px] text-[#ffffff] flex items-center gap-2.5">
            <span>LLM Context Exporter</span>
            <span class="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#1a1a1a] text-[#00d992] border border-[#3d3a39]">
              ~{estimatedTokens.toLocaleString()} Tokens
            </span>
          </h1>
        </div>

        {/* Action Buttons */}
        <div class="flex items-center gap-2 flex-wrap">
          <button
            class="flex items-center gap-1.5 h-8 px-4 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] rounded-[6px] text-xs font-semibold transition-colors"
            onClick={() => void copyToClipboard()}
          >
            <IconCopy size={13} />
            <span>Copy for AI ({fileName})</span>
          </button>
          <button
            class="flex items-center gap-1.5 h-8 px-3.5 bg-[#151515] border border-[#3d3a39] hover:bg-[#202020] rounded-[6px] text-xs text-[#f2f2f2] font-medium transition-colors"
            onClick={() => downloadFile()}
          >
            <IconDownload size={13} />
            <span>Download {fileName}</span>
          </button>
        </div>
      </div>

      {/* Preset Bar & Stats */}
      <div class="flex items-center justify-between gap-4 flex-wrap bg-[#141414] p-3 rounded-[8px] border border-[#2c2826]">
        <div class="flex items-center gap-2 text-xs">
          <span class="text-[#8b949e]">Target Format:</span>
          <div class="flex items-center bg-[#101010] p-0.5 border border-[#302c2a] rounded-[6px]">
            <button
              class={`px-3 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                targetPreset === "generic"
                  ? "bg-[#00d992]/15 text-[#00d992] font-semibold border border-[#00d992]/30"
                  : "text-[#8b949e] hover:text-[#f2f2f2]"
              }`}
              onClick={() => setTargetPreset("generic")}
            >
              Generic (MONOREPO_CONTEXT.md)
            </button>
            <button
              class={`px-3 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                targetPreset === "cursor"
                  ? "bg-[#00d992]/15 text-[#00d992] font-semibold border border-[#00d992]/30"
                  : "text-[#8b949e] hover:text-[#f2f2f2]"
              }`}
              onClick={() => setTargetPreset("cursor")}
            >
              Cursor Rules (.mdc)
            </button>
            <button
              class={`px-3 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                targetPreset === "claude"
                  ? "bg-[#00d992]/15 text-[#00d992] font-semibold border border-[#00d992]/30"
                  : "text-[#8b949e] hover:text-[#f2f2f2]"
              }`}
              onClick={() => setTargetPreset("claude")}
            >
              Claude (CLAUDE.md)
            </button>
            <button
              class={`px-3 py-1 text-xs rounded-[4px] font-medium transition-colors ${
                targetPreset === "json"
                  ? "bg-[#00d992]/15 text-[#00d992] font-semibold border border-[#00d992]/30"
                  : "text-[#8b949e] hover:text-[#f2f2f2]"
              }`}
              onClick={() => setTargetPreset("json")}
            >
              JSON
            </button>
          </div>
        </div>

        <div class="flex items-center gap-4 text-xs font-mono text-[#8b949e]">
          <div>
            Tokens: <span class="text-[#00d992] font-semibold">~{estimatedTokens.toLocaleString()}</span>
          </div>
          <div>
            Words: <span class="text-[#ffffff] font-semibold">{wordCount.toLocaleString()}</span>
          </div>
          <div>
            Workspaces: <span class="text-[#ffffff] font-semibold">{data.workspaces.length}</span>
          </div>
        </div>
      </div>

      {/* Quick Setup Instructions Callout */}
      <div class="bg-[#121212] border border-[#2e2a28] rounded-[8px] p-4 flex items-start gap-3.5">
        <div class="w-8 h-8 rounded-[6px] bg-[#00d992]/15 text-[#00d992] flex items-center justify-center shrink-0 mt-0.5">
          <IconBrain size={18} />
        </div>
        <div class="space-y-1 text-xs">
          <div class="font-semibold text-[#ffffff]">How to use this with AI Coding Assistants</div>
          <p class="text-[#8b949e] leading-relaxed">
            {targetPreset === "cursor" && (
              <>
                Save this content to <code class="text-[#00d992]">.cursor/rules/monorepo.mdc</code> in your
                repository. Cursor will automatically inject workspace boundaries and version policies
                whenever editing workspace manifests.
              </>
            )}
            {targetPreset === "claude" && (
              <>
                Save this content to <code class="text-[#00d992]">CLAUDE.md</code> in your repo root or paste
                it into your Claude Project Knowledge. Claude will follow strict boundary rules and avoid
                circular dependencies.
              </>
            )}
            {targetPreset === "generic" && (
              <>
                Save as <code class="text-[#00d992]">MONOREPO_CONTEXT.md</code> in your repository root. Share
                it with Copilot, Windsurf, or Antigravity to keep dependency versions aligned.
              </>
            )}
            {targetPreset === "json" && (
              <>
                Ingest this machine-readable JSON representation directly in your AI developer workflow or
                agent orchestration pipelines.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Content Code Preview Box */}
      <div class="bg-[#0e0e0e] border border-[#2e2a28] rounded-[8px] overflow-hidden shadow-inner">
        <div class="px-4 py-2.5 bg-[#141414] border-b border-[#242424] flex items-center justify-between text-xs text-[#8b949e]">
          <span class="font-mono text-[#d1d5db] font-semibold">{fileName}</span>
          <button
            onClick={() => void copyToClipboard()}
            class="flex items-center gap-1 hover:text-[#00d992] transition-colors"
          >
            <IconCopy size={12} />
            <span>Copy Snippet</span>
          </button>
        </div>
        <div class="p-4 overflow-x-auto max-h-[60vh] overflow-y-auto font-mono text-xs text-[#e6edf3] leading-relaxed whitespace-pre selection:bg-[#00d992]/20">
          <code>{contextContent}</code>
        </div>
      </div>
    </div>
  )
}
