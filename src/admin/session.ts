/**
 * Admin session handling.
 *
 * The fine-grained PAT lives in sessionStorage — per-tab, gone when the tab closes,
 * never in localStorage, never in a cookie, never in the URL. The session also dies
 * after 30 minutes without input, enforced client-side (the token itself is the only
 * credential; the server cannot revoke a session it never issued).
 */

const TOKEN_KEY = 'portfolio.admin.token';
const EXPIRY_KEY = 'portfolio.admin.expiry';

export const IDLE_MS = 30 * 60 * 1000;
/** Warn this long before the idle timeout so a long edit is not lost silently. */
export const IDLE_WARN_MS = 2 * 60 * 1000;

export interface AdminSession {
  token: string;
  expiresAt: number;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readSession(): AdminSession | null {
  const store = storage();
  if (!store) return null;
  try {
    const token = store.getItem(TOKEN_KEY);
    const expiresAt = Number(store.getItem(EXPIRY_KEY) ?? '0');
    if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      clearSession();
      return null;
    }
    return { token, expiresAt };
  } catch {
    return null;
  }
}

export function writeSession(token: string): AdminSession {
  const session: AdminSession = { token, expiresAt: Date.now() + IDLE_MS };
  const store = storage();
  if (store) {
    try {
      store.setItem(TOKEN_KEY, token);
      store.setItem(EXPIRY_KEY, String(session.expiresAt));
    } catch {
      /* private mode with storage disabled — the session works until reload */
    }
  }
  return session;
}

/** Extends the idle deadline. Called on real input, throttled by the caller. */
export function touchSession(): AdminSession | null {
  const session = readSession();
  if (!session) return null;
  const next: AdminSession = { token: session.token, expiresAt: Date.now() + IDLE_MS };
  const store = storage();
  if (store) {
    try {
      store.setItem(EXPIRY_KEY, String(next.expiresAt));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function clearSession(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(TOKEN_KEY);
    store.removeItem(EXPIRY_KEY);
  } catch {
    /* ignore */
  }
}

export function sessionRemaining(session: AdminSession | null): number {
  if (!session) return 0;
  return Math.max(0, session.expiresAt - Date.now());
}
