/**
 * Local Router Studio accounts: email + password with encrypted settings vault.
 * All data stays on disk under userData/accounts — no cloud unless you add it later.
 */

import { app } from 'electron';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
  pbkdf2Sync,
} from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../shared/types.js';
import * as store from './secureStore.js';

const ACCOUNTS_SUBDIR = 'accounts';
const META_NAME = 'meta.json';
const VAULT_NAME = 'vault.enc';

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const PBKDF2_ITERS = 310_000;
const AES_KEYLEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;

export interface AccountMetaFile {
  email: string;
  passwordSaltB64: string;
  passwordHashB64: string;
  vaultSaltB64: string;
  createdAt: number;
}

/** Payload encrypted inside vault.dat (AES-256-GCM). */
export interface AccountVaultPayload {
  v: 1;
  savedAt: number;
  /** Portable preferences + secrets; merged into app settings on login/sync. */
  settings: Partial<AppSettings>;
}

interface Session {
  email: string;
  normalizedEmail: string;
  vaultKey: Buffer;
}

let session: Session | null = null;
let vaultSyncTimer: ReturnType<typeof setTimeout> | null = null;

function accountsRoot(): string {
  return path.join(app.getPath('userData'), ACCOUNTS_SUBDIR);
}

function accountSlug(normalizedEmail: string): string {
  return createHash('sha256').update(normalizedEmail, 'utf8').digest('hex');
}

