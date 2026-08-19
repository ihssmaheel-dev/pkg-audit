import { buildDependencyMap } from "../scan/conflicts.js"
import type { CliOptions } from "./args.js"
import type { Conflict, ScanResult, Workspace } from "../types.js"

type Colorizer = {
  dim: (s: string) => string
  bold: (s: string) => string
  blue: (s: string) => string
  green: (s: string) => string
  yellow: (s: string) => string
  red: (s: string) => string
  cyan: (s: string) => string
}

function makeColorizer(enabled: boolean): Colorizer {
  const wrap = (code: string) => (s: string) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s)
  return {
    dim: wrap("2"),
    bold: wrap("1"),
    blue: wrap("34"),
    green: wrap("32"),
    yellow: wrap("33"),
    red: wrap("31"),
    cyan: wrap("36"),
  }
}

function renderWorkspaceList(workspaces: Workspace[], c: Colorizer, out: string[]): void {
  out.push(c.bold(`Workspaces (${workspaces.length}):`))
  const nameW = Math.max(...workspaces.map((w) => w.relPath.length), 9)
  for (const ws of workspaces) {
    const tag = ws.isRoot ? c.dim(" (root)") : ws.private ? c.dim(" (private)") : ""
    const namePad = ws.name.length < 28 ? " ".repeat(28 - ws.name.length) : " "
    out.push(
      `  ${ws.relPath.padEnd(nameW)}  ${c.cyan(ws.name)}${namePad}` +
        `v${ws.version}  ${String(ws.depCount - ws.devCount).padStart(3)} deps / ${String(ws.devCount).padStart(3)} dev${tag}`
    )
  }
  out.push("")
}

function renderConflicts(conflicts: Conflict[], c: Colorizer, out: string[]): void {
  if (!conflicts.length) {
    out.push(c.green("No version conflicts — every shared dependency is aligned. OK"))
    out.push("")
    return
  }

  out.push(c.bold(`Version conflicts (${conflicts.length}):`))
  for (const conflict of conflicts) {
    const marker = conflict.severity === "major" ? c.red("!") : c.yellow("!")
    const tag = conflict.severity === "major" ? c.red("major version differs") : c.yellow("range differs")
    out.push(`  ${marker} ${c.bold(conflict.name)}  ${c.dim(`(${tag})`)}`)
    const wsW = Math.max(...conflict.versions.flatMap((v) => v.occurrences.map((o) => o.workspace.length)))
    for (const { version, occurrences } of conflict.versions) {
      for (const occ of occurrences) {
        out.push(`      ${occ.workspace.padEnd(wsW)}  ${version}  ${c.dim(`(${occ.type})`)}`)
      }
    }
  }
  out.push("")
}

function renderTopShared(
  depMap: ReturnType<typeof buildDependencyMap>,
  top: number,
  c: Colorizer,
  out: string[]
): void {
  if (top <= 0) return
  const usage = [...depMap.entries()].map(([name, versions]) => {
    const workspaceSet = new Set<string>()
    for (const occurrences of versions.values()) {
      for (const o of occurrences) workspaceSet.add(o.workspace)
    }
    return { name, count: workspaceSet.size }
  })
  usage.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const shown = usage.slice(0, top)
  if (!shown.length) return

  out.push(c.bold(`Most shared dependencies (top ${shown.length}):`))
  const nameW = Math.max(...shown.map((s) => s.name.length))
  for (const s of shown) {
    out.push(`  ${s.name.padEnd(nameW)}  used in ${s.count} workspace${s.count === 1 ? "" : "s"}`)
  }
  out.push("")
}

function renderCycles(cycles: ScanResult["graph"]["cycles"], c: Colorizer, out: string[]): void {
  if (!cycles || !cycles.length) return
  out.push(c.bold(c.red(`Circular workspace dependencies (${cycles.length}):`)))
  out.push(c.dim(`  Warning: Circular loops deadlock build tools (Turborepo, Nx, pnpm).`))
  for (const cycle of cycles) {
    out.push(`  ${c.red("⟲")} ${cycle.path.join(c.dim(" ➔ "))}`)
  }
  out.push("")
}

function renderHygiene(issues: ScanResult["hygieneIssues"], c: Colorizer, out: string[]): void {
  if (!issues.length) {
    out.push(c.green("No hygiene issues found. OK"))
    out.push("")
    return
  }
  out.push(c.bold(`Hygiene (${issues.length}):`))
  for (const issue of issues) {
    out.push(`  ${c.yellow("!")} ${issue.message}`)
  }
  out.push("")
}

interface ChangelogBlock {
  status: string
  repo?: string
  reason?: string
  title?: string
  publishedAt?: string
  bodyLines?: string[]
  url?: string
}

