**Do it — as a local visual audit tool, not a monitoring platform.** Global + local install with a folder picker is the right shape. “Shows everything perfectly” is not. The product is **one scan, one matrix, instant clarity**.

Below is the full plan: what to ship, how it runs, how the dashboard works, how you build it, and what you refuse.

---

## 1. Product in one sentence

`pkg-audit` scans a JS/TS monorepo (or a single package) and opens a **local dashboard** that makes **dependency drift, hygiene, and outdated packages** obvious in under 10 seconds.

Not Datadog. Not Socket. Not Renovate.  
The report you’d paste into Slack after “why is CI using two Reacts?”

**Name (check npm before you fall in love):** `pkg-audit` if free, else `pkglens`, `driftmatrix`, `workspacedrift`. I’ll call it `pkg-audit` here.

---

## 2. Who it’s for

| User                                 | Need                                                       |
| ------------------------------------ | ---------------------------------------------------------- |
| Monorepo team (8–80 `package.json`s) | See React/TS/zod drift across apps                         |
| Staff/platform engineer              | Hygiene: `packageManager`, `engines.node`, duplicate names |
| Someone who cloned a messy repo      | `npx pkg-audit --ui` and understand the tree               |
| CI                                   | HTML artifact on the PR                                    |

Not for: solo todo apps, security CVEs, license legal, “is lodash 3 days behind.”

---

## 3. Design principles (this is how it stays “great”)

1. **Matrix first.** The first screen is package × workspace. Everything else is a filter or a drawer.
2. **One job per pixel.** No charts-for-charts, no world maps, no animated counters.
3. **Keyboard-first.** Search, filters, j/k, `⌘K`, `Esc` close drawer.
4. **Honest data.** If you don’t know, say unknown — never fake “up to date.”
5. **Local only.** `127.0.0.1`, no account, no telemetry, no cloud.
6. **Same engine everywhere.** CLI, JSON, HTML, dashboard — one scanner.
7. **Empty states are product.** No packages, bad path, offline registry, rate limit — each has a clear next action.
8. **Density with calm.** Like Linear / Vite inspect / Playwright report. Tight tables, one accent color, no glassmorphism junk.

If a feature doesn’t make drift easier to _see_ or _act on_, it doesn’t ship.

---

## 4. Install & run model

### 4.1 Three ways to install

```bash
# one-shot, no install
npx pkg-audit --ui

# local, team-shared
npm i -D pkg-audit
pnpm add -D pkg-audit

# global, any folder on the machine
npm i -g pkg-audit
```

`package.json`:

```json
{
  "scripts": {
    "audit:deps": "pkg-audit",
    "audit:deps:ui": "pkg-audit --ui"
  }
}
```

### 4.2 Commands (global and local are the same binary)

```text
pkg-audit [dir] [options]
pkg-audit ui [dir]          # alias of --ui
pkg-audit html [dir]        # write standalone report
pkg-audit json [dir]        # machine output
```

| Invocation                               | Behavior                             |
| ---------------------------------------- | ------------------------------------ |
| `pkg-audit`                              | Scan cwd, terminal report            |
| `pkg-audit --ui`                         | Scan cwd, open dashboard             |
| `pkg-audit --ui ~/code/shop`             | Scan that folder, open dashboard     |
| `pkg-audit ui` (cwd has no package.json) | Open dashboard on **project picker** |
| `pkg-audit html`                         | `pkg-audit-report.html` in cwd       |
| `pkg-audit json --out audit.json`        | CI / editor integrations             |
| `pkg-audit --outdated --ui`              | Scan + registry + dashboard          |
| `pkg-audit --watch --ui`                 | Rescan on `package.json` changes     |

Global vs local is **only how the binary is found**. Behavior does not fork.

### 4.3 Global folder selection (this is the UX you asked for)

Browsers cannot safely become a Node filesystem. Do **not** build Electron for v1.

**Three layers, in order:**

**A. CLI (before the browser)**  
If `--ui` and no dir, and cwd has no `package.json` / workspace file:

```text
No package.json in /Users/you
  1. Type a path
  2. Recent projects
  3. Open dashboard and pick there

Recent:
  › ~/code/architecture
    ~/code/shop
    ~/oss/vite
```

