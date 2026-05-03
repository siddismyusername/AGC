"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { RiFolderLine } from "@remixicon/react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  createArchitectureVersion,
  getAuditEvents,
  getProject,
  getProjectHealth,
  listArchitectureVersions,
  listComplianceReports,
  runComplianceCheck,
  triggerProjectAnalysis,
  updateArchitectureVersionStatus,
} from "@/lib/api";
import { formatDate, formatPercent } from "@/lib/format";
import type {
  ArchStatus,
  ArchitectureVersion,
  AuditEvent,
  ComplianceReport,
  HealthScoreResponse,
  Project,
} from "@/lib/types";

const versionSchema = z.object({
  description: z.string(),
});

const analysisSchema = z.object({
  architecture_version_id: z.string().min(1, "Architecture version is required."),
  repository_path: z.string().min(1, "Repository path is required."),
  branch: z.string().min(1, "Branch is required."),
  commit_hash: z.string().min(7, "Commit hash must be at least 7 characters."),
  include_patterns: z.string(),
  exclude_patterns: z.string(),
  max_depth: z.string().min(1, "Max depth is required."),
});

const scanSchema = z.object({
  architecture_version_id: z.string().min(1, "Architecture version is required."),
  branch: z.string().min(1, "Branch is required."),
  commit_hash: z.string().min(7, "Commit hash must be at least 7 characters."),
  fail_on_critical: z.boolean(),
  fail_on_major: z.boolean(),
  auto_analyze: z.boolean(),
  skip_cycle_detection: z.boolean(),
});

type VersionFormValues = z.infer<typeof versionSchema>;
type AnalysisFormValues = z.infer<typeof analysisSchema>;
type ScanFormValues = z.infer<typeof scanSchema>;

