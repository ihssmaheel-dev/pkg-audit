# pkg-audit

<div align="center">
  <img src="src/web/src/assets/logo.png" alt="pkg-audit logo" width="120" height="120" />
  <br />
  <br />
  <p><b>Developer-first dependency drift, hygiene, and semver conflict auditor for JS/TS monorepos.</b></p>
  <p>Scan any monorepo and open a clean local dashboard in under 10 seconds.</p>

  <p>
    <a href="https://github.com/ihssmaheel-dev/pkg-audit/actions"><img src="https://img.shields.io/github/actions/workflow/status/ihssmaheel-dev/pkg-audit/ci.yml?branch=main&style=flat-square&label=CI&color=00d992" alt="CI Status" /></a>
    <a href="https://www.npmjs.com/package/pkg-audit"><img src="https://img.shields.io/npm/v/pkg-audit?style=flat-square&color=00d992" alt="npm version" /></a>
    <a href="https://github.com/ihssmaheel-dev/pkg-audit/blob/main/package.json"><img src="https://img.shields.io/badge/node-%3E%3D18.18-101010?style=flat-square&logo=node.js&logoColor=00d992" alt="Node version" /></a>
    <a href="https://github.com/ihssmaheel-dev/pkg-audit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-101010?style=flat-square" alt="License" /></a>
  </p>
</div>

---

## Preview

<!-- UI Screenshot Placeholder: Main Dashboard -->
<div align="center">
  <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/dashboard-preview.png" alt="pkg-audit Dashboard Preview" width="100%" />
  <p><i>Dashboard: Monorepo Health Overview with 6 interactive Chart.js visualizations & KPI metrics</i></p>
</div>

<br />

<details>
  <summary><b>📷 More UI Screenshots & Views</b></summary>
  <br />

### Cross-Workspace Matrix Grid

  <!-- UI Screenshot Placeholder: Matrix View -->
  <p align="center">
    <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/matrix-preview.png" alt="Matrix Grid Preview" width="100%" />
  </p>

### Version Conflicts Breakdown

  <!-- UI Screenshot Placeholder: Conflicts View -->
  <p align="center">
    <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/conflicts-preview.png" alt="Conflicts Preview" width="100%" />
  </p>

### Outdated Dependencies & GitHub Changelogs

  <!-- UI Screenshot Placeholder: Outdated View -->
  <p align="center">
    <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/outdated-preview.png" alt="Outdated Changelogs Preview" width="100%" />
  </p>

### Workspace Manifests

  <!-- UI Screenshot Placeholder: Workspaces View -->
  <p align="center">
    <img src="https://raw.githubusercontent.com/ihssmaheel-dev/pkg-audit/main/docs/images/workspaces-preview.png" alt="Workspaces Preview" width="100%" />
  </p>

</details>

---

## Highlights

- **⚡ Blazing Fast** — Scans full monorepos with hundreds of workspaces in under 50 milliseconds.
- **📊 6-Chart Monorepo Intelligence** — Donut distributions, dependency compositions, workspace loads, and upstream drift charts powered by Chart.js.
- **🔍 Matrix Alignment Grid** — Cross-workspace view with cell drilldown and automated pin alignment recommendations.
- **⚠️ Conflict Detection** — Differentiates major breaking mismatches from range discrepancies with one-click markdown exports.
- **📦 Registry & Changelog Sync** — Live npm version queries with inline GitHub release notes.
- **🧹 Manifest Hygiene Audit** — Flags duplicate workspace names, missing package fields, engine drifts, and packageManager conflicts.
- **⌨️ Keyboard First** — Fast navigation via `Ctrl+K` / `Cmd+K` command palette and number hotkeys (`1`–`6`).
- **📄 Standalone HTML Export** — Generate portable, single-file offline reports for pull requests, audits, and Slack sharing.

---

## Quick Start

```bash
# One-shot scan with UI dashboard (no install required)
npx pkg-audit --ui

# Scan a specific repository directory
npx pkg-audit --ui ~/code/my-monorepo

# Install locally as dev dependency
npm i -D pkg-audit

# Install globally
npm i -g pkg-audit
```

---

## Usage

```bash
pkg-audit [dir] [options]
pkg-audit ui [dir]          # Alias of --ui
pkg-audit html [dir]        # Export standalone HTML report
pkg-audit json [dir]        # Machine-readable JSON output
```

| Invocation                        | Output / Behavior                                          |
| --------------------------------- | ---------------------------------------------------------- |
| `pkg-audit`                       | Scans current directory and prints terminal report         |
| `pkg-audit --ui`                  | Scans current directory and launches browser dashboard     |
| `pkg-audit --ui ~/code/shop`      | Scans target directory and launches browser dashboard      |
| `pkg-audit html`                  | Generates `pkg-audit-report.html` in current directory     |
| `pkg-audit json --out audit.json` | Emits structured JSON for CI and custom tooling            |
| `pkg-audit --outdated --ui`       | Scans repository, queries npm registry, opens dashboard    |
| `pkg-audit --watch --ui`          | Live-reloads dashboard automatically when manifests change |

---

## CLI Options