Arrow keys, Enter, or paste a path. Then open the browser.

**B. Dashboard header — always a project switcher**

```text
◎  ~/code/architecture    Change  ▾
     architecture-monorepo · 14 packages · scanned 1.2s ago
```

Dropdown:

- Current path (editable, Enter to rescan)
- Recents (last 15)
- Favorites (pin)
- Browse… → native dialog via **CLI helper**, not the browser

**C. “Browse” without Electron**  
`POST /api/pick-folder` from the UI → server runs a tiny native picker:

- macOS: `osascript` choose folder
- Linux: `zenity` / `kdialog` if present
- Windows: PowerShell `FolderBrowserDialog`
- Fallback: path text field + validation

Recents live in `~/.config/pkg-audit/state.json` (or `%APPDATA%\pkg-audit`). Never in the project.

**Validate every path on the server:** exists, is directory, not `/`, not `C:\`, reject if it looks like a whole disk. Confirm if `package.json` count > 250.

---

## 5. What the dashboard shows

Four surfaces. Not twelve.

### 5.1 Shell (every page)

```text
┌─────────────────────────────────────────────────────────────────────┐
│  pkg-audit    [search packages, workspaces, versions…]        ⌘K   │
│  ~/code/architecture          Scan    Outdated    HTML    · 1.1s  │
│                                                                     │
│  [Matrix]  [Conflicts 6]  [Outdated 12]  [Hygiene 2]  [Workspaces] │
│                                                                     │
│  Filters:  All ▾   Major only   Prod only   Search workspaces      │
│                                                                     │
│  …main view…                                                        │
│                                                                     │
│  14 manifests · 612 declarations · 6 conflicts (3 major) · 0 err    │
└─────────────────────────────────────────────────────────────────────┘
```

- Left or top nav is **tabs**, not a SaaS sidebar of fake modules.
- Status strip is always visible: counts + last scan time + errors.
- `Scan` is the primary button. `Outdated` is explicit (network). Never auto-hit npm on every open unless the user opted in last time.

### 5.2 Matrix (home — the product)

Rows = dependency names. Columns = workspaces. Cell = declared version.

```text
                 web         mobile      api        ui-kit      admin
react            19.0.0      18.3.1      —          19.0.0      19.0.0
                 ✗ major

zod              ^3.23.8     ^3.23.8     ^3.22.4    catalog:    ^3.23.8
                 ⚠ range

typescript       5.6.3       5.6.3       5.6.3      5.6.3       5.6.3
                 ✓
```

**Color (one language, everywhere):**

| State            | Meaning                                              |
| ---------------- | ---------------------------------------------------- |
| Green / quiet    | Aligned                                              |
| Amber            | Range differs, same major                            |
| Red              | Major differs                                        |
| Muted dash       | Not a dependency there                               |
| Purple/cyan mark | `workspace:` / `catalog:` / `link:` (not a conflict) |
| Stripe / italic  | Peer or optional (filterable)                        |

**Interactions:**

- Click cell → drawer: workspace, field (`dependencies` vs `dev`), range, path to `package.json`, copy path.
- Click package name → all versions of that package, “align to X” suggestion.
- Click workspace header → that workspace’s full dep list.
- Sticky first column + sticky header. Horizontal scroll for 20+ apps.
- Sort rows: conflicts first (default), then name, then # of workspaces.
- Hide aligned rows toggle (default **on** for large repos — show the problem, not 400 green checkmarks).
- Column groups if you later detect `apps/` vs `packages/` — v1.1, not v1.

This is the “awesome” part. Spend 60% of UI time here.

### 5.3 Conflicts

Same data as the matrix, as a list for people who hate wide tables.

```text
✗ react · major version differs
    web      19.0.0     prod
    admin    19.0.0     prod
    mobile   18.3.1     prod

⚠ zod · range differs
    ...
