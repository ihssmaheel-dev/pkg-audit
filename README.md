# pkg-audit

<div align="center">
  <img src="docs/images/logo.png" alt="pkg-audit logo" width="120" height="120" />
  <br />
  <br />
  <p><b>Developer-first dependency drift, hygiene, security SLA, and semver conflict auditor for JS/TS monorepos.</b></p>
  <p>Scan any monorepo and open a clean local dashboard in under 10 seconds.</p>

  <p>
    <a href="https://github.com/ihssmaheel-dev/pkg-audit/actions"><img src="https://img.shields.io/github/actions/workflow/status/ihssmaheel-dev/pkg-audit/ci.yml?branch=main&style=flat-square&label=CI&color=00d992" alt="CI Status" /></a>
    <a href="https://www.npmjs.com/package/pkg-audit"><img src="https://img.shields.io/npm/v/pkg-audit?style=flat-square&color=00d992" alt="npm version" /></a>
    <a href="https://github.com/ihssmaheel-dev/pkg-audit/blob/main/package.json"><img src="https://img.shields.io/badge/node-%3E%3D18.18-101010?style=flat-square&logo=node.js&logoColor=00d992" alt="Node version" /></a>
    <a href="https://github.com/ihssmaheel-dev/pkg-audit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-101010?style=flat-square" alt="License" /></a>
  </p>
</div>

---

## 📸 Preview

<div align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/dashboard-preview.png" alt="pkg-audit Dashboard Preview" width="100%" />
  <p><i>Dashboard: Monorepo Health Overview with interactive Chart.js visualizations & KPI metrics</i></p>
</div>

<br />

<details open>
  <summary><b>📷 Interactive Dashboard Views & Screenshots</b></summary>
  <br />

### 1. Cross-Workspace Matrix Grid

Cross-workspace alignment matrix showing package versions declared across all packages with conflict badges.
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/matrix-preview.png" alt="Matrix Grid Preview" width="100%" />
</p>

### 2. Version Conflicts Breakdown & 1-Click Aligner

Isolates major breaking mismatches and range discrepancies with automated alignment recommendations.
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/conflicts-preview.png" alt="Conflicts Preview" width="100%" />
</p>

### 3. Lockfile Deduplication & Disk Savings

Analyzes lockfile transitive bloat, measures actual physical disk bytes, and calculates disk savings from collapsing duplicate packages.
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/dedupe-preview.png" alt="Deduplication & Disk Savings Preview" width="100%" />
</p>

### 4. Package Deprecation & Abandonment Audit

Detects officially deprecated packages, unmaintained/abandoned libraries (>2 years without updates), and high-risk zombie dependencies.
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/deprecation-preview.png" alt="Deprecation & Zombie Packages Preview" width="100%" />
</p>

### 5. Interactive Workspace Topology & Cycle Detection

Visual dependency graph canvas with automatic cycle isolation (e.g. `A ➔ B ➔ C ➔ A`) that deadlock build tools.
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/graph-preview.png" alt="Workspace Graph & Circular Dependency Preview" width="100%" />
</p>

### 6. Phantom & Unused Dependency Scanner

Detects undeclared imports in source files (`.ts`, `.tsx`, `.vue`, `.svelte`) and dead dependencies declared in `package.json`.
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/unused-preview.png" alt="Phantom and Unused Dependency Scanner Preview" width="100%" />
</p>

### 7. Security Vulnerabilities & SLA Tracking

Scans dependencies via Google OSV API, tracks vulnerability age, and enforces organizational SLA compliance gates.
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/security-preview.png" alt="Security Vulnerability Audit Preview" width="100%" />
</p>

### 8. License Compliance & Copyleft Risk Audit

Audits dependency licenses across monorepos, flags restrictive AGPL/GPL copyleft licenses, and exports SPDX JSON / Notice text.
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/licenses-preview.png" alt="License Compliance Preview" width="100%" />
</p>

