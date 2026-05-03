# Contributing

Thanks for helping improve Router Studio.

## Development setup

- **Node.js 20+** and **npm 10+** (see `package.json` `engines`).
- Clone the repo, then:

```bash
npm install
npm run dev
```

## Before opening a PR

1. Run **`npm run typecheck`** and **`npm run verify`** (same as **`npm test`** — typecheck + production build).
2. For release-related changes, optionally run **`npm run pack:check`** (dry-run of the published tarball layout).
3. Do **not** add real API keys, tokens, or personal paths. Use Settings in the app for keys locally.
4. Keep changes focused on one concern when possible.

## Code style

- Match existing TypeScript / React patterns in `src/`.
- Prefer clear names and small, reviewable diffs over drive-by refactors.

## License

By contributing, you agree your contributions will be licensed under the same terms as the project ([MIT](LICENSE)).
