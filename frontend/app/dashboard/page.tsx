"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import GovernanceActivityRow, { summarizeAuditEvent } from '../../components/governance-activity-row';
import {
  AICandidateReviewTrendOut,
  AnalyticsHistoryPointOut,
  ComplianceReportOut,
  DocumentOut,
  DocumentMetricsTrendPointOut,
  ExtractorDiagnosticsHistoryEntry,
  ExtractorDiagnosticsSummary,
  getAICandidateReviewTrend,
  getAnalyticsHistory,
  getDocumentMetricsTrend,
  getAnalyticsSummary,
  listComplianceReportViolations,
  listComplianceReports,
  listDocuments,
  getProject,
  getProjectHealth,
  getProjects,
  getWorkerHealth,
  getWorkerOpsHints,
  WorkerHealthOut,
  WorkerOpsHintsOut,
} from '../../lib/api';
import {
  formatExtractorDiagnosticsTimestamp,
  summarizeExtractorDiagnosticsHistoryEntry,
} from '../../lib/extractor-diagnostics';
import useAuditEvents from '../../lib/use-audit-events';
import useGovernanceContext from '../../lib/use-governance-context';
import {
  projectSummary as fallbackProjectSummary,
  recentProjects as fallbackRecentProjects,
} from '../../lib/mock-data';
import { Activity, AlertTriangle, CheckCircle2, GitBranch, TrendingUp } from 'lucide-react';
import RouteGuard from '../../components/route-guard';
import AcceptanceRateTrendChip from '../../components/acceptance-rate-trend-chip';

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

function parseDiagnosticsHistory(extractedData: Record<string, unknown>): ExtractorDiagnosticsHistoryEntry[] {
  const rawHistory = extractedData.extractor_diagnostics_history;
  if (!Array.isArray(rawHistory)) {
    return [];
  }

  return rawHistory
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => ({
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : '',
      event: typeof entry.event === 'string' ? entry.event : 'unknown',
      trigger: typeof entry.trigger === 'string' ? entry.trigger : undefined,
      processing_status: (typeof entry.processing_status === 'string' ? entry.processing_status : 'pending') as DocumentOut['processing_status'],
      queue_backend: typeof entry.queue_backend === 'string' ? entry.queue_backend : null,
      task_id: typeof entry.task_id === 'string' ? entry.task_id : null,
      request_id: typeof entry.request_id === 'string' ? entry.request_id : null,
      key_slot: typeof entry.key_slot === 'string' ? entry.key_slot : null,
      provider_attempts: typeof entry.provider_attempts === 'number' ? entry.provider_attempts : null,
      error_code: typeof entry.error_code === 'string' ? entry.error_code : null,
      retryable: typeof entry.retryable === 'boolean' ? entry.retryable : null,
    }))
    .filter((entry) => !!entry.timestamp)
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}

