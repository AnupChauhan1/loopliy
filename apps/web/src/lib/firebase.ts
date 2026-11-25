import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';

// Production Firebase web config for project looply-crm-2fa19.
// Hardcoded on purpose: Render does not define NEXT_PUBLIC_FIREBASE_*
// env vars, and reading them produced auth/api-key-not-valid errors.
const firebaseConfig = {
  apiKey: 'AIzaSyCota13QQ6-JmVpjihnnp3YtD8hlgYgSZ4',
  authDomain: 'looply-crm-2fa19.firebaseapp.com',
  projectId: 'looply-crm-2fa19',
  storageBucket: 'looply-crm-2fa19.firebasestorage.app',
  messagingSenderId: '576502210552',
  appId: '1:576502210552:web:9ae95786aa84ccc2c6000d',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Zoho mail via Firebase OpenID Connect (provider id: oidc.zoho)
export const zohoProvider = new OAuthProvider('oidc.zoho');
zohoProvider.addScope('email');
zohoProvider.addScope('profile');
// Force fresh Zoho authentication (incl. Zoho OneAuth / MFA push) — never reuse a silent session
zohoProvider.setCustomParameters({ prompt: 'login' });

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/unauthorized-domain': 'This website is not authorized for sign-in yet. Add this domain under Firebase Console → Authentication → Settings → Authorized domains.',
  'auth/operation-not-allowed': 'This sign-in method is disabled. Enable it under Firebase Console → Authentication → Sign-in method.',
  'auth/api-key-not-valid': 'The Firebase API key is not valid for this project.',
  'auth/invalid-api-key': 'The Firebase API key is not valid for this project.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/weak-password': 'Enter a password of at least 6 characters before verifying your email.',
  'auth/missing-password': 'Enter a password first, then verify your email.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/missing-email': 'Enter your email address first.',
  'auth/wrong-password': 'This email was already used for verification with a different password. Use that password or continue with Google.',
  'auth/invalid-credential': 'This email was already used for verification with a different password. Use that password or continue with Google.',
  'auth/invalid-login-credentials': 'This email was already used for verification with a different password. Use that password or continue with Google.',
  'auth/account-exists-with-different-credential': 'This email is already linked to a different sign-in method.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/popup-blocked': 'Your browser blocked the Google popup. Allow popups for this site and try again.',
  'auth/user-token-expired': 'Your verification session expired. Please verify your email again.',
};

/** Human-readable message for a Firebase Auth error. */
export function firebaseErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.') {
  const code = (err as { code?: string })?.code;
  if (code && FIREBASE_ERRORS[code]) return FIREBASE_ERRORS[code];
  return code ? `${fallback} (${code})` : (err as { message?: string })?.message || fallback;
}
