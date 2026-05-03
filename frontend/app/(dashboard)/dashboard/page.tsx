"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { RiBarChart2Line } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, getAnalyticsHistory, getAnalyticsSummary, getAuditEvents, listProjects } from "@/lib/api";
import { formatDate, formatPercent } from "@/lib/format";
import type { AnalyticsHistory, AnalyticsSummary, AuditEvent, ProjectListItem } from "@/lib/types";

const healthConfig = {
  average_health_score: { label: "Health", color: "var(--chart-3)" },
} satisfies ChartConfig;

const criticalConfig = {
  critical_violations: { label: "Critical", color: "var(--destructive)" },
} satisfies ChartConfig;

function actionLabel(action: string) {
  return action
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [history, setHistory] = useState<AnalyticsHistory | null>(null);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [summaryData, historyData, activityData, projectData] = await Promise.all([
          getAnalyticsSummary(),
          getAnalyticsHistory(14),
          getAuditEvents({ page: 1, per_page: 10 }),
          listProjects({ page: 1, per_page: 6 }),
        ]);
        setSummary(summaryData);
        setHistory(historyData);
        setActivity(activityData.data);
        setProjects(projectData.data);
        setError("");
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const points =
    history?.points.map((point) => ({
      ...point,
      date: new Date(point.bucket_start).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    })) ?? [];

  const score = summary?.average_health_score ?? null;

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Governance Overview
            </p>
            <div className="space-y-1">
              <CardTitle className="text-3xl">Dashboard</CardTitle>
              <p className="text-sm text-muted-foreground">
                Organization-wide architecture governance status.
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/projects">Open projects</Link>
          </Button>
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28" />)
        ) : (
          <>
            <Card className="border-border/70 bg-card/85 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Average Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-3xl font-semibold tracking-tight">{formatPercent(score)}</div>
                <Progress value={score ?? 0} className="mt-2" />
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Active Projects
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-3xl font-semibold tracking-tight">
                  {summary?.active_projects ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary?.total_reports ?? 0} reports
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Critical Violations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tracking-tight">
                  {summary?.critical_violations ?? 0}
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-3xl font-semibold tracking-tight">
                  {summary?.total_documents ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary?.processing_documents ?? 0} processing
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent Events
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-3xl font-semibold tracking-tight">
                  {summary?.recent_audit_events ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">Last 24 hours</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-7">
        <Card className="border-border/70 bg-card/80 shadow-sm xl:col-span-4">
          <CardHeader>
            <CardTitle>Health Trend</CardTitle>
            <p className="text-sm text-muted-foreground">
              Average architecture health score over the last 14 days.
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px]" />
            ) : points.length ? (
              <ChartContainer config={healthConfig} className="h-[260px] w-full">
                <AreaChart data={points} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} domain={[0, 100]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    dataKey="average_health_score"
                    type="monotone"
                    fill="var(--color-average_health_score)"
                    fillOpacity={0.18}
                    stroke="var(--color-average_health_score)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                <RiBarChart2Line className="size-12 text-muted-foreground" />
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">No trend data</h3>
                  <p className="text-sm text-muted-foreground">
                    Run compliance checks to build historical health data.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-sm xl:col-span-3">
          <CardHeader>
            <CardTitle>Critical Violations</CardTitle>
            <p className="text-sm text-muted-foreground">Critical findings by day.</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px]" />
            ) : points.length ? (
              <ChartContainer config={criticalConfig} className="h-[260px] w-full">
                <BarChart data={points} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="critical_violations" fill="var(--color-critical_violations)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                <RiBarChart2Line className="size-12 text-muted-foreground" />
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">No violation trend</h3>
                  <p className="text-sm text-muted-foreground">
                    Critical violation history appears after report generation.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-7">
        <Card className="border-border/70 bg-card/80 shadow-sm xl:col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Latest governance events across the workspace.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[320px]">
              {loading ? (
                <div className="space-y-3 p-6">
                  {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-10" />)}
                </div>
              ) : activity.length ? (
                <div className="divide-y">
                  {activity.map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-muted/20">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{actionLabel(event.action)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDate(event.created_at)}</span>
                          {event.user_email ? <span>{event.user_email}</span> : null}
                        </div>
                      </div>
                      <Badge variant="outline">{event.entity_type}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6">
                  <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                    <RiBarChart2Line className="size-12 text-muted-foreground" />
                    <h3 className="text-base font-semibold">No activity yet</h3>
                  </div>
                </div>
                )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-sm xl:col-span-3">
          <CardHeader>
            <CardTitle>Recent Projects</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tracked architecture repositories.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[320px]">
              {loading ? (
                <div className="space-y-3 p-6">
                  {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12" />)}
                </div>
              ) : projects.length ? (
                <div className="divide-y">
                  {projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="flex items-center justify-between gap-3 px-6 py-4 hover:bg-muted/20"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{project.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{project.description || "No description"}</p>
                      </div>
                      <Badge variant="secondary">{project.language}</Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-6">
                  <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                    <RiBarChart2Line className="size-12 text-muted-foreground" />
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">No projects</h3>
                      <p className="text-sm text-muted-foreground">
                        Create a project to begin architecture governance.
                      </p>
                    </div>
                    <Button asChild>
                      <Link href="/projects">Create project</Link>
                    </Button>
                  </div>
                </div>
                )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
