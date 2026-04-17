import Link from 'next/link';
import { ArrowRight, ShieldCheck, Workflow, Radar, FileImage, FileText } from 'lucide-react';

const pillars = [
  {
    icon: ShieldCheck,
    title: 'Policy enforcement',
    text: 'Catch architecture drift before merge with deterministic graph checks and role-based governance.',
  },
  {
    icon: Workflow,
    title: 'CI/CD integration',
    text: 'Wire architecture checks into GitHub Actions or GitLab CI without breaking developer flow.',
  },
  {
    icon: Radar,
    title: 'Live compliance',
    text: 'Track health score, violation density, and trend changes across every project and version.',
  },
];

const inputs = [
  { icon: FileText, title: 'Documents', text: 'Markdown, text, and PDF sources become structured architecture intent.' },
  { icon: FileImage, title: 'Diagrams', text: 'Image uploads feed OCR and graph extraction for reviewable suggestions.' },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col justify-between px-6 py-8 lg:px-10">
      <header className="flex items-center justify-between rounded-full border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">ArchGuard</p>
          <p className="text-sm text-white/60">Architecture governance, made executable.</p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
        >
          Open dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <section className="grid gap-10 py-16 lg:grid-cols-[1.3fr_0.7fr] lg:items-center lg:py-20">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-100">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Backend MVP ready, frontend execution started
          </div>
          <div className="space-y-5">
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-white md:text-7xl">
              Make architecture{' '}
              <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-teal-300 bg-clip-text text-transparent">
                measurable
              </span>
              , enforceable, and visible.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
              ArchGuard compares intended architecture against real code, surfaces violations in CI, and
              turns docs and diagrams into reviewable structure.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              View dashboard <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-halo backdrop-blur">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-5">
            <p className="text-sm uppercase tracking-[0.3em] text-white/45">System snapshot</p>
            <div className="mt-6 space-y-4">
              {pillars.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-amber-400/15 p-2 text-amber-300">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-medium text-white">{item.title}</h2>
                      <p className="text-sm text-slate-300">{item.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 pb-10 md:grid-cols-2 xl:grid-cols-4">
        {inputs.map((item) => (
          <article key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="mb-4 inline-flex rounded-2xl bg-amber-400/10 p-3 text-amber-300">
              <item.icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
          </article>
        ))}
        <article className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 backdrop-blur md:col-span-2 xl:col-span-2">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-200/80">Execution status</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">Foundation work is underway.</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/80">
            Initial schema, uniqueness enforcement, and backend tests are being put in place before the
            frontend and AI layers expand.
          </p>
        </article>
      </section>
    </main>
  );
}