#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs, printHelp, type CliOptions } from "./args.js"
import { promptForDirectory } from "./picker.js"
import { scan } from "../scan/index.js"
import { renderTerminalReport } from "./report.js"
import { startServer } from "../server/index.js"
import { generateStandaloneHtml } from "../html/index.js"
import { addRecent, loadConfig } from "../config/index.js"
import { generatePrComment } from "./pr-comment.js"
import { postOrUpdateGitHubPrComment } from "./github-pr.js"
import type { ScanResult } from "../types.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface ConfigFile {
  ignoreDirs?: string[]
  top?: number
  outdated?: boolean
  changelog?: boolean
  changelogLines?: number
  concurrency?: number
  respectGitignore?: boolean
  color?: boolean
}

type MergedOptions = CliOptions & {
  ignoreDirs: Set<string>
}

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "..", "..", "package.json")
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string }
    return pkg.version ?? "unknown"
  } catch {
    return "unknown"
  }
}

function looksLikeProject(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "package.json")) ||
    fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
    fs.existsSync(path.join(dir, "lerna.json"))
  )
}

async function openBrowser(url: string): Promise<void> {
  const { exec } = await import("node:child_process")
  const platform = process.platform
  const cmd =
    platform === "darwin" ? `open "${url}"` : platform === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`
  try {
    exec(cmd)
  } catch {
    // Browser opening is best-effort.
  }
}

function setupWatch(dir: string): void {
  const debounce = (fn: () => void, ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    return () => {
      clearTimeout(timer)
      timer = setTimeout(fn, ms)
    }
  }

  const trigger = debounce(() => {
    console.log("  package.json changed — rescan on next request")
  }, 500)

  const watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
    if (filename && filename.includes("package.json")) trigger()
  })

  process.on("SIGINT", () => watcher.close())
  process.on("SIGTERM", () => watcher.close())
}

function exitWithCode(result: Awaited<ReturnType<typeof scan>>, failOn: string | null): void {
  if (!failOn) return
  const hasConflict = result.conflicts.some((c) => {
    if (failOn === "major") return c.severity === "major"
    if (failOn === "range") return true
    return false
  })
  if (hasConflict) process.exitCode = 2
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.version) {
    console.log(readPackageVersion())
    return
  }

  if (opts.help) {
    printHelp()
    return
  }

  const configFile: ConfigFile = await loadConfig(opts.target ?? process.cwd())

  const merged: MergedOptions = {
    ...configFile,
    ...opts,
    ignoreDirs: new Set<string>([...(configFile.ignoreDirs ?? []), ...opts.ignoreDirs]),
  }

  if (merged.ui) {
    await runUiMode(merged)
    return
  }

  const dir = path.resolve(merged.target ?? process.cwd())
  const result = await scan(dir, {
    ignoreDirs: merged.ignoreDirs,
    respectGitignore: merged.respectGitignore,
    outdated: merged.outdated,
    versions: merged.versions,
    changelog: merged.changelog,
    concurrency: merged.concurrency,
    changelogLines: merged.changelogLines,
    security: merged.security,
  })

  if (merged.security) {
    const { checkVulnerabilities, applySecurityFixes } = await import("../scan/security.js")
    let security = result.security
    if (!security) {
      process.stdout.write("  Scanning vulnerabilities via Google OSV API...")
      security = await checkVulnerabilities(result.workspaces)
      process.stdout.write("\r\x1b[K")
    }

    if (merged.securityFix) {
      if (security.vulnerabilities.length === 0) {
        console.log("\n  ✔ Zero security vulnerabilities found across monorepo dependencies.\n")
        return
      }

      if (merged.dryRun) {
        console.log("\n  ⚡ pkg-audit audit fix (dry run)\n")
        console.log(`  Security fixes to be applied (${security.vulnerabilities.length} vulnerabilities):`)
        for (const vuln of security.vulnerabilities) {
          console.log(
            `    • ${vuln.pkg}: ${vuln.version} ➔ ${vuln.suggestedVersion ?? "manual review"} [${vuln.severity}] (${vuln.id})`
          )
        }
        console.log("\n  Run without --dry-run to apply upgrades to package.json files.\n")
        return
      }

      const fixRes = await applySecurityFixes(dir, security.vulnerabilities, result.workspaces)
      console.log("\n  ⚡ pkg-audit audit fix\n")
      if (fixRes.changes.length === 0) {
        console.log("  No automatic patches available.\n")
        return
      }
      console.log(
        `  ✔ Upgraded ${fixRes.changes.length} package(s) across ${fixRes.modifiedFiles.length} workspace manifest(s):\n`
      )
      for (const ch of fixRes.changes) {
        console.log(`    • ${ch.pkg}: ${ch.from} ➔ ${ch.to} (${ch.workspace})`)
      }
      console.log(`\n  ${fixRes.modifiedFiles.length} package.json file(s) updated successfully.\n`)
      return
    }

    // Print Security Report
    console.log(`\n  🔒 Security Audit Report (Google OSV) — ${dir}\n`)
    if (security.vulnerabilities.length === 0) {
      console.log(
        `  ✔ Zero vulnerabilities found across ${security.scannedPackageCount} scanned packages. Your dependencies are secure!\n`
      )
      return
    }

    console.log(
      `  Found ${security.vulnerabilities.length} vulnerability(ies) across ${security.totalVulnerablePackages} package(s):`
    )
    console.log(
      `  Critical: ${security.criticalCount} | High: ${security.highCount} | Moderate: ${security.moderateCount} | Low: ${security.lowCount}\n`
    )

    for (const vuln of security.vulnerabilities) {
      const sevBadge =
        vuln.severity === "CRITICAL"
          ? "🔴 CRITICAL"
          : vuln.severity === "HIGH"
            ? "🟠 HIGH"
            : vuln.severity === "MODERATE"
              ? "🟡 MODERATE"
              : "⚪ LOW"
      console.log(`  ${sevBadge}  ${vuln.pkg}@${vuln.version} — ${vuln.id}`)
      console.log(`    Summary: ${vuln.summary}`)
      if (vuln.suggestedVersion) {
        console.log(`    Fix: Upgrade to ${vuln.suggestedVersion}`)
      }
      console.log(`    Advisory: ${vuln.advisoryUrl}`)
      console.log(`    Workspaces: ${vuln.workspaces.map((w) => w.workspace).join(", ")}`)
      console.log("")
    }

    console.log(`  Run 'npx pkg-audit audit fix' to automatically patch all vulnerable packages.\n`)
    if (security.criticalCount > 0 || security.highCount > 0) {
      process.exitCode = 1
    }
    return
  }

  if (merged.catalog) {
    const { generateCatalogPlan, applyCatalogPlan, readPnpmWorkspaceYaml } =
      await import("../scan/catalog.js")
    const plan = generateCatalogPlan(result, {
      strategy: merged.fixStrategy,
      allPackages: merged.catalogAll,
    })

    if (merged.catalogList) {
      const existing = readPnpmWorkspaceYaml(dir)
      console.log(`\n  📦 pnpm-workspace.yaml Catalog Inspection (${dir})\n`)
      if (Object.keys(existing.catalog).length === 0) {
        console.log("  No existing catalog entries found in pnpm-workspace.yaml.")
      } else {
        console.log(`  Current catalog (${Object.keys(existing.catalog).length} packages):`)
        for (const [pkg, ver] of Object.entries(existing.catalog).sort()) {
          console.log(`    • ${pkg}: ${ver}`)
        }
      }

      if (plan.catalogEntries.length > 0) {
        console.log(`\n  Proposed additions / sync (${plan.catalogEntries.length} packages):`)
        for (const entry of plan.catalogEntries) {
          console.log(
            `    + ${entry.name}: ${entry.targetVersion} (used across ${entry.workspacesCount} workspaces)`
          )
        }
        console.log(`\n  Run 'npx pkg-audit catalog init' to migrate workspaces to catalog:\n`)
      } else {
        console.log("\n  All shared dependencies are already centralized in catalog.\n")
      }
      return
    }

    if (plan.catalogEntries.length === 0) {
      console.log("\n  ✔ All shared dependencies are already centralized in pnpm-workspace.yaml catalog:!\n")
      return
    }

    if (merged.dryRun) {
      console.log(`\n  ⚡ pkg-audit catalog init (dry run — strategy: ${merged.fixStrategy})\n`)
      console.log(`  Catalog entries to be created in ${path.basename(plan.pnpmWorkspaceYamlPath)}:`)
      for (const e of plan.catalogEntries) {
        console.log(`    + ${e.name}: ${e.targetVersion} (${e.workspacesCount} workspaces)`)
      }
      console.log(`\n  Affected workspace package.json files (${plan.totalWorkspacesUpdated}):`)
      for (const ws of plan.updatedWorkspaceFiles) {
        console.log(`    • ${ws}/package.json ➔ updated to "catalog:"`)
      }
      console.log(`\n  Run without --dry-run to apply migration to disk.\n`)
      return
    }

    const catalogRes = await applyCatalogPlan(dir, plan, result)
    console.log(`\n  ⚡ pkg-audit catalog init (strategy: ${merged.fixStrategy})\n`)
    if (!catalogRes.ok && catalogRes.errors.length > 0) {
      console.log(`  ⚠ Migration encountered errors:`)
      for (const err of catalogRes.errors) {
        console.log(`    • ${err.path}: ${err.error}`)
      }
    }

    console.log(
      `  ✔ Centralized ${plan.totalPackages} package(s) into ${path.basename(plan.pnpmWorkspaceYamlPath)}:`
    )
    for (const e of plan.catalogEntries) {
      console.log(`    • ${e.name}: ${e.targetVersion}`)
    }

    console.log(`\n  ✔ Updated ${catalogRes.modifiedFiles.length} file(s) across monorepo to "catalog:".\n`)
    return
  }

  if (merged.fix) {
    const { resolveConflictsAuto, applyFixes, pickTargetVersion } = await import("../scan/fix.js")

    if (result.conflicts.length === 0) {
      console.log("\n  ✔ No version conflicts found across monorepo workspaces. Everything is aligned!\n")
      return
    }

    let fixes = resolveConflictsAuto(result, merged.fixStrategy).fixes

    if (merged.fixPkg) {
      const match = result.conflicts.find((c) => c.name === merged.fixPkg)
      if (!match) {
        console.log(`\n  Notice: Package '${merged.fixPkg}' has no version conflicts across workspaces.\n`)
        return
      }
      const targetVersion = merged.fixTargetVersion || pickTargetVersion(match, merged.fixStrategy)
      fixes = [{ name: merged.fixPkg, targetVersion }]
    }

    if (merged.dryRun) {
      console.log(`\n  ⚡ pkg-audit fix (dry run — strategy: ${merged.fixStrategy})\n`)
      console.log(`  Target fixes to be applied:`)
      for (const f of fixes) {
        console.log(`    • ${f.name} → ${f.targetVersion}`)
      }
      console.log(`\n  Run without --dry-run to apply changes to package.json files.\n`)
      return
    }

    const fixResult = await applyFixes(dir, fixes, result)

    console.log(`\n  ⚡ pkg-audit fix (strategy: ${merged.fixStrategy})\n`)
    if (fixResult.changes.length === 0) {
      console.log("  No modifications were needed.\n")
      return
    }

    console.log(
      `  ✔ Aligned ${fixes.length} package(s) across ${fixResult.modifiedFiles.length} workspace manifest(s):\n`
    )
    for (const ch of fixResult.changes) {
      console.log(`    • ${ch.pkg}: ${ch.from} → ${ch.to} (${ch.workspace})`)
    }

    console.log(`\n  ${fixResult.modifiedFiles.length} package.json file(s) updated successfully.\n`)
    return
  }

  if (merged.removeUnused) {
    const { removeUnusedDependencies } = await import("../scan/fix.js")
    if (!result.unused || result.unused.unused.length === 0) {
      console.log("\n  ✔ No unused dependencies found across monorepo workspaces.\n")
      return
    }

    const unusedItems = result.unused.unused.map((u) => ({
      workspace: u.workspace,
      pkg: u.name,
      type: u.type,
    }))

    if (merged.dryRun) {
      console.log(`\n  ⚡ pkg-audit remove-unused (dry run)\n`)
      for (const item of unusedItems) {
        console.log(`    • Remove '${item.pkg}' from ${item.workspace}`)
      }
      console.log(`\n  Run without --dry-run to apply changes.\n`)
      return
    }

    const fixResult = await removeUnusedDependencies(dir, unusedItems, result)
    console.log(`\n  ⚡ pkg-audit remove-unused\n`)
    console.log(
      `  ✔ Removed ${fixResult.changes.length} unused package(s) across ${fixResult.modifiedFiles.length} workspace manifest(s):\n`
    )
    for (const ch of fixResult.changes) {
      console.log(`    • ${ch.pkg} (${ch.workspace})`)
    }
    console.log(`\n  ${fixResult.modifiedFiles.length} package.json file(s) updated successfully.\n`)
    return
  }

  if (merged.declarePhantoms) {
    const { declarePhantomDependencies } = await import("../scan/fix.js")
    if (!result.unused || result.unused.phantoms.length === 0) {
      console.log("\n  ✔ No phantom dependencies found across monorepo workspaces.\n")
      return
    }

    const phantomItems = result.unused.phantoms.map((p) => ({
      workspace: p.workspace,
      pkg: p.name,
      version: p.suggestedVersion || "^latest",
      type: "prod" as const,
    }))

    if (merged.dryRun) {
      console.log(`\n  ⚡ pkg-audit declare-phantoms (dry run)\n`)
      for (const item of phantomItems) {
        console.log(`    • Declare '${item.pkg}@${item.version}' in ${item.workspace}`)
      }
      console.log(`\n  Run without --dry-run to apply changes.\n`)
      return
    }

    const fixResult = await declarePhantomDependencies(dir, phantomItems, result)
    console.log(`\n  ⚡ pkg-audit declare-phantoms\n`)
    console.log(
      `  ✔ Declared ${fixResult.changes.length} phantom package(s) across ${fixResult.modifiedFiles.length} workspace manifest(s):\n`
    )
    for (const ch of fixResult.changes) {
      console.log(`    • ${ch.pkg}@${ch.to} (${ch.workspace})`)
    }
    console.log(`\n  ${fixResult.modifiedFiles.length} package.json file(s) updated successfully.\n`)
    return
  }

  if (merged.json) {
    const json = JSON.stringify(result, null, 2)
    if (merged.jsonFile) {
      fs.writeFileSync(merged.jsonFile, json, "utf8")
      console.log(`Wrote JSON to ${merged.jsonFile}`)
    } else {
      console.log(json)
    }
    exitWithCode(result, merged.failOn)
    return
  }

  if (merged.html) {
    const html = generateStandaloneHtml(result)
    const outPath = merged.htmlFile ?? path.join(dir, "pkg-audit-report.html")
    fs.writeFileSync(outPath, html, "utf8")
    console.log(`Wrote HTML report to ${outPath}`)
    exitWithCode(result, merged.failOn)
    return
  }

  if (merged.prComment || merged.postPrComment) {
    let baseResult: ScanResult | undefined
    if (merged.baseJson && fs.existsSync(merged.baseJson)) {
      try {
        baseResult = JSON.parse(fs.readFileSync(merged.baseJson, "utf8")) as ScanResult
      } catch {
        // Ignore read/parse error
      }
    }

    const comment = generatePrComment(result, {
      baseResult,
      artifactName: merged.htmlFile ? path.basename(merged.htmlFile) : undefined,
    })

    if (merged.prCommentFile) {
      fs.writeFileSync(merged.prCommentFile, comment, "utf8")
      console.log(`Wrote PR comment to ${merged.prCommentFile}`)
    }

    if (merged.postPrComment) {
      await postOrUpdateGitHubPrComment(comment)
    }

    if (!merged.prCommentFile && !merged.postPrComment) {
      process.stdout.write(comment + "\n")
    }

    exitWithCode(result, merged.failOn)
    return
  }

  process.stdout.write(renderTerminalReport(result, merged) + "\n")
  exitWithCode(result, merged.failOn)
}

async function runUiMode(merged: MergedOptions): Promise<void> {
  let dir: string | null = merged.target ? path.resolve(merged.target) : process.cwd()

  if (!merged.target && !looksLikeProject(dir)) {
    dir = await promptForDirectory(dir)
  }

  if (dir) addRecent(dir)

  const { server, port, url } = await startServer(dir, { port: merged.port })

  console.log("")
  console.log("  pkg-audit dashboard")
  console.log(`  Scanning: ${dir ?? "(pick a folder in the dashboard)"}`)
  console.log(`  Server:   http://127.0.0.1:${port}`)
  console.log("")
  console.log(`  Open: ${url}`)
  console.log("  Press Ctrl+C to stop.")
  console.log("")

  if (!merged.noOpen && url) {
    await openBrowser(url)
  }

  if (merged.watch && dir) {
    setupWatch(dir)
  }

  process.on("SIGINT", () => {
    server.close()
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    server.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
