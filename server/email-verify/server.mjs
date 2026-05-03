/**
 * Minimal registration email verification API for Router Studio.
 * See README.md in this folder.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = parseInt(process.env.PORT || '8787', 10);
const SERVER_SECRET = process.env.VERIFY_SERVER_SECRET || 'dev-only-change-me';
const VERIFY_API_KEY = process.env.VERIFY_API_KEY?.trim();
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const RESEND_FROM = process.env.RESEND_FROM || 'Router Studio <onboarding@resend.dev>';

/** @type {Map<string, { codeHash: string, exp: number }>} */
const pendingCodeByEmail = new Map();
/** @type {Map<string, { email: string, exp: number }>} */
const registrationTokenBySecret = new Map();
/** @type {Map<string, number>} */
const lastRequestByEmail = new Map();

const CODE_TTL_MS = 15 * 60 * 1000;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function normEmail(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function validEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function hashCode(emailNorm, digits) {
  return crypto
    .createHmac('sha256', SERVER_SECRET)
    .update(`${emailNorm}:${digits}`)
    .digest('hex');
}

function authOk(req) {
  if (!VERIFY_API_KEY) return true;
  const h = req.headers.authorization;
  return h === `Bearer ${VERIFY_API_KEY}`;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function sendMailWithResend(to, subject, textBody) {
  if (!RESEND_API_KEY) {
    console.log(`[email-verify] (no RESEND_API_KEY) mail to ${to}:\n${textBody}\n`);
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject,
      text: textBody,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Resend error ${r.status}: ${t}`);
  }
}

function prune() {
  const now = Date.now();
  for (const [k, v] of pendingCodeByEmail) {
    if (v.exp <= now) pendingCodeByEmail.delete(k);
  }
  for (const [k, v] of registrationTokenBySecret) {
    if (v.exp <= now) registrationTokenBySecret.delete(k);
  }
}

async function handleRequest(req, res) {
  if (!authOk(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/$/, '') || '/';

  let body = '';
  for await (const chunk of req) body += chunk;
  let json = {};
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON' });
    return;
  }

  prune();

  if (path === '/v1/request-code') {
    const email = normEmail(json.email);
    if (!validEmail(email)) {
      sendJson(res, 400, { error: 'Invalid email' });
      return;
    }
    const last = lastRequestByEmail.get(email) || 0;
    if (Date.now() - last < RESEND_COOLDOWN_MS) {
      sendJson(res, 429, { error: 'Please wait before requesting another code.' });
      return;
    }
    lastRequestByEmail.set(email, Date.now());

    const digits = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = hashCode(email, digits);
    pendingCodeByEmail.set(email, { codeHash, exp: Date.now() + CODE_TTL_MS });

    try {
      await sendMailWithResend(
        email,
        'Your Router Studio verification code',
        `Your verification code is: ${digits}\n\nIt expires in 15 minutes. If you did not request this, ignore this email.`,
      );
    } catch (e) {
      pendingCodeByEmail.delete(email);
      sendJson(res, 500, { error: (e && e.message) || 'Failed to send email' });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (path === '/v1/verify-code') {
    const email = normEmail(json.email);
    const codeRaw = String(json.code || '').replace(/\D/g, '');
    if (!validEmail(email) || codeRaw.length !== 6) {
      sendJson(res, 400, { error: 'Invalid email or code' });
      return;
    }
    const pending = pendingCodeByEmail.get(email);
    if (!pending || pending.exp <= Date.now()) {
      pendingCodeByEmail.delete(email);
      sendJson(res, 400, { error: 'Code expired or not found. Request a new one.' });
      return;
    }
    const want = Buffer.from(pending.codeHash, 'hex');
    const got = Buffer.from(hashCode(email, codeRaw), 'hex');
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
      sendJson(res, 400, { error: 'Incorrect code.' });
      return;
    }
    pendingCodeByEmail.delete(email);
    const registrationToken = crypto.randomBytes(32).toString('hex');
    registrationTokenBySecret.set(registrationToken, {
      email,
      exp: Date.now() + TOKEN_TTL_MS,
    });
    sendJson(res, 200, { registrationToken });
    return;
  }

  if (path === '/v1/consume-token') {
    const email = normEmail(json.email);
    const registrationToken = String(json.registrationToken || '').trim();
    if (!validEmail(email) || !registrationToken) {
      sendJson(res, 400, { error: 'Invalid payload' });
      return;
    }
    const rec = registrationTokenBySecret.get(registrationToken);
    if (!rec || rec.exp <= Date.now()) {
      registrationTokenBySecret.delete(registrationToken);
      sendJson(res, 400, { error: 'Invalid or expired verification session.' });
      return;
    }
    if (rec.email !== email) {
      sendJson(res, 400, { error: 'Email does not match verification session.' });
      return;
    }
    registrationTokenBySecret.delete(registrationToken);
    sendJson(res, 200, { consumed: true });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  void handleRequest(req, res).catch((err) => {
    console.error('[email-verify]', err);
    sendJson(res, 500, { error: 'Internal error' });
  });
});

server.listen(PORT, () => {
  console.log(`[email-verify] listening on http://127.0.0.1:${PORT}`);
  if (SERVER_SECRET === 'dev-only-change-me') {
    console.warn('[email-verify] Using default VERIFY_SERVER_SECRET — set a strong secret in production.');
  }
});
