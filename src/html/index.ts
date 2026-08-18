import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { ScanResult } from "../types.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const UI_DIR = path.join(__dirname, "..", "..", "dist", "ui")

/** Inline the built dashboard JS/CSS so the report works from file:// or as a
 * CI artifact with no external requests. */
export function generateStandaloneHtml(result: ScanResult): string {
  let inlineJs = ""
  let inlineCss = ""

  try {
    const files = fs.readdirSync(path.join(UI_DIR, "assets"))
    for (const file of files) {
      const filePath = path.join(UI_DIR, "assets", file)
      if (file.endsWith(".js")) inlineJs += fs.readFileSync(filePath, "utf8") + "\n"
      else if (file.endsWith(".css")) inlineCss += fs.readFileSync(filePath, "utf8") + "\n"
    }
  } catch {
    // Dashboard not built — report renders with data only.
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>pkg-audit — ${result.root}</title>
  <style>${inlineCss}</style>
</head>
<body>
  <div id="app"></div>
  <script>window.__PKG_AUDIT__ = ${JSON.stringify(result)};</script>
  <script>${inlineJs}</script>
</body>
</html>`
}
