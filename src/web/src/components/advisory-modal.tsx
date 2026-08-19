import { useEffect } from "preact/hooks"
import type { ComponentChildren } from "preact"
import type { SecuritySeverity, SecurityVulnerability } from "../../../types"
import { IconCopy, IconExternalLink, IconWrench, IconX } from "./icons"

interface AdvisoryModalProps {
  vuln: SecurityVulnerability | null
  isOpen: boolean
  onClose: () => void
  notify: (msg: string) => void
  onFixSingle?: (vuln: SecurityVulnerability) => Promise<void>
  isFixing?: boolean
}

const SEVERITY_COLORS: Record<SecuritySeverity, { bg: string; text: string; border: string; label: string }> =
  {
    CRITICAL: {
      bg: "bg-[#f43f5e]/15",
      text: "text-[#f43f5e]",
      border: "border-[#f43f5e]/40",
      label: "CRITICAL",
    },
    HIGH: {
      bg: "bg-[#ea580c]/15",
      text: "text-[#f97316]",
      border: "border-[#ea580c]/40",
      label: "HIGH",
    },
    MODERATE: {
      bg: "bg-[#f59e0b]/15",
      text: "text-[#f59e0b]",
      border: "border-[#f59e0b]/40",
      label: "MODERATE",
    },
    LOW: {
      bg: "bg-[#8b949e]/15",
      text: "text-[#8b949e]",
      border: "border-[#8b949e]/40",
      label: "LOW",
    },
    UNKNOWN: {
      bg: "bg-[#8b949e]/15",
      text: "text-[#8b949e]",
      border: "border-[#8b949e]/40",
      label: "UNKNOWN",
    },
  }