```

Actions:

- Copy a summary (markdown for Slack/PR).
- Copy suggested pin (`"react": "19.0.0"`).
- Filter major / range.

Do **not** auto-edit `package.json` in v1. Suggest + copy. Write-backs are how you destroy trust.

### 5.4 Outdated / versions

Only after user runs Outdated (or `--outdated`).

Columns: package · current (highest declared) · latest · bump (major/minor/patch) · used in N workspaces.

- Expand row → changelog (title, date, N lines, link to GitHub).
- Sticky GitHub rate-limit banner: stop fetching, show what you have, “try later.”
- Scoped packages must work (`@scope%2Fname`). Ship this in the engine before any UI polish.
- `--versions` equivalent: “show all” toggle including up-to-date and private/unpublished.

### 5.5 Hygiene

Cards, not a junk drawer:

- Unnamed manifests (with “likely not a workspace”)
- Duplicate `name`s
- `packageManager` mismatch
- `engines.node` mismatch

Each row: message, paths, severity. Click path → workspace detail.

### 5.6 Workspaces

The current CLI list, but useful:

- Path, name, version, private, root, dep counts
- Click → full dep table + which of those deps conflict
- Search / sort

### 5.7 Command palette (`⌘K`)

```text
> react
  Package · react
  Workspace · apps/web
  Action · Rescan
  Action · Check outdated
  Action · Export HTML
  Action · Copy conflicts as markdown
  Recent · ~/code/shop
```

This is what makes it feel “perfect” without adding screens.

---

## 6. Visual system (concrete, not “make it pretty”)

**Vibe:** Playwright HTML report × Linear. Dark-first, light supported.

- Font: system UI + `ui-monospace` for versions and paths.
- Radius: 8px cards, 6px chips. No 24px blobs.
- Accent: one color (cyan or lime) for interactive. Red/amber only for status.
- Don’t use red for “major” _and_ buttons _and_ errors without a second cue (icon + text).
- Density: comfortable default, `Compact` toggle for 30+ workspaces.
- Motion: 120–180ms fades. No bounce, no skeleton shimmer forever.
- Color is never the only signal (✗ ⚠ ✓ ·).
- Respect `prefers-reduced-motion` and `NO_COLOR` for the CLI.

**Empty / error states (write the copy now):**

| State            | Copy + action                                                                          |
| ---------------- | -------------------------------------------------------------------------------------- |
| Bad path         | “That folder doesn’t exist.” → edit path                                               |
| No package.json  | “Nothing to audit here.” → parent dir / picker                                         |
| All aligned      | “No version conflicts. Every shared dependency is aligned.” + still show matrix toggle |
| Offline outdated | “Registry unreachable. Conflicts and hygiene don’t need the network.”                  |
| Rate limited     | “GitHub rate limit hit. Changelogs paused.”                                            |
| Huge repo        | “312 manifests. Scan anyway? Add ignore dirs.”                                         |

---

## 7. Feature scope by version

### v1 — ship this or don’t ship

- Extract current scanner into a library
- Fix: scoped npm `/latest`, sticky GH rate limit, changelog `--outdated` imply, worker try/catch
- CLI: terminal report (keep), `--json`, `--ui`, `--html`, `[dir]`
- Local server on `127.0.0.1`, random port, token in URL
- Project picker + recents (global use)
- Dashboard: matrix, conflicts, workspaces, hygiene, search, drawer
- Outdated + changelog panel (opt-in button)
- Export standalone HTML (same views, data baked in, no server)
- `--ignore-dir`, gitignore on, `--no-color`, `--help`
- Copy markdown summary
- Dark/light, compact, keyboard, ⌘K

### v1.1 — right after first users

- Workspace-aware roots: `pnpm-workspace.yaml`, `package.json#workspaces`, npm/yarn/bun
- Mark nested fixtures/examples as “not a workspace” (toggle)
- Filter matrix to one workspace / one glob (`apps/*`)
- Config file (see §9)

### v2 — only if v1 is used

- Read lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`) and show **resolved** vs declared
- `--watch`
- “Align to version” **preview** (diff, don’t write)
- Compare two scans (save last JSON in `~/.config/pkg-audit/cache/`)

### v3 — maybe never

- PR comments bot
- Auto-write catalog/workspace pins
- Security/CVEs
- Hosted multi-tenant
- Electron app
- Historical charts / “drift over time” SaaS

---

## 8. Architecture

```text
pkg-audit/
  src/
    cli/                 parse args, help, prompts, open browser
    scan/                find + parse + conflicts + hygiene  (pure)
    registry/            npm outdated + github changelog
    report/              terminal renderer (keep what you have)
    server/              localhost API + static dashboard
    web/                 dashboard app (Vite)
    html/                inject scan JSON into a single HTML file
    config/              load pkg-audit.config.* + state.json
    pick-folder/         native dialog helpers
  public/ or dist/ui/    built dashboard assets
  package.json
