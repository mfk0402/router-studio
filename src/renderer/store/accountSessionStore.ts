import { create } from 'zustand';

interface AccountSessionState {
  email: string | null;
  setEmail: (e: string | null) => void;
  refresh: () => Promise<void>;
}

export const useAccountSession = create<AccountSessionState>((set) => ({
  email: null,
  setEmail: (email) => set({ email }),
  refresh: async () => {
    try {
      const s = await window.api.auth.session();
      set({ email: s.loggedIn ? s.email : null });
    } catch {
      set({ email: null });
    }
  },
}));
