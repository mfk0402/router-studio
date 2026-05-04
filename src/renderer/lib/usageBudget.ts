import type { AppSettings, CompletionUsageSnapshot } from '../../shared/types';

const STORAGE_KEY = 'routerstudio.completionBudget.v1';

type Stored = {
  dayKey: string;
  dailyCompletion: number;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { dayKey: todayKey(), dailyCompletion: 0 };
    const p = JSON.parse(raw) as Partial<Stored>;
    const dayKey = typeof p.dayKey === 'string' ? p.dayKey : todayKey();
    let dailyCompletion = typeof p.dailyCompletion === 'number' ? p.dailyCompletion : 0;
    if (dayKey !== todayKey()) {
      dailyCompletion = 0;
    }
    return { dayKey: todayKey(), dailyCompletion };
  } catch {
    return { dayKey: todayKey(), dailyCompletion: 0 };
  }
}

function writeStored(s: Stored): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore quota
  }
}

let sessionCompletionUsed = 0;

/** In-memory session counter (resets when the window reloads). */
export function getSessionCompletionTokensUsed(): number {
  return sessionCompletionUsed;
}

export function getDailyCompletionTokensUsed(): number {
  return readStored().dailyCompletion;
}

export function assertAllowsEstimatedCompletion(settings: AppSettings, estimatedNewCompletionMax: number): void {
  const dailyCap = settings.dailyCompletionTokenBudget;
  const sessionCap = settings.sessionCompletionTokenBudget;
  if (dailyCap <= 0 && sessionCap <= 0) return;

  const stored = readStored();
  const dailyUsed = stored.dayKey === todayKey() ? stored.dailyCompletion : 0;

  if (sessionCap > 0 && sessionCompletionUsed + estimatedNewCompletionMax > sessionCap) {
    throw new Error(
      `Session completion token budget exceeded (limit ${sessionCap.toLocaleString()}, used ~${sessionCompletionUsed.toLocaleString()}, reserving up to ${estimatedNewCompletionMax.toLocaleString()} for this reply). Raise the cap in Settings → Models or wait until you reload the app.`,
    );
  }
  if (dailyCap > 0 && dailyUsed + estimatedNewCompletionMax > dailyCap) {
    throw new Error(
      `Daily completion token budget exceeded (limit ${dailyCap.toLocaleString()}, used ${dailyUsed.toLocaleString()} today). Raise the cap in Settings → Models or try again tomorrow.`,
    );
  }
}

/** Record provider-reported completion tokens after a successful completion. */
export function recordCompletionBudgetUsage(usage?: CompletionUsageSnapshot): void {
  const c = usage?.completion_tokens;
  if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) return;
  const tokens = Math.floor(c);
  sessionCompletionUsed += tokens;
  const stored = readStored();
  const daily =
    stored.dayKey === todayKey() ? stored.dailyCompletion + tokens : tokens;
  writeStored({ dayKey: todayKey(), dailyCompletion: daily });
}