function extractLatestDiagnostics(projectName: string, documents: DocumentOut[]): ExtractorDiagnosticsSummary | null {
  const candidates = documents
    .map((document) => {
      const extractedData = document.extracted_data ?? {};
      const provider = extractedData.provider as Record<string, unknown> | undefined;
      const error = extractedData.error as Record<string, unknown> | undefined;
      const deadLetter = extractedData.dead_letter as Record<string, unknown> | undefined;
      const job = extractedData.job as Record<string, unknown> | undefined;

      const requestId = typeof provider?.request_id === 'string'
        ? provider.request_id
        : typeof error?.details === 'object' && error?.details !== null && typeof (error.details as Record<string, unknown>).request_id === 'string'
          ? String((error.details as Record<string, unknown>).request_id)
          : null;

      const keySlot = typeof provider?.key_slot === 'string'
        ? provider.key_slot
        : typeof error?.details === 'object' && error?.details !== null && typeof (error.details as Record<string, unknown>).key_slot === 'string'
          ? String((error.details as Record<string, unknown>).key_slot)
          : null;

      const providerAttempts = typeof provider?.attempts === 'number'
        ? provider.attempts
        : typeof error?.attempt === 'number'
          ? error.attempt
          : null;

      const errorCode = typeof error?.code === 'string' ? error.code : null;
      const retryable = typeof error?.retryable === 'boolean'
        ? error.retryable
        : typeof deadLetter?.retryable === 'boolean'
          ? deadLetter.retryable
          : null;
      const queueBackend = typeof job?.queue_backend === 'string' ? job.queue_backend : null;
      const history = parseDiagnosticsHistory(extractedData);

      if (!requestId && !keySlot && providerAttempts === null && !errorCode && retryable === null && !queueBackend && history.length === 0) {
        return null;
      }

      return {
        project_name: projectName,
        document_name: document.file_name,
        file_type: document.file_type,
        processing_status: document.processing_status,
        queue_backend: queueBackend,
        request_id: requestId,
        key_slot: keySlot,
        provider_attempts: providerAttempts,
        error_code: errorCode,
        retryable,
        history,
        updated_at: document.updated_at,
      } satisfies ExtractorDiagnosticsSummary;
    })
    .filter((item): item is ExtractorDiagnosticsSummary => item !== null)
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());

  return candidates[0] ?? null;
}

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summaryCards, setSummaryCards] = useState(fallbackProjectSummary);
  const [projectCards, setProjectCards] = useState<ProjectCard[]>(fallbackProjectCards);
  const [trendPoints, setTrendPoints] = useState<AnalyticsHistoryPointOut[]>([]);
  const [documentTrendPoints, setDocumentTrendPoints] = useState<DocumentMetricsTrendPointOut[]>([]);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthOut | null>(null);
  const [workerOpsHints, setWorkerOpsHints] = useState<WorkerOpsHintsOut | null>(null);
  const [extractorDiagnostics, setExtractorDiagnostics] = useState<ExtractorDiagnosticsSummary | null>(null);
  const [aiReviewAnalytics, setAiReviewAnalytics] = useState<AICandidateReviewTrendOut | null>(null);
  const [complianceContext, setComplianceContext] = useState<{
    project_name: string;
    report: ComplianceReportOut;
    violations: Array<{
      violation_type: string;
      severity: string;
      source_component: string;
      target_component: string | null;
      description: string;
    }>;
  } | null>(null);
  const { auditEvents: activityFeed } = useAuditEvents(1, 8);
  const { sessionUser, organizationMembersById } = useGovernanceContext();

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [projects, summary, history, worker, workerOps, documentTrend, aiReviewTrend] = await Promise.all([
          getProjects(),
          getAnalyticsSummary(),
          getAnalyticsHistory(14),
          getWorkerHealth(),
          getWorkerOpsHints(),
          getDocumentMetricsTrend(14),
          getAICandidateReviewTrend(14),
        ]);
        const activeProjects = projects.filter((item) => item.is_active);
        const topActiveProjects = activeProjects.slice(0, 3);

        const healthEntries = await Promise.all(
          activeProjects.map(async (project) => ({
            project,
            health: await getProjectHealth(project.id),
          })),
        );

        const complianceEntries = await Promise.all(
          topActiveProjects.map(async (project) => {
            const reports = await listComplianceReports(project.id, 1, 1);
            if (reports.length === 0) {
              return null;
            }
            const report = reports[0];
            const violations = await listComplianceReportViolations(project.id, report.id, 1, 3);
            return {
              project_name: project.name,
              report,
              violations: violations.map((violation) => ({
                violation_type: violation.violation_type,
                severity: violation.severity,
                source_component: violation.source_component,
                target_component: violation.target_component,
                description: violation.description,
              })),
            };
          }),
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

        setTrendPoints(history.points.slice(-5));
        setWorkerHealth(worker);
        setWorkerOpsHints(workerOps);
        setDocumentTrendPoints(documentTrend.points.slice(-7));
        setAiReviewAnalytics(aiReviewTrend);

        const diagnosticsCandidates = await Promise.all(
          topActiveProjects.map(async (project) => ({
            projectName: project.name,
            documents: await listDocuments(project.id),
          })),
        );
        const latestDiagnostics = diagnosticsCandidates
          .map(({ projectName, documents }) => extractLatestDiagnostics(projectName, documents))
          .filter((item): item is ExtractorDiagnosticsSummary => item !== null)
          .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())[0] ?? null;
        setExtractorDiagnostics(latestDiagnostics);

        const latestComplianceContext = complianceEntries
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((left, right) => new Date(right.report.created_at).getTime() - new Date(left.report.created_at).getTime())[0] ?? null;
        setComplianceContext(latestComplianceContext);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load dashboard data');
        setProjectCards(fallbackProjectCards);
        setSummaryCards(fallbackProjectSummary);
        setTrendPoints([]);
        setWorkerHealth(null);
        setWorkerOpsHints(null);
        setDocumentTrendPoints([]);
        setExtractorDiagnostics(null);
        setAiReviewAnalytics(null);
        setComplianceContext(null);
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((item) => (
            <article key={item.label} className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 shadow-halo backdrop-blur">
              <p className="text-sm text-slate-400">{item.label}</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <span className="text-4xl font-semibold text-white">{item.value}</span>
                <span className="text-xs text-emerald-200">{item.delta}</span>
              </div>
            </article>
          ))}
          <article className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 shadow-halo backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-400">AI review acceptance</p>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
                Trend
              </span>
            </div>
            {aiReviewAnalytics ? (
              <>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <span className="text-4xl font-semibold text-white">
                    {aiReviewAnalytics.acceptance_rate_percent !== null ? `${aiReviewAnalytics.acceptance_rate_percent.toFixed(1)}%` : 'n/a'}
                  </span>
                  <span className="text-right text-xs text-emerald-200">
                    <span className="block">{aiReviewAnalytics.total_reviews} reviews</span>
                    <span className="block text-slate-400">{aiReviewAnalytics.reviewed_documents} documents</span>
                  </span>
                </div>
                <div className="mt-4 flex items-end gap-1">
                  {aiReviewAnalytics.points.length > 0 ? (
                    aiReviewAnalytics.points.slice(-8).map((point, index) => {
                      const barHeight = point.acceptance_rate_percent === null ? 18 : Math.max(18, Math.min(100, point.acceptance_rate_percent));
                      return (
                        <span
                          key={`${point.bucket_start}-${index}`}
                          className="flex-1 rounded-full bg-emerald-300/80"
                          style={{ height: `${barHeight}px`, minHeight: '18px' }}
                        />
                      );
                    })
                  ) : (
                    <div className="rounded-full border border-dashed border-white/10 px-3 py-2 text-xs text-slate-400">
                      No review trend yet
                    </div>
                  )}
                </div>
                <AcceptanceRateTrendChip
                  className="mt-4 w-full justify-between"
                  acceptanceRatePercent={aiReviewAnalytics.acceptance_rate_percent}
                  reviewCount={aiReviewAnalytics.total_reviews}
                  points={aiReviewAnalytics.points}
                  tone="dark"
                  compact
                />
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                No candidate-review trend is available yet. Review AI candidates to populate this metric.
              </p>
            )}
          </article>
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
                  <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-xs text-slate-300">
                    <p className="font-semibold text-amber-200">Replay activity</p>
                    {workerOpsHints.last_replay_requested_at ? (
                      <p className="mt-1">
                        Last replay: {workerOpsHints.last_replay_document_count} document(s) at{' '}
                        {new Date(workerOpsHints.last_replay_requested_at).toLocaleString()}.
                      </p>
                    ) : (
                      <p className="mt-1 text-slate-400">No replay activity recorded yet for this organization.</p>
                    )}
                  </div>
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

            <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-200">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/45">Extractor diagnostics</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Latest document trace</h2>
                </div>
              </div>

              {extractorDiagnostics ? (
                <div className="mt-4 space-y-2 text-sm text-slate-300">
                  <p>Project: {extractorDiagnostics.project_name}</p>
                  <p>Document: {extractorDiagnostics.document_name} ({extractorDiagnostics.file_type})</p>
                  <p>Status: {extractorDiagnostics.processing_status}</p>
                  <p>Queue: {extractorDiagnostics.queue_backend ?? 'n/a'}</p>
                  <p>Request ID: {extractorDiagnostics.request_id ?? 'n/a'}</p>
                  <p>Auth key slot: {extractorDiagnostics.key_slot ?? 'n/a'}</p>
                  <p>Attempts: {extractorDiagnostics.provider_attempts ?? 0}</p>
                  <p>Error code: {extractorDiagnostics.error_code ?? 'n/a'}</p>
                  <p>Retryable: {extractorDiagnostics.retryable === null ? 'n/a' : extractorDiagnostics.retryable ? 'yes' : 'no'}</p>
                  {extractorDiagnostics.history.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Recent history</p>
                      <ul className="mt-2 space-y-1">
                        {extractorDiagnostics.history.slice(0, 4).map((entry) => (
                          <li key={`${entry.timestamp}-${entry.event}`} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-300">
                            <p>{summarizeExtractorDiagnosticsHistoryEntry(entry)}</p>
                            <p className="text-[11px] text-slate-400">{formatExtractorDiagnosticsTimestamp(entry.timestamp)}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  No extractor diagnostics are available yet. Process or fail a document to populate this view.
                </p>
              )}
            </article>

            <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-rose-400/10 p-3 text-rose-200">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/45">Violation context</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Latest compliance report</h2>
                </div>
              </div>

              {complianceContext ? (
                <div className="mt-4 space-y-2 text-sm text-slate-300">
                  <p>Project: {complianceContext.project_name}</p>
                  <p>Status: {complianceContext.report.status}</p>
                  <p>Health score: {complianceContext.report.health_score !== null ? complianceContext.report.health_score.toFixed(1) : 'n/a'}</p>
                  <p>Total violations: {complianceContext.report.total_violations}</p>
                  <div className="mt-3 space-y-2">
                    {complianceContext.violations.length > 0 ? complianceContext.violations.map((violation) => (
                      <div key={`${violation.violation_type}-${violation.source_component}`} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                        <p className="font-semibold text-rose-200">{violation.violation_type} • {violation.severity}</p>
                        <p className="mt-1 text-slate-300">
                          {violation.source_component}{violation.target_component ? ` → ${violation.target_component}` : ''}
                        </p>
                        <p className="mt-1 text-slate-400">{violation.description}</p>
                      </div>
                    )) : (
                      <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">
                        No violations recorded on the latest report.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  No compliance reports available yet. Run a compliance check to populate this context.
                </p>
              )}
            </article>

            <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-400/10 p-3 text-emerald-200">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/45">AI review governance</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Accept / reject trend</h2>
                </div>
              </div>

              {aiReviewAnalytics ? (
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="uppercase tracking-[0.25em] text-slate-500">Reviews</p>
                      <p className="mt-1 text-2xl font-semibold text-white">{aiReviewAnalytics.total_reviews}</p>
                      <p className="mt-1 text-slate-400">Across {aiReviewAnalytics.reviewed_documents} documents</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="uppercase tracking-[0.25em] text-slate-500">Acceptance rate</p>
                      <p className="mt-1 text-2xl font-semibold text-white">
                        {aiReviewAnalytics.acceptance_rate_percent !== null ? `${aiReviewAnalytics.acceptance_rate_percent.toFixed(1)}%` : 'n/a'}
                      </p>
                      <p className="mt-1 text-slate-400">
                        {aiReviewAnalytics.accepted_candidates} accepted • {aiReviewAnalytics.rejected_candidates} rejected
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                    <p className="font-semibold text-emerald-200">Latest review</p>
                    {aiReviewAnalytics.last_reviewed_at ? (
                      <p className="mt-1">{new Date(aiReviewAnalytics.last_reviewed_at).toLocaleString()}</p>
                    ) : (
                      <p className="mt-1 text-slate-400">No AI candidate reviews recorded yet.</p>
                    )}
                  </div>

                  {aiReviewAnalytics.points.length > 0 ? (
                    <ul className="space-y-2">
                      {aiReviewAnalytics.points.slice(-5).map((point) => (
                        <li
                          key={point.bucket_start}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2"
                        >
                          <span>{new Date(point.bucket_start).toLocaleDateString()}</span>
                          <span className="text-slate-200">
                            {point.accepted_candidates} accepted • {point.rejected_candidates} rejected
                            {point.acceptance_rate_percent !== null ? ` • ${point.acceptance_rate_percent.toFixed(1)}% accept` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm leading-6 text-slate-300">
                      No review decisions yet. Use the Documents page to accept or reject AI candidates and this panel will show the trend.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  No AI review analytics available yet. Review document candidates to populate governance signals.
                </p>
              )}
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
                {activityFeed.length > 0 ? activityFeed.map((event) => (
                  <li key={event.id}>
                    <GovernanceActivityRow
                      event={event}
                      summary={summarizeAuditEvent(event)}
                      sessionUser={sessionUser}
                      membersById={organizationMembersById}
                      tone="dark"
                    />
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