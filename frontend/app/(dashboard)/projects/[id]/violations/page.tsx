"use client";

import { use, useEffect, useMemo, useState } from "react";
import { RiAlertLine } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, listComplianceReports, listViolations } from "@/lib/api";
import { formatDate, formatPercent } from "@/lib/format";
import type { ApiPagination, ComplianceReport, Violation } from "@/lib/types";

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ViolationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ report?: string }>;
}) {
  const { id } = use(params);
  const initialSearch = use(searchParams);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [reportId, setReportId] = useState(initialSearch.report ?? "");
  const [violations, setViolations] = useState<Violation[]>([]);
  const [pagination, setPagination] = useState<ApiPagination | null>(null);
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Violation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadReports() {
      try {
        const data = await listComplianceReports(id, { page: 1, page_size: 50 });
        setReports(data.data);
        setReportId((current) => current || data.data[0]?.id || "");
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : "Failed to load reports");
      }
    }
    loadReports();
  }, [id]);

  useEffect(() => {
    async function load() {
      if (!reportId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await listViolations(id, reportId, {
          page,
          page_size: 50,
          severity: severity === "all" ? undefined : severity,
          violation_type: type === "all" ? undefined : type,
        });
        setViolations(data.data);
        setPagination(data.pagination);
        setError("");
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : "Failed to load violations");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, reportId, page, severity, type]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return violations.filter((violation) =>
      [
        violation.description,
        violation.source_component,
        violation.target_component,
        violation.source_file,
        violation.violation_type,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [violations, search]);

  const currentReport = reports.find((report) => report.id === reportId);

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-3xl">Violations</CardTitle>
            <p className="text-sm text-muted-foreground">
              Inspect architecture drift from compliance reports.
            </p>
          </div>
          {currentReport ? <Badge variant="outline">{formatPercent(currentReport.health_score)} health</Badge> : null}
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 xl:flex-row">
        <Select value={reportId} onValueChange={(value) => { setReportId(value); setPage(1); }}>
          <SelectTrigger className="xl:w-72"><SelectValue placeholder="Select report" /></SelectTrigger>
          <SelectContent>
            {reports.map((report) => (
              <SelectItem key={report.id} value={report.id}>
                {formatDate(report.created_at)} · {formatPercent(report.health_score)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={(value) => { setSeverity(value); setPage(1); }}>
          <SelectTrigger className="xl:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="major">Major</SelectItem>
            <SelectItem value="minor">Minor</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(value) => { setType(value); setPage(1); }}>
          <SelectTrigger className="xl:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="forbidden_dependency">Forbidden dependency</SelectItem>
            <SelectItem value="missing_dependency">Missing dependency</SelectItem>
            <SelectItem value="cycle">Cycle</SelectItem>
            <SelectItem value="layer_skip">Layer skip</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Search violations..." value={search} onChange={(e) => setSearch(e.target.value)} className="xl:max-w-sm" />
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dependency</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-52" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-44" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-64" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-9 w-24" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length ? (
              filtered.map((violation) => (
                <TableRow key={violation.id}>
                  <TableCell>
                    <Badge variant={violation.severity === "critical" ? "destructive" : violation.severity === "major" ? "secondary" : "outline"}>
                      {humanize(violation.severity)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{humanize(violation.violation_type)}</TableCell>
                  <TableCell className="text-sm">{violation.source_component} {violation.target_component ? `→ ${violation.target_component}` : ""}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {violation.source_file ? `${violation.source_file}${violation.source_line ? `:${violation.source_line}` : ""}` : "N/A"}
                  </TableCell>
                  <TableCell className="max-w-xl truncate">{violation.description}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelected(violation)}>Inspect</Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                    <RiAlertLine className="size-12 text-muted-foreground" />
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">
                        {reportId ? "No violations found" : "No reports available"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {reportId ? "This report has no matching violations." : "Run a compliance check first."}
                      </p>
                    </div>
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

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Violation detail</DialogTitle>
            <DialogDescription>Backend-provided evidence and remediation suggestion.</DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={selected.severity === "critical" ? "destructive" : selected.severity === "major" ? "secondary" : "outline"}>
                  {selected.severity}
                </Badge>
                <Badge variant="outline">{selected.violation_type}</Badge>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">{selected.source_component} {selected.target_component ? `→ ${selected.target_component}` : ""}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {selected.source_file ? `${selected.source_file}${selected.source_line ? `:${selected.source_line}` : ""}` : "No source location provided"}
                </p>
              </div>
              <p className="text-sm">{selected.description}</p>
              {selected.suggestion ? (
                <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs"><code>{selected.suggestion}</code></pre>
              ) : (
                <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                  <RiAlertLine className="size-12 text-muted-foreground" />
                  <h3 className="text-base font-semibold">No remediation suggestion</h3>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
