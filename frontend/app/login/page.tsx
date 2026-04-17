"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react';

import { login } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await login({ email, password });
      localStorage.setItem('archguard_access_token', result.access_token);
      localStorage.setItem('archguard_refresh_token', result.refresh_token);
      localStorage.setItem('archguard_user', JSON.stringify(result.user));
      router.push('/dashboard');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-10 lg:px-10">
      <section className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">ArchGuard access</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Sign in to your governance console.</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
            Use your organization account to inspect projects, architecture versions, and compliance
            reports.
          </p>
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <LockKeyhole className="h-4 w-4 text-amber-300" />
              <span className="text-sm text-slate-200">JWT auth and role-aware access</span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <UserRound className="h-4 w-4 text-teal-300" />
              <span className="text-sm text-slate-200">Architect, developer, devops, and viewer workflows</span>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-8 shadow-halo backdrop-blur">
          <div className="space-y-5">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/45">Welcome back</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Authenticate to continue</h2>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Email</span>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="architect@company.com"
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                    required
                  />
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Password</span>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <LockKeyhole className="h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                    required
                  />
                </div>
              </label>

              {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Signing in...' : 'Open dashboard'} <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}