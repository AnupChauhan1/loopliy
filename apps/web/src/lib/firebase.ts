import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Production Firebase web config for project looply-e2ba5.
// Env vars may override, but only when they contain a real non-empty value —
// an unset/blank NEXT_PUBLIC_FIREBASE_* on Render must never produce
// auth/api-key-not-valid errors.
const env = (key: string) => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
};

const firebaseConfig = {
  apiKey: env('NEXT_PUBLIC_FIREBASE_API_KEY') || 'AIzaSyB4ES74LIjQZH08IWpBcWNp9V5bSFBeeJY',
  authDomain: env('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN') || 'looply-e2ba5.firebaseapp.com',
  projectId: env('NEXT_PUBLIC_FIREBASE_PROJECT_ID') || 'looply-e2ba5',
  storageBucket: env('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET') || 'looply-e2ba5.firebasestorage.app',
  messagingSenderId: env('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') || '468013910279',
  appId: env('NEXT_PUBLIC_FIREBASE_APP_ID') || '1:468013910279:web:b0ce999c1698ddebb85da2',
  measurementId: env('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID') || 'G-WJ9K3Y18EB',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