function accountDir(normalizedEmail: string): string {
  return path.join(accountsRoot(), accountSlug(normalizedEmail));
}

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function derivePasswordHash(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, { ...SCRYPT_OPTS }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

function deriveVaultKey(password: string, vaultSalt: Buffer): Buffer {
  return pbkdf2Sync(password, vaultSalt, PBKDF2_ITERS, AES_KEYLEN, 'sha256');
}

function encryptVault(plain: AccountVaultPayload, key: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
  const json = JSON.stringify(plain);
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

function decryptVault(data: Buffer, key: Buffer): AccountVaultPayload {
  if (data.length < IV_LEN + TAG_LEN) {
    throw new Error('Vault file is too small or corrupt.');
  }
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = data.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  const parsed = JSON.parse(dec.toString('utf8')) as AccountVaultPayload;
  if (!parsed || parsed.v !== 1 || typeof parsed.settings !== 'object') {
    throw new Error('Invalid vault payload.');
  }
  return parsed;
}

export function getSession(): { email: string } | null {
  if (!session) return null;
  return { email: session.email };
}

export async function listRegisteredAccounts(): Promise<string[]> {
  const root = accountsRoot();
  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch {
    return [];
  }
  const emails: string[] = [];
  for (const dir of names) {
    try {
      const metaPath = path.join(root, dir, META_NAME);
      const raw = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(raw) as AccountMetaFile;
      if (meta?.email) emails.push(meta.email);
    } catch (e) {
      console.warn('[accountVault] Skipping account directory with invalid meta:', (e as Error).message);
    }
  }
  emails.sort();
  return emails;
}

/** True if a local account folder exists for this email. */
export async function isEmailRegistered(email: string): Promise<boolean> {
  const norm = normalizeAccountEmail(email);
  if (!isValidEmail(norm)) return false;
  const dir = accountDir(norm);
  try {
    await fs.access(path.join(dir, META_NAME));
    return true;
  } catch {
    return false;
  }
}

export async function registerAccount(
  email: string,
  password: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const norm = normalizeAccountEmail(email);
  if (!isValidEmail(norm)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  const dir = accountDir(norm);
  try {
    await fs.access(dir);
    return { ok: false, error: 'An account with this email already exists. Sign in instead.' };
  } catch {
    /* ok */
  }

  await fs.mkdir(dir, { recursive: true });
  const passwordSalt = randomBytes(16);
  const vaultSalt = randomBytes(16);
  const passwordHash = await derivePasswordHash(password, passwordSalt);

  const meta: AccountMetaFile = {
    email: norm,
    passwordSaltB64: passwordSalt.toString('base64'),
    passwordHashB64: passwordHash.toString('base64'),
    vaultSaltB64: vaultSalt.toString('base64'),
    createdAt: Date.now(),
  };
  await fs.writeFile(path.join(dir, META_NAME), JSON.stringify(meta, null, 2), 'utf8');

  const vaultKey = deriveVaultKey(password, vaultSalt);
  const emptyPayload: AccountVaultPayload = {
    v: 1,
    savedAt: Date.now(),
    settings: {},
  };
  const enc = encryptVault(emptyPayload, vaultKey);
  vaultKey.fill(0);
  await fs.writeFile(path.join(dir, VAULT_NAME), enc);

  return loginAccount(email, password);
}

export async function loginAccount(
  email: string,
  password: string,
): Promise<
  { ok: true; email: string } | { ok: false; error: string }
> {
  const norm = normalizeAccountEmail(email);
  if (!isValidEmail(norm)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  const dir = accountDir(norm);
  let metaRaw: string;
  try {
    metaRaw = await fs.readFile(path.join(dir, META_NAME), 'utf8');
  } catch {
    return { ok: false, error: 'No account found for this email. Register first.' };
  }
  const meta = JSON.parse(metaRaw) as AccountMetaFile;
  const passwordSalt = Buffer.from(meta.passwordSaltB64, 'base64');
  const expectedHash = Buffer.from(meta.passwordHashB64, 'base64');
  const candidate = await derivePasswordHash(password, passwordSalt);
  if (
    candidate.length !== expectedHash.length ||
    !timingSafeEqual(candidate, expectedHash)
  ) {
    candidate.fill(0);
    return { ok: false, error: 'Incorrect password.' };
  }
  candidate.fill(0);

  const vaultSalt = Buffer.from(meta.vaultSaltB64, 'base64');
  const vaultKey = deriveVaultKey(password, vaultSalt);

  let vaultData: Buffer;
  try {
    vaultData = await fs.readFile(path.join(dir, VAULT_NAME));
  } catch {
    vaultKey.fill(0);
    return { ok: false, error: 'Vault file is missing. Account data may be corrupt.' };
  }

  let payload: AccountVaultPayload;
  try {
    payload = decryptVault(vaultData, vaultKey);
  } catch (e) {
    vaultKey.fill(0);
    return { ok: false, error: `Could not decrypt vault: ${(e as Error).message}` };
  }

  session = {
    email: meta.email,
    normalizedEmail: norm,
    vaultKey,
  };

  if (Object.keys(payload.settings).length > 0) {
    await store.setSettings(payload.settings);
  }

  return { ok: true, email: meta.email };
}

export function logoutAccount(): void {
  if (session?.vaultKey) {
    session.vaultKey.fill(0);
  }
  session = null;
  if (vaultSyncTimer) {
    clearTimeout(vaultSyncTimer);
    vaultSyncTimer = null;
  }
}

function currentSettingsToVaultPayload(base: AppSettings): AccountVaultPayload {
  const {
    apiKey,
    githubToken,
    linearApiKey,
    ...rest
  } = base;
  return {
    v: 1,
    savedAt: Date.now(),
    settings: {
      ...rest,
      githubToken,
      linearApiKey,
      apiKey,
    },
  };
}

export async function saveVaultFromCurrentSettings(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!session) {
    return { ok: false, error: 'Not signed in.' };
  }
  const full = await store.getSettings();
  const payload = currentSettingsToVaultPayload(full);
  const enc = encryptVault(payload, session.vaultKey);
  const dir = accountDir(session.normalizedEmail);
  await fs.writeFile(path.join(dir, VAULT_NAME), enc);
  return { ok: true };
}

export function scheduleVaultSyncIfLoggedIn(): void {
  if (!session) return;
  if (vaultSyncTimer) clearTimeout(vaultSyncTimer);
  vaultSyncTimer = setTimeout(() => {
    vaultSyncTimer = null;
    void saveVaultFromCurrentSettings().catch((e) =>
      console.error('[accountVault] background sync failed', e),
    );
  }, 1800);
}