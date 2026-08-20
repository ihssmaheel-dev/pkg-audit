# Contributing to pkg-audit

Thank you for your interest in contributing to **pkg-audit**! We are committed to building a fast, developer-first dependency drift, hygiene, and semver conflict auditor for JavaScript and TypeScript monorepos.

---

## 📜 Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating in the community.

---

## 🛠️ Development Setup

### Prerequisites

- **Node.js**: `>= 18.18.0` (LTS recommended, e.g. Node 20 or 22)
- **npm**: `>= 9.0.0`
- **Git**

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ihssmaheel-dev/pkg-audit.git
cd pkg-audit

# 2. Install dependencies (installs Husky git hooks automatically)
npm install

# 3. Verify setup
npm run verify
```

---

## 📂 Architecture Overview

`pkg-audit` is intentionally structured into decoupled modules:

```
pkg-audit/
├── src/
│   ├── scan/          # Core analysis engine (pure TypeScript, zero UI dependencies)
│   │   ├── conflicts.ts    # Dependency map & conflict detection algorithms
│   │   ├── hygiene.ts      # Workspace manifest hygiene & sanity rules
│   │   ├── graph.ts        # Topological DAG & circular dependency cycle detection
│   │   ├── unused.ts       # Phantom AST import scanner & dead dependency detector
│   │   ├── security.ts     # Google OSV vulnerability lookup & patch resolver
│   │   ├── dedupe.ts       # Lockfile parser & physical disk size impact calculator
│   │   ├── deprecation.ts  # npm registry deprecation & abandoned package audit
│   │   ├── license.ts      # SPDX extraction & copyleft compliance checker
│   │   ├── suppressions.ts # Expiry-based suppression engine (.pkg-audit-ignore.json)
│   │   ├── cache.ts        # Persistent disk cache with TTL & offline support
│   │   ├── boundaries.ts   # Architectural cross-boundary import enforcer
│   │   └── context.ts      # AI Monorepo prompt & context generator
│   ├── cli/           # CLI argument parser, terminal reporter, PR comment generator
│   ├── server/        # Lightweight local HTTP server with token-based security
│   ├── web/           # Preact + Tailwind CSS v4 reactive web dashboard
│   ├── html/          # Standalone single-file HTML export generator
│   ├── config/        # Config file loader & persistent state management
│   └── pick-folder/   # Cross-platform native OS directory dialogs
├── test/              # Comprehensive Vitest test suites & fixture monorepo
├── docs/              # Documentation assets and preview screenshots
└── scripts/           # Automation utilities (e.g. headless screenshot captures)
```

---

## 💻 Available Scripts

| Command                | Description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`          | Run the CLI directly using `tsx`                                                |
| `npm run dev:ui`       | Boot the CLI and launch the local web dashboard                                 |
| `npm run build`        | Build both TypeScript compiler output (`dist/`) and Vite UI bundle (`dist/ui/`) |
| `npm test`             | Run the full test suite with Vitest                                             |
| `npm run test:watch`   | Run Vitest in interactive watch mode                                            |
| `npm run typecheck`    | Run `tsc --noEmit` on both Node server and browser Web UI                       |
| `npm run lint`         | Check ESLint rules across all files                                             |
| `npm run lint:fix`     | Automatically fix ESLint violations                                             |
| `npm run format`       | Format the entire codebase with Prettier                                        |
| `npm run format:check` | Verify formatting consistency with Prettier                                     |
| `npm run verify`       | Complete pre-flight check: format, lint, typecheck, test, and build             |

---

## 🧪 Testing Guidelines

We maintain high test coverage across all scanning, CLI, and server operations:

1. **Unit Tests**: All new features or bug fixes in `src/scan/*` must include comprehensive test cases under `test/*.test.ts`.
2. **Fixture Testing**: Test complex multi-workspace scenarios against `test/fixtures/mono`.
3. **No External Network Calls in Tests**: Use `vi.stubGlobal("fetch", ...)` or `getScanCache().clear()` when testing network-dependent features to ensure determinism.
4. Always ensure `npm run verify` passes completely before opening a pull request.

---

## 📝 Commit Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new user-facing feature or CLI capability
- `fix:` A bug fix
- `docs:` Documentation changes only
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `perf:` Performance improvements
- `test:` Adding or updating tests
- `chore:` Build process, tooling, or dependency maintenance

_Example:_

```bash
git commit -m "feat(security): add vulnerability SLA age tracking and CI break gate"
```

---

## 🚀 Pull Request Process

1. Fork the repository and create a descriptive branch: `git checkout -b feat/my-new-feature`.
2. Make your changes adhering to existing architectural patterns and clean code conventions.
3. Write/update unit tests to cover your changes.
4. Run the full verification suite:
   ```bash
   npm run verify
   ```
5. Submit your Pull Request against the `main` branch with a clear description of the problem, proposed solution, and testing performed.

Thank you for helping make `pkg-audit` awesome!
