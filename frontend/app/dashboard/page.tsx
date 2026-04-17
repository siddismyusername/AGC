"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { getProject, getProjectHealth, getProjects, HealthScoreOut, ProjectListItem } from '../../lib/api';
import { activityFeed as fallbackActivityFeed, projectSummary as fallbackProjectSummary, recentProjects as fallbackRecentProjects } from '../../lib/mock-data';
import { Activity, AlertTriangle, CheckCircle2, GitBranch, TrendingUp } from 'lucide-react';

const statusStyles: Record<string, string> = {
  healthy: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/20',
  warning: 'bg-amber-400/15 text-amber-100 border-amber-400/20',
  attention: 'bg-rose-400/15 text-rose-100 border-rose-400/20',
};

type ProjectCard = {
  id?: string;
  name: string;
  branch: string;
  score: number;
  status: 'healthy' | 'warning' | 'attention';
  violations: number;
};

const fallbackProjectCards: ProjectCard[] = fallbackRecentProjects.map((item) => ({
  ...item,
  status: item.status as 'healthy' | 'warning' | 'attention',
}));

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summaryCards, setSummaryCards] = useState(fallbackProjectSummary);
  const [projectCards, setProjectCards] = useState<ProjectCard[]>(fallbackProjectCards);
  const [activityFeed, setActivityFeed] = useState(fallbackActivityFeed);

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true);
      setErrorMessage(null);

      const accessToken = localStorage.getItem('archguard_access_token');
      if (!accessToken) {
        setAuthRequired(true);
        setIsLoading(false);
        return;
      }

      try {
        const projects = await getProjects(accessToken);
        const activeProjects = projects.filter((item) => item.is_active);

        const healthEntries = await Promise.all(
          activeProjects.map(async (project) => ({
            project,
            health: await getProjectHealth(project.id, accessToken),
          })),
        );

        const topProjects = healthEntries.slice(0, 3);
        const cards = await Promise.all(
          topProjects.map(async ({ project, health }) => {
            const details = await getProject(project.id, accessToken);
            const score = Math.round(health?.health_score ?? 0);

            let status: 'healthy' | 'warning' | 'attention' = 'attention';
            if (score >= 90) {
              status = 'healthy';
            } else if (score >= 75) {
              status = 'warning';
            }

            return {
              id: project.id,
              name: project.name,
              branch: details.default_branch,
              score,
              status,
              violations: health?.total_violations ?? 0,
            } as ProjectCard;
          }),
        );

        const knownHealth = healthEntries
          .map((item) => item.health)
          .filter((entry): entry is HealthScoreOut => entry !== null);

        const totalCritical = knownHealth.reduce((sum, item) => sum + item.critical_count, 0);
        const averageHealth =
          knownHealth.length > 0
            ? (knownHealth.reduce((sum, item) => sum + item.health_score, 0) / knownHealth.length).toFixed(1)
            : '0.0';

        setSummaryCards([
          { label: 'Active projects', value: String(activeProjects.length), delta: 'Live from API' },
          { label: 'Health score', value: averageHealth, delta: `${knownHealth.length} reports` },
          { label: 'Critical violations', value: String(totalCritical), delta: 'Current open risk' },
          {
            label: 'Pending reviews',
            value: String(activeProjects.length - knownHealth.length),
            delta: 'Projects without reports',
          },
        ]);

        setProjectCards(cards.length > 0 ? cards : fallbackProjectCards);

        const liveEvents = [
          `Fetched ${activeProjects.length} active projects from backend.`,
          `Loaded health snapshots for ${knownHealth.length} projects.`,
          totalCritical > 0
            ? `${totalCritical} critical violations currently need review.`
            : 'No critical violations reported in loaded snapshots.',
          'Dashboard is now reading live API data.',
        ];
        setActivityFeed(liveEvents);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load dashboard data');
        setProjectCards(fallbackProjectCards);
        setSummaryCards(fallbackProjectSummary);
        setActivityFeed(fallbackActivityFeed);
      } finally {
        setIsLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  const backendStatusText = useMemo(() => {
    if (isLoading) {
      return 'Loading backend data';
    }
    if (authRequired) {
      return 'Sign in required';
    }
    if (errorMessage) {
      return 'Backend fallback mode';
    }
    return 'Backend synced';
  }, [isLoading, authRequired, errorMessage]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-8 lg:px-10">
      <div className="space-y-8">
        <header className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">ArchGuard dashboard</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Governance overview</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Track architecture health, compliance activity, and the most recent signals from static
                analysis and pipeline enforcement.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
              {backendStatusText}
            </div>
          </div>
          {authRequired ? (
            <p className="mt-4 text-sm text-amber-200">
              You are not signed in. Continue to <Link href="/login" className="underline">login</Link> to load secure project data.
            </p>
          ) : null}
          {errorMessage ? <p className="mt-4 text-sm text-rose-300">{errorMessage}</p> : null}
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((item) => (
            <article key={item.label} className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 shadow-halo backdrop-blur">
              <p className="text-sm text-slate-400">{item.label}</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <span className="text-4xl font-semibold text-white">{item.value}</span>
                <span className="text-xs text-emerald-200">{item.delta}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-white/45">Projects</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Compliance status by project</h2>
              </div>
              <TrendingUp className="h-5 w-5 text-amber-300" />
            </div>

            <div className="mt-6 space-y-4">
              {projectCards.map((project) => (
                <div key={project.name} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{project.name}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                          <GitBranch className="h-3.5 w-3.5" />
                          {project.branch}
                        </span>
                        <span>{project.violations} violations</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Health score</p>
                        <p className="text-3xl font-semibold text-white">{project.score}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[project.status]}`}>
                        {project.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <aside className="space-y-6">
            <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-amber-400/10 p-3 text-amber-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/45">Priority signal</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Review critical dependency paths</h2>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                Focus first on projects with rising violation counts and the highest severity mix. Those are
                the best candidates for architecture version review.
              </p>
            </article>

            <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-teal-400/10 p-3 text-teal-300">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/45">Recent activity</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Latest governance events</h2>
                </div>
              </div>

              <ul className="mt-5 space-y-3">
                {activityFeed.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}