'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Mail, Lock, AlertCircle, CheckCircle2, Loader2, Copy, Check, Camera } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { panelRoleOf, homeFor } from '@/lib/roles';
import Link from 'next/link';
import { LooplyLogo } from '@/components/LooplyLogo';
import { ZohoIcon } from '@/components/zoho-icon';
import { sendZohoVerificationLink, pollZohoVerification, handleZohoEmailLinkLanding } from '@/lib/zoho-verify';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

const features = [
  'Projects, tasks & approvals in one workspace',
  'CRM, invoicing & finance built for agencies',
  'Real-time collaboration with your team & clients',
];

// Public workspace credentials — these accounts are provisioned on the
// backend via the BOOTSTRAP_*_PASSWORD env vars and verified against the
// live auth endpoint. Temporary testing credentials for the designated
// bootstrap accounts only; set NEXT_PUBLIC_SHOW_LOGIN_CREDENTIALS=false
// (or remove this panel) before real production go-live.
const SHOW_CREDENTIALS = process.env.NEXT_PUBLIC_SHOW_LOGIN_CREDENTIALS !== 'false';
const loginCredentials: { role: string; email: string; password: string }[] = SHOW_CREDENTIALS ? [
  { role: 'Admin', email: 'admin@epatang.com', password: 'Admin@Looply2026' },
  { role: 'Manager', email: 'pm@epatang.com', password: 'Manager@Looply2026' },
  { role: 'HR', email: 'hr@epatang.com', password: 'HR@Looply2026' },
  { role: 'Employee', email: 'employee@epatang.com', password: 'Employee@Looply2026' },
  { role: 'Client', email: 'client@acme.com', password: 'Client@Looply2026' },
] : [];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState('');
  const [loading, setLoading] = useState(false);

  // In-place auth views — no routing, no redirects
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [su, setSu] = useState({ fullName: '', email: '', accountType: 'employee', password: '', confirm: '' });
  const [suMsg, setSuMsg] = useState('');
  const [suErr, setSuErr] = useState('');
  const [suLoading, setSuLoading] = useState(false);
  const [suDevToken, setSuDevToken] = useState('');
  const [suDoneEmail, setSuDoneEmail] = useState('');
  const [suPhoto, setSuPhoto] = useState<File | null>(null);
  const [suPreview, setSuPreview] = useState('');
  const [extraCreds, setExtraCreds] = useState<{ role: string; email: string; password: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('looply_extra_creds') || '[]'); } catch { return []; }
  });
  const [fpEmail, setFpEmail] = useState('');
  const [fpStep, setFpStep] = useState<1 | 2>(1);
  const [fpToken, setFpToken] = useState('');
  const [fpPw, setFpPw] = useState('');
  const [fpConfirm, setFpConfirm] = useState('');
  const [fpMsg, setFpMsg] = useState('');
  const [fpErr, setFpErr] = useState('');
  const [fpLoading, setFpLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [resendToken, setResendToken] = useState('');
  const [resendLoading, setResendLoading] = useState(false);

  // Signup email verification state (real inbox verification via Firebase Auth)
  const [fbSent, setFbSent] = useState(false);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbMsg, setFbMsg] = useState('');
  const [emailProof, setEmailProof] = useState(''); // Firebase ID token proving a verified inbox
  const [emailLocked, setEmailLocked] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [zohoLoading, setZohoLoading] = useState(false);
  const fbUser = useRef<any>(null);

  const [googleVerified, setGoogleVerified] = useState(false);
  const [zohoVerified, setZohoVerified] = useState(false);
  const [suZohoSent, setSuZohoSent] = useState(false);
  const [suZohoDone, setSuZohoDone] = useState(false);
  const [suOtpProof, setSuOtpProof] = useState('');

  const resetEmailVerification = () => {
    setFbSent(false); setFbLoading(false); setFbMsg('');
    setEmailProof(''); setEmailLocked(false); setGoogleVerified(false); setZohoVerified(false);
    setSuZohoSent(false); setSuZohoDone(false); setSuOtpProof(''); fbUser.current = null;
  };

  const fbError = async (err: unknown, fallback: string) =>
    (await import('@/lib/firebase')).firebaseErrorMessage(err, fallback);

  const sendVerificationEmail = async () => {
    setFbMsg(''); setFbLoading(true);
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(su.email)) { setFbMsg('Enter a valid email first'); return; }
      const { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } = await import('firebase/auth');
      const { auth } = await import('@/lib/firebase');
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, su.email, su.password);
      } catch (e: any) {
        if (e?.code === 'auth/email-already-in-use') {
          cred = await signInWithEmailAndPassword(auth, su.email, su.password);
        } else {
          throw e;
        }
      }
      fbUser.current = cred.user;
      if (!cred.user.emailVerified) await sendEmailVerification(cred.user);
      setFbSent(true);
      setFbMsg('Verification link sent to your email inbox. Please open your email, click the verification link, and then click "I have verified" to continue.');
    } catch (err: unknown) {
      setFbMsg(await fbError(err, 'Could not send verification email.'));
    } finally {
      setFbLoading(false);
    }
  };

  // Reloads the Firebase user and unlocks signup once the inbox link was clicked
  const checkVerified = async () => {
    const user = fbUser.current;
    if (!user) return false;
    await user.reload();
    if (!user.emailVerified) return false;
    const token = await user.getIdToken(true);
    setEmailProof(token);
    setEmailLocked(true);
    setFbSent(false);
    setFbMsg('');
    return true;
  };

  const confirmVerified = async () => {
    setFbMsg(''); setFbLoading(true);
    try {
      if (!fbUser.current) { setFbMsg('Request a verification email first'); return; }
      if (!(await checkVerified())) setFbMsg('Not verified yet — open the email, click the link, then try again.');
    } catch (err: unknown) {
      setFbMsg(await fbError(err, 'Could not confirm verification.'));
    } finally {
      setFbLoading(false);
    }
  };

  // Auto-check every 4 seconds while waiting for the inbox link to be clicked
  useEffect(() => {
    if (!fbSent || emailProof) return;
    const id = setInterval(() => { void checkVerified().catch(() => {}); }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbSent, emailProof]);

  const allCredentials = [...loginCredentials, ...extraCreds];

  const applyGoogleCred = (cred: any) => {
    setEmailProof(''); // replaced below once token resolves
    void (async () => {
      const idToken = await cred.user.getIdToken();
      setEmailProof(idToken);
      setSuOtpProof('');
      setEmailLocked(true);
      setGoogleVerified(true);
      setFbSent(false);
      setFbMsg('');
      const email = cred.user.email ?? '';
      const name = cred.user.displayName ?? '';
      setSu((s) => ({ ...s, email, fullName: s.fullName || name }));
    })();
  };

  // Complete an OAuth redirect sign-in when the page loads
  useEffect(() => {
    (async () => {
      try {
        const { getRedirectResult } = await import('firebase/auth');
        const { auth } = await import('@/lib/firebase');
        const cred = await getRedirectResult(auth);
        if (cred?.user) {
          const pid = cred.user.providerData?.[0]?.providerId ?? '';
          if (pid.includes('zoho')) {
            // Redirect fallback from "Continue with Zoho" → finish the session exchange
            setLoading(true);
            await completeFirebaseLogin(cred.user, 'zoho');
            setLoading(false);
            return;
          }
          setAuthMode('signup');
          applyGoogleCred(cred);
        }
      } catch (err: unknown) {
        if ((err as { code?: string })?.code) {
          setAuthMode('signup');
          setSuErr(await fbError(err, 'Google sign-in failed.'));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInWithGoogle = async () => {
    setSuErr(''); setGoogleLoading(true);
    try {
      const { signInWithPopup, signInWithRedirect } = await import('firebase/auth');
      const { auth, googleProvider } = await import('@/lib/firebase');
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        applyGoogleCred(cred);
      } catch (popupErr: any) {
        const code = popupErr?.code ?? 'unknown';
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(code)) {
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
          setSuErr(await fbError(popupErr, 'Google sign-in failed — please try again or use email verification below.'));
        }
      }
    } catch (err: unknown) {
      setSuErr(await fbError(err, 'Google sign-in failed.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  // Zoho OAuth success → verified email + locked signup fields (signup mode)
  const applyZohoCred = (cred: any) => {
    void (async () => {
      const idToken = await cred.user.getIdToken();
      setEmailProof(idToken);
      setSuOtpProof('');
      setEmailLocked(true);
      setZohoVerified(true);
      setGoogleVerified(false);
      setFbSent(false);
      setFbMsg('');
      const email = cred.user.email ?? '';
      const name = cred.user.displayName ?? '';
      setSu((s) => ({ ...s, email, fullName: s.fullName || name }));
    })();
  };

  // "Verify & Sign up with Zoho" — passwordless: emails a Firebase sign-in link
  // to the Zoho Mail inbox; approving on the phone unlocks this form in real time.
  const signInWithZoho = async () => {
    setSuErr(''); setZohoLoading(true); setFbMsg('');
    try {
      const email = su.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setSuErr('Enter your Zoho work email first (e.g. name@zohomail.in) — no password needed.');
        return;
      }
      try {
        await sendZohoVerificationLink(email, '/login');
        setSuZohoSent(true);
        setFbMsg(`Verification link sent to ${email} — open Zoho Mail on your phone and tap the link to approve.`);
      } catch (linkErr: any) {
        if (!su.password) {
          setSuErr(await fbError(linkErr, 'Could not send the Zoho verification link — enter a password and use "Verify Email" instead.'));
          return;
        }
        const { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } = await import('firebase/auth');
        const { auth } = await import('@/lib/firebase');
        let cred;
        try {
          cred = await createUserWithEmailAndPassword(auth, email, su.password);
        } catch (e: any) {
          if (e?.code === 'auth/email-already-in-use') cred = await signInWithEmailAndPassword(auth, email, su.password);
          else throw e;
        }
        fbUser.current = cred.user;
        if (!cred.user.emailVerified) {
          await sendEmailVerification(cred.user, { url: `${window.location.origin}/login?zohoVerify=1&email=${encodeURIComponent(email)}`, handleCodeInApp: false });
        }
        setFbSent(true);
        setFbMsg(`Verification email sent to ${email} — open Zoho Mail on your phone and tap the link.`);
      }
    } catch (err: unknown) {
      setSuErr(await fbError(err, 'Could not send Zoho verification. Please try again.'));
    } finally {
      setZohoLoading(false);
    }
  };

  // Phone-side landing: completes signInWithEmailLink and unlocks this form.
  useEffect(() => {
    void handleZohoEmailLinkLanding(async (user) => {
      setSuZohoDone(true);
      setSuZohoSent(false);
      const idToken = await user.getIdToken();
      setEmailProof(idToken);
      setSuOtpProof('');
      setEmailLocked(true);
      setZohoVerified(true);
      const email = user.email ?? '';
      setSu((s) => ({ ...s, email, fullName: s.fullName || user.displayName || '' }));
      setAuthMode('signup');
    }, (msg) => setSuErr(msg));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop-side poll: the exact second the phone approves, unlock this form.
  useEffect(() => {
    if (!suZohoSent || emailProof || suOtpProof) return;
    const email = su.email.trim().toLowerCase();
    if (!email) return;
    const id = setInterval(async () => {
      const token = await pollZohoVerification(email);
      if (token) {
        setSuOtpProof(token);
        setEmailProof('');
        setEmailLocked(true);
        setZohoVerified(true);
        setSuZohoSent(false);
        setFbMsg('');
      }
    }, 3000);
    return () => clearInterval(id);
  }, [suZohoSent, emailProof, suOtpProof, su.email]);

  // Exchanges a verified Firebase user for a LOOPLY session; unknown emails
  // continue into the verified signup flow instead of erroring out.
  const completeFirebaseLogin = async (firebaseUser: any, provider: 'zoho' | 'google') => {
    const idToken = await firebaseUser.getIdToken();
    const res = await fetch(`${API_URL}/api/v1/auth/firebase-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firebaseIdToken: idToken }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (/no account found/i.test(data.message || '')) {
        try {
          sessionStorage.setItem('looply_oauth_prefill', JSON.stringify({
            fullName: firebaseUser.displayName ?? '',
            email: firebaseUser.email ?? '',
            idToken,
            provider,
          }));
        } catch { /* storage unavailable */ }
        router.push('/signup');
        return;
      }
      throw new Error(data.message || 'Sign-in failed');
    }
    await login(data.token, data.user);
    router.push(homeFor(panelRoleOf(data.user.roles, data.user.primaryRole)));
  };

  // "Continue with Zoho" on the login form: clean Zoho OIDC popup → backend session.
  const continueWithZoho = async () => {
    setError(''); setLoading(true);
    try {
      const { signInWithPopup, signInWithRedirect } = await import('firebase/auth');
      const { auth, zohoProvider } = await import('@/lib/firebase');
      let cred;
      try {
        cred = await signInWithPopup(auth, zohoProvider);
      } catch (popupErr: any) {
        const code = popupErr?.code ?? 'unknown';
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(code)) {
          await signInWithRedirect(auth, zohoProvider);
          return;
        }
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
        throw popupErr;
      }
      await completeFirebaseLogin(cred.user, 'zoho');
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : await fbError(err, 'Zoho sign-in failed. Please try again.'),
      );
    } finally {
      setLoading(false);
    }
  };

  const submitSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuErr(''); setSuMsg('');
    const parts = su.fullName.trim().split(/\s+/);
    if (parts.length < 2) { setSuErr('Please enter your full name (first and last name)'); return; }
    if (su.password !== su.confirm) { setSuErr('Passwords do not match'); return; }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(su.password)) { setSuErr('Password needs 8+ chars with upper, lower case and a number'); return; }
    if (!emailProof && !suOtpProof) { setSuErr('Please verify your email via the link sent to your inbox first'); return; }
    setSuLoading(true);
    try {
      const fd = new FormData();
      fd.append('firstName', parts[0]);
      fd.append('lastName', parts.slice(1).join(' '));
      fd.append('email', su.email);
      fd.append('password', su.password);
      fd.append('phone', '');
      fd.append('accountType', su.accountType);
      if (suOtpProof) fd.append('otpToken', suOtpProof);
      else fd.append('firebaseIdToken', emailProof);
      if (suPhoto) fd.append('photo', suPhoto);
      const res = await fetch(`${API_URL}/api/v1/auth/signup`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message || 'Registration failed');
      // Store the new account in the demo credentials list (localStorage)
      const roleLabel = { employee: 'Employee', client: 'Client', hr: 'HR', manager: 'Manager' }[su.accountType as 'employee'];
      const cred = { role: roleLabel, email: su.email, password: su.password };
      const next = [...extraCreds.filter((c) => c.email !== su.email), cred];
      setExtraCreds(next);
      localStorage.setItem('looply_extra_creds', JSON.stringify(next));
      setSuDevToken(data.devVerifyToken ?? '');
      setSuDoneEmail(su.email);
      setSuMsg(data.message || 'Registration submitted.');
      setSu({ fullName: '', email: '', accountType: 'employee', password: '', confirm: '' });
      resetEmailVerification();
    } catch (err: any) {
      setSuErr(err.message || 'Registration failed. Please try again.');
    } finally {
      setSuLoading(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpErr(''); setFpMsg('');
    setFpLoading(true);
    try {
      if (fpStep === 1) {
        const res = await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: fpEmail }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Request failed');
        if (data.devResetToken) {
          setFpToken(data.devResetToken);
          setFpStep(2);
        } else {
          setFpMsg('If an account exists for that email, a reset link has been sent.');
        }
      } else {
        if (fpPw !== fpConfirm) { setFpErr('Passwords do not match'); return; }
        if (fpPw.length < 8) { setFpErr('Password must be at least 8 characters'); return; }
        const res = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: fpToken, newPassword: fpPw }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Reset failed');
        setFpMsg('Password updated — sign in with your new password.');
        setTimeout(() => { setAuthMode('login'); setFpStep(1); setFpMsg(''); setFpPw(''); setFpConfirm(''); }, 1200);
      }
    } catch (err: any) {
      setFpErr(err.message || 'Something went wrong');
    } finally {
      setFpLoading(false);
    }
  };

  const copyCredential = async (key: string, value: string) => {
    setCopyError('');
    if (!navigator.clipboard?.writeText) {
      setCopyError('Clipboard access is unavailable in this browser.');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
    } catch {
      setCopyError('Could not copy this credential. Please select and copy it manually.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      await login(data.token, data.user);
      router.push(homeFor(panelRoleOf(data.user.roles, data.user.primaryRole)));
    } catch (err: unknown) {
      setError(
        err instanceof TypeError
          ? `Unable to reach the API at ${API_URL}. Check that the API server is running, then try again.`
          : err instanceof Error
            ? err.message || 'Login failed. Please try again.'
            : 'Login failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full overflow-y-auto overflow-x-hidden px-4 py-8 pb-20 flex flex-col lg:flex-row lg:justify-start lg:p-0 bg-white">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative flex-col justify-between overflow-hidden bg-[#0b1220] p-12">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-500/20 blur-[120px] animate-float-slow" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-brand-400/10 blur-[140px] animate-float-slower" />
        <div className="pointer-events-none absolute top-1/3 left-1/2 h-64 w-64 rounded-full bg-brand-400/10 blur-[100px] animate-float-slow" style={{ animationDelay: '-4s' }} />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(156,163,175,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(156,163,175,0.06) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="relative flex items-center gap-3 animate-rotate-in">
          <LooplyLogo animate={true} size="md" theme="dark" />
        </div>

        <div className="relative max-w-md animate-slide-up">
          <h2 className="text-4xl font-semibold text-white leading-[1.15] tracking-tight">
            Run your agency,
            <br />
            <span className="gradient-text-animated">beautifully organized.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-400">
            The all-in-one operating system for digital agencies — from first proposal to final invoice.
          </p>
          <ul className="mt-8 space-y-3.5 stagger">
            {features.map((feature, idx) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-gray-300 smooth-transition hover:text-white hover:translate-x-1" style={{ animationDelay: `${idx * 100}ms` }}>
                <CheckCircle2 className="h-[18px] w-[18px] text-brand-400 shrink-0 animate-icon-pop" style={{ animationDelay: `${idx * 100 + 200}ms` }} />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-4 text-xs text-gray-500">
          <span>© 2026 Looply</span>
          <span className="h-1 w-1 rounded-full bg-gray-600" />
          <span>Trusted by modern agencies</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-1 flex-col items-center justify-start bg-white lg:justify-center lg:px-6 lg:py-12">
        <div className="w-full max-w-[400px] animate-fade-in-blur">
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center animate-rotate-in">
            <LooplyLogo animate={true} size="md" theme="light" />
          </div>

          <div className="mb-8 animate-fade-in-up">
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              {authMode === 'login' ? 'Welcome back' : authMode === 'signup' ? 'Create your account' : 'Reset password'}
            </h1>
            <p className="mt-1.5 text-sm text-gray-500">
              {authMode === 'login'
                ? 'Sign in to your workspace to continue'
                : authMode === 'signup'
                  ? 'Your account activates after HR and admin approval'
                  : fpStep === 1 ? 'Enter your email and we\u2019ll send a reset link' : 'Choose a new password'}
            </p>
          </div>

          {authMode === 'login' && (<>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200/80 animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 animate-icon-pop" />
                  <p className="text-[13px] font-medium text-rose-700">{error}</p>
                </div>
                {error.toLowerCase().includes('verify your email') && (
                  <button
                    type="button"
                    disabled={resendLoading}
                    onClick={async () => {
                      setResendLoading(true);
                      setResendMsg('');
                      try {
                        const res = await fetch(`${API_URL}/api/v1/auth/resend-verification`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email }),
                        });
                        const data = await res.json();
                        setResendToken(data.devVerifyToken ?? '');
                        setResendMsg('Verification email sent — check your inbox.');
                      } catch {
                        setResendMsg('Could not send right now — try again.');
                      } finally {
                        setResendLoading(false);
                      }
                    }}
                    className="mt-2 text-[12px] font-semibold text-brand-700 underline hover:text-brand-800 disabled:opacity-50"
                  >
                    {resendLoading ? 'Sending...' : 'Resend verification email'}
                  </button>
                )}
                {resendMsg && <p className="mt-1 text-[12px] text-gray-600">{resendMsg}</p>}
                {resendToken && (
                  <a href={`/verify-email?email=${encodeURIComponent(email)}&token=${resendToken}`} className="mt-1 block text-[12px] font-medium text-brand-700 underline">
                    Verify now (dev mode)
                  </a>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[13px] font-medium text-gray-700">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 smooth-transition" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@epatang.com"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/40 transition-all smooth-transition hover:border-brand-300"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-[13px] font-medium text-gray-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => { setAuthMode('forgot'); setFpErr(''); setFpMsg(''); setFpStep(1); }}
                  className="text-[13px] font-medium text-brand-600 hover:text-brand-700 smooth-transition hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 smooth-transition" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/40 transition-all smooth-transition hover:border-brand-300"
                  required
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer smooth-transition hover:translate-x-1">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500/40 smooth-transition"
              />
              <span className="text-[13px] text-gray-600">Keep me signed in</span>
            </label>

            <Button
              type="submit"
              className="w-full h-11 gradient-brand-btn text-white font-medium shadow-md shadow-brand-500/25 border-0 rounded-xl btn-micro"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          <button
            type="button"
            onClick={continueWithZoho}
            disabled={loading}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ZohoIcon />}
            {loading ? 'Connecting to Zoho...' : 'Continue with Zoho'}
          </button>

          {allCredentials.length > 0 && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 text-center">
              Login Credentials
            </p>
            <div className="mt-1.5 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {allCredentials.map((account) => {
                const compact = account.role === 'Client';
                return (
                <div key={account.role} className={`rounded-lg bg-white ring-1 ring-gray-100 ${compact ? 'px-2 py-1' : 'px-2 py-1.5'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold text-gray-800`}>{account.role}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(account.email);
                        setPassword(account.password);
                      }}
                      className={`rounded font-semibold text-brand-700 ${compact ? 'bg-brand-50 px-1 py-px text-[8px] hover:bg-brand-100' : 'bg-brand-50 px-1.5 py-0.5 text-[9px] hover:bg-brand-100'}`}
                    >
                      Use
                    </button>
                  </div>
                  <div className={`${compact ? 'mt-0.5 space-y-px' : 'mt-1 space-y-0.5'}`}>
                    <div className="flex items-center gap-1">
                      <p className={`min-w-0 flex-1 truncate text-gray-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`} title={account.email}>{account.email}</p>
                      <button
                        type="button"
                        aria-label={`Copy ${account.role} email`}
                        title="Copy email"
                        onClick={() => copyCredential(`${account.role}-email`, account.email)}
                        className={`shrink-0 rounded text-gray-400 hover:bg-gray-100 hover:text-brand-700 ${compact ? 'p-px' : 'p-0.5'}`}
                      >
                        {copied === `${account.role}-email` ? <Check className={compact ? 'h-2.5 w-2.5 text-brand-600' : 'h-3 w-3 text-brand-600'} /> : <Copy className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />}
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <p className={`min-w-0 flex-1 truncate font-mono text-gray-600 ${compact ? 'text-[9px]' : 'text-[10px]'}`} title={account.password}>{account.password}</p>
                      <button
                        type="button"
                        aria-label={`Copy ${account.role} password`}
                        title="Copy password"
                        onClick={() => copyCredential(`${account.role}-password`, account.password)}
                        className={`shrink-0 rounded text-gray-400 hover:bg-gray-100 hover:text-brand-700 ${compact ? 'p-px' : 'p-0.5'}`}
                      >
                        {copied === `${account.role}-password` ? <Check className={compact ? 'h-2.5 w-2.5 text-brand-600' : 'h-3 w-3 text-brand-600'} /> : <Copy className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />}
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            {copyError && <p role="status" className="mt-1.5 text-center text-[10px] text-rose-600">{copyError}</p>}
          </div>
          )}

          {allCredentials.length === 0 && (
            <p className="mt-6 text-center text-[12px] text-gray-500">
              Sign in with the account your administrator created for you.
            </p>
          )}

          <button
            type="button"
            onClick={() => { setAuthMode('signup'); setSuErr(''); setSuMsg(''); resetEmailVerification(); }}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-brand-300 hover:text-brand-700 hover:shadow"
          >
            Create New Account
          </button>

          <p className="mt-4 text-center text-[12px] text-gray-400">
            Employee, client, HR or manager — create your own account and password above.
          </p>
          </>)}

          {authMode === 'signup' && (
            <form onSubmit={submitSignup} className="space-y-4">
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={googleLoading}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
              >
                {googleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                )}
                {googleLoading ? 'Connecting to Google...' : 'Verify & Sign up with Google'}
              </button>
              <button
                type="button"
                onClick={signInWithZoho}
                disabled={zohoLoading}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
              >
                {zohoLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ZohoIcon />
                )}
                {zohoLoading ? 'Sending Zoho verification...' : 'Verify & Sign up with Zoho'}
              </button>
              {suZohoSent && !suOtpProof && (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
                  <p className="text-[12px] font-medium text-emerald-800">
                    Verification link sent — open <span className="font-semibold">Zoho Mail</span> on your phone and tap the link to approve. This form unlocks automatically.
                  </p>
                </div>
              )}
              {suZohoDone && (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-[12px] font-semibold text-emerald-800">Approved! Zoho Mail Verified ✓ — set your password below to finish.</p>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-gray-200" />
                <span className="text-[11px] font-medium text-gray-400">or use email</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>
              {suErr && (
                <div className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50 p-3.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <p className="text-[13px] font-medium text-rose-700">{suErr}</p>
                </div>
              )}
              {suMsg && (
                <div className="rounded-xl border border-brand-200 bg-brand-50 p-3.5 text-[13px] text-brand-800">
                  {suMsg}
                  {suDevToken && (
                    <a href={`/verify-email?email=${encodeURIComponent(suDoneEmail)}&token=${suDevToken}`} className="mt-1 block font-medium text-brand-700 underline">
                      Verify email now (dev mode)
                    </a>
                  )}
                </div>
              )}
              <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-3">
                <div className="relative">
                  {suPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={suPreview} alt="Preview" className="h-16 w-16 rounded-full object-cover ring-2 ring-brand-200" />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                      <Camera className="h-6 w-6 text-gray-400" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-gray-700">Profile photo <span className="font-normal text-gray-400">(optional)</span></p>
                  <p className="truncate text-[11px] text-gray-400">{suPhoto ? suPhoto.name : 'PNG, JPG or WebP — max 5MB'}</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <label className="cursor-pointer rounded-lg bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200 transition-colors hover:bg-brand-100">
                      {suPhoto ? 'Change photo' : 'Upload Photo'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024) { setSuErr('Choose a PNG, JPG or WebP image under 5MB'); return; }
                          setSuErr('');
                          setSuPhoto(f);
                          setSuPreview(URL.createObjectURL(f));
                        }}
                      />
                    </label>
                    {suPhoto && (
                      <button
                        type="button"
                        onClick={() => { setSuPhoto(null); setSuPreview(''); }}
                        className="text-[11px] font-medium text-rose-500 hover:text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-gray-700">Full name</label>
                <input required value={su.fullName} onChange={(e) => setSu({ ...su, fullName: e.target.value })} placeholder="First and last name" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-gray-700">Work email</label>
                <div className="flex gap-2">
                  <input required type="email" value={su.email} onChange={(e) => { if (emailLocked) return; setSu({ ...su, email: e.target.value }); resetEmailVerification(); }} readOnly={emailLocked} placeholder="you@company.com" className={`w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${emailLocked ? 'bg-brand-50/50 text-gray-600' : ''}`} />
                  {!emailProof && !suOtpProof ? (
                    <button type="button" onClick={sendVerificationEmail} disabled={fbLoading} className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-3 text-[12px] font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50">
                      {fbLoading ? '...' : fbSent ? 'Resend email' : 'Verify Email'}
                    </button>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {googleVerified ? 'Google Email Verified ✓' : zohoVerified ? 'Zoho Mail Verified ✓' : 'Verified'}
                    </span>
                  )}
                </div>
                {fbSent && !emailProof && !suOtpProof && (
                  <button
                    type="button"
                    onClick={confirmVerified}
                    disabled={fbLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl gradient-brand-btn px-4 py-2.5 text-[12px] font-semibold text-white shadow-md shadow-brand-500/25 disabled:opacity-50"
                  >
                    {fbLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    I&apos;ve Verified — Check Status
                  </button>
                )}
                {fbMsg && <p className="text-[11px] text-brand-700">{fbMsg}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-gray-700">Role</label>
                <select value={su.accountType} onChange={(e) => setSu({ ...su, accountType: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40">
                  <option value="employee">Employee</option>
                  <option value="client">Client</option>
                  <option value="hr">HR Manager</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-gray-700">Password</label>
                  <input required type="password" minLength={8} value={su.password} onChange={(e) => setSu({ ...su, password: e.target.value })} placeholder="Min. 8 chars" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-gray-700">Confirm</label>
                  <input required type="password" value={su.confirm} onChange={(e) => setSu({ ...su, confirm: e.target.value })} placeholder="Repeat" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                </div>
              </div>
              <Button type="submit" disabled={suLoading || (!emailProof && !suOtpProof)} className="h-11 w-full gradient-brand-btn rounded-xl border-0 font-medium text-white shadow-md shadow-brand-500/25 disabled:opacity-60">
                {suLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : (emailProof || suOtpProof) ? 'Create Account' : 'Verify email to continue'}
              </Button>
              <button type="button" onClick={() => setAuthMode('login')} className="w-full text-center text-[13px] font-medium text-brand-600 hover:underline">
                Already have an account? Sign in
              </button>
            </form>
          )}

          {authMode === 'forgot' && (
            <form onSubmit={submitForgot} className="space-y-4">
              {fpErr && (
                <div className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50 p-3.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <p className="text-[13px] font-medium text-rose-700">{fpErr}</p>
                </div>
              )}
              {fpMsg && (
                <div className="flex items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50 p-3.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />
                  <p className="text-[13px] font-medium text-brand-800">{fpMsg}</p>
                </div>
              )}
              {fpStep === 1 ? (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium text-gray-700">Email address</label>
                  <input required type="email" value={fpEmail} onChange={(e) => setFpEmail(e.target.value)} placeholder="you@company.com" className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-gray-700">New password</label>
                    <input required type="password" minLength={8} value={fpPw} onChange={(e) => setFpPw(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-gray-700">Confirm new password</label>
                    <input required type="password" value={fpConfirm} onChange={(e) => setFpConfirm(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                  </div>
                </>
              )}
              <Button type="submit" disabled={fpLoading} className="h-11 w-full gradient-brand-btn rounded-xl border-0 font-medium text-white shadow-md shadow-brand-500/25">
                {fpLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{fpStep === 1 ? 'Sending...' : 'Updating...'}</> : fpStep === 1 ? 'Send Reset Link' : 'Update Password'}
              </Button>
              <button type="button" onClick={() => { setAuthMode('login'); setFpStep(1); setFpErr(''); setFpMsg(''); }} className="w-full text-center text-[13px] font-medium text-brand-600 hover:underline">
                Back to Sign in
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
