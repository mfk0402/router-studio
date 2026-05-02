# Security

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for undisclosed security problems.

1. Open a **private** security advisory on GitHub (Repository → **Security** → **Advisories** → **Report a vulnerability**), or  
2. Email maintainers with enough detail to reproduce and assess impact.

We will acknowledge receipt and coordinate a fix and release timeline.

## Secrets and API keys

- **Never commit** OpenRouter API keys, GitHub tokens, signing certificates, or `.env` files containing secrets.
- Keys are stored only in the app’s local user data directory (see `src/main/secureStore.ts`); they are **not** part of this repository.
- If you accidentally pushed a secret: **revoke the key immediately** at the provider, then remove it from git history (e.g. `git filter-repo` or GitHub support) — a normal revert is not enough.

## Optional environment variables (maintainers / CI)

These are read at runtime and must **not** be hardcoded in the repo:

| Variable | Purpose |
| -------- | ------- |
| `ROUTER_STUDIO_UPDATES_URL` | Optional generic update feed URL for packaged builds (`src/main/updater.ts`) |
| `ELECTRON_RENDERER_URL` | Set by `electron-vite` in development only |

See `.env.example` for a safe template.
