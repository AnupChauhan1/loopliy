import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';

// Firebase web config for project looply-67db8.
// Hardcoded on purpose: env overrides previously shipped a stale/invalid
// apiKey and broke auth with auth/api-key-not-valid on production.
const firebaseConfig = {
  apiKey: 'AIzaSyAy6Z2LLQW--00hzC0J0gQ605PQHSl5l74',
  authDomain: 'looply-67db8.firebaseapp.com',
  projectId: 'looply-67db8',
  storageBucket: 'looply-67db8.firebasestorage.app',
  messagingSenderId: '433616898133',
  appId: '1:433616898133:web:a63ac223af07d2e70fecdc',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Zoho mail via Firebase OpenID Connect (provider id: oidc.zoho)
export const zohoProvider = new OAuthProvider('oidc.zoho');
zohoProvider.addScope('email');
zohoProvider.addScope('profile');

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
