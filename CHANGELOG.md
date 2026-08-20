# Changelog

All notable changes to **pkg-audit** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-08-20

### 🚀 Added

- **Core Scanning Engine**:
  - Blazing fast multi-workspace dependency parser and version conflict detector (`major` breaking vs `range` drift).
  - Graph topological analyzer with interactive SVG visualizer and circular dependency cycle detection.
  - Phantom (undeclared imports) scanner for `.ts`, `.tsx`, `.js`, `.vue`, and `.svelte` files.
  - Dead / unused dependency remover with 1-click package manifest remediation.
  - Manifest hygiene auditor checking for duplicate workspace names, missing package fields, Node engine drifts, and package manager consistency.
  - pnpm Catalogs (`catalog:`) plan generator and automatic migration applier.
- **Enterprise Features**:
  - **Suppression Engine with Expiration (`.pkg-audit-ignore.json`)**: Suppress specific CVEs, licenses, phantoms, or deprecations with mandatory `reason` and `expires` date. Expired suppressions automatically trigger warnings.
  - **Local Disk Cache with TTL & `--offline` Mode**: Persistent two-tier response cache under `.pkg-audit/cache/` avoiding redundant network calls.
  - **Vulnerability SLA Age Tracking & CI Gate (`--fail-on=critical:7d`)**: Google OSV security audit with first-seen history tracking and configurable SLA break gates.
  - **Cross-Boundary Import Enforcement Engine**: Static analyzer preventing shared packages from importing application code (`packages/*` ➔ `apps/*`).
  - **Lockfile Dedupe & Disk Size Impact Calculator**: Measures physical byte savings from collapsing duplicate transitive packages.
- **Web Dashboard**:
  - High-performance Preact + Tailwind CSS v4 interactive dashboard with dark/light themes.
  - 6 interactive Chart.js visualizations (alignment score, composition, workspace load, drift distribution).
  - Quick-action Command Palette (`Ctrl+K` / `Cmd+K`) and keyboard hotkeys.
  - Native OS directory picker and recent repositories switcher.
- **CLI & CI/CD Tooling**:
  - Rich ANSI colorized terminal reports with summary statistics.
  - Standalone single-file HTML report exporter (`pkg-audit html`).
  - Machine-readable JSON output for CI pipelines (`pkg-audit json`).
  - Official GitHub Action (`action.yml`) with sticky PR comment bot and alignment delta reporting.
- **Security & Governance**:
  - Token-authenticated local server with strict loopback CORS and per-request directory confinement.
  - Comprehensive `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`.
