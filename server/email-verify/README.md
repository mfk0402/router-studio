# Email verification server

Small HTTP service used by **Router Studio** during account registration when `ROUTER_STUDIO_VERIFY_URL` is set on the packaged app (or in dev).

## Endpoints

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/v1/request-code` | `{ "email": "..." }` | Send a 6-digit code to the inbox |
| POST | `/v1/verify-code` | `{ "email": "...", "code": "123456" }` | Validate code, return `registrationToken` |
| POST | `/v1/consume-token` | `{ "email": "...", "registrationToken": "..." }` | One-time use after local account is allowed |

## Environment

- `PORT` — default `8787`
- `VERIFY_SERVER_SECRET` — required in production; used to HMAC verification codes (min 16 chars recommended)
- `VERIFY_API_KEY` — optional; if set, clients must send `Authorization: Bearer <same value>` (set `ROUTER_STUDIO_VERIFY_API_KEY` in the Electron app to match)
- `RESEND_API_KEY` + `RESEND_FROM` — optional; if `RESEND_API_KEY` is set, codes are emailed via [Resend](https://resend.com). Otherwise the code is printed to the server console (dev only).

## Client (Electron)

```text
ROUTER_STUDIO_VERIFY_URL=http://127.0.0.1:8787
ROUTER_STUDIO_VERIFY_API_KEY=your-shared-secret   # optional, must match VERIFY_API_KEY
```

Dev bypass (no server):

```text
ROUTER_STUDIO_VERIFY_SKIP=1
```

Only active when the app is **not** packaged.

## Run

From repo root:

```bash
npm run verify-server
```

Deploy the same `server.mjs` to any Node 20+ host (Railway, Fly, a VPS, etc.) and point `ROUTER_STUDIO_VERIFY_URL` at the public `https` URL.
