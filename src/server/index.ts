import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import { scan } from "../scan/index.js"
import { addRecent, getFavorites, getRecents, toggleFavorite } from "../config/index.js"
import { pickFolder } from "../pick-folder/index.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DASHBOARD_DIR = path.join(__dirname, "..", "..", "dist", "ui")

interface ServerOptions {
  port?: number
}

interface ServerHandle {
  server: http.Server
  port: number
  url: string
  token: string
  dir: string | null
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (c: Buffer) => chunks.push(c))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  })
  res.end(body)
}

function validatePath(dirPath: string): { valid: boolean; path?: string; error?: string } {
  if (!dirPath || typeof dirPath !== "string") {
    return { valid: false, error: "No path provided" }
  }
  const resolved = path.resolve(dirPath)
  try {
    const stat = fs.statSync(resolved)
    if (!stat.isDirectory()) return { valid: false, error: "Not a directory" }
    if (resolved === path.parse(resolved).root) {
      return { valid: false, error: "Refusing to scan a drive root" }
    }
    return { valid: true, path: resolved }
  } catch {
    return { valid: false, error: "Path does not exist" }
  }
}

function serveDashboard(res: http.ServerResponse, token: string): void {
  const dashboardPath = path.join(DASHBOARD_DIR, "index.html")
  try {
    let html = fs.readFileSync(dashboardPath, "utf8")
    html = html.replace("</head>", `<meta name="pkg-audit-token" content="${token}"></head>`)
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(html)
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain" })
    res.end("Dashboard not built. Run: npm run build")
  }
}

function serveStatic(res: http.ServerResponse, filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath)
    if (stat.isFile()) {
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
      }
      const mime = mimeTypes[ext] ?? "application/octet-stream"
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" })
      fs.createReadStream(filePath).pipe(res)
      return true
    }
  } catch {
    // Not found — falls through.
  }
  return false
}

