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

function getAllowedOrigin(req: http.IncomingMessage, port: number): string {
  const origin = req.headers.origin
  if (origin) {
    if (
      origin === `http://127.0.0.1:${port}` ||
      origin === `http://localhost:${port}` ||
      origin === "http://127.0.0.1" ||
      origin === "http://localhost"
    ) {
      return origin
    }
  }
  return `http://127.0.0.1:${port}`
}

function json(
  res: http.ServerResponse,
  data: unknown,
  status = 200,
  allowedOrigin = "http://127.0.0.1"
): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-pkg-audit-token",
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
  let defaultDir: string | null = dir ? path.resolve(dir) : null

  let actualPort = port

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    const allowedOrigin = getAllowedOrigin(req, actualPort)

    // Verify token from query parameter, Authorization header, or x-pkg-audit-token header
    const authHeader = req.headers["authorization"]
    const customHeader = req.headers["x-pkg-audit-token"]
    const hasToken =
      url.searchParams.get("token") === token || customHeader === token || authHeader === `Bearer ${token}`

    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-pkg-audit-token",
      })
      res.end()
      return
    }

    if (url.pathname.startsWith("/api/")) {
      if (!hasToken && url.pathname !== "/api/health") {
        json(res, { error: "Unauthorized" }, 401, allowedOrigin)
        return
      }
    }

    try {
      if (url.pathname === "/api/health") {
        json(res, { ok: true }, 200, allowedOrigin)
        return
      }

      if (url.pathname === "/api/scan" && req.method === "GET") {
        const scanDir = url.searchParams.get("dir") ?? defaultDir
        if (!scanDir) {
          json(res, { error: "No directory selected", code: "NO_DIR" }, 400, allowedOrigin)
          return
        }
        const validation = validatePath(scanDir)
        if (!validation.valid || !validation.path) {
          json(res, { error: validation.error }, 400, allowedOrigin)
          return
        }
        defaultDir = validation.path
        addRecent(defaultDir)
        const result = await scan(validation.path, {
          outdated: url.searchParams.get("outdated") === "true",
          versions: url.searchParams.get("versions") === "true",
          changelog: url.searchParams.get("changelog") === "true",
          security: url.searchParams.get("security") === "true",
          deprecation: url.searchParams.get("deprecation") !== "false",
          concurrency: Number(url.searchParams.get("concurrency")) || 8,
          changelogLines: Number(url.searchParams.get("changelogLines")) || 6,
        })
        json(res, result, 200, allowedOrigin)
        return
      }

      if (url.pathname === "/api/scan" && req.method === "POST") {
        let body: Record<string, unknown>
        try {
          body = JSON.parse(await readBody(req)) as Record<string, unknown>
        } catch {
          json(res, { error: "Invalid JSON body" }, 400, allowedOrigin)
          return
        }

        const targetDir = typeof body.dir === "string" ? body.dir : defaultDir
        if (!targetDir) {
          json(res, { error: "No directory selected", code: "NO_DIR" }, 400, allowedOrigin)
          return
        }
        const validation = validatePath(targetDir)
        if (!validation.valid || !validation.path) {
          json(res, { error: validation.error }, 400, allowedOrigin)
          return
        }
        defaultDir = validation.path
        addRecent(defaultDir)
        const result = await scan(validation.path, {
          outdated: Boolean(body.outdated),
          changelog: Boolean(body.changelog),
          security: Boolean(body.security),
          deprecation: body.deprecation !== false,
          concurrency: typeof body.concurrency === "number" ? body.concurrency : 8,
          changelogLines: typeof body.changelogLines === "number" ? body.changelogLines : 6,
        })
        json(res, result, 200, allowedOrigin)
        return
      }

      if (url.pathname === "/api/pick-folder" && req.method === "POST") {
        const folder = await pickFolder()
        json(res, { path: folder }, 200, allowedOrigin)
        return
      }

      if (url.pathname === "/api/license/export" && req.method === "GET") {
        const targetDir = url.searchParams.get("dir") ?? defaultDir
        if (!targetDir) {
          json(res, { error: "No directory selected", code: "NO_DIR" }, 400, allowedOrigin)
          return
        }
        const validation = validatePath(targetDir)
        if (!validation.valid || !validation.path) {
          json(res, { error: validation.error }, 400, allowedOrigin)
          return
        }
        const scanResult = await scan(validation.path, {})
        const { scanMonorepoLicenses, generateNoticeText, generateSpdxJson, generateCsvReport } =
          await import("../scan/license.js")
        const licenseResult =
          scanResult.licenses ?? scanMonorepoLicenses(scanResult.workspaces, validation.path)
        const fmt = url.searchParams.get("format") ?? "notice"
        if (fmt === "spdx") {
          const text = generateSpdxJson(licenseResult, path.basename(validation.path))
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": allowedOrigin,
            "Content-Disposition": 'attachment; filename="spdx-sbom.json"',
          })
          res.end(text)
          return
        }
        if (fmt === "csv") {
          const text = generateCsvReport(licenseResult)
          res.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Access-Control-Allow-Origin": allowedOrigin,
            "Content-Disposition": 'attachment; filename="licenses-report.csv"',
          })
          res.end(text)
          return
        }
        const text = generateNoticeText(licenseResult, path.basename(validation.path))
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": allowedOrigin,
          "Content-Disposition": 'attachment; filename="NOTICE.txt"',
        })
        res.end(text)
        return
      }

      if (url.pathname === "/api/context" && req.method === "GET") {
        const targetDir = url.searchParams.get("dir") ?? defaultDir
        if (!targetDir) {
          json(res, { error: "No directory selected", code: "NO_DIR" }, 400, allowedOrigin)
          return
        }
        const validation = validatePath(targetDir)
        if (!validation.valid || !validation.path) {
          json(res, { error: validation.error }, 400, allowedOrigin)
          return
        }
        const scanResult = await scan(validation.path, {})
        const { generateMonorepoContext } = await import("../scan/context.js")
        const fmt = (url.searchParams.get("format") as "markdown" | "json" | "xml") ?? "markdown"
        const target = (url.searchParams.get("target") as "generic" | "cursor" | "claude") ?? "generic"
        const text = generateMonorepoContext(scanResult, {
          format: fmt,
          target,
          projectName: path.basename(validation.path),
        })

        if (fmt === "json") {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": allowedOrigin,
          })
        } else if (fmt === "xml") {
          res.writeHead(200, {
            "Content-Type": "application/xml",
            "Access-Control-Allow-Origin": allowedOrigin,
          })
        } else {
          res.writeHead(200, {
            "Content-Type": "text/markdown; charset=utf-8",
            "Access-Control-Allow-Origin": allowedOrigin,
          })
        }
        res.end(text)
        return
      }

      if (url.pathname === "/api/recents") {
        if (req.method === "GET") {
          json(res, { recents: getRecents(), favorites: getFavorites() }, 200, allowedOrigin)
          return
        }
        if (req.method === "POST") {
          let body: Record<string, unknown>
          try {
            body = JSON.parse(await readBody(req)) as Record<string, unknown>
          } catch {
            json(res, { error: "Invalid JSON body" }, 400, allowedOrigin)
            return
          }
          if (typeof body.dir === "string" && body.dir.trim()) addRecent(body.dir.trim())
          json(res, { recents: getRecents(), favorites: getFavorites() }, 200, allowedOrigin)
          return
        }
      }

      if (url.pathname === "/api/recents/pin" && req.method === "POST") {
        let body: Record<string, unknown>
        try {
          body = JSON.parse(await readBody(req)) as Record<string, unknown>
        } catch {
          json(res, { error: "Invalid JSON body" }, 400, allowedOrigin)
          return
        }
        if (!body.dir || typeof body.dir !== "string") {
          json(res, { error: "No dir provided" }, 400, allowedOrigin)
          return
        }
        json(res, { favorites: toggleFavorite(body.dir) }, 200, allowedOrigin)
        return
      }

      if (url.pathname === "/api/fix" && req.method === "POST") {
        let rawBody: Record<string, unknown>
        try {
          rawBody = JSON.parse(await readBody(req)) as Record<string, unknown>
        } catch {
          json(res, { error: "Invalid JSON body" }, 400, allowedOrigin)
          return
        }

        const targetDir = typeof rawBody.dir === "string" ? rawBody.dir : defaultDir
        if (!targetDir) {
          json(res, { error: "No directory selected", code: "NO_DIR" }, 400, allowedOrigin)
          return
        }

        const validation = validatePath(targetDir)
        if (!validation.valid || !validation.path) {
          json(res, { error: validation.error || "Invalid directory path" }, 400, allowedOrigin)
          return
        }
        const validatedDir = validation.path

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

        const action = typeof rawBody.action === "string" ? rawBody.action : "align"

        // Load authoritative scan data for workspace allowlist validation
        const currentScan = await scan(validatedDir, { security: action === "security-fix" })

        if (action === "remove-unused") {
          if (!Array.isArray(rawBody.unused) || rawBody.unused.length === 0) {
            json(res, { error: "No unused dependencies provided" }, 400, allowedOrigin)
            return
          }
          const items = rawBody.unused.filter(
            (u): u is { workspace: string; pkg: string; type?: string } =>
              typeof u === "object" &&
              u !== null &&
              typeof (u as { workspace?: unknown }).workspace === "string" &&
              typeof (u as { pkg?: unknown }).pkg === "string"
          )
          fixResult = await removeUnusedDependencies(validatedDir, items, currentScan)
        } else if (action === "declare-phantom") {
          if (!Array.isArray(rawBody.phantoms) || rawBody.phantoms.length === 0) {
            json(res, { error: "No phantom dependencies provided" }, 400, allowedOrigin)
            return
          }
          const items = rawBody.phantoms.filter(
            (p): p is { workspace: string; pkg: string; version: string; type?: "prod" | "dev" } =>
              typeof p === "object" &&
              p !== null &&
              typeof (p as { workspace?: unknown }).workspace === "string" &&
              typeof (p as { pkg?: unknown }).pkg === "string" &&
              typeof (p as { version?: unknown }).version === "string"
          )
          fixResult = await declarePhantomDependencies(validatedDir, items, currentScan)
        } else if (action === "security-fix") {
          const { applySecurityFixes } = await import("../scan/security.js")
          const vulns = currentScan.security?.vulnerabilities ?? []
          fixResult = await applySecurityFixes(validatedDir, vulns, currentScan.workspaces)
          const updatedScan = await scan(validatedDir, { security: true })
          json(
            res,
            {
              ok: fixResult.ok,
              changes: fixResult.changes,
              modifiedFiles: fixResult.modifiedFiles,
              errors: fixResult.errors,
              result: updatedScan,
            },
            200,
            allowedOrigin
          )
          return
        } else if (action === "catalog-migrate") {
          const { applyCatalogPlan, generateCatalogPlan } = await import("../scan/catalog.js")
          const plan = generateCatalogPlan(currentScan, {
            strategy: rawBody.catalogStrategy === "most-frequent" ? "most-frequent" : "highest",
            allPackages: Boolean(rawBody.catalogAll),
          })
          const catalogRes = await applyCatalogPlan(validatedDir, plan, currentScan)
          const updatedScan = await scan(validatedDir, {})
          json(
            res,
            {
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
            },
            200,
            allowedOrigin
          )
          return
        } else if (action === "dedupe-apply") {
          const { applyDedupeOverrides, analyzeLockfile, generateOverridesDict } =
            await import("../scan/dedupe.js")
          const rootWs = currentScan.workspaces.find((w) => w.isRoot)
          const dedupeResult =
            currentScan.dedupe ?? analyzeLockfile(validatedDir, rootWs?.packageManager ?? null)
          if (!dedupeResult || dedupeResult.duplicates.length === 0) {
            json(res, { error: "No lockfile duplicates found to dedupe" }, 400, allowedOrigin)
            return
          }
          const strategy = rawBody.dedupeStrategy === "most-frequent" ? "most-frequent" : "highest"
          const overrides =
            typeof rawBody.overrides === "object" && rawBody.overrides !== null
              ? (rawBody.overrides as Record<string, string>)
              : generateOverridesDict(dedupeResult.duplicates, strategy)
          fixResult = applyDedupeOverrides(validatedDir, overrides, dedupeResult.packageManager)
          const updatedScan = await scan(validatedDir, {})
          json(
            res,
            {
              ok: fixResult.ok,
              changes: fixResult.changes,
              modifiedFiles: fixResult.modifiedFiles,
              errors: fixResult.errors,
              result: updatedScan,
            },
            200,
            allowedOrigin
          )
          return
        } else {
          if (!Array.isArray(rawBody.fixes) || rawBody.fixes.length === 0) {
            json(res, { error: "No fixes provided" }, 400, allowedOrigin)
            return
          }
          const fixes = rawBody.fixes.filter(
            (f): f is { name: string; targetVersion: string; workspaces?: string[] } =>
              typeof f === "object" &&
              f !== null &&
              typeof (f as { name?: unknown }).name === "string" &&
              typeof (f as { targetVersion?: unknown }).targetVersion === "string"
          )
          fixResult = await applyFixes(validatedDir, fixes, currentScan)
        }

        const updatedScan = await scan(validatedDir, {})
        json(
          res,
          {
            ok: fixResult.ok,
            changes: fixResult.changes,
            modifiedFiles: fixResult.modifiedFiles,
            errors: fixResult.errors,
            result: updatedScan,
          },
          200,
          allowedOrigin
        )
        return
      }

      if (url.pathname === "/api/export.html" && req.method === "GET") {
        const targetDir = url.searchParams.get("dir") ?? defaultDir
        if (!targetDir) {
          json(res, { error: "No scan result available" }, 400, allowedOrigin)
          return
        }
        const validation = validatePath(targetDir)
        if (!validation.valid || !validation.path) {
          json(res, { error: validation.error || "Invalid path" }, 400, allowedOrigin)
          return
        }
        const result = await scan(validation.path, {})
        const { generateStandaloneHtml } = await import("../html/index.js")
        const html = generateStandaloneHtml(result)
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": allowedOrigin,
        })
        res.end(html)
        return
      }

      if (url.pathname.startsWith("/assets/")) {
        const assetPath = path.join(DASHBOARD_DIR, url.pathname)
        if (serveStatic(res, assetPath)) return
      }

      serveDashboard(res, token)
    } catch (err) {
      json(res, { error: err instanceof Error ? err.message : String(err) }, 500, allowedOrigin)
    }
  })

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address()
      actualPort = typeof address === "object" && address !== null ? address.port : port
      const url = `http://127.0.0.1:${actualPort}/?token=${token}`
      resolve({ server, port: actualPort, url, token, dir: defaultDir })
    })
  })
}
