"use client";

import { useEffect, useState } from "react";
import { RiBarChart2Line } from "@remixicon/react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  getAiCandidateReviewTrend,
  getAnalyticsHistory,
  getAnalyticsSummary,
  getDocumentTrends,
  getWorkerHealth,
  getWorkerOpsHints,
} from "@/lib/api";
import { formatPercent } from "@/lib/format";
import type { AiCandidateReviewTrend, AnalyticsHistory, AnalyticsSummary, DocumentTrend, WorkerHealth, WorkerOpsHints } from "@/lib/types";

const healthConfig = { average_health_score: { label: "Health", color: "var(--chart-3)" } } satisfies ChartConfig;
const documentConfig = {
  uploaded_count: { label: "Uploaded", color: "var(--chart-1)" },
  failed_count: { label: "Failed", color: "var(--destructive)" },
} satisfies ChartConfig;
const aiConfig = { acceptance_rate_percent: { label: "Acceptance", color: "var(--chart-4)" } } satisfies ChartConfig;

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [history, setHistory] = useState<AnalyticsHistory | null>(null);
  const [documents, setDocuments] = useState<DocumentTrend | null>(null);
  const [ai, setAi] = useState<AiCandidateReviewTrend | null>(null);
  const [worker, setWorker] = useState<WorkerHealth | null>(null);
  const [ops, setOps] = useState<WorkerOpsHints | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [summaryData, historyData, documentData, aiData, workerData, opsData] = await Promise.all([
          getAnalyticsSummary(),
          getAnalyticsHistory(14),
          getDocumentTrends(14).catch(() => null),
          getAiCandidateReviewTrend(14).catch(() => null),
          getWorkerHealth().catch(() => null),
          getWorkerOpsHints().catch(() => null),
        ]);
        setSummary(summaryData);
        setHistory(historyData);
        setDocuments(documentData);
        setAi(aiData);
        setWorker(workerData);
        setOps(opsData);
        setError("");
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const healthPoints = history?.points.map((point) => ({ ...point, date: dateLabel(point.bucket_start) })) ?? [];
  const documentPoints = documents?.points.map((point) => ({ ...point, date: dateLabel(point.bucket_start) })) ?? [];
  const aiPoints = ai?.points.map((point) => ({ ...point, date: dateLabel(point.bucket_start) })) ?? [];

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Operational Intelligence
          </p>
          <div className="space-y-1">
            <CardTitle className="text-3xl">Analytics</CardTitle>
            <p className="text-sm text-muted-foreground">
              Organization health, document processing, AI review, and worker status.
            </p>
          </div>
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => (
              <Card key={index} className="border-border/70 bg-card/85 shadow-sm">
                <CardHeader className="pb-3">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-10 w-20" />
                  <Skeleton className="h-4 w-28" />
                </CardContent>
              </Card>
            ))
          : [
              { title: "Average Health", value: formatPercent(summary?.average_health_score), detail: null },
              { title: "Active Projects", value: summary?.active_projects ?? 0, detail: null },
              { title: "Reports", value: summary?.total_reports ?? 0, detail: null },
              { title: "Critical Violations", value: summary?.critical_violations ?? 0, detail: null },
              { title: "Documents", value: summary?.total_documents ?? 0, detail: `${summary?.failed_documents ?? 0} failed` },
            ].map((metric) => (
              <Card key={metric.title} className="border-border/70 bg-card/85 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {metric.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-3xl font-semibold tracking-tight">{metric.value}</div>
                  {metric.detail ? <p className="text-xs text-muted-foreground">{metric.detail}</p> : null}
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle>Health Score Trend</CardTitle>
            <p className="text-sm text-muted-foreground">Average compliance score by day.</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : healthPoints.length ? (
              <ChartContainer config={healthConfig} className="h-[260px] w-full">
                <AreaChart data={healthPoints} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area dataKey="average_health_score" fill="var(--color-average_health_score)" fillOpacity={0.18} stroke="var(--color-average_health_score)" />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                <RiBarChart2Line className="size-12 text-muted-foreground" />
                <h3 className="text-base font-semibold">No health trend</h3>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle>Document Processing</CardTitle>
            <p className="text-sm text-muted-foreground">Uploads and failures over time.</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : documentPoints.length ? (
              <ChartContainer config={documentConfig} className="h-[260px] w-full">
                <BarChart data={documentPoints} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="uploaded_count" fill="var(--color-uploaded_count)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed_count" fill="var(--color-failed_count)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                <RiBarChart2Line className="size-12 text-muted-foreground" />
                <h3 className="text-base font-semibold">No document trend</h3>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle>AI Candidate Acceptance</CardTitle>
            <p className="text-sm text-muted-foreground">Reviewed candidate acceptance rate.</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : aiPoints.length ? (
              <ChartContainer config={aiConfig} className="h-[260px] w-full">
                <LineChart data={aiPoints} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line dataKey="acceptance_rate_percent" stroke="var(--color-acceptance_rate_percent)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                <RiBarChart2Line className="size-12 text-muted-foreground" />
                <h3 className="text-base font-semibold">No AI review trend</h3>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle>Worker And Queue</CardTitle>
            <p className="text-sm text-muted-foreground">
              Operational readiness from backend worker health.
            </p>
          </CardHeader>
          <CardContent>
          <div className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <div className="grid gap-3 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-28 w-full" />
                  ))}
                </div>
              </div>
            ) : worker ? (
              <>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">Worker</span>
                  <Badge variant="outline">{humanize(worker.worker_status)}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">Redis</span>
                  <Badge variant="outline">{humanize(worker.redis_status)}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { title: "Workers", value: worker.celery_worker_count, detail: null },
                    { title: "Latency", value: worker.redis_latency_ms ?? "N/A", detail: worker.redis_latency_ms !== null ? "ms" : null },
                    { title: "Backend", value: worker.queue_backend, detail: null },
                  ].map((metric) => (
                    <Card key={metric.title} className="border-border/70 bg-card/85 shadow-sm">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {metric.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-3xl font-semibold tracking-tight">{metric.value}</div>
                        {metric.detail ? (
                          <p className="text-xs text-muted-foreground">{metric.detail}</p>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {ops ? (
                  <pre className="max-h-40 overflow-auto rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">{JSON.stringify(ops, null, 2)}</pre>
                ) : null}
              </>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                <RiBarChart2Line className="size-12 text-muted-foreground" />
                <h3 className="text-base font-semibold">No worker health data</h3>
              </div>
            )}
          </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
