'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Mail, Lock, AlertCircle, CheckCircle2, Loader2, Copy, Check, Camera } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { panelRoleOf, homeFor } from '@/lib/roles';
import Link from 'next/link';
import { LooplyLogo } from '@/components/LooplyLogo';

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
  const fbUser = useRef<any>(null);

  const resetEmailVerification = () => {
    setFbSent(false); setFbLoading(false); setFbMsg('');
    setEmailProof(''); setEmailLocked(false); fbUser.current = null;
  };

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
    } catch (err: any) {
      setFbMsg(err?.message || 'Could not send verification email');
    } finally {
      setFbLoading(false);
    }
  };

  const confirmVerified = async () => {
    setFbMsg(''); setFbLoading(true);
    try {
      if (!fbUser.current) { setFbMsg('Request a verification email first'); return; }
      await fbUser.current.reload();
      if (!fbUser.current.emailVerified) {
        setFbMsg('Not verified yet — open the email, click the link, then try again.');
        return;
      }
      const token = await fbUser.current.getIdToken(true);
      setEmailProof(token);
      setEmailLocked(true);
      setFbSent(false);
      setFbMsg('');
    } catch (err: any) {
      setFbMsg(err?.message || 'Could not confirm verification');
    } finally {
      setFbLoading(false);
    }
  };

  const allCredentials = [...loginCredentials, ...extraCreds];

  const applyGoogleCred = (cred: any) => {
    setEmailProof(''); // replaced below once token resolves
    void (async () => {
      const idToken = await cred.user.getIdToken();
      setEmailProof(idToken);
      setEmailLocked(true);
      const email = cred.user.email ?? '';
      const name = cred.user.displayName ?? '';
      setSu((s) => ({ ...s, email, fullName: s.fullName || name }));
    })();
  };

  // Complete a Google redirect sign-in when the page loads
  useEffect(() => {
    (async () => {
      try {
        const { getRedirectResult } = await import('firebase/auth');
        const { auth } = await import('@/lib/firebase');
        const cred = await getRedirectResult(auth);
        if (cred?.user) applyGoogleCred(cred);
      } catch {
        /* not a redirect return */
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
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported', 'auth/unauthorized-domain'].includes(code)) {
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
          setSuErr(`Google sign-in failed (${code}) — please try again or use email verification below.`);
        }
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const submitSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuErr(''); setSuMsg('');
    const parts = su.fullName.trim().split(/\s+/);
    if (parts.length < 2) { setSuErr('Please enter your full name (first and last name)'); return; }
    if (su.password !== su.confirm) { setSuErr('Passwords do not match'); return; }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(su.password)) { setSuErr('Password needs 8+ chars with upper, lower case and a number'); return; }
    if (!emailProof) { setSuErr('Please verify your email via the link sent to your inbox first'); return; }
    setSuLoading(true);
    try {
      const fd = new FormData();
      fd.append('firstName', parts[0]);
      fd.append('lastName', parts.slice(1).join(' '));
      fd.append('email', su.email);
      fd.append('password', su.password);
      fd.append('phone', '');
      fd.append('accountType', su.accountType);
      fd.append('firebaseIdToken', emailProof);
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
    <div className="min-h-screen flex bg-white">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative flex-col justify-between overflow-hidden border-r border-gray-100 p-12" style={{ backgroundColor: '#ffffff' }}>
        <div className="relative flex items-center gap-3 animate-rotate-in">
          <LooplyLogo animate={true} size="md" />
        </div>

        <div className="relative max-w-md animate-slide-up">
          <h2 className="text-4xl font-semibold text-gray-900 leading-[1.15] tracking-tight">
            Run your agency,
            <br />
            <span className="gradient-text-animated">beautifully organized.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-500">
            The all-in-one operating system for digital agencies — from first proposal to final invoice.
          </p>
          <ul className="mt-8 space-y-3.5 stagger">
            {features.map((feature, idx) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-gray-600 smooth-transition hover:text-gray-900 hover:translate-x-1" style={{ animationDelay: `${idx * 100}ms` }}>
                <CheckCircle2 className="h-[18px] w-[18px] text-brand-600 shrink-0 animate-icon-pop" style={{ animationDelay: `${idx * 100 + 200}ms` }} />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-4 text-xs text-gray-500">
          <span>© 2026 Looply</span>
          <span className="h-1 w-1 rounded-full bg-gray-300" />
          <span>Trusted by modern agencies</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-[400px] animate-fade-in-blur">
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center animate-rotate-in">
            <LooplyLogo animate={true} size="md" />
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
                  {!emailProof ? (
                    <button type="button" onClick={sendVerificationEmail} disabled={fbLoading} className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-3 text-[12px] font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50">
                      {fbLoading ? '...' : fbSent ? 'Resend email' : 'Verify Email'}
                    </button>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 rounded-xl bg-brand-50 px-3 text-[12px] font-semibold text-brand-700 ring-1 ring-brand-200">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                    </span>
                  )}
                </div>
                {fbSent && !emailProof && (
                  <button
                    type="button"
                    onClick={confirmVerified}
                    disabled={fbLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl gradient-brand-btn px-4 py-2.5 text-[12px] font-semibold text-white shadow-md shadow-brand-500/25 disabled:opacity-50"
                  >
                    {fbLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    I have verified — continue
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
              <Button type="submit" disabled={suLoading || !emailProof} className="h-11 w-full gradient-brand-btn rounded-xl border-0 font-medium text-white shadow-md shadow-brand-500/25 disabled:opacity-60">
                {suLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : emailProof ? 'Create Account' : 'Verify email to continue'}
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
