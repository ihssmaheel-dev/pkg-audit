import fs from "node:fs"
import path from "node:path"
import puppeteer from "puppeteer"

const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="256" height="256" fill="none">
  <defs>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="32" height="32" rx="7" fill="#101010" />
  <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" stroke="#3d3a39" stroke-width="1" />
  
  <g transform="translate(4, 4) scale(0.75)" filter="url(#glow)">
    <path
      d="M16 3L28 9.5V22.5L16 29L4 22.5V9.5L16 3Z"
      stroke="#00d992"
      stroke-width="1.75"
      stroke-linejoin="round"
      stroke-opacity="0.9"
    />
    <path
      d="M16 16L28 9.5M16 16V29M16 16L4 9.5"
      stroke="#00d992"
      stroke-width="1.25"
      stroke-linejoin="round"
      stroke-opacity="0.5"
    />
    <path
      d="M16 10L22 13.5V19.5L16 23L10 19.5V13.5L16 10Z"
      stroke="#00d992"
      stroke-width="1"
      stroke-linejoin="round"
      stroke-opacity="0.35"
    />
    <path
      d="M18.5 4.5L11 15.5H16.5L13.5 27.5L22.5 14H16.5L18.5 4.5Z"
      fill="#00d992"
      stroke="#101010"
      stroke-width="1"
      stroke-linejoin="round"
    />
  </g>
</svg>
`

const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
    }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>
`

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: {
      width: 256,
      height: 256,
      deviceScaleFactor: 2,
    },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: "networkidle0" })

  const outPaths = [path.resolve("docs/images/logo.png"), path.resolve("src/web/src/assets/logo.png")]

  for (const outPath of outPaths) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    await page.screenshot({
      path: outPath,
      type: "png",
      omitBackground: true,
    })
    console.log(`✓ Saved logo to ${outPath}`)
  }

  // Also save SVG version
  fs.writeFileSync(path.resolve("docs/images/logo.svg"), svgContent.trim(), "utf8")
  console.log(`✓ Saved logo to docs/images/logo.svg`)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