export default function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [versions, setVersions] = useState<ArchitectureVersion[]>([]);
  const [health, setHealth] = useState<HealthScoreResponse | null>(null);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [versionDialog, setVersionDialog] = useState(false);
  const [analysisDialog, setAnalysisDialog] = useState(false);
  const [scanDialog, setScanDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const versionForm = useForm<VersionFormValues>({
    resolver: zodResolver(versionSchema),
    defaultValues: { description: "" },
  });
  const analysisForm = useForm<AnalysisFormValues>({
    resolver: zodResolver(analysisSchema),
    defaultValues: {
      architecture_version_id: "",
      repository_path: "",
      branch: "main",
      commit_hash: "",
      include_patterns: "**/*.py",
      exclude_patterns: "**/tests/**\n**/migrations/**",
      max_depth: "10",
    },
  });
  const scanForm = useForm<ScanFormValues>({
    resolver: zodResolver(scanSchema),
    defaultValues: {
      architecture_version_id: "",
      branch: "main",
      commit_hash: "",
      fail_on_critical: true,
      fail_on_major: false,
      auto_analyze: true,
      skip_cycle_detection: false,
    },
  });
  const analysisVersionId = useWatch({
    control: analysisForm.control,
    name: "architecture_version_id",
  });
  const scanVersionId = useWatch({
    control: scanForm.control,
    name: "architecture_version_id",
  });

  async function load() {
    setLoading(true);
    try {
      const [projectData, versionData, reportsData, activityData] = await Promise.all([
        getProject(id),
        listArchitectureVersions(id),
        listComplianceReports(id, { page: 1, page_size: 5 }).catch(() => ({ data: [], pagination: null })),
        getAuditEvents({ page: 1, per_page: 5 }).catch(() => ({ data: [], pagination: null })),
      ]);
      setProject(projectData);
      setVersions(versionData);
      setReports(reportsData.data);
      setActivity(activityData.data);
      const active = versionData.find((version) => version.status === "active") ?? versionData[0];
      scanForm.reset({
        ...scanForm.getValues(),
        branch: projectData.default_branch || "main",
        architecture_version_id: scanForm.getValues().architecture_version_id || active?.id || "",
      });
      analysisForm.reset({
        ...analysisForm.getValues(),
        branch: projectData.default_branch || "main",
        architecture_version_id: analysisForm.getValues().architecture_version_id || active?.id || "",
        repository_path: analysisForm.getValues().repository_path || projectData.repository_url || "",
      });
      setHealth(await getProjectHealth(id, active?.id).catch(() => null));
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const activeVersion = versions.find((version) => version.status === "active");
  const latestReport = reports[0];

  async function createVersion(values: VersionFormValues) {
    setSaving(true);
    try {
      await createArchitectureVersion(id, { description: values.description.trim() || null });
      toast.success("Architecture version created");
      setVersionDialog(false);
      versionForm.reset({ description: "" });
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to create version");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(versionId: string, status: ArchStatus) {
    try {
      await updateArchitectureVersionStatus(id, versionId, { status });
      toast.success("Version status updated");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to update status");
    }
  }

  async function runScan(values: ScanFormValues) {
    setSaving(true);
    try {
      await runComplianceCheck(id, {
        architecture_version_id: values.architecture_version_id || null,
        branch: values.branch,
        commit_hash: values.commit_hash,
        trigger: "manual",
        options: {
          fail_on_critical: values.fail_on_critical,
          fail_on_major: values.fail_on_major,
          auto_analyze: values.auto_analyze,
          skip_cycle_detection: values.skip_cycle_detection,
        },
      });
      toast.success("Compliance check completed");
      setScanDialog(false);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Compliance check failed");
    } finally {
      setSaving(false);
    }
  }

  async function runAnalysis(values: AnalysisFormValues) {
    setSaving(true);
    try {
      const result = await triggerProjectAnalysis(id, {
        architecture_version_id: values.architecture_version_id,
        repository_path: values.repository_path,
        commit_hash: values.commit_hash,
        branch: values.branch,
        repository_url: project?.repository_url || null,
        analysis_scope: "full",
        options: {
          include_patterns: values.include_patterns
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          exclude_patterns: values.exclude_patterns
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          max_depth: Number(values.max_depth) || 10,
        },
      });
      toast.success(
        `Analysis completed: ${result.module_count} modules, ${result.dependency_count} dependencies`
      );
      setAnalysisDialog(false);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Static analysis failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Project Workspace
            </p>
            <div className="space-y-1">
              <CardTitle className="text-3xl">{project?.name || "Project"}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {project?.description || "Architecture governance workspace."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                versionForm.reset({ description: "" });
                setVersionDialog(true);
              }}
            >
              New version
            </Button>
            <Button variant="outline" onClick={() => setAnalysisDialog(true)} disabled={!versions.length}>
              Run analysis
            </Button>
            <Button onClick={() => setScanDialog(true)} disabled={!versions.length}>Run compliance</Button>
          </div>
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {project ? (
        <Card className="border-border/70 bg-card/80 shadow-sm">
          <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm text-muted-foreground">
            <span>{project.language}</span>
            {project.default_branch ? <span>Branch {project.default_branch}</span> : null}
            <span>{project.repository_url || "Repository URL not configured"}</span>
            <span>{activeVersion ? `Active v${activeVersion.version_number}` : "No active version"}</span>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "Health Score",
            value: loading ? <Skeleton className="h-10 w-24" /> : formatPercent(health?.health_score),
            detail: null,
            progress: health?.health_score ?? 0,
          },
          {
            title: "Active Version",
            value: activeVersion ? `v${activeVersion.version_number}` : "None",
            detail: activeVersion?.status ?? "Create or activate a version",
          },
          {
            title: "Latest Report",
            value: formatPercent(latestReport?.health_score),
            detail: latestReport ? formatDate(latestReport.created_at) : "No reports yet",
          },
          {
            title: "Violations",
            value: latestReport?.total_violations ?? 0,
            detail: `${latestReport?.critical_count ?? 0} critical`,
          },
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
              {metric.title === "Health Score" ? (
                <Progress value={metric.progress} className="mt-2" />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle>Architecture Versions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Governed models for this project.
            </p>
          </CardHeader>
          <CardContent>
          <div className="space-y-3">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-52" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-10 w-36" />
                    </div>
                  </div>
                ))}
              </div>
            ) : versions.length ? (
              versions.map((version) => (
                <div key={version.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                  <div>
                    <p className="text-sm font-medium">Version {version.version_number}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{version.description || "No description"}</span>
                      <span>{formatDate(version.updated_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{version.status}</Badge>
                    <Select value={version.status} onValueChange={(value) => changeStatus(version.id, value as ArchStatus)}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["draft", "under_review", "approved", "active", "deprecated"].map((status) => (
                          <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                <RiFolderLine className="size-12 text-muted-foreground" />
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">No architecture versions</h3>
                  <p className="text-sm text-muted-foreground">
                    Create a version before adding rules or components.
                  </p>
                </div>
                <Button onClick={() => setVersionDialog(true)}>New version</Button>
              </div>
            )}
          </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
            <p className="text-sm text-muted-foreground">Latest compliance results.</p>
          </CardHeader>
          <CardContent>
          <div className="space-y-3">
            {reports.length ? (
              reports.map((report) => (
                <Link key={report.id} href={`/projects/${id}/violations?report=${report.id}`} className="block rounded-xl border border-border/70 bg-muted/20 p-3 hover:bg-muted/35">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{formatPercent(report.health_score)}</p>
                    <Badge variant="outline">{report.status}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{report.branch || "no branch"}</span>
                    <Badge variant="destructive">critical</Badge>
                    <span>{report.critical_count} critical</span>
                    <span>{formatDate(report.created_at)}</span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                <RiFolderLine className="size-12 text-muted-foreground" />
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">No reports</h3>
                  <p className="text-sm text-muted-foreground">
                    Run the first compliance check for this project.
                  </p>
                </div>
                <Button onClick={() => setScanDialog(true)} disabled={!versions.length}>
                  Run compliance
                </Button>
              </div>
            )}
          </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <p className="text-sm text-muted-foreground">Latest organization events.</p>
        </CardHeader>
        <CardContent>
          {activity.length ? (
            <div className="divide-y rounded-xl border border-border/70">
              {activity.map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-4 p-3 hover:bg-muted/20">
                  <div>
                    <p className="text-sm font-medium">{event.action}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(event.created_at)}</span>
                      <span>{event.entity_id}</span>
                    </div>
                  </div>
                  <Badge variant="outline">{event.entity_type}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
              <RiFolderLine className="size-12 text-muted-foreground" />
              <h3 className="text-base font-semibold">No recent activity</h3>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={versionDialog} onOpenChange={setVersionDialog}>
        <DialogContent>
          <Form {...versionForm}>
          <form onSubmit={versionForm.handleSubmit(createVersion)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Create architecture version</DialogTitle>
              <DialogDescription>Versions keep architecture models reviewable and auditable.</DialogDescription>
            </DialogHeader>
            <FormField
              control={versionForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
            </DialogFooter>
          </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={analysisDialog} onOpenChange={setAnalysisDialog}>
        <DialogContent className="sm:max-w-xl">
          <Form {...analysisForm}>
          <form onSubmit={analysisForm.handleSubmit(runAnalysis)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Run static analysis</DialogTitle>
              <DialogDescription>
                Analyze a local repository path to refresh the actual dependency graph.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <FormField
                control={analysisForm.control}
                name="architecture_version_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Architecture version</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select version" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {versions.map((version) => (
                          <SelectItem key={version.id} value={version.id}>
                            v{version.version_number} ({version.status})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={analysisForm.control}
                name="repository_path"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repository path</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="/absolute/path/to/repository" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={analysisForm.control}
                  name="branch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branch</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={analysisForm.control}
                  name="commit_hash"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commit hash</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={40} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
                <FormField
                  control={analysisForm.control}
                  name="include_patterns"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Include patterns</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={analysisForm.control}
                  name="exclude_patterns"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Exclude patterns</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={analysisForm.control}
                  name="max_depth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max depth</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={1} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={saving || !analysisVersionId}
              >
                {saving ? "Analyzing..." : "Run analysis"}
              </Button>
            </DialogFooter>
          </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={scanDialog} onOpenChange={setScanDialog}>
        <DialogContent className="sm:max-w-xl">
          <Form {...scanForm}>
          <form onSubmit={scanForm.handleSubmit(runScan)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Run compliance check</DialogTitle>
              <DialogDescription>Compare the intended graph with the latest analyzed code graph.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <FormField
                control={scanForm.control}
                name="architecture_version_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Architecture version</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select version" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {versions.map((version) => (
                          <SelectItem key={version.id} value={version.id}>v{version.version_number} ({version.status})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={scanForm.control}
                  name="branch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branch</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={scanForm.control}
                  name="commit_hash"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commit hash</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={40} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {[
                ["fail_on_critical", "Fail on critical"],
                ["fail_on_major", "Fail on major"],
                ["auto_analyze", "Auto analyze"],
                ["skip_cycle_detection", "Skip cycle detection"],
              ].map(([key, label]) => (
                <FormField
                  key={key}
                  control={scanForm.control}
                  name={key as keyof ScanFormValues}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving || !scanVersionId}>{saving ? "Running..." : "Run check"}</Button>
            </DialogFooter>
          </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
