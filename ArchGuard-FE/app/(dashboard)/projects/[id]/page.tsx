"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import type { Project, ArchitectureVersion, ComplianceReport, AuditEvent } from "@/lib/types";

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  repository_url: string | null;
  default_branch: string;
  language: string | null;
  organization_id: string | null;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface HealthScoreResponse {
  current_score: number;
  previous_score: number | null;
  trend: string;
  delta: number;
  last_check: string;
}

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [health, setHealth] = useState<HealthScoreResponse | null>(null);
  const [versions, setVersions] = useState<ArchitectureVersion[]>([]);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [projectData, healthData, versionsData, reportsData, activityData] = await Promise.all([
          api.get<ProjectDetail>(`/projects/${id}`),
          api.get<HealthScoreResponse>(`/projects/${id}/compliance/health`).catch(() => null),
          api.get<{ data: ArchitectureVersion[] }>(`/projects/${id}/architecture`).catch(() => ({ data: [] })),
          api.get<{ data: ComplianceReport[] }>(`/projects/${id}/compliance/reports?per_page=5`).catch(() => ({ data: [] })),
          api.get<AuditEvent[]>(`/audit/events?entity_type=project&entity_id=${id}&limit=5`).catch(() => []),
        ]);
        
        // Extract data from APIResponse wrapper if present
        setProject((projectData as any).data || projectData);
        
        if (healthData) {
          setHealth((healthData as any).data || healthData);
        }
        
        setVersions(versionsData.data || []);
        setReports(reportsData.data || []);
        setActivity(Array.isArray(activityData) ? activityData : (activityData as any).data || []);
        
        setError(null);
      } catch (err) {
        const msg = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Failed to load";
        console.warn("Project load error:", msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const activeVersion = versions.find((v) => v.status === "active");
  const latestReport = reports[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {loading ? (
            <>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight">{project?.name}</h1>
              <p className="text-muted-foreground text-sm">
                {project?.description || "No description"}
              </p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/projects/${id}/graph`)}>
            Graph
          </Button>
          <Button variant="outline" onClick={() => router.push(`/projects/${id}/rules`)}>
            Rules
          </Button>
          <Button>Run Compliance Check</Button>
        </div>
      </div>

      {error && !loading && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="pt-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ Could not connect to backend: {error}
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
          <TabsTrigger value="reports">Reports ({reports.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Health Score */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Architecture Health</CardTitle>
                <CardDescription>Overall compliance with defined rules</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-20 w-full" />
                ) : (
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className={`text-5xl font-bold mb-4 ${getHealthColor(health?.current_score ?? 0)}`}>
                      {health?.current_score != null ? `${health.current_score}%` : "N/A"}
                    </div>
                    <Progress value={health?.current_score ?? 0} className="w-full max-w-md h-3" />
                    <div className="flex justify-between w-full max-w-md mt-2 text-xs text-muted-foreground">
                      <span>Critical</span>
                      <span>Needs Improvement</span>
                      <span>Healthy</span>
                    </div>
                    {health?.trend && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {health.trend === "declining" ? "↓" : health.trend === "improving" ? "↑" : "→"} 
                        {" "}vs previous: {health.previous_score ?? "N/A"}%
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
                <CardDescription>Current version snapshot</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                      <span className="text-sm font-medium">Active Version</span>
                      <Badge variant="secondary">v{activeVersion?.version_number ?? "None"}</Badge>
                    </div>
                    <div className="flex justify-between items-center border-b pb-2">
                      <span className="text-sm font-medium">Latest Report</span>
                      <Badge variant={latestReport?.health_score && latestReport.health_score >= 80 ? "default" : "destructive"}>
                        {latestReport?.health_score ?? "N/A"}%
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center border-b pb-2">
                      <span className="text-sm font-medium">Total Reports</span>
                      <span className="text-sm">{reports.length}</span>
                    </div>
                    <div className="flex justify-between items-center border-b pb-2">
                      <span className="text-sm font-medium">Language</span>
                      <Badge variant="outline">{project?.language ?? "Unknown"}</Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="md:col-span-2 lg:col-span-3">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest scans and updates</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-32 w-full" />
                ) : activity.length > 0 ? (
                  <div className="space-y-2">
                    {activity.map((event) => (
                      <div key={event.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <p className="text-sm font-medium">{event.action}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.created_at).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant="outline">{event.entity_type}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-8 text-center border-2 border-dashed rounded-md">
                    No recent activity. Run a compliance check to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="versions">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : versions.length > 0 ? (
                <div className="space-y-2">
                  {versions.map((version) => (
                    <div key={version.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">Version {version.version_number}</p>
                        <p className="text-sm text-muted-foreground">{version.description || "No description"}</p>
                      </div>
                      <Badge variant={version.status === "active" ? "default" : "secondary"}>
                        {version.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No architecture versions yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : reports.length > 0 ? (
                <div className="space-y-2">
                  {reports.map((report) => (
                    <div key={report.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">
                          Score: {report.health_score}%
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(report.created_at).toLocaleString()} • {report.total_violations} violations
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={report.health_score && report.health_score >= 80 ? "default" : "destructive"}>
                          {report.health_score && report.health_score >= 80 ? "Passed" : "Failed"}
                        </Badge>
                        <Badge variant="outline">
                          {report.critical_violations} critical
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No compliance reports yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}