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
  })

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
