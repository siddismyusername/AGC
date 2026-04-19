"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import {
  AnalyticsHistoryPointOut,
  AuditEvent,
  DocumentMetricsTrendPointOut,
  getAnalyticsHistory,
  getDocumentMetricsTrend,
  getAnalyticsSummary,
  getAuditEvents,
  getProject,
  getProjectHealth,
  getProjects,
  getWorkerHealth,
  getWorkerOpsHints,
  WorkerHealthOut,
  WorkerOpsHintsOut,
} from '../../lib/api';
import {
  projectSummary as fallbackProjectSummary,
  recentProjects as fallbackRecentProjects,
} from '../../lib/mock-data';
import { Activity, AlertTriangle, CheckCircle2, GitBranch, TrendingUp } from 'lucide-react';
import RouteGuard from '../../components/route-guard';

const statusStyles: Record<string, string> = {
  healthy: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/20',
  warning: 'bg-amber-400/15 text-amber-100 border-amber-400/20',
  attention: 'bg-rose-400/15 text-rose-100 border-rose-400/20',
};

const workerStatusStyles: Record<string, string> = {
  healthy: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/20',
  degraded: 'bg-amber-400/15 text-amber-100 border-amber-400/20',
  down: 'bg-rose-400/15 text-rose-100 border-rose-400/20',
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summaryCards, setSummaryCards] = useState(fallbackProjectSummary);
  const [projectCards, setProjectCards] = useState<ProjectCard[]>(fallbackProjectCards);
  const [activityFeed, setActivityFeed] = useState<string[]>([]);
  const [trendPoints, setTrendPoints] = useState<AnalyticsHistoryPointOut[]>([]);
  const [documentTrendPoints, setDocumentTrendPoints] = useState<DocumentMetricsTrendPointOut[]>([]);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthOut | null>(null);
  const [workerOpsHints, setWorkerOpsHints] = useState<WorkerOpsHintsOut | null>(null);

  function formatAuditEvent(event: AuditEvent): string {
    const actor = event.user_email ?? 'System';
    const action = event.action.replaceAll('.', ' ').replaceAll('_', ' ');
    const when = new Date(event.created_at).toLocaleString();
    const newValue = event.new_value ?? {};
    const oldValue = event.old_value ?? {};
    const changedKeys = Object.keys(newValue);

    if (changedKeys.length > 0) {
      const primaryKey = changedKeys[0];
      const previous = oldValue[primaryKey];
      const next = newValue[primaryKey];

      if (previous !== undefined) {
        return `${actor} changed ${event.entity_type} ${primaryKey} from "${String(previous)}" to "${String(next)}" at ${when}.`;
      }

      if (changedKeys.length > 1) {
        return `${actor} performed ${action} on ${event.entity_type} (${changedKeys.length} fields updated) at ${when}.`;
      }

      return `${actor} set ${event.entity_type} ${primaryKey} to "${String(next)}" at ${when}.`;
    }

    return `${actor} performed ${action} on ${event.entity_type} at ${when}.`;
  }

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [projects, summary, events, history, worker, workerOps, documentTrend] = await Promise.all([
          getProjects(),
          getAnalyticsSummary(),
          getAuditEvents(1, 8),
          getAnalyticsHistory(14),
          getWorkerHealth(),
          getWorkerOpsHints(),
          getDocumentMetricsTrend(14),
        ]);
        const activeProjects = projects.filter((item) => item.is_active);

        const healthEntries = await Promise.all(
          activeProjects.map(async (project) => ({
            project,
            health: await getProjectHealth(project.id),
          })),
        );

        const topProjects = healthEntries.slice(0, 3);
        const cards = await Promise.all(
          topProjects.map(async ({ project, health }) => {
            const details = await getProject(project.id);
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

        setSummaryCards([
          { label: 'Active projects', value: String(summary.active_projects), delta: 'Live from analytics' },
          {
            label: 'Health score',
            value: summary.average_health_score.toFixed(1),
            delta: `${summary.total_reports} reports`,
          },
          {
            label: 'Critical violations',
            value: String(summary.critical_violations),
            delta: 'Current open risk',
          },
          {
            label: 'Documents',
            value: String(summary.total_documents),
            delta: `${summary.completed_documents} completed • ${summary.pending_documents + summary.processing_documents} in progress`,
          },
        ]);

        setProjectCards(cards.length > 0 ? cards : fallbackProjectCards);

        setActivityFeed(events.map(formatAuditEvent));
        setTrendPoints(history.points.slice(-5));
        setWorkerHealth(worker);
        setWorkerOpsHints(workerOps);
        setDocumentTrendPoints(documentTrend.points.slice(-7));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load dashboard data');
        setProjectCards(fallbackProjectCards);
        setSummaryCards(fallbackProjectSummary);
        setActivityFeed([]);
        setTrendPoints([]);
        setWorkerHealth(null);
        setWorkerOpsHints(null);
        setDocumentTrendPoints([]);
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
    if (errorMessage) {
      return 'Backend data error';
    }
    return 'Backend synced';
  }, [isLoading, errorMessage]);

  return (
    <RouteGuard>
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
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/organization"
                className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/10"
              >
                Organization settings
              </Link>
              <Link
                href="/architecture/graph"
                className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/10"
              >
                Graph explorer
              </Link>
              <Link
                href="/architecture/rules"
                className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/10"
              >
                Rule editor
              </Link>
              <Link
                href="/documents"
                className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/10"
              >
                Documents
              </Link>
            </div>
          </div>
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
                  <p className="text-sm uppercase tracking-[0.3em] text-white/45">Health trend (14d)</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Compliance momentum</h2>
                </div>
              </div>
              {trendPoints.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {trendPoints.map((point) => (
                    <li
                      key={point.bucket_start}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-300">{new Date(point.bucket_start).toLocaleDateString()}</span>
                      <span className="text-emerald-200">Score {point.average_health_score.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  No historical reports yet. Run compliance checks to populate trend analytics.
                </p>
              )}
            </article>

            <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/45">Worker health</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Queue and worker status</h2>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${workerStatusStyles[workerHealth?.worker_status ?? 'down']}`}
                >
                  {workerHealth?.worker_status ?? 'down'}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-slate-300">
                <p>Backend: {workerHealth?.queue_backend ?? 'celery'}</p>
                <p>Redis: {workerHealth?.redis_status ?? 'unreachable'}</p>
                <p>Workers online: {workerHealth?.celery_worker_count ?? 0}</p>
                <p>
                  Redis latency:{' '}
                  {workerHealth?.redis_latency_ms !== null && workerHealth?.redis_latency_ms !== undefined
                    ? `${workerHealth.redis_latency_ms} ms`
                    : 'n/a'}
                </p>
              </div>

              {workerOpsHints ? (
                <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Ops actions</p>
                  <ul className="space-y-1 text-xs text-slate-200">
                    {workerOpsHints.recommended_actions.slice(0, 3).map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                  <div className="space-y-2">
                    {workerOpsHints.runbook_commands.slice(0, 2).map((entry) => (
                      <div key={entry.label} className="rounded-xl border border-white/10 bg-slate-950/70 p-2">
                        <p className="text-xs font-semibold text-amber-200">{entry.label}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{entry.when_to_use}</p>
                        <p className="mt-1 break-all font-mono text-[11px] text-slate-200">{entry.command}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>

            <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-indigo-400/10 p-3 text-indigo-200">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/45">Document trend (14d)</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Ingestion throughput</h2>
                </div>
              </div>

              {documentTrendPoints.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {documentTrendPoints.map((point) => (
                    <li
                      key={point.bucket_start}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs"
                    >
                      <span className="text-slate-300">{new Date(point.bucket_start).toLocaleDateString()}</span>
                      <span className="text-slate-200">
                        +{point.uploaded_count} uploaded • {point.completed_count} completed ({point.completed_delta_day_over_day >= 0 ? '+' : ''}{point.completed_delta_day_over_day} DoD) • {point.failed_count} failed • {point.success_rate_percent !== null ? `${point.success_rate_percent.toFixed(1)}% success` : 'n/a success'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  No document processing trend data yet. Upload and process documents to populate this panel.
                </p>
              )}
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
                {activityFeed.length > 0 ? activityFeed.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                    {item}
                  </li>
                )) : (
                  <li className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                    No audit activity available yet for this organization.
                  </li>
                )}
              </ul>
            </article>
          </aside>
        </section>
      </div>
      </main>
    </RouteGuard>
  );
}