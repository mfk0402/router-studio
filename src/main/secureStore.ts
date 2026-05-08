import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../shared/types.js';
import { DEFAULT_SETTINGS } from '../shared/types.js';
import { isAgentProtocolProductMode } from '../shared/productMode.js';

/**
 * Local-only secure storage.
 *
 * - API key is stored via Electron safeStorage (OS keychain/DPAPI/libsecret) when available.
 * - Non-secret settings are stored in plain JSON in userData.
 * - If safeStorage is unavailable, the key is stored base64-encoded in a local-only file
 *   and clearly marked as such. Nothing ever leaves the machine via this module.
 */

const SETTINGS_FILENAME = 'settings.json';
const SECRETS_FILENAME = 'secrets.local.bin';
const SECRETS_FALLBACK_FILENAME = 'secrets.local.b64';

function userDataDir(): string {
  return app.getPath('userData');
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(userDataDir(), { recursive: true });
}

async function readJsonSafe<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

export async function getSettings(): Promise<AppSettings> {
  await ensureDir();
  const file = path.join(userDataDir(), SETTINGS_FILENAME);
  const stored = await readJsonSafe<Partial<AppSettings>>(file, {});
  const apiKey = await secretGet('OPENROUTER_API_KEY');
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    apiKey: apiKey ?? '',
  };
  const storedPm = stored.productMode;
  const hasStoredPm =
    typeof storedPm === 'string' &&
    ['chat', 'learn', 'edit', 'agent', 'architect', 'review', 'ship'].includes(storedPm);
  if (!hasStoredPm) {
    merged.productMode = merged.agentMode ? 'agent' : 'chat';
  }
  merged.agentMode = isAgentProtocolProductMode(merged.productMode);
  return merged;
}

export async function setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  await ensureDir();
  const file = path.join(userDataDir(), SETTINGS_FILENAME);
  const current = await readJsonSafe<Partial<AppSettings>>(file, {});
  const merged: Partial<AppSettings> = { ...DEFAULT_SETTINGS, ...current, ...partial };

  if (partial.agentMode !== undefined && partial.productMode === undefined) {
    merged.productMode = partial.agentMode ? 'agent' : 'chat';
  }

  const full = { ...DEFAULT_SETTINGS, ...merged } as AppSettings;
  merged.productMode = full.productMode;
  merged.agentMode = isAgentProtocolProductMode(full.productMode);

  if (typeof partial.apiKey === 'string') {
    await secretSet('OPENROUTER_API_KEY', partial.apiKey);
  }

  // Never persist the plaintext API key to the non-secret settings file.
  const { apiKey: _apiKey, ...toSave } = merged;
  await writeJson(file, toSave);

  return getSettings();
}

export async function secretGet(key: string): Promise<string | null> {
  await ensureDir();
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const file = path.join(userDataDir(), SECRETS_FILENAME);
      const map = await readSecretMap(file, true);
      const cipher = map[key];
      if (!cipher) return null;
      const buf = Buffer.from(cipher, 'base64');
      return safeStorage.decryptString(buf);
    }
    const file = path.join(userDataDir(), SECRETS_FALLBACK_FILENAME);
    const map = await readSecretMap(file, false);
    const b64 = map[key];
    if (!b64) return null;
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch (e) {
    console.warn('[secureStore] Failed to read secret:', (e as Error).message);
    return null;
  }
}

export async function secretSet(key: string, value: string): Promise<void> {
  await ensureDir();
  if (safeStorage.isEncryptionAvailable()) {
    const file = path.join(userDataDir(), SECRETS_FILENAME);
    const map = await readSecretMap(file, true);
    if (value === '') {
      delete map[key];
    } else {
      map[key] = safeStorage.encryptString(value).toString('base64');
    }
    await writeSecretMap(file, map, true);
    return;
  }
  const file = path.join(userDataDir(), SECRETS_FALLBACK_FILENAME);
  const map = await readSecretMap(file, false);
  if (value === '') {
    delete map[key];
  } else {
    map[key] = Buffer.from(value, 'utf8').toString('base64');
  }
  await writeSecretMap(file, map, false);
}

export async function secretDelete(key: string): Promise<void> {
  await secretSet(key, '');
}

async function readSecretMap(file: string, _encrypted: boolean): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    // Strip optional leading comment line(s) so JSON.parse succeeds.
    const jsonStart = raw.indexOf('{');
    if (jsonStart < 0) return {};
    const parsed = JSON.parse(raw.slice(jsonStart));
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSecretMap(
  file: string,
  map: Record<string, string>,
  encrypted: boolean,
): Promise<void> {
  const header = encrypted
    ? '// LOCAL ONLY - encrypted with OS key store (Electron safeStorage). Do not share.'
    : '// LOCAL ONLY - base64 encoded only (safeStorage unavailable). Do not share.';
  const body = JSON.stringify(map, null, 2);
  await fs.writeFile(file, `${header}\n${body}`, 'utf8');
}