export async function startServer(dir: string | null, opts: ServerOptions = {}): Promise<ServerHandle> {
  const token = crypto.randomBytes(16).toString("hex")
  const port = opts.port ?? 0
  let resolvedDir: string | null = dir ? path.resolve(dir) : null

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    const hasToken = url.searchParams.get("token") === token

    if (url.pathname.startsWith("/api/")) {
      if (!hasToken && url.pathname !== "/api/health") {
        json(res, { error: "Unauthorized" }, 401)
        return
      }
    } else if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      })
      res.end()
      return
    }

    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      })
      res.end()
      return
    }

    try {
      if (url.pathname === "/api/health") {
        json(res, { ok: true })
        return
      }

      if (url.pathname === "/api/scan" && req.method === "GET") {
        const scanDir = url.searchParams.get("dir") ?? resolvedDir
        if (!scanDir) {
          json(res, { error: "No directory selected", code: "NO_DIR" }, 400)
          return
        }
        const validation = validatePath(scanDir)
        if (!validation.valid) {
          json(res, { error: validation.error }, 400)
          return
        }
        resolvedDir = validation.path!
        addRecent(resolvedDir)
        const result = await scan(resolvedDir, {
          outdated: url.searchParams.get("outdated") === "true",
          versions: url.searchParams.get("versions") === "true",
          changelog: url.searchParams.get("changelog") === "true",
          security: url.searchParams.get("security") === "true",
          concurrency: Number(url.searchParams.get("concurrency")) || 8,
          changelogLines: Number(url.searchParams.get("changelogLines")) || 6,
        })
        json(res, result)
        return
      }

      if (url.pathname === "/api/scan" && req.method === "POST") {
        const body = JSON.parse(await readBody(req)) as {
          dir?: string
          outdated?: boolean
          changelog?: boolean
          security?: boolean
          concurrency?: number
          changelogLines?: number
        }
        const targetDir = body.dir ?? resolvedDir
        if (!targetDir) {
          json(res, { error: "No directory selected", code: "NO_DIR" }, 400)
          return
        }
        const validation = validatePath(targetDir)
        if (!validation.valid) {
          json(res, { error: validation.error }, 400)
          return
        }
        resolvedDir = validation.path!
        addRecent(resolvedDir)
        const result = await scan(resolvedDir, {
          outdated: Boolean(body.outdated),
          changelog: Boolean(body.changelog),
          security: Boolean(body.security),
          concurrency: body.concurrency ?? 8,
          changelogLines: body.changelogLines ?? 6,
        })
        json(res, result)
        return
      }

      if (url.pathname === "/api/pick-folder" && req.method === "POST") {
        const folder = await pickFolder()
        json(res, { path: folder })
        return
      }

      if (url.pathname === "/api/license/export" && req.method === "GET") {
        const targetDir = url.searchParams.get("dir") ?? resolvedDir
        if (!targetDir) {
          json(res, { error: "No directory selected", code: "NO_DIR" }, 400)
          return
        }
        const validation = validatePath(targetDir)
        if (!validation.valid) {
          json(res, { error: validation.error }, 400)
          return
        }
        const scanResult = await scan(validation.path!, {})
        const { scanMonorepoLicenses, generateNoticeText, generateSpdxJson, generateCsvReport } =
          await import("../scan/license.js")
        const licenseResult =
          scanResult.licenses ?? scanMonorepoLicenses(scanResult.workspaces, validation.path!)
        const fmt = url.searchParams.get("format") ?? "notice"
        if (fmt === "spdx") {
          const text = generateSpdxJson(licenseResult, path.basename(validation.path!))
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Disposition": 'attachment; filename="spdx-sbom.json"',
          })
          res.end(text)
          return
        }
        if (fmt === "csv") {
          const text = generateCsvReport(licenseResult)
          res.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="licenses-report.csv"',
          })
          res.end(text)
          return
        }
        const text = generateNoticeText(licenseResult, path.basename(validation.path!))
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": 'attachment; filename="NOTICE.txt"',
        })
        res.end(text)
        return
      }

      if (url.pathname === "/api/recents") {
        if (req.method === "GET") {
          json(res, { recents: getRecents(), favorites: getFavorites() })
          return
        }
        if (req.method === "POST") {
          const body = JSON.parse(await readBody(req)) as { dir?: string }
          if (body.dir) addRecent(body.dir)
          json(res, { recents: getRecents(), favorites: getFavorites() })
          return
        }
      }

      if (url.pathname === "/api/recents/pin" && req.method === "POST") {
        const body = JSON.parse(await readBody(req)) as { dir?: string }
        if (!body.dir) {
          json(res, { error: "No dir provided" }, 400)
          return
        }
        json(res, { favorites: toggleFavorite(body.dir) })
        return
      }

      if (url.pathname === "/api/fix" && req.method === "POST") {
        const body = JSON.parse(await readBody(req)) as {
          dir?: string
          action?:
            | "align"
            | "remove-unused"
            | "declare-phantom"
            | "catalog-migrate"
            | "security-fix"
            | "dedupe-apply"
          fixes?: Array<{ name: string; targetVersion: string; workspaces?: string[] }>
          unused?: Array<{ workspace: string; pkg: string; type?: string }>
          phantoms?: Array<{ workspace: string; pkg: string; version: string; type?: "prod" | "dev" }>
          catalogStrategy?: "highest" | "most-frequent"
          catalogAll?: boolean
          overrides?: Record<string, string>
          dedupeStrategy?: "highest" | "most-frequent"
        }
        const targetDir = body.dir ?? resolvedDir
        if (!targetDir) {
          json(res, { error: "No directory selected", code: "NO_DIR" }, 400)
          return
        }

        const { applyFixes, removeUnusedDependencies, declarePhantomDependencies } =
          await import("../scan/fix.js")

        let fixResult: {
          ok: boolean
          modifiedFiles: string[]
          changes: Array<{
            workspace: string
            filePath: string
            pkg: string
            from: string
            to: string
            depType: string
          }>
          errors: Array<{ path: string; error: string }>
        }

        if (body.action === "remove-unused") {
          if (!body.unused || !Array.isArray(body.unused) || body.unused.length === 0) {
            json(res, { error: "No unused dependencies provided" }, 400)
            return
          }
          fixResult = await removeUnusedDependencies(targetDir, body.unused)
        } else if (body.action === "declare-phantom") {
          if (!body.phantoms || !Array.isArray(body.phantoms) || body.phantoms.length === 0) {
            json(res, { error: "No phantom dependencies provided" }, 400)
            return
          }
          fixResult = await declarePhantomDependencies(targetDir, body.phantoms)
        } else if (body.action === "security-fix") {
          const { applySecurityFixes } = await import("../scan/security.js")
          const currentScan = await scan(targetDir, { security: true })
          const vulns = currentScan.security?.vulnerabilities ?? []
          fixResult = await applySecurityFixes(targetDir, vulns, currentScan.workspaces)
          const updatedScan = await scan(targetDir, { security: true })
          json(res, {
            ok: fixResult.ok,
            changes: fixResult.changes,
            modifiedFiles: fixResult.modifiedFiles,
            errors: fixResult.errors,
            result: updatedScan,
          })
          return
        } else if (body.action === "catalog-migrate") {
          const { applyCatalogPlan, generateCatalogPlan } = await import("../scan/catalog.js")
          const currentScan = await scan(targetDir, {})
          const plan = generateCatalogPlan(currentScan, {
            strategy:
              (body as { catalogStrategy?: "highest" | "most-frequent" }).catalogStrategy ?? "highest",
            allPackages: (body as { catalogAll?: boolean }).catalogAll ?? false,
          })
          const catalogRes = await applyCatalogPlan(targetDir, plan, currentScan)
          const updatedScan = await scan(targetDir, {})
          json(res, {
            ok: catalogRes.ok,
            changes: plan.catalogEntries.map((e) => ({
              workspace: e.workspaces.join(", "),
              filePath: plan.pnpmWorkspaceYamlPath,
              pkg: e.name,
              from: Object.values(e.previousVersions).join(", "),
              to: "catalog:",
              depType: "catalog",
            })),
            modifiedFiles: catalogRes.modifiedFiles,
            catalogCount: catalogRes.catalogCount,
            errors: catalogRes.errors,
            result: updatedScan,
          })
          return
        } else if (body.action === "dedupe-apply") {
          const { applyDedupeOverrides, analyzeLockfile, generateOverridesDict } =
            await import("../scan/dedupe.js")
          const currentScan = await scan(targetDir, {})
          const rootWs = currentScan.workspaces.find((w) => w.isRoot)
          const dedupeResult =
            currentScan.dedupe ?? analyzeLockfile(targetDir, rootWs?.packageManager ?? null)
          if (!dedupeResult || dedupeResult.duplicates.length === 0) {
            json(res, { error: "No lockfile duplicates found to dedupe" }, 400)
            return
          }
          const overrides =
            body.overrides ?? generateOverridesDict(dedupeResult.duplicates, body.dedupeStrategy ?? "highest")
          fixResult = applyDedupeOverrides(targetDir, overrides, dedupeResult.packageManager)
          const updatedScan = await scan(targetDir, {})
          json(res, {
            ok: fixResult.ok,
            changes: fixResult.changes,
            modifiedFiles: fixResult.modifiedFiles,
            errors: fixResult.errors,
            result: updatedScan,
          })
          return
        } else {
          if (!body.fixes || !Array.isArray(body.fixes) || body.fixes.length === 0) {
            json(res, { error: "No fixes provided" }, 400)
            return
          }
          fixResult = await applyFixes(targetDir, body.fixes)
        }

        const updatedScan = await scan(targetDir, {})
        json(res, {
          ok: fixResult.ok,
          changes: fixResult.changes,
          modifiedFiles: fixResult.modifiedFiles,
          errors: fixResult.errors,
          result: updatedScan,
        })
        return
      }

      if (url.pathname === "/api/export.html" && req.method === "GET") {
        if (!resolvedDir) {
          json(res, { error: "No scan result available" }, 400)
          return
        }
        const result = await scan(resolvedDir, {})
        const { generateStandaloneHtml } = await import("../html/index.js")
        const html = generateStandaloneHtml(result)
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        res.end(html)
        return
      }

      if (url.pathname.startsWith("/assets/")) {
        const assetPath = path.join(DASHBOARD_DIR, url.pathname)
        if (serveStatic(res, assetPath)) return
      }

      serveDashboard(res, token)
    } catch (err) {
      json(res, { error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address()
      const actualPort = typeof address === "object" && address !== null ? address.port : port
      const url = `http://127.0.0.1:${actualPort}/?token=${token}`
      resolve({ server, port: actualPort, url, token, dir: resolvedDir })
    })
  })
}