function renderChangelogBlock(changelog: ChangelogBlock, c: Colorizer, out: string[]): void {
  const indent = "        "
  switch (changelog.status) {
    case "ok":
    case "approx": {
      const approxNote =
        changelog.status === "approx" ? c.dim(" (closest release found, tag didn't match exactly)") : ""
      out.push(
        `${indent}${c.cyan(changelog.title ?? "")}${approxNote}  ${c.dim(`— ${changelog.repo ?? ""}`)}`
      )
      if (changelog.publishedAt) {
        out.push(`${indent}${c.dim(new Date(changelog.publishedAt).toISOString().slice(0, 10))}`)
      }
      if (changelog.bodyLines?.length) {
        for (const line of changelog.bodyLines) {
          out.push(`${indent}${c.dim("|")} ${line}`)
        }
      } else {
        out.push(`${indent}${c.dim("(release has no notes body)")}`)
      }
      if (changelog.url) out.push(`${indent}${c.dim(changelog.url)}`)
      break
    }
    case "no-release":
      out.push(`${indent}${c.dim(`no GitHub releases found for ${changelog.repo ?? ""}`)}`)
      break
    case "no-repo":
      out.push(`${indent}${c.dim(`no changelog available — ${changelog.reason ?? ""}`)}`)
      break
    case "rate-limited":
      out.push(
        `${indent}${c.yellow("GitHub API rate limit hit — try again later or reduce --changelog scope")}`
      )
      break
    default:
      out.push(`${indent}${c.dim("(could not fetch release notes)")}`)
  }
  out.push("")
}

function renderOutdated(
  result: NonNullable<ScanResult["outdated"]>,
  c: Colorizer,
  out: string[],
  showChangelog: boolean
): void {
  if (result.networkErrors.length) {
    out.push(
      c.dim(`(${result.networkErrors.length} package(s) could not be checked — network/registry issue)`)
    )
  }
  if (!result.outdated.length) {
    out.push(c.green("Everything is up to date with the npm registry. OK"))
    out.push("")
    return
  }

  out.push(c.bold(`Outdated (${result.outdated.length}):`))
  const nameW = Math.max(...result.outdated.map((o) => o.name.length))
  for (const o of result.outdated) {
    const marker = o.status === "major" ? c.red("!") : o.status === "minor" ? c.yellow("!") : c.dim(".")
    out.push(
      `  ${marker} ${o.name.padEnd(nameW)}  ${(o.current ?? "-").padEnd(14)} -> ${c.bold(o.latest ?? "-")}  ${c.dim(`(${o.status})`)}`
    )
    if (showChangelog && o.changelog) renderChangelogBlock(o.changelog, c, out)
  }
  out.push("")
}

function renderVersionsTable(result: NonNullable<ScanResult["outdated"]>, c: Colorizer, out: string[]): void {
  if (!result.all.length) {
    out.push(c.dim("No external dependencies to check."))
    out.push("")
    return
  }

  const byName = [...result.all].sort((a, b) => a.name.localeCompare(b.name))

  out.push(c.bold(`All package versions (${byName.length}):`))
  const nameW = Math.max(...byName.map((r) => r.name.length))
  const curW = Math.max(...byName.map((r) => (r.current ?? "-").length), 7)

  for (const r of byName) {
    const current = r.current ?? "-"
    let latestCol: string
    let marker: string
    let statusLabel: string

    switch (r.status) {
      case "major":
        marker = c.red("!")
        latestCol = c.bold(r.latest ?? "-")
        statusLabel = c.red("major update available")
        break
      case "minor":
        marker = c.yellow("!")
        latestCol = c.bold(r.latest ?? "-")
        statusLabel = c.yellow("minor update available")
        break
      case "patch":
        marker = c.dim(".")
        latestCol = r.latest ?? "-"
        statusLabel = c.dim("patch update available")
        break
      case "up-to-date":
        marker = c.green("OK")
        latestCol = r.latest ?? "-"
        statusLabel = c.green("up to date")
        break
      case "not-published":
        marker = c.dim("o")
        latestCol = "-"
        statusLabel = c.dim("private / not on public npm")
        break
      case "error":
        marker = c.dim("?")
        latestCol = "-"
        statusLabel = c.dim(`check failed (${r.error ?? "unknown error"})`)
        break
      default:
        marker = c.dim("?")
        latestCol = "-"
        statusLabel = c.dim("could not determine")
    }

    out.push(
      `  ${marker} ${r.name.padEnd(nameW)}  ${current.padEnd(curW)} -> ${latestCol.padEnd(14)} ${statusLabel}`
    )
  }

  if (result.networkErrors.length) {
    out.push("")
    out.push(
      c.dim(`${result.networkErrors.length} package(s) failed to check due to network/registry issues.`)
    )
  }
  out.push("")
}