| Option                   | Description                                              | Default |
| ------------------------ | -------------------------------------------------------- | ------- |
| `--ui`                   | Launch local web dashboard in browser                    | `false` |
| `--html[=file]`          | Write standalone self-contained HTML report to file      | `false` |
| `--json[=file]`          | Emit structured JSON to stdout or specified file         | `false` |
| `--outdated`             | Query npm registry for latest version drift              | `false` |
| `--changelog`            | Fetch GitHub release notes and changelogs per package    | `false` |
| `--changelog-lines=N`    | Maximum lines of release notes to display                | `6`     |
| `--concurrency=N`        | Maximum concurrent registry requests                     | `8`     |
| `--top=N`                | Number of top shared dependencies to report              | `10`    |
| `--only-conflicts`       | Filter output to only packages with version conflicts    | `false` |
| `--workspace=<name>`     | Inspect dependencies for a single specified workspace    | `all`   |
| `--full`                 | Render full dependency matrix across all manifests       | `false` |
| `--watch`                | Watch `package.json` files and rescan automatically      | `false` |
| `--port=N`               | Custom port for `--ui` web server                        | `auto`  |
| `--no-open`              | Prevent opening browser window automatically with `--ui` | `false` |
| `--ignore-dir=a,b`       | Extra directory patterns to ignore during scan           | none    |
| `--no-gitignore`         | Ignore `.gitignore` exclusions during scanning           | `false` |
| `--fail-on=major\|range` | Exit with code 2 if conflicts at or above severity exist | none    |
| `-h, --help`             | Display help information                                 |         |
| `-v, --version`          | Display version number                                   |         |

---

## Dashboard Views

1. **Dashboard** — 6-up high-level KPI cards and 6 interactive Chart.js charts:
   - **Version Alignment** (Doughnut)
   - **Dependency Composition** (Doughnut)
   - **Dependencies by Workspace** (Horizontal Bar)
   - **Top Shared Dependencies** (Horizontal Bar)
   - **Outdated Semver Drift** (Vertical Column)
   - **Active Version Conflicts** (Color-coded Bar)
2. **Matrix** — Dense cross-workspace dependency matrix. Click any cell to view version details across workspaces and copy suggested alignment pins.
3. **Conflicts** — Grouped version conflicts categorized by Major breaking vs Range discrepancies with copy-to-clipboard markdown support.
4. **Outdated** — Real-time upstream semver drift with inline GitHub changelogs and release notes.
5. **Hygiene** — Monorepo sanity checks for duplicate package names, missing package fields, Node engines, and package manager consistency.
6. **Workspaces** — Dedicated dependency tables per workspace with uniform column widths and filter capabilities.

---

## Keyboard Shortcuts

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

## Configuration File

You can define default configuration options in `pkg-audit.config.js`, `pkg-audit.config.mjs`, `pkg-audit.config.cjs`, or under the `"pkg-audit"` key in `package.json`:

```javascript
export default {
  ignoreDirs: ["fixtures", "examples", "legacy"],
  top: 15,
  outdated: false,
  changelog: false,
  changelogLines: 6,
  concurrency: 8,
  respectGitignore: true,
  color: true,
}
```

_Precedence:_ CLI Arguments > Config File > Default Values.

---

## 🤖 Official GitHub Action & PR Bot

Automate dependency drift auditing on every Pull Request using the official GitHub Action. It analyzes cross-workspace changes, uploads a standalone HTML report artifact, and posts/updates a sticky rich PR comment with alignment scores, conflict tables, and hygiene alerts.

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
          fail-on: "major" # Optional: fail step if major version conflicts are introduced
```

### Action Inputs

| Input           | Description                                                            | Default               |
| :-------------- | :--------------------------------------------------------------------- | :-------------------- |
| `github-token`  | GitHub Token for posting or updating pull request comments             | `${{ github.token }}` |
| `comment-on-pr` | Whether to post or update a sticky summary comment on the Pull Request | `true`                |
| `html-report`   | Whether to generate and upload a standalone interactive HTML report    | `true`                |
| `fail-on`       | Fail the workflow step if conflicts exist (`major`, `range`, `none`)   | `none`                |
| `outdated`      | Query the npm registry for upstream version drift and release notes    | `false`               |
| `directory`     | Directory path of the monorepo root to audit                           | `.`                   |
| `report-name`   | Artifact name for the uploaded standalone HTML report                  | `pkg-audit-report`    |

---

## CI / CD Integration (CLI)

Integrate `pkg-audit` directly into CLI scripts or generic CI environments:

```json
{
  "scripts": {
    "audit:deps": "pkg-audit --ui",
    "audit:ci": "pkg-audit --fail-on major --html reports/dependency-audit.html"
  }
}
```

### Exit Codes

- `0` — Clean scan, no qualifying conflicts found.
- `1` — Scan or filesystem error.
- `2` — Conflicts detected exceeding `--fail-on` threshold.

---

## Development

```bash
# Clone and install dependencies
git clone https://github.com/ihssmaheel-dev/pkg-audit.git
cd pkg-audit
npm install

# Run CLI locally
npm run dev

# Run web UI in development mode
npm run dev:ui

# Execute test suite
npm test

# Run full verification (format, lint, typecheck, tests, build)
npm run verify
```

---

## Architecture

```
pkg-audit/
  src/
    scan/          Core scanner engine (zero UI dependencies)
    cli/           CLI parser, terminal report renderer
    server/        Local web server & API handlers
    web/           Preact + Tailwind CSS v4 Dashboard
    html/          Standalone HTML report bundler
    config/        Configuration loader & persistent state
    pick-folder/   Native directory dialog bindings
  test/
    fixtures/      Test monorepo fixture suite
```

---

## License

MIT © [ihssmaheel-dev](https://github.com/ihssmaheel-dev)
