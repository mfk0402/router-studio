/**
 * Optional email verification for registration (anti-bot / proof of inbox).
 * Configure ROUTER_STUDIO_VERIFY_URL to your deployed server (see server/email-verify).
 * Dev-only bypass: ROUTER_STUDIO_VERIFY_SKIP=1
 */

import { app } from 'electron';
import type { RegistrationPolicyInfo } from '../shared/types.js';

const SKIP = process.env['ROUTER_STUDIO_VERIFY_SKIP'] === '1' && !app.isPackaged;

function resolveVerifyBaseUrl(): string | null {
  const u = process.env['ROUTER_STUDIO_VERIFY_URL']?.trim();
  return u && u.length > 0 ? u.replace(/\/$/, '') : null;
}

function apiKey(): string | undefined {
  const k = process.env['ROUTER_STUDIO_VERIFY_API_KEY']?.trim();
  return k && k.length > 0 ? k : undefined;
}

export function getRegistrationPolicy(): RegistrationPolicyInfo {
  if (SKIP) {
    return {
      needsVerification: false,
      hint: 'Development: ROUTER_STUDIO_VERIFY_SKIP is on — email codes are not enforced.',
    };
  }
  if (resolveVerifyBaseUrl()) {
    return { needsVerification: true };
  }
  return {
    needsVerification: false,
    hint:
      'Email verification is not configured (set ROUTER_STUDIO_VERIFY_URL to your verify server). ' +
      'Anyone can register locally without proving they own the address.',
  };
}
async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const root = resolveVerifyBaseUrl();
  if (!root) {
    return { ok: false, error: 'Verification server URL is not configured.' };
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = apiKey();
  if (key) headers['Authorization'] = `Bearer ${key}`;
  let res: Response;
  try {
    res = await fetch(`${root}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  let data: unknown;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: text || `HTTP ${res.status}` };
  }
  if (!res.ok) {
    const msg =
      typeof (data as { error?: string }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    return { ok: false, error: msg };
  }
  return { ok: true, data: data as T };
}

/** Ask the server to email a one-time code. */
export async function requestRegistrationCode(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (SKIP) {
    return { ok: true };
  }
  const r = await postJson<{ ok?: boolean }>('/v1/request-code', { email: email.trim() });
  if (!r.ok) return r;
  return { ok: true };
}

/** Exchange emailed code for a single-use registration token (server-side). */
export async function verifyRegistrationCode(
  email: string,
  code: string,
): Promise<
  { ok: true; registrationToken: string } | { ok: false; error: string }
> {
  if (SKIP) {
    const c = code.replace(/\D/g, '');
    if (c.length !== 6) {
      return { ok: false, error: 'Enter the 6-digit code.' };
    }
    return { ok: true, registrationToken: 'dev-skip-token' };
  }
  const r = await postJson<{ registrationToken?: string }>('/v1/verify-code', {
    email: email.trim(),
    code: code.trim(),
  });
  if (!r.ok) return r;
  const token = r.data.registrationToken;
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, error: 'Invalid response from verification server.' };
  }
  return { ok: true, registrationToken: token.trim() };
}

/** Mark the registration token as used after local account files are created. */
export async function consumeRegistrationToken(
  email: string,
  registrationToken: string,
): Promise<boolean> {
  if (SKIP) {
    return registrationToken === 'dev-skip-token';
  }
  const r = await postJson<{ consumed?: boolean }>('/v1/consume-token', {
    email: email.trim(),
    registrationToken: registrationToken.trim(),
  });
  return r.ok && (r.data as { consumed?: boolean }).consumed !== false;
}
