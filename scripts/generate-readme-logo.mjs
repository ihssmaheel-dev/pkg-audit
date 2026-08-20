import fs from "node:fs"
import path from "node:path"
import puppeteer from "puppeteer"

const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256" fill="none">
  <defs>
    <linearGradient id="emeraldBolt" x1="16" y1="4" x2="16" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="50%" stop-color="#00d992" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <linearGradient id="cubeGlow" x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#00f0a8" />
      <stop offset="100%" stop-color="#00b87a" />
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.2" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Dark Badge Background with Hairline Border -->
  <rect width="128" height="128" rx="28" fill="#101010" />
  <rect x="1" y="1" width="126" height="126" rx="27" stroke="#383534" stroke-width="2" />

  <g transform="translate(16, 16) scale(3)" filter="url(#softGlow)">
    <!-- Outer Hexagonal Isometric Prism -->
    <path
      d="M16 3L28 9.5V22.5L16 29L4 22.5V9.5L16 3Z"
      stroke="url(#cubeGlow)"
      stroke-width="1.85"
      stroke-linejoin="round"
      stroke-opacity="0.95"
    />
    <!-- Inner Isometric Axes -->
    <path
      d="M16 16L28 9.5M16 16V29M16 16L4 9.5"
      stroke="url(#cubeGlow)"
      stroke-width="1.35"
      stroke-linejoin="round"
      stroke-opacity="0.4"
    />
    <!-- Inner Concentric Frame -->
    <path
      d="M16 10L22 13.5V19.5L16 23L10 19.5V13.5L16 10Z"
      stroke="url(#cubeGlow)"
      stroke-width="1.1"
      stroke-linejoin="round"
      stroke-opacity="0.3"
    />
    <!-- Solid Vibrant Lightning Bolt (No Dark Outline) -->
    <path
      d="M18.5 4.5L11 15.5H16.5L13.5 27.5L22.5 14H16.5L18.5 4.5Z"
      fill="url(#emeraldBolt)"
      stroke="#34d399"
      stroke-width="0.3"
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