function renderWorkspaceDetail(ws: Workspace, c: Colorizer, out: string[]): void {
  out.push(c.bold(`${ws.name} @ ${ws.version}`) + c.dim(`  (${ws.relPath})`))
  const entries = Object.entries(ws.deps).sort(([a], [b]) => a.localeCompare(b))
  if (!entries.length) {
    out.push(c.dim("  no dependencies"))
    out.push("")
    return
  }
  const nameW = Math.max(...entries.map(([n]) => n.length))
  for (const [name, { version, type }] of entries) {
    out.push(`  ${name.padEnd(nameW)}  ${version.padEnd(14)} ${c.dim(`(${type})`)}`)
  }
  out.push("")
}

function renderFullMatrix(workspaces: Workspace[], c: Colorizer, out: string[]): void {
  out.push(c.bold("Full dependency matrix:"))
  out.push("")
  for (const ws of workspaces) {
    renderWorkspaceDetail(ws, c, out)
  }
}

export function renderTerminalReport(result: ScanResult, opts: CliOptions): string {
  const c = makeColorizer(opts.color)
  const out: string[] = []
  const workspaces = result.workspaces

  out.push(c.bold("pkg-audit — Monorepo Package Audit") + c.dim(`  —  ${result.root}`))
  out.push(c.dim(`Found ${workspaces.length} package.json file${workspaces.length === 1 ? "" : "s"}`))
  if (result.meta.skippedGitignored) {
    out.push(c.dim(`(${result.meta.skippedGitignored} additional path(s) skipped via .gitignore)`))
  }
  out.push("")

  if (opts.workspace) {
    const match = workspaces.find((w) => w.name === opts.workspace || w.relPath === opts.workspace)
    if (!match) {
      return `No workspace matching "${opts.workspace}" found.\nAvailable: ${workspaces.map((w) => w.name).join(", ")}`
    }
    renderWorkspaceDetail(match, c, out)
    return out.join("\n")
  }

  if (opts.full) {
    renderFullMatrix(workspaces, c, out)
  } else if (!opts.onlyConflicts) {
    renderWorkspaceList(workspaces, c, out)
  }

  renderConflicts(result.conflicts, c, out)
  if (result.graph) {
    renderCycles(result.graph.cycles, c, out)
  }
  renderHygiene(result.hygieneIssues, c, out)

  if (result.outdated) {
    if (opts.versions) {
      renderVersionsTable(result.outdated, c, out)
    } else {
      renderOutdated(result.outdated, c, out, opts.changelog)
    }
  }

  const depMap = buildDependencyMap(workspaces)
  renderTopShared(depMap, opts.top, c, out)

  const majorCount = result.conflicts.filter((x) => x.severity === "major").length
  const rangeCount = result.conflicts.length - majorCount

  out.push(c.bold("Summary:"))
  out.push(
    `  ${workspaces.length} package.json file${workspaces.length === 1 ? "" : "s"} scanned` +
      ` (${workspaces.filter((w) => !w.isRoot).length} workspaces${workspaces.some((w) => w.isRoot) ? ", 1 root manifest" : ""})`
  )
  out.push(
    `  ${result.meta.totalDepDeclarations.toLocaleString()} total dependency declarations, ${result.meta.totalUniquePackages.toLocaleString()} unique packages`
  )
  if (result.conflicts.length) {
    out.push(
      `  ${result.conflicts.length} version conflict${result.conflicts.length === 1 ? "" : "s"} ${c.dim(`(${majorCount} major, ${rangeCount} range)`)}`
    )
  } else {
    out.push(`  ${c.green("0 version conflicts")}`)
  }
  if (result.graph && result.graph.hasCycles) {
    out.push(`  ${c.red(`${result.graph.cycles.length} circular dependency cycle(s) detected`)}`)
  }
  out.push(
    `  ${result.hygieneIssues.length ? result.hygieneIssues.length + " hygiene issue" + (result.hygieneIssues.length === 1 ? "" : "s") : c.green("0 hygiene issues")}`
  )
  if (result.outdated) {
    const majorOutdated = result.outdated.outdated.filter((o) => o.status === "major").length
    out.push(
      `  ${result.outdated.outdated.length} outdated ${c.dim(`(${majorOutdated} major)`)}, ` +
        `${result.outdated.unpublished.length} not on public npm, ${result.outdated.networkErrors.length} check failures`
    )
  }
  if (result.errors.length) {
    out.push(`  ${c.red(String(result.errors.length))} file(s) could not be read/parsed:`)
    for (const e of result.errors.slice(0, 10)) {
      out.push(`    ${c.dim(e.path)} — ${e.error}`)
    }
  }
  out.push(`  ${c.dim(`done in ${result.scannedMs}ms`)}`)

  return out.join("\n")
}
