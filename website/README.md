# Router Studio — marketing site

Static pages under `website/` for product launches, GitHub Pages, or any static host.

## Preview locally

From the repository root:

```bash
npm run website:serve
```

Open `http://localhost:4173`.

## Deploy

- **GitHub Pages**: Configure Pages to publish the `website/` folder (or copy its contents to `docs/` / root as your workflow requires).
- **Absolute URLs**: For rich social previews (`og:image`, `twitter:image`), set image and `og:url` to your real public base URL (for example `https://YOUR_DOMAIN/` or your `github.io` URL) in `index.html`.
- **Optional media**: Screen recordings in `assets/media/` are layered on scroll backdrops; filenames are listed in `app.js` (`MEDIA_PATHS`).

## Files

| Path | Purpose |
|------|---------|
| `index.html` | Landing page — capability map (aligned with in-app roadmap), download, features, account flow preview |
| `styles.css` / `app.js` | Styles; scroll + theme + account UI (login / register + verification step order matches the app) |
| `assets/app-icon.png` | Favicon, Apple touch icon, nav lockup (copy of app `resources/icon.png`) |
| `assets/og-card.png` | Open Graph / Twitter card image (same source; update when branding changes) |
| `assets/logo-icon.png` | Alternate small mark (optional; app renderer asset copy) |
| `assets/hero-illustration.svg` | Hero product diagram |
| `legal/privacy.html` | Privacy summary + README deep link |
| `legal/third-parties.html` | OpenRouter & deployment disclosures |
| `README.md` | This file |

**Account on the website:** the **Account** button opens a modal that mirrors the desktop flow (sign in, or create account → send code → verify). The site does not store accounts or send email; it directs users to **File → Router Studio account…** in the app and links to `server/email-verify/README.md` for optional email verification.

Full app documentation, build instructions, and keyboard shortcuts remain in the repository [README](https://github.com/mfk0402/router-studio#readme).