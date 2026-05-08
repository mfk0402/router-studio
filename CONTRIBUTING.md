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

When upgrading **`vite`** / **`electron-vite`**, if npm resolves newer **`rollup`** or **`esbuild`** majors/minors, update **`optionalDependencies`** native package pins in **`package.json`** to match the versions nested under those packages in **`package-lock.json`** so Windows/macOS/Linux installs stay consistent.

## Code style

- Match existing TypeScript / React patterns in `src/`.
- Prefer clear names and small, reviewable diffs over drive-by refactors.

## Cutting a GitHub Release (desktop installers)

The repo ships a **Release** workflow (`.github/workflows/release.yml`). When you push a **version tag** whose name starts with `v`, GitHub Actions builds **Windows** (NSIS + zip), **Linux** (AppImage), and **macOS** (dmg + zip), then attaches them to a **[GitHub Release](https://github.com/mfk0402/router-studio/releases)**.

1. **Align the tag with `package.json` version**, e.g. version `1.0.1` → tag **`v1.0.1`**.
2. From `main`:

   ```bash
   npm run typecheck
   npm run test   # optional but recommended (= unit tests + verify)
   git tag -a v1.0.1 -m "Release v1.0.1"
   git push origin v1.0.1
   ```

3. Watch **Actions → Release**. When finished, installers appear under the new Release.
4. **Local builds:** `npm run build:win` / `build:mac` / `build:linux` write to **`release/`**. Close any running Router Studio instance first—Windows often locks `release/win-unpacked/*.asar`.

**Signing (optional)** — CI supports the same secrets as `package-desktop` in [`ci.yml`](.github/workflows/ci.yml): **`WIN_*`** for Windows code signing (PFX) and **`CSC_*`** for macOS. Without secrets, installers are built **unsigned**.

## License

By contributing, you agree your contributions will be licensed under the same terms as the project ([MIT](LICENSE)).
