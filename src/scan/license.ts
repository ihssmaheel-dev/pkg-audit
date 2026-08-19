import fs from "node:fs"
import path from "node:path"
import type { LicenseRiskLevel, LicenseScanResult, PackageLicenseInfo, Workspace } from "../types.js"
import { isLinkedProtocol } from "./conflicts.js"

const PERMISSIVE_SPDX = new Set([
  "MIT",
  "Apache-2.0",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSD-4-Clause",
  "0BSD",
  "CC0-1.0",
  "CC-BY-4.0",
  "CC-BY-3.0",
  "Unlicense",
  "Zlib",
  "Python-2.0",
  "Artistic-2.0",
  "WTFPL",
  "BlueOak-1.0.0",
  "PostgreSQL",
  "OpenSSL",
])

const WEAK_COPYLEFT_SPDX = new Set([
  "MPL-2.0",
  "MPL-1.1",
  "LGPL-2.0",
  "LGPL-2.1",
  "LGPL-3.0",
  "LGPL-2.0-only",
  "LGPL-2.0-or-later",
  "LGPL-2.1-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later",
  "CDDL-1.0",
  "CDDL-1.1",
  "EPL-1.0",
  "EPL-2.0",
  "CPL-1.0",
])

const STRONG_COPYLEFT_SPDX = new Set([
  "GPL-1.0",
  "GPL-2.0",
  "GPL-3.0",
  "GPL-1.0-only",
  "GPL-1.0-or-later",
  "GPL-2.0-only",
  "GPL-2.0-or-later",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "AGPL-1.0",
  "AGPL-3.0",
  "AGPL-3.0-only",
  "AGPL-3.0-or-later",
  "SSPL-1.0",
  "OSL-1.0",
  "OSL-2.0",
  "OSL-3.0",
  "EUPL-1.1",
  "EUPL-1.2",
  "CPAL-1.0",
  "CC-BY-SA-4.0",
])

/**
 * Normalizes raw license strings from package.json to SPDX identifiers.
 */
export function normalizeSpdx(rawLicense?: string | null): { spdxId: string; raw: string } {
  if (!rawLicense || typeof rawLicense !== "string" || !rawLicense.trim()) {
    return { spdxId: "UNKNOWN", raw: "UNKNOWN" }
  }

  const raw = rawLicense.trim()
  const clean = raw.replace(/[()]/g, "").trim()
  const lower = clean.toLowerCase()

  // Exact known matches
  if (PERMISSIVE_SPDX.has(clean) || WEAK_COPYLEFT_SPDX.has(clean) || STRONG_COPYLEFT_SPDX.has(clean)) {
    return { spdxId: clean, raw }
  }

  // Proprietary / Unlicensed check
  if (lower === "unlicensed" || lower.includes("see license in") || lower.includes("commercial")) {
    return { spdxId: "UNLICENSED", raw }
  }

  // Fuzzy mapping
  if (lower === "mit" || lower.includes("mit")) return { spdxId: "MIT", raw }
  if (lower.includes("apache 2") || lower.includes("apache-2") || lower.includes("apache2"))
    return { spdxId: "Apache-2.0", raw }
  if (lower === "isc") return { spdxId: "ISC", raw }
  if (lower.includes("bsd 3") || lower.includes("bsd-3")) return { spdxId: "BSD-3-Clause", raw }
  if (lower.includes("bsd 2") || lower.includes("bsd-2")) return { spdxId: "BSD-2-Clause", raw }
  if (lower === "bsd") return { spdxId: "BSD-3-Clause", raw }
  if (lower === "0bsd") return { spdxId: "0BSD", raw }
  if (lower === "unlicense" || lower === "the unlicense") return { spdxId: "Unlicense", raw }
  if (lower.includes("cc0")) return { spdxId: "CC0-1.0", raw }

  if (lower.includes("mpl 2") || lower.includes("mpl-2")) return { spdxId: "MPL-2.0", raw }
  if (lower.includes("lgpl 3") || lower.includes("lgpl-3") || lower.includes("lgplv3"))
    return { spdxId: "LGPL-3.0", raw }
  if (lower.includes("lgpl 2") || lower.includes("lgpl-2") || lower.includes("lgplv2"))
    return { spdxId: "LGPL-2.1", raw }
  if (lower.includes("lgpl")) return { spdxId: "LGPL-3.0", raw }

  if (lower.includes("agpl 3") || lower.includes("agpl-3") || lower.includes("agplv3"))
    return { spdxId: "AGPL-3.0", raw }
  if (lower.includes("agpl")) return { spdxId: "AGPL-3.0", raw }
  if (lower.includes("gpl 3") || lower.includes("gpl-3") || lower.includes("gplv3"))
    return { spdxId: "GPL-3.0", raw }
  if (lower.includes("gpl 2") || lower.includes("gpl-2") || lower.includes("gplv2"))
    return { spdxId: "GPL-2.0", raw }
  if (lower.includes("gpl")) return { spdxId: "GPL-3.0", raw }
  if (lower.includes("sspl")) return { spdxId: "SSPL-1.0", raw }

  return { spdxId: clean, raw }
}

