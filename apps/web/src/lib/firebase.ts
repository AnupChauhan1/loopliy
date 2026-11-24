import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Production Firebase web config for project looply-e2ba5.
// Hardcoded on purpose: Render does not define NEXT_PUBLIC_FIREBASE_*
// env vars, and reading them produced auth/api-key-not-valid errors.
const firebaseConfig = {
  apiKey: 'AIzaSyB4ES74LIjQZH08IWpBcWNp9V5bSFBeeJY',
  authDomain: 'looply-e2ba5.firebaseapp.com',
  projectId: 'looply-e2ba5',
  storageBucket: 'looply-e2ba5.firebasestorage.app',
  messagingSenderId: '468013910279',
  appId: '1:468013910279:web:b0ce999c1698ddebb85da2',
  measurementId: 'G-WJ9K3Y18EB',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
