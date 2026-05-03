"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { RiBarChart2Line } from "@remixicon/react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, getProject, listArchitectureVersions, listComplianceReports, runComplianceCheck } from "@/lib/api";
import { formatDate, formatPercent } from "@/lib/format";
import type { ApiPagination, ArchitectureVersion, ComplianceReport, Project } from "@/lib/types";

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function CompliancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [versions, setVersions] = useState<ArchitectureVersion[]>([]);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [pagination, setPagination] = useState<ApiPagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scanDialog, setScanDialog] = useState(false);
  const form = useForm({
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
  const selectedArchitectureVersionId = useWatch({
    control: form.control,
    name: "architecture_version_id",
  });

  async function load() {
    setLoading(true);
    try {
      const [projectData, versionsData, reportsData] = await Promise.all([
        getProject(id),
        listArchitectureVersions(id),
        listComplianceReports(id, { page, page_size: 20 }),
      ]);
      setProject(projectData);
      setVersions(versionsData);
      setReports(reportsData.data);
      setPagination(reportsData.pagination);
      const active = versionsData.find((version) => version.status === "active") ?? versionsData[0];
      const current = form.getValues();
      const nextScan = {
        ...current,
        branch: current.branch || projectData.default_branch || "main",
        architecture_version_id: current.architecture_version_id || active?.id || "",
      };
      form.reset(nextScan);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load compliance reports");
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
  }, [id, page]);

  async function submitScan(values: {
    architecture_version_id: string
    branch: string
    commit_hash: string
    fail_on_critical: boolean
    fail_on_major: boolean
    auto_analyze: boolean
    skip_cycle_detection: boolean
  }) {
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

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-3xl">Compliance</CardTitle>
            <p className="text-sm text-muted-foreground">
              Run deterministic checks and inspect report history.
            </p>
          </div>
          <Button onClick={() => setScanDialog(true)} disabled={!versions.length}>
            Run compliance check
          </Button>
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Branch / Commit</TableHead>
              <TableHead>Violations</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-9 w-24" /></TableCell>
                </TableRow>
              ))
            ) : reports.length ? (
              reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-mono text-xs">{report.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatPercent(report.health_score)}</span>
                      <Progress value={report.health_score ?? 0} className="w-16" />
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{humanize(report.status)}</Badge></TableCell>
                  <TableCell>
                    <p className="text-sm">{report.branch || project?.default_branch || "main"}</p>
                    <p className="font-mono text-xs text-muted-foreground">{report.commit_hash || "no commit"}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="destructive">critical</Badge>
                      <span className="text-xs text-muted-foreground">{report.critical_count}</span>
                      <Badge variant="secondary">major</Badge>
                      <span className="text-xs text-muted-foreground">{report.major_count}</span>
                      <Badge variant="outline">minor</Badge>
                      <span className="text-xs text-muted-foreground">{report.minor_count}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(report.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/projects/${id}/violations?report=${report.id}`}>Violations</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                    <RiBarChart2Line className="size-12 text-muted-foreground" />
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">No compliance reports</h3>
                      <p className="text-sm text-muted-foreground">
                        Run a check to compare intended architecture with code dependencies.
                      </p>
                    </div>
                    <Button onClick={() => setScanDialog(true)} disabled={!versions.length}>Run check</Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </CardContent>
      </Card>

      {pagination && pagination.total_pages > 1 ? (
        <Card className="border-border/70 bg-card/80 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Page {pagination.page} of {pagination.total_pages} · {pagination.total_items} total
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!pagination.has_prev} onClick={() => setPage(pagination.page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={!pagination.has_next} onClick={() => setPage(pagination.page + 1)}>Next</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={scanDialog} onOpenChange={setScanDialog}>
        <DialogContent className="sm:max-w-xl">
          <Form {...form}>
          <form onSubmit={form.handleSubmit(submitScan)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Run compliance check</DialogTitle>
              <DialogDescription>Auto-analysis can refresh the actual graph before evaluating rules.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="architecture_version_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Architecture version</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select version" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>{versions.map((version) => <SelectItem key={version.id} value={version.id}>v{version.version_number} ({version.status})</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="branch"
                  rules={{ required: "Branch is required" }}
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
                  control={form.control}
                  name="commit_hash"
                  rules={{ required: "Commit hash is required", minLength: { value: 7, message: "Commit hash must be at least 7 characters" } }}
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
                <div key={key} className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm font-medium">{label}</span>
                  <FormField
                    control={form.control}
                    name={key as "fail_on_critical" | "fail_on_major" | "auto_analyze" | "skip_cycle_detection"}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving || !selectedArchitectureVersionId}>{saving ? "Running..." : "Run check"}</Button>
            </DialogFooter>
          </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