/**
 * Determines legal risk level for a given license.
 */
export function categorizeLicense(spdxId: string, rawLicense: string): LicenseRiskLevel {
  const norm = spdxId.toUpperCase()
  const rawLower = rawLicense.toLowerCase()

  if (rawLower === "unlicensed" || rawLower.includes("see license in") || rawLower.includes("commercial")) {
    return "proprietary"
  }
  if (norm === "UNKNOWN" || !norm) {
    return "unknown"
  }
  if (STRONG_COPYLEFT_SPDX.has(spdxId)) {
    return "strong-copyleft"
  }
  if (WEAK_COPYLEFT_SPDX.has(spdxId)) {
    return "weak-copyleft"
  }
  if (PERMISSIVE_SPDX.has(spdxId)) {
    return "permissive"
  }

  // Check fallback keywords
  if (norm.includes("GPL") || norm.includes("AGPL") || norm.includes("SSPL")) {
    return "strong-copyleft"
  }
  if (norm.includes("MPL") || norm.includes("LGPL") || norm.includes("CDDL") || norm.includes("EPL")) {
    return "weak-copyleft"
  }

  return "unknown"
}

interface RawPkgJson {
  name?: string
  version?: string
  license?: string | { type?: string; url?: string }
  licenses?: Array<{ type?: string; url?: string }>
  author?: string | { name?: string; email?: string; url?: string }
  repository?: string | { url?: string }
  homepage?: string
  description?: string
}

/**
 * Searches local node_modules hierarchy to extract package metadata and license.
 */
function findInstalledPackageJson(
  pkgName: string,
  workspacePaths: string[],
  rootDir: string
): RawPkgJson | null {
  const possiblePaths: string[] = []

  // Check workspace-level node_modules
  for (const ws of workspacePaths) {
    possiblePaths.push(path.join(ws, "node_modules", pkgName, "package.json"))
  }

  // Check root-level node_modules
  possiblePaths.push(path.join(rootDir, "node_modules", pkgName, "package.json"))

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf8")
        return JSON.parse(raw) as RawPkgJson
      } catch {
        // Ignore parse error
      }
    }
  }

  // Check pnpm virtual store if .pnpm exists
  const pnpmStore = path.join(rootDir, "node_modules", ".pnpm")
  if (fs.existsSync(pnpmStore)) {
    try {
      const pnpmEntries = fs.readdirSync(pnpmStore)
      const encodedPkg = pkgName.replace("/", "+")
      const matchingDir = pnpmEntries.find(
        (dir) => dir.startsWith(`${encodedPkg}@`) || dir.startsWith(`${pkgName}@`)
      )
      if (matchingDir) {
        const p = path.join(pnpmStore, matchingDir, "node_modules", pkgName, "package.json")
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, "utf8")
          return JSON.parse(raw) as RawPkgJson
        }
      }
    } catch {
      // Ignore
    }
  }

  return null
}

function parseAuthorString(author?: RawPkgJson["author"]): string | undefined {
  if (!author) return undefined
  if (typeof author === "string") return author
  if (typeof author === "object" && author.name) {
    return author.name + (author.email ? ` <${author.email}>` : "")
  }
  return undefined
}

