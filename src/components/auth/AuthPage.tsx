import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { toast } from '@/hooks/use-toast';
import { Headphones, Eye, EyeOff, ArrowUpRight } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: 'Sign in failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Welcome back', description: 'You are signed in to Sonora.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await signUp(email, password, {
        display_name: displayName,
        username: displayName.toLowerCase().replace(/\s+/g, '_'),
      });
      if (error) {
        toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Welcome to Sonora', description: 'Please check your email to confirm your account.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="sonora-app relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute -left-28 top-0 h-96 w-96 rounded-full bg-white/[.04] blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[30rem] w-[30rem] rounded-full bg-lime-100/[.035] blur-[150px]" />
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <span className="sonora-brand-mark mx-auto mb-5 h-14 w-14"><i/><i/><i/><i/></span>
          <p className="font-[Manrope] text-2xl font-semibold tracking-[-.045em] text-zinc-100">Sonora</p>
          <p className="mt-2 text-[10px] font-medium uppercase tracking-[.24em] text-zinc-600">Music for your moments</p>
        </div>

        <section className="rounded-[28px] border border-white/[.09] bg-[linear-gradient(145deg,rgba(28,30,29,.96),rgba(10,11,11,.98))] p-6 shadow-[0_30px_90px_rgba(0,0,0,.55),inset_0_1px_rgba(255,255,255,.05)] sm:p-8">
          <div className="mb-7">
            <p className="mb-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.22em] text-zinc-500"><Headphones className="h-3.5 w-3.5" /> Your listening space</p>
            <h1 className="font-[Manrope] text-3xl font-medium tracking-[-.05em] text-zinc-100">{mode === 'signin' ? 'Welcome back.' : 'Find your frequency.'}</h1>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{mode === 'signin' ? 'Sign in and pick up where the music left off.' : 'Create an account to save your music across devices.'}</p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-full border border-white/[.08] bg-black/20 p-1">
            <button type="button" onClick={() => setMode('signin')} className={mode === 'signin' ? 'rounded-full bg-zinc-100 py-2.5 text-[11px] font-semibold text-zinc-950 shadow-lg' : 'rounded-full py-2.5 text-[11px] font-medium text-zinc-500 transition hover:text-zinc-200'}>Sign in</button>
            <button type="button" onClick={() => setMode('signup')} className={mode === 'signup' ? 'rounded-full bg-zinc-100 py-2.5 text-[11px] font-semibold text-zinc-950 shadow-lg' : 'rounded-full py-2.5 text-[11px] font-medium text-zinc-500 transition hover:text-zinc-200'}>Create account</button>
          </div>

          <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
            {mode === 'signup' && (
              <label className="block">
                <span className="mb-2 block text-[10px] font-medium text-zinc-400">Display name</span>
                <input type="text" autoComplete="name" placeholder="How should we call you?" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required className="w-full rounded-xl border border-white/[.09] bg-black/25 px-4 py-3.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-white/25 focus:bg-black/35" />
              </label>
            )}
            <label className="block">
              <span className="mb-2 block text-[10px] font-medium text-zinc-400">Email address</span>
              <input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full rounded-xl border border-white/[.09] bg-black/25 px-4 py-3.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-white/25 focus:bg-black/35" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-medium text-zinc-400">Password</span>
              <span className="relative block">
                <input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder={mode === 'signin' ? 'Enter your password' : 'Create a password'} value={password} onChange={(event) => setPassword(event.target.value)} required className="w-full rounded-xl border border-white/[.09] bg-black/25 px-4 py-3.5 pr-12 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-white/25 focus:bg-black/35" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 transition hover:text-zinc-200">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </span>
            </label>
            <button type="submit" disabled={loading} className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-400 py-3.5 text-xs font-semibold text-zinc-950 shadow-xl transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in to Sonora' : 'Create your account'}
              {!loading && <ArrowUpRight className="h-4 w-4" />}
            </button>
          </form>
        </section>

        <p className="mt-6 text-center text-[10px] leading-5 text-zinc-700">By continuing, you agree to our Terms of Service and Privacy Policy.</p>
      </div>
    </main>
  );
};
