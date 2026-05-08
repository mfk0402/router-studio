import { useEffect, useState } from 'react';
import { useApp } from '../store/appStore';
import { useAccountSession } from '../store/accountSessionStore';
import { useSettings } from '../store/settingsStore';
import type { RegistrationPolicyInfo } from '../../shared/types';
import { toast } from './ToastContainer';
import logoIcon from '../assets/logo-icon.png';

type Tab = 'login' | 'register';
type RegisterStep = 'form' | 'code';

/**
 * Local email + password account: encrypted vault under app userData (no cloud).
 * Sign in restores settings/API keys from the vault; changes sync back after a short delay or manually.
 * When ROUTER_STUDIO_VERIFY_URL is set, registration requires a one-time email code (see server/email-verify).
 */
export default function AccountModal() {
  const open = useApp((s) => s.showAccountModal);
  const setOpen = useApp((s) => s.setShowAccountModal);
  const emailSession = useAccountSession((s) => s.email);
  const refreshSession = useAccountSession((s) => s.refresh);
  const loadSettings = useSettings((s) => s.load);

  const [tab, setTab] = useState<Tab>('login');
  const [registerStep, setRegisterStep] = useState<RegisterStep>('form');
  const [regPolicy, setRegPolicy] = useState<RegistrationPolicyInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [knownEmails, setKnownEmails] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        setKnownEmails(await window.api.auth.listAccounts());
      } catch {
        setKnownEmails([]);
      }
      try {
        setRegPolicy(await window.api.auth.registrationPolicy());
      } catch {
        setRegPolicy(null);
      }
    })();
    setPassword('');
    setPassword2('');
    if (tab === 'register') {
      setRegisterStep('form');
      setVerificationCode('');
    }
  }, [open, tab]);

  if (!open) return null;

  const onLogout = async () => {
    setBusy(true);
    try {
      await window.api.auth.logout();
      await refreshSession();
      toast.info('Signed out', 'Your local settings are unchanged. Sign in again to load a saved vault.');
    } finally {
      setBusy(false);
    }
  };

  const onSync = async () => {
    setBusy(true);
    try {
      const r = await window.api.auth.syncVault();
      if (r.ok) toast.success('Saved encrypted backup', 'Settings synced to your account on this machine.');
      else toast.error('Sync failed', r.error);
    } finally {
      setBusy(false);
    }
  };

  const onLogin = async () => {
    setBusy(true);
    try {
      const r = await window.api.auth.login(email.trim(), password);
      if (!r.ok) {
        toast.error('Sign in failed', r.error);
        return;
      }
      await refreshSession();
      await loadSettings();
      toast.success('Signed in', r.email);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const validateRegisterPasswords = (): boolean => {
    if (password.length < 8) {
      toast.error('Password too short', 'Use at least 8 characters.');
      return false;
    }
    if (password !== password2) {
      toast.error('Passwords do not match');
      return false;
    }
    return true;
  };

  const onSendVerificationCode = async () => {
    if (!email.trim()) {
      toast.error('Email required');
      return;
    }
    if (!validateRegisterPasswords()) return;
    setBusy(true);
    try {
      const r = await window.api.auth.requestRegistrationCode(email.trim());
      if (!r.ok) {
        toast.error('Could not send code', r.error);
        return;
      }
      setRegisterStep('code');
      setVerificationCode('');
      toast.success('Check your email', 'Enter the 6-digit code to finish creating your account.');
    } finally {
      setBusy(false);
    }
  };

  const onRegisterSimple = async () => {
    if (!validateRegisterPasswords()) return;
    setBusy(true);
    try {
      const r = await window.api.auth.register(email.trim(), password);
      if (!r.ok) {
        toast.error('Registration failed', r.error);
        return;
      }
      await refreshSession();
      await loadSettings();
      toast.success('Account created', `Signed in as ${r.email}`);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const onRegisterAfterCode = async () => {
    const digits = verificationCode.replace(/\D/g, '');
    if (digits.length !== 6) {
      toast.error('Invalid code', 'Enter the 6-digit code from your email.');
      return;
    }
    if (!validateRegisterPasswords()) return;
    setBusy(true);
    try {
      const v = await window.api.auth.verifyRegistrationCode(email.trim(), digits);
      if (!v.ok) {
        toast.error('Verification failed', v.error);
        return;
      }
      const r = await window.api.auth.register(email.trim(), password, v.registrationToken);
      if (!r.ok) {
        toast.error('Registration failed', r.error);
        return;
      }
      await refreshSession();
      await loadSettings();
      toast.success('Account created', `Signed in as ${r.email}`);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const needsVerification = regPolicy?.needsVerification === true;

  return (
    <div className="modal-scrim fixed inset-0 z-[201000] flex items-center justify-center p-6">
      <div className="glass-panel glass-modal-lg flex w-full max-w-md flex-col overflow-hidden ds-transition">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="brand-mark-icon-wrap">
              <img src={logoIcon} alt="" className="h-7 w-7 shrink-0 select-none" draggable={false} />
            </span>
            <div>
              <div className="truncate text-sm font-semibold text-fg">Router Studio account</div>
              <div className="text-[10px] text-fg-subtle">Local encrypted vault — data stays on this device</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover"
          >
            Close
          </button>
        </div>

        {regPolicy?.hint ? (
          <div className="border-b border-border-soft bg-bg/80 px-4 py-2 text-[10px] text-fg-muted">{regPolicy.hint}</div>
        ) : null}

        {emailSession ? (
          <div className="space-y-3 p-4 text-sm">
            <p className="text-fg">
              Signed in as <strong className="font-mono text-xs">{emailSession}</strong>
            </p>
            <p className="text-[11px] text-fg-subtle">
              Settings and API keys are copied into the running app from your vault when you sign in. Edits are
              saved back into the encrypted vault automatically (after a short pause) or when you click{' '}
              <strong>Sync now</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSync()}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                Sync now
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onLogout()}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:bg-bg-hover disabled:opacity-50"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex border-b border-border-soft px-2 pt-2">
              <button
                type="button"
                className={
                  'flex-1 rounded-t-md px-3 py-2 text-xs font-medium ' +
                  (tab === 'login' ? 'bg-bg text-fg' : 'text-fg-muted hover:text-fg')
                }
                onClick={() => setTab('login')}
              >
                Sign in
              </button>
              <button
                type="button"
                className={
                  'flex-1 rounded-t-md px-3 py-2 text-xs font-medium ' +
                  (tab === 'register' ? 'bg-bg text-fg' : 'text-fg-muted hover:text-fg')
                }
                onClick={() => setTab('register')}
              >
                Create account
              </button>
            </div>
            <div className="space-y-3 p-4">
              {tab === 'register' && needsVerification && registerStep === 'code' ? (
                <>
                  <p className="text-[11px] text-fg-subtle">
                    We sent a code to <strong className="text-fg">{email.trim() || 'your email'}</strong>. Enter it
                    below, then create your account.
                  </p>
                  <div>
                    <label htmlFor="acct-code" className="mb-1 block text-[11px] font-medium text-fg-muted">
                      Verification code
                    </label>
                    <input
                      id="acct-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={12}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      className="w-full rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-sm tracking-widest focus:border-accent focus:outline-none"
                      placeholder="000000"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onRegisterAfterCode()}
                    className="w-full rounded-md bg-accent py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
                  >
                    {busy ? 'Please wait…' : 'Verify & create account'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setRegisterStep('form');
                      setVerificationCode('');
                    }}
                    className="w-full rounded-md border border-border py-2 text-xs text-fg-muted hover:bg-bg-hover disabled:opacity-40"
                  >
                    Back
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="acct-email" className="mb-1 block text-[11px] font-medium text-fg-muted">
                      Email
                    </label>
                    <input
                      id="acct-email"
                      type="email"
                      autoComplete="email"
                      list="known-acct-emails"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                      placeholder="you@example.com"
                    />
                    <datalist id="known-acct-emails">
                      {knownEmails.map((e) => (
                        <option key={e} value={e} />
                      ))}
                    </datalist>
                  </div>
                  {tab === 'register' ? (
                    <>
                      <div>
                        <label htmlFor="acct-pass" className="mb-1 block text-[11px] font-medium text-fg-muted">
                          Password
                        </label>
                        <input
                          id="acct-pass"
                          type="password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="acct-pass2" className="mb-1 block text-[11px] font-medium text-fg-muted">
                          Confirm password
                        </label>
                        <input
                          id="acct-pass2"
                          type="password"
                          autoComplete="new-password"
                          value={password2}
                          onChange={(e) => setPassword2(e.target.value)}
                          className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                        />
                        <p className="mt-1 text-[10px] text-fg-subtle">
                          Minimum 8 characters. Used only to encrypt your vault on disk.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label htmlFor="acct-pass" className="mb-1 block text-[11px] font-medium text-fg-muted">
                        Password
                      </label>
                      <input
                        id="acct-pass"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={busy || !email.trim() || (tab === 'login' && !password)}
                    onClick={() =>
                      void (tab === 'login'
                        ? onLogin()
                        : needsVerification
                          ? onSendVerificationCode()
                          : onRegisterSimple())
                    }
                    className="w-full rounded-md bg-accent py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
                  >
                    {busy
                      ? 'Please wait…'
                      : tab === 'login'
                        ? 'Sign in'
                        : needsVerification
                          ? 'Send verification email'
                          : 'Create account & sign in'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
