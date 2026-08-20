import fs from "node:fs"
import path from "node:path"
import puppeteer from "puppeteer"
import { startServer } from "../dist/server/index.js"

const OUT_DIR = path.resolve("docs/images")
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

const targetDir = path.resolve("test/fixtures/mono")

async function main() {
  console.log("Starting server for screenshots on fixture:", targetDir)
  const { server, url } = await startServer(targetDir, { port: 4899 })
  console.log(`Server running at ${url}`)

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
    },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  const page = await browser.newPage()
  await page.goto(url, { waitUntil: "networkidle0" })

  // Wait for initial render
  await page.waitForSelector("header", { timeout: 10000 })
  await new Promise((r) => setTimeout(r, 1200))

  console.log("Triggering full scan with security, outdated, and changelogs...")
  await page.evaluate(async () => {
    const win = globalThis
    if (win.__pkgAuditScan) {
      await win.__pkgAuditScan({ security: true, outdated: true, changelog: true })
    }
  })

  // Wait for scan to complete
  await new Promise((r) => setTimeout(r, 3500))

  const tabs = [
    { id: "dashboard", file: "dashboard-preview.png" },
    { id: "matrix", file: "matrix-preview.png" },
    { id: "conflicts", file: "conflicts-preview.png" },
    { id: "dedupe", file: "dedupe-preview.png" },
    { id: "deprecation", file: "deprecation-preview.png" },
    { id: "graph", file: "graph-preview.png" },
    { id: "unused", file: "unused-preview.png" },
    { id: "security", file: "security-preview.png" },
    { id: "licenses", file: "licenses-preview.png" },
    { id: "context", file: "context-preview.png" },
    { id: "outdated", file: "outdated-preview.png" },
    { id: "hygiene", file: "hygiene-preview.png" },
    { id: "workspaces", file: "workspaces-preview.png" },
  ]

  for (const tab of tabs) {
    console.log(`Switching to ${tab.id}...`)
    await page.evaluate((tabId) => {
      const win = globalThis
      if (win.__pkgAuditSetTab) {
        win.__pkgAuditSetTab(tabId)
      } else {
        win.location.hash = `#${tabId}`
      }
    }, tab.id)

    // If on outdated tab, click the first outdated package card header to expand its release notes
    if (tab.id === "outdated") {
      await new Promise((r) => setTimeout(r, 800))
      await page.evaluate(() => {
        const doc = globalThis.document
        if (!doc) return
        const cards = doc.querySelectorAll("div[title*='changelog']")
        if (cards.length > 0) {
          cards[0].click()
        }
      })
    }

    // Wait for animations and charts to settle
    await new Promise((r) => setTimeout(r, 1200))

    const outPath = path.join(OUT_DIR, tab.file)
    await page.screenshot({ path: outPath, type: "png" })
    console.log(`✓ Saved ${tab.file}`)
  }

  await browser.close()
  server.close()
  console.log("\n All screenshots captured successfully!")
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err)
  process.exit(1)
})