function parseRepoString(repo?: RawPkgJson["repository"]): string | undefined {
  if (!repo) return undefined
  if (typeof repo === "string") return repo
  if (typeof repo === "object" && repo.url) {
    return repo.url.replace(/^git\+/, "").replace(/\.git$/, "")
  }
  return undefined
}

/**
 * Scans all declared external dependencies across monorepo workspaces and performs legal compliance analysis.
 */
export function scanMonorepoLicenses(workspaces: Workspace[], rootDir: string): LicenseScanResult {
  const workspaceNames = new Set(workspaces.map((w) => w.name).filter(Boolean))
  const workspacePaths = workspaces.map((w) => path.join(rootDir, w.relPath))

  // Collect all external dependencies
  const depUsageMap = new Map<
    string,
    {
      workspaces: Array<{ workspace: string; type: Workspace["deps"][string]["type"]; spec: string }>
      versions: Set<string>
      hasProd: boolean
    }
  >()

  for (const ws of workspaces) {
    for (const [depName, depInfo] of Object.entries(ws.deps)) {
      if (workspaceNames.has(depName) || isLinkedProtocol(depInfo.version)) {
        continue
      }

      if (!depUsageMap.has(depName)) {
        depUsageMap.set(depName, {
          workspaces: [],
          versions: new Set(),
          hasProd: false,
        })
      }

      const entry = depUsageMap.get(depName)!
      entry.workspaces.push({
        workspace: ws.name || ws.relPath,
        type: depInfo.type,
        spec: depInfo.version,
      })
      entry.versions.add(depInfo.version.replace(/^[\^~>=<\s]+/, ""))
      if (depInfo.type === "prod") {
        entry.hasProd = true
      }
    }
  }

  const packages: PackageLicenseInfo[] = []
  let permissiveCount = 0
  let weakCopyleftCount = 0
  let strongCopyleftCount = 0
  let proprietaryCount = 0
  let unknownCount = 0
  let prodCopyleftCount = 0

  for (const [pkgName, usage] of depUsageMap.entries()) {
    const installed = findInstalledPackageJson(pkgName, workspacePaths, rootDir)

    let rawLicenseStr = "UNKNOWN"
    if (installed) {
      if (typeof installed.license === "string") {
        rawLicenseStr = installed.license
      } else if (installed.license && typeof installed.license === "object" && installed.license.type) {
        rawLicenseStr = installed.license.type
      } else if (Array.isArray(installed.licenses) && installed.licenses.length > 0) {
        rawLicenseStr = installed.licenses
          .map((l) => l.type || "")
          .filter(Boolean)
          .join(" OR ")
      }
    }

    const { spdxId, raw } = normalizeSpdx(rawLicenseStr)
    const riskLevel = categorizeLicense(spdxId, raw)
    const isCopyleft = riskLevel === "strong-copyleft" || riskLevel === "weak-copyleft"

    if (riskLevel === "permissive") permissiveCount++
    else if (riskLevel === "weak-copyleft") weakCopyleftCount++
    else if (riskLevel === "strong-copyleft") strongCopyleftCount++
    else if (riskLevel === "proprietary") proprietaryCount++
    else unknownCount++

    if (isCopyleft && usage.hasProd) {
      prodCopyleftCount++
    }

    const resolvedVersion = installed?.version ?? Array.from(usage.versions)[0] ?? "unknown"

    packages.push({
      name: pkgName,
      version: resolvedVersion,
      license: rawLicenseStr,
      spdxId,
      riskLevel,
      isCopyleft,
      isProd: usage.hasProd,
      workspaces: usage.workspaces,
      author: parseAuthorString(installed?.author),
      repository: parseRepoString(installed?.repository),
      homepage: installed?.homepage,
      description: installed?.description,
    })
  }

  // Sort packages by risk severity (strong-copyleft > weak-copyleft > proprietary > unknown > permissive), then name
  const riskOrder: Record<LicenseRiskLevel, number> = {
    "strong-copyleft": 0,
    "weak-copyleft": 1,
    proprietary: 2,
    unknown: 3,
    permissive: 4,
  }

  packages.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || a.name.localeCompare(b.name))

  return {
    packages,
    permissiveCount,
    weakCopyleftCount,
    strongCopyleftCount,
    proprietaryCount,
    unknownCount,
    prodCopyleftCount,
    totalScanned: packages.length,
  }
}

