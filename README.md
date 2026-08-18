# pkg-audit

Scan a JS/TS monorepo and open a local dashboard that makes dependency drift, hygiene, and outdated packages obvious in under 10 seconds.

Not Datadog. Not Socket. Not Renovate.
The report you'd paste into Slack after "why is CI using two Reacts?"

## Quick Start

```bash
# One-shot, no install
npx pkg-audit --ui

# Local, team-shared
npm i -D pkg-audit

# Global, any folder on the machine
npm i -g pkg-audit
```

## Usage

```text
pkg-audit [dir] [options]
pkg-audit ui [dir]          # alias of --ui
pkg-audit html [dir]        # write standalone HTML report
pkg-audit json [dir]        # machine output
```

| Invocation                        | Behavior                         |
| --------------------------------- | -------------------------------- |
| `pkg-audit`                       | Scan cwd, terminal report        |
| `pkg-audit --ui`                  | Scan cwd, open dashboard         |
| `pkg-audit --ui ~/code/shop`      | Scan that folder, open dashboard |
| `pkg-audit html`                  | `pkg-audit-report.html` in cwd   |
| `pkg-audit json --out audit.json` | CI / editor integrations         |
| `pkg-audit --outdated --ui`       | Scan + registry + dashboard      |
| `pkg-audit --watch --ui`          | Rescan on `package.json` changes |

## Options

| Option                   | Description                                  |
| ------------------------ | -------------------------------------------- |
| `--json[=file]`          | Emit JSON (stdout, or to file if given)      |
| `--html[=file]`          | Write standalone HTML report                 |
| `--ui`                   | Open local dashboard in browser              |
| `--workspace=<name>`     | Full dependency detail for one workspace     |
| `--full`                 | Full dependency matrix for every workspace   |
| `--outdated`             | Check versions against npm registry          |
| `--versions`             | Show ALL dependencies with current vs latest |
| `--changelog`            | Fetch GitHub release notes per package       |
| `--changelog-lines=N`    | Max lines of release notes (default 6)       |
| `--concurrency=N`        | Parallel registry requests (default 8)       |
| `--top=N`                | Show N most-shared dependencies (default 10) |
| `--only-conflicts`       | Skip workspace list, show only conflicts     |
| `--ignore-dir=a,b`       | Extra directory names to skip                |
| `--no-gitignore`         | Don't honor .gitignore files                 |
| `--no-color`             | Disable ANSI colors                          |
| `--no-open`              | Don't auto-open browser with `--ui`          |
| `--port=N`               | Port for `--ui` server                       |
| `--watch`                | Rescan on package.json changes               |
| `--fail-on=major\|range` | Exit with code 2 if conflicts found          |
| `-h, --help`             | Show help                                    |
| `-v, --version`          | Show version                                 |

## Dashboard Features

- **Matrix view** — package x workspace grid, click cells for details
- **Conflicts** — version drift across workspaces, copy as markdown
- **Outdated** — check against npm registry, see changelogs
- **Hygiene** — unnamed manifests, duplicate names, packageManager/engines mismatches
- **Workspaces** — full dependency list per workspace
- **Folder picker** — no project yet? Browse, type, or pick a recent/favorite folder
- **Command palette** — `Ctrl+K` to search packages, workspaces, actions
- **Dark/light theme** — respects system preference
- **Compact mode** — for repos with 30+ workspaces

## Keyboard Shortcuts

| Key                | Action                                                         |
| ------------------ | -------------------------------------------------------------- |
| `Ctrl+K` / `Cmd+K` | Command palette                                                |
| `Esc`              | Close drawer / palette                                         |
| `1-5`              | Switch tabs (matrix, conflicts, outdated, hygiene, workspaces) |

## Config File

`pkg-audit.config.js` / `pkg-audit.config.mjs` / `pkg-audit.config.cjs` / `"pkg-audit"` key in `package.json`:

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

## CI Integration

```json
{
  "scripts": {
    "deps": "pkg-audit --ui",
    "deps:ci": "pkg-audit --fail-on major --html reports/deps.html"
  }
}
```

- Exit code `0`: clean
- Exit code `1`: scan errors
- Exit code `2`: major conflicts (with `--fail-on major`)

Set `PKG_AUDIT_NO_OPEN=1` to prevent browser opening in CI.

## Development

```bash
npm install          # install deps (also sets up husky hooks)
npm run dev          # run the CLI via tsx
npm run dev:ui       # run the CLI with the dashboard
npm run build        # compile dist/ (tsc + vite)
npm run verify       # format check + lint + typecheck + tests + build
```

### Toolchain

- **TypeScript** — strict mode, NodeNext for node code, Bundler + preact automatic JSX for the dashboard
- **Vitest** — unit + integration tests in `test/` with a fixture monorepo
- **ESLint** (flat config + typescript-eslint) and **Prettier**
- **Husky + lint-staged** — format and lint on every commit
- **GitHub Actions** — CI runs lint, typecheck, tests, and a build on Node 18/20/22 for every push and PR
- **Icons, not emojis** — the dashboard ships an inline SVG icon set; there are no emoji glyphs anywhere in the UI or the CLI output

## Architecture

```
pkg-audit/
  src/
    scan/          Pure scanner library (zero UI imports)
    cli/           CLI entry point, arg parsing, terminal renderer
    server/        Local HTTP server (127.0.0.1 only)
    web/           Dashboard (Vite + Preact)
    html/          Standalone HTML export
    config/        Config file + state loading
    pick-folder/   Native folder picker helpers
  test/
    fixtures/      Fixture monorepo used by the integration tests
```

## What This Is NOT

- No accounts, teams, or cloud sync
- No CVE / malware / license scanning
- No auto-PRs (that's Renovate's job)
- No editing `package.json` in v1
- No Electron wrapper
- No "AI explain my deps"

## License

MIT