### 9. AI Monorepo Architect Prompt Generator

Generates curated, token-efficient architecture context markdown for AI agents (Cursor, Claude, Copilot, ChatGPT).
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/context-preview.png" alt="AI Context Generator Preview" width="100%" />
</p>

### 10. Outdated Releases & Inline GitHub Changelogs

Queries the npm registry for latest updates and embeds inline GitHub release notes and changelogs.
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/outdated-preview.png" alt="Outdated Releases Preview" width="100%" />
</p>

### 11. Manifest Hygiene Audit

Audits package manifests for duplicate names, missing fields, engine drifts, and mismatched package managers.
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/hygiene-preview.png" alt="Manifest Hygiene Preview" width="100%" />
</p>

### 12. Workspace Manifest Inventory

Detailed dependency breakdown per workspace with uniform columns and type filters.
<p align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/workspaces-preview.png" alt="Workspaces Inventory Preview" width="100%" />
</p>

</details>

---

## ✨ Highlights

- **⚡ Blazing Fast** — Scans full monorepos with hundreds of workspaces in under 50 milliseconds.
- **⏳ Suppression Engine with Expiry** — Suppress specific CVEs, licenses, or false-positive phantoms with a mandatory `reason` and `expires` date (`.pkg-audit-ignore.json`).
- **💾 Local Cache & `--offline` Mode** — Persistent disk cache under `.pkg-audit/cache/` enables fast offline audits and avoids redundant network calls.
- **⏱️ Vulnerability SLA & Age Gate** — Persists vulnerability discovery history and breaks CI builds when unpatched CVEs breach SLA thresholds (`--fail-on=critical:7d`).
- **🛡️ Cross-Boundary Import Enforcement** — Static analysis ensures shared packages never import from applications (`packages/*` ➔ `apps/*`), preserving clean modularity.
- **💾 Lockfile Dedupe & Disk Size Impact** — Computes physical byte savings from collapsing duplicate transitive packages (e.g. `~14.2 MB saved`).
- **⚠️ Deprecation & Zombie Audit** — Queries official npm deprecations and flags abandoned packages unmaintained for >2 years.
- **👻 Phantom Dependency Scanner** — Catches undeclared imports in source files (`.ts`, `.tsx`, `.js`, `.vue`, `.svelte`) that silently hoist locally but fail in Docker/CI.
- **🗑️ Unused Dependency Remover** — Identifies dead packages declared in `package.json` with 1-click removal.
- **🕸️ Workspace Dependency Graph** — Interactive SVG canvas with zoom, pan, and topological layer hierarchy mapping internal linkages.
- **🚨 Circular Dependency Detector** — Automatically isolates cyclic loops (e.g. `A ➔ B ➔ C ➔ A`) that deadlock Turborepo/Nx/pnpm builds.
- **⚡ One-Click Conflict Fixer** — Automatically align version mismatches via `pkg-audit fix` or 1-click UI buttons.
- **📜 License Governance** — Identifies copyleft risks in production dependencies and exports SPDX JSON, CSV, or NOTICE files.
- **🤖 AI Monorepo Context** — Exports concise repository structure and rules formatted for Cursor (`.cursorrules`), Claude (`CLAUDE.md`), and Copilot.
- **📦 pnpm Catalog Migrator** — Generates and applies `pnpm-workspace.yaml` catalog plans automatically.
- **📄 Standalone HTML Export** — Generate portable, single-file offline reports for pull requests, audits, and Slack sharing.

---

## 🚀 Quick Start

```bash
# One-shot scan with UI dashboard (no install required)
npx pkg-audit --ui

# Scan a specific repository directory
npx pkg-audit --ui ~/code/my-monorepo

# Install locally as dev dependency
npm i -D pkg-audit

# Install globally to audit any repository across your computer
npm i -g pkg-audit
```

---

## 💻 CLI Usage

