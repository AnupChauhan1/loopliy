'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ZohoIcon } from '@/components/zoho-icon';
import { AlertCircle, Loader2, Mail, Lock, X } from 'lucide-react';

interface Props {
  open: boolean;
  mode: 'signup' | 'login';
  initialEmail?: string;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (email: string, password: string) => void;
}

/** Zoho-branded modal collecting Zoho Mail ID + password before dispatching
 *  the phone approval verification. */
export function ZohoVerifyModal({ open, mode, initialEmail = '', loading, error, onClose, onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);

  // Seed the email each time the modal opens
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setEmail(initialEmail); setPassword(''); setTouched(false); }
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pwOk = password.length >= 8;
  const valid = emailOk && pwOk;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-emerald-100">
                  <ZohoIcon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-900">Zoho Mail Verification</p>
                  <p className="text-[11px] text-gray-500">Approve from your phone&apos;s Zoho Mail app</p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              className="space-y-3.5 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                setTouched(true);
                if (valid && !loading) onSubmit(email.trim().toLowerCase(), password);
              }}
            >
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-gray-700">Zoho Mail ID</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@zohomail.in or name@company.com"
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                {touched && !emailOk && <p className="text-[11px] text-rose-500">Enter a valid Zoho Mail ID</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-gray-700">{mode === 'signup' ? 'Create Password' : 'Password'}</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Min 8 characters' : 'Your Zoho account password'}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                {touched && !pwOk && <p className="text-[11px] text-rose-500">Password must be at least 8 characters</p>}
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <p className="text-[12px] font-medium text-rose-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !valid}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ZohoIcon className="h-4 w-4" />}
                {loading ? 'Sending…' : 'Send Approval Notification to Zoho Mail'}
              </button>
              <p className="text-center text-[11px] text-gray-400">
                A verification link will be pushed to your Zoho Mail inbox — approve it on your phone.
              </p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