/**
 * Generates an enterprise-ready NOTICE.txt third-party attribution document.
 */
export function generateNoticeText(licenseResult: LicenseScanResult, projectName = "This Project"): string {
  const timestamp = new Date().toISOString().split("T")[0]
  let notice = `================================================================================
THIRD-PARTY SOFTWARE NOTICES AND INFORMATION
Project: ${projectName}
Date: ${timestamp}
================================================================================

This project incorporates components from the open source and third-party software
listed below. The respective copyright notices and licenses apply to these components.

`

  for (const pkg of licenseResult.packages) {
    notice += `--------------------------------------------------------------------------------\n`
    notice += `Package: ${pkg.name}\n`
    notice += `Version: ${pkg.version}\n`
    notice += `License: ${pkg.spdxId} (${pkg.license})\n`
    if (pkg.author) notice += `Author: ${pkg.author}\n`
    if (pkg.repository) notice += `Repository: ${pkg.repository}\n`
    if (pkg.homepage) notice += `Homepage: ${pkg.homepage}\n`
    notice += `Workspaces: ${pkg.workspaces.map((w) => w.workspace).join(", ")}\n`
    notice += `--------------------------------------------------------------------------------\n\n`
  }

  return notice
}

/**
 * Generates a standard SPDX 2.3 JSON Software Bill of Materials (SBOM).
 */
export function generateSpdxJson(licenseResult: LicenseScanResult, projectName = "monorepo"): string {
  const doc = {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: projectName,
    documentNamespace: `https://spdx.org/spdxdocs/${projectName}-${Date.now()}`,
    creationInfo: {
      creators: ["Tool: pkg-audit-0.1.0"],
      created: new Date().toISOString(),
    },
    packages: licenseResult.packages.map((pkg) => ({
      name: pkg.name,
      SPDXID: `SPDXRef-Package-${pkg.name.replace(/[^a-zA-Z0-9.-]/g, "-")}`,
      versionInfo: pkg.version,
      licenseConcluded: pkg.spdxId !== "UNKNOWN" ? pkg.spdxId : "NOASSERTION",
      licenseDeclared: pkg.spdxId !== "UNKNOWN" ? pkg.spdxId : "NOASSERTION",
      copyrightText: pkg.author ? `Copyright (c) ${pkg.author}` : "NOASSERTION",
      downloadLocation: pkg.repository ?? "NOASSERTION",
      homepage: pkg.homepage ?? "NOASSERTION",
      description: pkg.description ?? "",
      supplier: pkg.author ? `Person: ${pkg.author}` : "NOASSERTION",
    })),
  }

  return JSON.stringify(doc, null, 2)
}

/**
 * Generates a spreadsheet-compatible CSV export for corporate legal audits.
 */
export function generateCsvReport(licenseResult: LicenseScanResult): string {
  const headers = [
    "Package",
    "Version",
    "License",
    "SPDX Identifier",
    "Risk Level",
    "Is Copyleft",
    "Production Used",
    "Workspaces",
    "Author",
    "Repository",
    "Homepage",
  ]

  const escapeCsv = (val?: string | boolean | null) => {
    if (val === undefined || val === null) return '""'
    const s = String(val).replace(/"/g, '""')
    return `"${s}"`
  }

  const rows = [headers.join(",")]

  for (const pkg of licenseResult.packages) {
    const wsStr = pkg.workspaces.map((w) => `${w.workspace} (${w.type})`).join("; ")
    rows.push(
      [
        escapeCsv(pkg.name),
        escapeCsv(pkg.version),
        escapeCsv(pkg.license),
        escapeCsv(pkg.spdxId),
        escapeCsv(pkg.riskLevel),
        escapeCsv(pkg.isCopyleft ? "YES" : "NO"),
        escapeCsv(pkg.isProd ? "YES" : "NO"),
        escapeCsv(wsStr),
        escapeCsv(pkg.author),
        escapeCsv(pkg.repository),
        escapeCsv(pkg.homepage),
      ].join(",")
    )
  }

  return rows.join("\n")
}
