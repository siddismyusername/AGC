"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ArrowRight, Building2, LockKeyhole, Mail, UserRound } from 'lucide-react';

import { register } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await register({
        email,
        password,
        full_name: fullName,
        organization_name: organizationName,
      });
      router.push('/dashboard');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-10 lg:px-10">
      <section className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">First-time setup</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Create your ArchGuard workspace.</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
            Register the first organization admin account so your team can start validating architecture
            conformance from the dashboard.
          </p>
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <Building2 className="h-4 w-4 text-amber-300" />
              <span className="text-sm text-slate-200">Creates your organization and admin user</span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <UserRound className="h-4 w-4 text-teal-300" />
              <span className="text-sm text-slate-200">Immediate dashboard access after registration</span>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-8 shadow-halo backdrop-blur">
          <div className="space-y-5">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/45">Create account</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Set up organization admin</h2>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Full name</span>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <UserRound className="h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Architecture Lead"
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                    required
                  />
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Organization name</span>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                    placeholder="Acme Platform"
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                    required
                  />
                </div>
              </label>

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
                    placeholder="Minimum 8 characters"
                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                    minLength={8}
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
                {isSubmitting ? 'Creating account...' : 'Create workspace'} <ArrowRight className="h-4 w-4" />
              </button>

              <p className="text-center text-sm text-slate-400">
                Already have an account?{' '}
                <Link href="/login" className="text-amber-300 underline underline-offset-4">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
