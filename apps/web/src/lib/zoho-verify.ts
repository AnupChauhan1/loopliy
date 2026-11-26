'use client';

import api from './api-client';

const TOKEN_KEY = 'pendingZohoClientToken';
const EMAIL_KEY = 'pendingZohoEmail';

function clientToken(): string {
  let t = '';
  try { t = localStorage.getItem(TOKEN_KEY) ?? ''; } catch { /* ignore */ }
  if (!t) {
    t = crypto.randomUUID();
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
  }
  return t;
}

/** Send a passwordless sign-in link to the Zoho Mail inbox (works cross-device:
 *  the email is embedded in the continue URL so the phone doesn't need storage). */
export async function sendZohoVerificationLink(email: string, landingPath: string): Promise<void> {
  const { sendSignInLinkToEmail } = await import('firebase/auth');
  const { auth } = await import('./firebase');
  const token = clientToken();
  try { localStorage.setItem(EMAIL_KEY, email); } catch { /* ignore */ }
  await api.post('/auth/email-link-init', { email, clientToken: token });
  const url = `${window.location.origin}${landingPath}?zohoVerify=1&email=${encodeURIComponent(email)}`;
  await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
}

/** Poll until the phone approves the link; returns a signup otpToken once verified. */
export async function pollZohoVerification(email: string): Promise<string | null> {
  try {
    const token = clientToken();
    const { data } = await api.get('/auth/email-link-status', { params: { email, clientToken: token } });
    if (!data?.verified) return null;
    const claim = await api.post('/auth/email-link-claim', { email, clientToken: token });
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ }
    return claim.data?.otpToken ?? null;
  } catch {
    return null;
  }
}

export function pendingZohoEmail(): string {
  try { return localStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; }
}

/**
 * Landing handler — runs on page mount. If the URL is an email-link landing
 * (`isSignInWithEmailLink`), completes sign-in, reports verification to the API
 * (so the desktop tab unlocks), and invokes onVerified with the Firebase user.
 * Returns true when a landing was handled.
 */
export async function handleZohoEmailLinkLanding(
  onVerified: (user: any) => void | Promise<void>,
  onError?: (message: string) => void,
): Promise<boolean> {
  try {
    const { isSignInWithEmailLink, signInWithEmailLink } = await import('firebase/auth');
    const { auth } = await import('./firebase');
    if (!isSignInWithEmailLink(auth, window.location.href)) return false;

    const params = new URLSearchParams(window.location.search);
    const email = (params.get('email') || pendingZohoEmail() || window.prompt('Confirm the email this link was sent to:') || '').trim().toLowerCase();
    if (!email) return false;

    const cred = await signInWithEmailLink(auth, email, window.location.href);
    window.history.replaceState(null, '', window.location.pathname);

    // Local unlock: this device now holds a verified Firebase session
    await onVerified(cred.user);

    // Cross-device unlock: record verification server-side for the desktop tab
    try {
      const idToken = await cred.user.getIdToken();
      await api.post('/auth/email-link-verified', { firebaseIdToken: idToken });
    } catch { /* desktop poll will simply keep waiting */ }
    return true;
  } catch (err: unknown) {
    const { firebaseErrorMessage } = await import('./firebase');
    onError?.(await firebaseErrorMessage(err, 'Zoho verification link is invalid or expired — request a new one.'));
    return true;
  }
}
