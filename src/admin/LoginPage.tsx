/**
 * Team login for the leads dashboard.
 */
import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react';
import type { AdminUser } from '../data/leads';
import { BUSINESS_INFO } from '../data/portfolioData';
import { api } from './api';

export const LoginPage: React.FC<{ onLoggedIn: (user: AdminUser) => void }> = ({ onLoggedIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onLoggedIn(await api.login(email.trim(), password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] grid lg:grid-cols-2 font-sans text-[#1D1714]">
      {/* Photo panel (large screens) */}
      <div className="relative hidden lg:block overflow-hidden">
        <img
          src="/images/portfolio/about-deepika-portrait.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-[center_25%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1D1714]/80 via-[#1D1714]/20 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <p className="font-serif italic text-3xl">{BUSINESS_INFO.name}</p>
          <p className="mt-2 text-sm text-white/80">Every enquiry from your ads, website and WhatsApp, in one place.</p>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col justify-center px-5 py-12 sm:px-12">
        <div className="w-full max-w-sm mx-auto">
          <a href="/" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-[#9E7D53] hover:text-[#1D1714] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to website
          </a>

          <div className="mt-10 w-11 h-11 rounded-full bg-[#1D1714] text-[#C5A880] flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="mt-5 font-serif text-3xl sm:text-4xl">Team login</h1>
          <p className="mt-2 text-sm text-[#6A5F56]">Log in to see and manage your leads.</p>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-xs font-medium uppercase tracking-[0.12em] text-[#6A5F56]">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[#D9D0C5] bg-white px-4 py-3 text-sm outline-none focus:border-[#9E7D53] focus:ring-2 focus:ring-[#C5A880]/40"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-medium uppercase tracking-[0.12em] text-[#6A5F56]">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#D9D0C5] bg-white pl-4 pr-12 py-3 text-sm outline-none focus:border-[#9E7D53] focus:ring-2 focus:ring-[#C5A880]/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[#6A5F56] hover:text-[#1D1714] hover:bg-[#F4EFEA]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-[#F2C9C4] bg-[#FDF1EF] px-4 py-3 text-sm text-[#A1332A]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-[#1D1714] py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#3A322C] disabled:opacity-60 transition-colors"
            >
              {busy ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <p className="mt-8 text-xs text-[#6A5F56] leading-relaxed">
            Forgot your password? Ask the site owner to reset it with <code className="text-[#1D1714]">npm run admin:create</code>.
          </p>
        </div>
      </div>
    </div>
  );
};