function renderInline(text: string): ComponentChildren[] {
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<]+)/g
  const parts: ComponentChildren[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code class="px-1.5 py-0.5 rounded text-[11px] font-mono bg-[#1c1c1c] text-[#00d992] border border-[#333]">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(<strong class="font-bold text-[#ffffff]">{token.slice(2, -2)}</strong>)
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(<em class="italic text-[#d1d5db]">{token.slice(1, -1)}</em>)
    } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      const closeBracket = token.indexOf("](")
      const linkText = token.slice(1, closeBracket)
      const url = token.slice(closeBracket + 2, -1)
      parts.push(
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          class="text-[#00d992] underline hover:text-[#2fd6a1] transition-colors break-all"
        >
          {linkText}
        </a>
      )
    } else if (token.startsWith("http://") || token.startsWith("https://")) {
      parts.push(
        <a
          href={token}
          target="_blank"
          rel="noreferrer"
          class="text-[#00d992] underline hover:text-[#2fd6a1] transition-colors break-all"
        >
          {token}
        </a>
      )
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

export function MarkdownView({ content }: { content: string }) {
  const elements: ComponentChildren[] = []
  const lines = content.split(/\r?\n/)
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // 1. Fenced Code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        codeLines.push(lines[i]!)
        i++
      }
      i++
      const codeText = codeLines.join("\n")
      elements.push(
        <div class="my-3 rounded-[6px] overflow-hidden border border-[#2e2a28] bg-[#0c0c0c]">
          {lang && (
            <div class="px-3 py-1 bg-[#161616] border-b border-[#2e2a28] text-[10px] font-mono text-[#8b949e] uppercase">
              {lang}
            </div>
          )}
          <pre class="p-3 text-xs font-mono text-[#e6edf3] overflow-x-auto whitespace-pre leading-relaxed">
            <code>{codeText}</code>
          </pre>
        </div>
      )
      continue
    }

    // 2. Empty line
    if (!line.trim()) {
      i++
      continue
    }

    // 3. Horizontal rule
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      elements.push(<hr class="my-4 border-[#2e2a28]" />)
      i++
      continue
    }

    // 4. Headings
    if (line.startsWith("# ")) {
      elements.push(
        <h1 class="text-xl font-bold text-[#ffffff] mt-5 mb-2 pb-1.5 border-b border-[#2e2a28]">
          {renderInline(line.slice(2))}
        </h1>
      )
      i++
      continue
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 class="text-base font-bold text-[#ffffff] mt-4 mb-2 pb-1 border-b border-[#2e2a28]">
          {renderInline(line.slice(3))}
        </h2>
      )
      i++
      continue
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3 class="text-sm font-semibold text-[#00d992] mt-3.5 mb-1.5">{renderInline(line.slice(4))}</h3>
      )
      i++
      continue
    }
    if (line.startsWith("#### ")) {
      elements.push(
        <h4 class="text-xs font-semibold text-[#d1d5db] mt-3 mb-1">{renderInline(line.slice(5))}</h4>
      )
      i++
      continue
    }

    // 5. Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i]!.startsWith("> ")) {
        quoteLines.push(lines[i]!.slice(2))
        i++
      }
      elements.push(
        <blockquote class="my-3 pl-3.5 border-l-2 border-[#00d992] text-xs text-[#a0a0a0] italic bg-[#151515] py-2 rounded-r">
          {renderInline(quoteLines.join(" "))}
        </blockquote>
      )
      continue
    }

    // 6. Bullet lists
    if (/^[-*+]\s+/.test(line)) {
      const listItems: string[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i]!)) {
        listItems.push(lines[i]!.replace(/^[-*+]\s+/, ""))
        i++
      }
      elements.push(
        <ul class="my-2.5 pl-5 list-disc space-y-1 text-xs text-[#d1d5db]">
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    // 7. Numbered lists
    if (/^\d+\.\s+/.test(line)) {
      const listItems: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        listItems.push(lines[i]!.replace(/^\d+\.\s+/, ""))
        i++
      }
      elements.push(
        <ol class="my-2.5 pl-5 list-decimal space-y-1 text-xs text-[#d1d5db]">
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    // 8. Markdown Table
    if (line.includes("|") && lines[i + 1]?.includes("---")) {
      const headerCols = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
      i += 2
      const rowList: string[][] = []
      while (i < lines.length && lines[i]!.includes("|")) {
        const rowCols = lines[i]!.split("|")
          .map((c) => c.trim())
          .filter(Boolean)
        if (rowCols.length) rowList.push(rowCols)
        i++
      }
      elements.push(
        <div class="my-3 overflow-x-auto border border-[#2e2a28] rounded-[6px]">
          <table class="w-full text-left text-xs">
            <thead class="bg-[#181818] border-b border-[#2e2a28] text-[#8b949e]">
              <tr>
                {headerCols.map((h, hIdx) => (
                  <th key={hIdx} class="p-2.5 font-semibold">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody class="divide-y divide-[#242424] text-[#d1d5db]">
              {rowList.map((row, rIdx) => (
                <tr key={rIdx} class="hover:bg-[#151515]">
                  {row.map((col, cIdx) => (
                    <td key={cIdx} class="p-2.5">
                      {renderInline(col)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // 9. Standard Paragraph
    const paragraphLines: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !lines[i]!.startsWith("#") &&
      !lines[i]!.startsWith("> ") &&
      !lines[i]!.startsWith("```") &&
      !/^[-*+]\s+/.test(lines[i]!) &&
      !/^\d+\.\s+/.test(lines[i]!)
    ) {
      paragraphLines.push(lines[i]!)
      i++
    }
    elements.push(
      <p class="my-2.5 text-xs text-[#d1d5db] leading-relaxed">{renderInline(paragraphLines.join(" "))}</p>
    )
  }

  return <div class="markdown-body space-y-1">{elements}</div>
}

export function AdvisoryModal({ vuln, isOpen, onClose, notify, onFixSingle, isFixing }: AdvisoryModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !vuln) return null

  const sevInfo = SEVERITY_COLORS[vuln.severity]

  const copyMarkdown = async () => {
    let md = `## [${vuln.severity}] ${vuln.id} — ${vuln.pkg}@${vuln.version}\n\n`
    md += `- **Summary**: ${vuln.summary}\n`
    if (vuln.cvssScore) md += `- **CVSS Score**: ${vuln.cvssScore}\n`
    if (vuln.suggestedVersion) md += `- **Recommended Fix**: \`${vuln.suggestedVersion}\`\n`
    md += `- **Advisory URL**: ${vuln.advisoryUrl}\n`
    md += `- **Affected Workspaces**: ${vuln.workspaces.map((w) => w.workspace).join(", ")}\n\n`
    if (vuln.details) {
      md += `### Advisory Details\n\n${vuln.details}\n`
    }
    try {
      await navigator.clipboard.writeText(md)
      notify("Copied advisory markdown to clipboard")
    } catch {
      // Clipboard unavailable
    }
  }

  const advisoryMarkdown =
    vuln.details?.trim() ||
    `### Overview\n\n${vuln.summary}\n\n### Impact\n\nThis vulnerability affects \`${vuln.pkg}@${vuln.version}\` declared in: ${vuln.workspaces
      .map((w) => `\`${w.workspace}\``)
      .join(", ")}.\n\n${
      vuln.suggestedVersion
        ? `### Recommended Remediation\n\nUpgrade \`${vuln.pkg}\` to safe release \`${vuln.suggestedVersion}\`.`
        : "No automated fixed version was published in OSV advisory records."
    }`

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
      <div
        class="bg-[#121212] border border-[#2e2a28] rounded-[10px] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div class="px-6 py-4 border-b border-[#2e2a28] flex items-center justify-between gap-4 bg-[#161616]">
          <div class="flex items-center gap-3 flex-wrap min-w-0">
            <span
              class={`px-2.5 py-1 rounded text-xs font-bold font-mono border ${sevInfo.bg} ${sevInfo.text} ${sevInfo.border}`}
            >
              {sevInfo.label} {vuln.cvssScore ? `(${vuln.cvssScore.toFixed(1)})` : ""}
            </span>
            <div class="flex items-baseline gap-2 min-w-0">
              <span class="text-base font-bold font-mono text-[#ffffff]">{vuln.id}</span>
              <span class="text-xs font-mono text-[#8b949e]">
                ({vuln.pkg}@{vuln.version})
              </span>
            </div>
            {vuln.suggestedVersion && (
              <span class="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#00d992]/10 text-[#00d992] border border-[#00d992]/30">
                safe target: {vuln.suggestedVersion}
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            class="text-[#8b949e] hover:text-[#ffffff] p-1.5 rounded-md hover:bg-[#252525] transition-colors"
            title="Close (Esc)"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Metadata Sub-bar */}
        <div class="px-6 py-3 bg-[#181818] border-b border-[#2e2a28] flex items-center justify-between gap-4 flex-wrap text-xs">
          <div class="flex items-center gap-4 flex-wrap text-[#8b949e]">
            {vuln.aliases.length > 0 && (
              <div>
                <span class="text-[#6e7681]">Aliases:</span>{" "}
                <span class="text-[#d1d5db] font-mono">{vuln.aliases.join(", ")}</span>
              </div>
            )}
            {vuln.publishedAt && (
              <div>
                <span class="text-[#6e7681]">Published:</span>{" "}
                <span class="text-[#d1d5db] font-mono">{vuln.publishedAt.split("T")[0]}</span>
              </div>
            )}
          </div>

          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[11px] text-[#6e7681]">Workspaces:</span>
            {vuln.workspaces.map((w) => (
              <span
                key={w.workspace}
                class="px-2 py-0.5 bg-[#121212] border border-[#302c2a] rounded text-[11px] font-mono text-[#8b949e]"
              >
                {w.workspace}
              </span>
            ))}
          </div>
        </div>

        {/* Summary Callout Banner */}
        <div class="px-6 py-3 bg-[#1a1a1a]/70 border-b border-[#252525] text-xs text-[#e6edf3] font-medium">
          {vuln.summary}
        </div>

        {/* Modal Scrollable Markdown Body */}
        <div class="px-6 py-5 overflow-y-auto flex-1 max-h-[60vh]">
          <MarkdownView content={advisoryMarkdown} />
        </div>

        {/* Modal Footer */}
        <div class="px-6 py-3.5 border-t border-[#2e2a28] bg-[#161616] flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2">
            <a
              href={vuln.advisoryUrl}
              target="_blank"
              rel="noreferrer"
              class="flex items-center gap-1.5 h-8 px-3 bg-[#1e1e1e] border border-[#3d3a39] hover:bg-[#282828] text-[#d1d5db] hover:text-[#ffffff] rounded-[6px] text-xs font-medium transition-colors"
            >
              <IconExternalLink size={13} />
              <span>Open Advisory Record ↗</span>
            </a>
            <button
              onClick={() => void copyMarkdown()}
              class="flex items-center gap-1.5 h-8 px-3 bg-[#1e1e1e] border border-[#3d3a39] hover:bg-[#282828] text-[#8b949e] hover:text-[#ffffff] rounded-[6px] text-xs font-medium transition-colors"
            >
              <IconCopy size={13} />
              <span>Copy Markdown</span>
            </button>
          </div>

          <div class="flex items-center gap-2">
            {onFixSingle && vuln.suggestedVersion && (
              <button
                onClick={() => void onFixSingle(vuln)}
                disabled={isFixing}
                class="flex items-center gap-1.5 h-8 px-4 bg-[#00d992] hover:bg-[#2fd6a1] text-[#101010] rounded-[6px] text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <IconWrench size={13} className={isFixing ? "spinner" : ""} />
                <span>
                  Upgrade {vuln.pkg} to {vuln.suggestedVersion}
                </span>
              </button>
            )}
            <button
              onClick={onClose}
              class="h-8 px-4 bg-[#202020] hover:bg-[#2a2a2a] text-[#8b949e] hover:text-[#ffffff] rounded-[6px] text-xs font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