```bash
pkg-audit [dir] [options]
pkg-audit fix [dir]         # Automatically resolve and align version conflicts
pkg-audit ui [dir]          # Launch interactive browser dashboard
pkg-audit html [dir]        # Export standalone HTML report
pkg-audit json [dir]        # Machine-readable JSON output
```

| Invocation                               | Output / Behavior                                           |
| ---------------------------------------- | ----------------------------------------------------------- |
| `pkg-audit`                              | Scans current directory and prints terminal report          |
| `pkg-audit fix`                          | Automatically aligns all conflicts to highest semver        |
| `pkg-audit fix --strategy=most-frequent` | Aligns all conflicts to most frequent version               |
| `pkg-audit fix --dry-run`                | Previews manifest modifications without writing to disk     |
| `pkg-audit fix --pkg=react`              | Aligns version conflicts for a specific package only        |
| `pkg-audit --ui`                         | Scans current directory and launches browser dashboard      |
| `pkg-audit --ui ~/code/shop`             | Scans target directory and launches browser dashboard       |
| `pkg-audit --offline`                    | Runs scan without network requests using local disk cache   |
| `pkg-audit --fail-on=critical:7d`        | Breaks CI if critical vulnerabilities exceed 7 days old     |
| `pkg-audit --fail-on=copyleft`           | Breaks CI if restrictive copyleft licenses are in prod deps |
| `pkg-audit html`                         | Generates `pkg-audit-report.html` in current directory      |
| `pkg-audit json --out audit.json`        | Emits structured JSON for CI and custom tooling             |
| `pkg-audit --watch --ui`                 | Live-reloads dashboard automatically when manifests change  |

---

## ⚙️ CLI Options Reference

| Option                   | Description                                                                        | Default   |
| ------------------------ | ---------------------------------------------------------------------------------- | --------- |
| `--ui`                   | Launch local web dashboard in browser                                              | `false`   |
| `--fix`                  | Automatically align conflicting dependency versions                                | `false`   |
| `--strategy=<strategy>`  | Fix strategy: `highest` or `most-frequent`                                         | `highest` |
| `--dry-run`              | Preview changes without modifying `package.json` files                             | `false`   |
| `--pkg=<name>`           | Limit fix remediation to a single package name                                     | none      |
| `--target-version=<ver>` | Specify custom target version (used with `--pkg`)                                  | none      |
| `--offline`              | Skip network requests and use local disk response cache                            | `false`   |
| `--no-cache`, `--fresh`  | Bypass local disk response cache and fetch fresh network data                      | `false`   |
| `--boundaries`           | Enforce cross-boundary import architecture rules                                   | `false`   |
| `--fail-on=<val>`        | CI Gate: `major`, `range`, `copyleft`, or `<severity>:<days>` (e.g. `critical:7d`) | none      |
| `--security`             | Run security vulnerability audit via Google OSV API                                | `false`   |
| `--security-fix`         | Automatically apply non-breaking vulnerability patch upgrades                      | `false`   |
| `--dedupe`               | Run lockfile transitive deduplication audit                                        | `false`   |
| `--dedupe-fix`           | Automatically apply package manager overrides/resolutions                          | `false`   |
| `--licenses`             | Run license compliance audit                                                       | `false`   |
| `--license-export=<fmt>` | Export licenses as `notice`, `spdx`, or `csv`                                      | none      |
| `--deprecation`          | Audit deprecated, abandoned (>2y), and zombie packages                             | `true`    |
| `--html[=file]`          | Write standalone self-contained HTML report to file                                | `false`   |
| `--json[=file]`          | Emit structured JSON to stdout or specified file                                   | `false`   |
| `--pr-comment[=file]`    | Generate GitHub PR comment markdown                                                | `false`   |
| `--post-pr-comment`      | Post or update sticky comment on PR in GitHub Actions                              | `false`   |
| `--base-json=file`       | Compare with base branch JSON audit to compute delta                               | none      |
| `--outdated`             | Query npm registry for latest version drift                                        | `false`   |
| `--changelog`            | Fetch GitHub release notes and changelogs per package                              | `false`   |
| `--concurrency=N`        | Maximum concurrent registry requests                                               | `8`       |
| `--top=N`                | Number of top shared dependencies to report                                        | `10`      |
| `--workspace=<name>`     | Inspect dependencies for a single specified workspace                              | `all`     |
| `--full`                 | Render full dependency matrix across all manifests                                 | `false`   |
| `--watch`                | Watch `package.json` files and rescan automatically                                | `false`   |
| `--port=N`               | Custom port for `--ui` web server                                                  | `auto`    |
| `--no-open`              | Prevent opening browser window automatically with `--ui`                           | `false`   |

