import { create } from "zustand";

const STORAGE_KEY = "inventory-auth";

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  initialized: false,
  hydrate: () => {
    if (get().initialized) return;
    if (typeof window === "undefined") {
      set({ initialized: true });
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ initialized: true, user: null, token: null });
        return;
      }
      const parsed = JSON.parse(raw);
      set({
        user: parsed?.user ?? null,
        token: parsed?.token ?? null,
        initialized: true
      });
    } catch (error) {
      console.error("Failed to hydrate auth store", error);
      window.localStorage.removeItem(STORAGE_KEY);
      set({ initialized: true, user: null, token: null });
    }
  },
  setSession: ({ user, token }) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
    }
    set({ user, token });
  },
  clearSession: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    set({ user: null, token: null });
  }
}));