```

**Rules:**

- `scan/` has **zero** UI imports. Test it with fixtures.
- Dashboard never re-implements conflict logic. It only renders JSON.
- `--html` = `scan()` + inline `window.__PKG_AUDIT__` + built CSS/JS.
- `--ui` = `scan()` + `http.createServer` (or `node:http`) + SSE/websocket optional for watch later.
- Bind **only** `127.0.0.1`. Query token required. Refuse `0.0.0.0`.
- No `postinstall` scripts. No network on install.

### 8.1 API (local server)

```text
GET  /                     dashboard
GET  /api/health
GET  /api/scan?dir=
POST /api/scan             { dir, outdated, changelog, ignoreDirs }
POST /api/pick-folder
GET  /api/recents
POST /api/recents/pin
GET  /api/export.html
```

Scan is cancellable. Big scans stream progress:

```text
{ phase: "walk", files: 40 }
{ phase: "parse", done: 40 }
{ phase: "outdated", done: 12, total: 80 }
{ phase: "done", result }
```

UI shows a thin progress bar + “40 package.json found…” — never a blank spinner.

### 8.2 JSON contract (freeze this)

```ts
{
  version: 1,
  root: string,
  scannedMs: number,
  workspaces: Workspace[],
  conflicts: Conflict[],
  hygieneIssues: HygieneIssue[],
  outdated: OutdatedResult | null,
  errors: ScanError[],
  meta: { ignoredDirs, skippedGitignored, toolVersion }
}
```

Bump `version` when you break it. CLI, HTML, and UI all consume this.

### 8.3 Tech choices (opinionated)

| Layer        | Choice                                       | Why                                |
| ------------ | -------------------------------------------- | ---------------------------------- |
| Scanner      | Your existing Node, ESM                      | Already good                       |
| CLI prompts  | `node:readline` or tiny `prompts`            | Keep deps low                      |
| Server       | `node:http` + manual routes                  | No Express needed                  |
| Dashboard    | Vite + Preact + CSS                          | Small, fast, enough structure      |
| Grid         | Virtualized table (e.g. `@tanstack/virtual`) | 80×80 cells will choke a naive DOM |
| Open browser | `node:child_process` + platform open         | Avoid extra dep if you can         |
| Tests        | node:test + fixture monorepos                | Scan logic must be locked          |

Do **not** use Next.js, Tailwind-in-the-report-if-it-needs-a-CDN, or a component library that weighs more than the scanner.

HTML export must work as `file://` (or a static CI artifact) with **no** external requests except optional changelog links the user clicks.

---

## 9. Config & DX

`pkg-audit.config.js` / `pkg-audit.config.ts` / `"pkg-audit"` key in `package.json`:

```js
export default {
  ignoreDirs: ["fixtures", "examples"],
  top: 15,
  outdated: false,
  changelog: false,
  changelogLines: 6,
  concurrency: 8,
  respectGitignore: true,
  color: true,
}
```

Priority: CLI flags > config file > defaults.

Also:

- `PKG_AUDIT_NO_OPEN=1` for CI
- `--port 4173` / `--no-open`
- Exit codes: `0` clean, `1` scan errors, `2` major conflicts (opt-in `--fail-on major`) so CI can gate
- README: 30-second GIF of the matrix, then commands
- `--help` matches README (you already drifted once)

**Local DX for contributors using it in a repo:**

```json
{
  "scripts": {
    "deps": "pkg-audit --ui",
    "deps:ci": "pkg-audit --fail-on major --html reports/deps.html"
  }
}
```

**Global DX:**

```text
pkg-audit ui
→ picker if needed
→ recents
→ same dashboard
```

First-run: no tutorial modal. One quiet line in the header: “Click a red cell. Press ⌘K.”