---

## 🛡️ Enterprise Feature Deep Dive

### 1. Suppression File with Expiry (`.pkg-audit-ignore.json`)

Manage known exceptions without permanently hiding technical debt. Expired suppressions automatically trigger warnings.

```json
[
  {
    "id": "GHSA-1234-*",
    "pkg": "lodash",
    "type": "security",
    "reason": "Internal dev build tool only; migration scheduled for Q4",
    "expires": "2026-12-31"
  },
  {
    "pkg": "@mono/legacy-helper",
    "type": "phantom",
    "workspace": "apps/web",
    "reason": "Legacy build script phantom import",
    "expires": "2026-11-30"
  }
]
```

### 2. Vulnerability SLA Age Tracking

Enforce strict remediation timelines in your CI pipelines:

```bash
# Break build only if critical vulnerabilities remain unpatched after 7 days
pkg-audit --fail-on=critical:7d

# Break build for high severity CVEs older than 14 days
pkg-audit --fail-on=high:14d
```

Discovery timestamps are tracked in `.pkg-audit/vulnerability-history.json`.

### 3. Cross-Boundary Import Rules

Ensure modular architecture is preserved across apps and packages:

```javascript
// pkg-audit.config.js
export default {
  boundaryRules: [
    {
      from: "packages/**",
      disallow: ["apps/**"],
      reason: "Shared libraries must never import application code",
    },
    {
      from: "apps/web/**",
      disallow: ["apps/api/**"],
      reason: "Frontend application must not directly import backend server code",
    },
  ],
}
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut           | Action                                                      |
| ------------------ | ----------------------------------------------------------- |
| `Ctrl+K` / `Cmd+K` | Open command palette (search packages, workspaces, actions) |
| `Esc`              | Close details drawer / command palette                      |
| `1`                | Navigate to **Dashboard** tab                               |
| `2`                | Navigate to **Matrix** tab                                  |
| `3`                | Navigate to **Conflicts** tab                               |
| `4`                | Navigate to **Outdated** tab                                |
| `5`                | Navigate to **Hygiene** tab                                 |
| `6`                | Navigate to **Workspaces** tab                              |

---

## 🤖 Official GitHub Action & PR Bot

Automate dependency drift auditing on every Pull Request using the official GitHub Action.

```yaml
# .github/workflows/dependency-audit.yml
name: Dependency Drift Audit

on:
  pull_request:
    paths:
      - "**/package.json"
      - "pnpm-workspace.yaml"
      - "package-lock.json"
      - "pnpm-lock.yaml"
      - "yarn.lock"

permissions:
  contents: read
  pull-requests: write

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Run pkg-audit & Post PR Comment
        uses: ihssmaheel-dev/pkg-audit@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          comment-on-pr: "true"
          html-report: "true"
          fail-on: "major"
```

---

## 🧪 Verification & Testing

```bash
# Run full verification pipeline (formatting, linting, strict types, 151 unit tests, and build)
npm run verify
```

---

## 📄 License

MIT © [ihssmaheel-dev](https://github.com/ihssmaheel-dev)
