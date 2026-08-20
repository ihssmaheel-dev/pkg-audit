# Security Policy

## Supported Versions

We actively maintain and support the latest minor release branch of `pkg-audit`:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

---

## Local Security Architecture

`pkg-audit` is designed for developer and CI usage:

- **Local Network Confinement**: The web server binds strictly to `127.0.0.1` (loopback interface) and does not listen on external network interfaces (`0.0.0.0`).
- **Session Authentication**: Every local server session generates a high-entropy cryptographic token (`crypto.randomBytes(16)`). Requests to all mutating and data endpoints require token authentication via query parameter or `Authorization: Bearer <token>` / `x-pkg-audit-token` headers.
- **CORS Scoping**: Cross-Origin Resource Sharing is strictly constrained to local loopback origins (`http://127.0.0.1:<port>` / `http://localhost:<port>`).
- **Filesystem Path Confinement**: All workspace manifest reads and destructive writes (`applyFixes`, `removeUnusedDependencies`, `declarePhantomDependencies`, `applySecurityFixes`, `applyCatalogPlan`) are strictly confined within the scanned repository root. Any directory traversal attempts (`..`, absolute paths outside root) are unconditionally rejected.

---

## Reporting a Vulnerability

If you discover a potential security vulnerability in `pkg-audit`, please report it responsibly:

1. **Email**: Open an issue or contact security maintainers directly at `security@pkg-audit.dev` (or via GitHub Private Vulnerability Reporting).
2. **Details to include**:
   - Description of the vulnerability.
   - Minimal reproducible test case or steps.
   - Potential impact and affected versions.

We appreciate responsible disclosure and aim to acknowledge all reports within 48 hours.