---

## 10. Package publish shape

```json
{
  "name": "pkg-audit",
  "version": "1.0.0",
  "type": "module",
  "bin": { "pkg-audit": "./dist/cli.js" },
  "exports": {
    ".": "./dist/index.js",
    "./scan": "./dist/scan/index.js"
  },
  "files": ["dist"],
  "engines": { "node": ">=18.18" },
  "sideEffects": false
}
```

- Programmatic API: `scan(dir, opts)` → same JSON. So someone can build a VS Code view later without forking.
- Publish **built** UI inside `dist/ui`. Users don’t need Vite.
- CI: test scanner fixtures + `pkg-audit --json` snapshot on a sample monorepo.
- Changelog for the tool itself. Dogfood.

---

## 11. Implementation sequence (do this order)

Don’t start in Figma for three weeks.

1. **Engine extraction + bugfix week**  
   Library + CLI still works. Fix scoped registry, rate limit, last-write dep type, changelog imply outdated.

2. **Freeze JSON schema + `--html` dump**  
   Ugly HTML table is fine. Proves the contract.

3. **Local server + open browser**  
   Serves the ugly table from live scan. Prove folder arg + cwd.

4. **Project picker + recents + path validation**  
   This is the global-install story. Ship it before polish.

5. **Real dashboard: matrix + drawer + conflicts**  
   Virtualize. Keyboard. Filters. Dark theme.

6. **Hygiene + workspaces + command palette**

7. **Outdated + changelog in UI**  
   Progress events. Rate-limit banner.

8. **Standalone HTML export** that looks the same (read-only, project switcher hidden).

9. **Config, `--fail-on`, README, GIFs, npm publish `0.1.0`**

10. **Workspace-protocol awareness + ignore suggestions** (1.1)

Estimate if you stay ruthless: **2–3 focused weeks to a 0.1 you can run on a real monorepo**, then 1 week of matrix polish. A “perfect” SaaS-looking shell will take 3 months and hide the matrix. Don’t.

---

## 12. Dashboard UX details people feel

- Rescan is instant if the tree didn’t change (mtime hash of found `package.json`s). Show “unchanged, skipped walk.”
- Outdated results cache in `~/.config/pkg-audit/cache/npm/` with TTL (12h). Don’t hammer the registry.
- Column resize + “fit workspaces.”
- Hover a cell: tooltip with type + version; click for drawer (tooltip isn’t enough).
- Multi-select packages in conflicts → one markdown blob.
- `?` shortcut overlay.
- If scan has parse errors, banner: “3 files failed” → jump list. Don’t swallow them.
- Folder switch: fade content, don’t remount a loading splash that feels like a web app login.

---

## 13. What you will not build (write this in the README)

- Accounts, teams, cloud sync
- CVE / malware / license legal
- Auto-PRs (Renovate’s job)
- Editing `package.json` in v1
- Mobile-responsive dashboard as a goal (it should work, but design for laptop)
- Plugins marketplace
- Electron wrapper
- “AI explain my deps”

Saying no is how this stays clean.

---

## 14. Success criteria

v1 is successful if:

1. `npm i -g pkg-audit && pkg-audit ui` → pick `~/code/some-monorepo` → matrix in < 3s for ~20 packages.
2. `npx pkg-audit --ui` inside a repo works with zero config.
3. A teammate who didn’t write the tool can find the React major drift without you talking.
4. HTML artifact opens from GitHub Actions with the same matrix.
5. No network required for conflicts + hygiene.
6. You are not embarrassed by scoped packages or a hung changelog fetch.

If (3) fails, the UI is not “awesome” no matter how it looks.

---

## 15. Verdict on your idea

| Piece                          | Verdict                                              |
| ------------------------------ | ---------------------------------------------------- |
| npm package, local + global    | Yes                                                  |
| Global → select folder → audit | Yes — picker + recents + header switcher             |
| Dashboard                      | Yes — **matrix-centric local report**                |
| “Shows everything perfectly”   | No — show **conflicts, hygiene, outdated** perfectly |
| Hosted monitoring              | No                                                   |

That’s a real package: **webpack-bundle-analyzer for workspace alignment**.
