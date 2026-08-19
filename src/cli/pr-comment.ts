import type { Conflict, ScanResult } from "../types.js"

export const PR_COMMENT_TAG = "<!-- pkg-audit-pr-comment -->"

export interface PrCommentOptions {
  baseResult?: ScanResult
  htmlReportPath?: string
  artifactName?: string
}

function getAlignmentRate(result: ScanResult): number {
  if (result.meta.totalUniquePackages === 0) return 100
  const aligned = result.meta.totalUniquePackages - result.conflicts.length
  return Math.max(0, Math.round((aligned / result.meta.totalUniquePackages) * 100))
}

function formatConflictRow(conflict: Conflict): string {
  const versionsList = conflict.versions
    .map((v) => `\`${v.version}\` (${v.occurrences.map((o) => `*${o.workspace}*`).join(", ")})`)
    .join("<br />")

  const badge =
    conflict.severity === "major"
      ? "🔴 `major`"
      : conflict.severity === "range"
        ? "🟡 `range`"
        : "🔵 `linked`"

  return `| **\`${conflict.name}\`** | ${badge} | ${versionsList} |`
}

export function generatePrComment(result: ScanResult, opts: PrCommentOptions = {}): string {
  const alignmentRate = getAlignmentRate(result)
  const majorConflicts = result.conflicts.filter((c) => c.severity === "major")
  const rangeConflicts = result.conflicts.filter((c) => c.severity === "range")

  let statusBadge = "🟢 **Clean / Aligned**"
  if (majorConflicts.length > 0) {
    statusBadge = `🔴 **${majorConflicts.length} Major Conflict${majorConflicts.length > 1 ? "s" : ""}**`
  } else if (rangeConflicts.length > 0) {
    statusBadge = `🟡 **${rangeConflicts.length} Range Conflict${rangeConflicts.length > 1 ? "s" : ""}**`
  }

  // Calculate delta if baseResult is provided
  let deltaText = ""
  if (opts.baseResult) {
    const baseAlignment = getAlignmentRate(opts.baseResult)
    const diff = alignmentRate - baseAlignment
    if (diff > 0) {
      deltaText = ` *(+${diff}% vs base branch)*`
    } else if (diff < 0) {
      deltaText = ` *(${diff}% vs base branch)*`
    }
  }

  const lines: string[] = [
    PR_COMMENT_TAG,
    "## ⚡ `pkg-audit` Monorepo Dependency Report",
    "",
    `> **Status:** ${statusBadge} &nbsp;|&nbsp; **Alignment Score:** \`${alignmentRate}%\`${deltaText}`,
    "",
    "| Metric | Count | Details |",
    "| :--- | :--- | :--- |",
    `| 🎯 **Version Alignment** | **${alignmentRate}%** | ${result.meta.totalUniquePackages - result.conflicts.length}/${result.meta.totalUniquePackages} packages consistent |`,
    `| ⚠️ **Version Conflicts** | **${result.conflicts.length}** | ${majorConflicts.length} major, ${rangeConflicts.length} range |`,
    `| 🏢 **Workspaces** | **${result.workspaces.length}** | ${result.meta.totalDepDeclarations} total declarations |`,
    `| 🧹 **Hygiene Issues** | **${result.hygieneIssues.length}** | ${result.hygieneIssues.length === 0 ? "All manifests healthy" : `${result.hygieneIssues.length} warning(s)`} |`,
  ]

  if (result.graph && result.graph.hasCycles) {
    lines.push(
      `| 🔄 **Circular Dependencies** | **🔴 ${result.graph.cycles.length} loop(s)** | Causes build tool deadlocks |`
    )
  }

  if (result.outdated) {
    const outdatedCount = result.outdated.outdated.length
    lines.push(
      `| 📦 **Outdated Packages** | **${outdatedCount}** | ${result.outdated.all.length} registry packages checked |`
    )
  }

  lines.push("")

  // Circular Dependency Details
  if (result.graph && result.graph.hasCycles) {
    lines.push(
      "<details open>",
      `<summary><b>🚨 Circular Workspace Dependencies (${result.graph.cycles.length})</b></summary>`,
      "",
      "| # | Cycle Path | Length |",
      "| :--- | :--- | :--- |"
    )

    result.graph.cycles.forEach((c, idx) => {
      lines.push(`| ${idx + 1} | \`${c.path.join(" ➔ ")}\` | ${c.length} workspaces |`)
    })

    lines.push("</details>", "")
  }

  // Version Conflicts Details
  if (result.conflicts.length > 0) {
    lines.push(
      `<details ${majorConflicts.length > 0 ? "open" : ""}>`,
      `<summary><b>⚠️ Active Version Conflicts (${result.conflicts.length})</b></summary>`,
      "",
      "| Package | Severity | Workspace Versions |",
      "| :--- | :--- | :--- |"
    )

    for (const conflict of result.conflicts) {
      lines.push(formatConflictRow(conflict))
    }

    lines.push("</details>", "")
  }

  // Hygiene Issues Details
  if (result.hygieneIssues.length > 0) {
    lines.push(
      "<details>",
      `<summary><b>🧹 Manifest Hygiene Issues (${result.hygieneIssues.length})</b></summary>`,
      "",
      "| Category | Issue Description |",
      "| :--- | :--- |"
    )

    for (const issue of result.hygieneIssues) {
      lines.push(`| \`${issue.kind}\` | ${issue.message} |`)
    }

    lines.push("</details>", "")
  }

  // Outdated Summary
  if (result.outdated && result.outdated.outdated.length > 0) {
    lines.push(
      "<details>",
      `<summary><b>📦 Outdated Packages (${result.outdated.outdated.length})</b></summary>`,
      "",
      "| Package | Current | Latest | Drift |",
      "| :--- | :--- | :--- | :--- |"
    )

    for (const item of result.outdated.outdated.slice(0, 15)) {
      const badge =
        item.status === "major" ? "🔴 `major`" : item.status === "minor" ? "🟡 `minor`" : "🟢 `patch`"
      lines.push(`| **\`${item.name}\`** | \`${item.current}\` | \`${item.latest}\` | ${badge} |`)
    }

    if (result.outdated.outdated.length > 15) {
      lines.push(`| *...and ${result.outdated.outdated.length - 15} more* | | | |`)
    }

    lines.push("</details>", "")
  }

  // Standalone HTML report note
  if (opts.artifactName) {
    lines.push(`📄 *Standalone HTML report available in workflow artifacts: \`${opts.artifactName}\`.*`)
  }

  lines.push(
    "",
    "---",
    `<sub>Generated in ${result.scannedMs}ms by <a href="https://github.com/ihssmaheel-dev/pkg-audit">pkg-audit</a> · Run \`npx pkg-audit --ui\` locally to inspect</sub>`
  )

  return lines.join("\n")
}
