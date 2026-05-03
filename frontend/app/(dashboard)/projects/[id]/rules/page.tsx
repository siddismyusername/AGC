"use client";

import { use, useEffect, useMemo, useState } from "react";
import { RiShieldLine } from "@remixicon/react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  createRule,
  deactivateRule,
  getArchitectureGraph,
  listArchitectureVersions,
  listRules,
  updateRule,
} from "@/lib/api";
import type { ArchitectureVersion, GraphComponent, Rule, RuleCreatePayload, RuleType, Severity } from "@/lib/types";

const ruleTypes: RuleType[] = ["forbidden_dependency", "required_dependency", "layer_constraint", "cycle_prohibition", "naming_convention", "custom"];
const severities: Severity[] = ["critical", "major", "minor"];

const emptyRule: RuleCreatePayload = {
  rule_text: "",
  rule_type: "forbidden_dependency",
  source_component: null,
  target_component: null,
  severity: "major",
};

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function RulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [versions, setVersions] = useState<ArchitectureVersion[]>([]);
  const [versionId, setVersionId] = useState("");
  const [components, setComponents] = useState<GraphComponent[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [ruleType, setRuleType] = useState("all");
  const [active, setActive] = useState("true");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [deactivatingRule, setDeactivatingRule] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);
  const form = useForm<RuleCreatePayload>({
    defaultValues: emptyRule,
  });

  useEffect(() => {
    async function loadVersions() {
      try {
        const data = await listArchitectureVersions(id);
        setVersions(data);
        const activeVersion = data.find((version) => version.status === "active") ?? data[0];
        setVersionId(activeVersion?.id ?? "");
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : "Failed to load architecture versions");
      }
    }
    loadVersions();
  }, [id]);

  async function loadRules() {
    if (!versionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [ruleData, graphData] = await Promise.all([
        listRules(versionId, {
          rule_type: ruleType === "all" ? undefined : ruleType,
          severity: severity === "all" ? undefined : severity,
          is_active: active === "all" ? "all" : active === "true",
        }),
        getArchitectureGraph(versionId).catch(() => null),
      ]);
      setRules(ruleData);
      setComponents(graphData?.components ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load rules");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRules();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, severity, ruleType, active]);

  const filteredRules = useMemo(() => {
    const q = search.toLowerCase();
    return rules.filter((rule) =>
      [rule.rule_text, rule.rule_type, rule.source_component, rule.target_component]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [rules, search]);

  function openCreate() {
    setEditing(null);
    form.reset(emptyRule);
    setDialogOpen(true);
  }

  function openEdit(rule: Rule) {
    setEditing(rule);
    form.reset({
      rule_text: rule.rule_text,
      rule_type: rule.rule_type,
      source_component: rule.source_component,
      target_component: rule.target_component,
      severity: rule.severity,
    });
    setDialogOpen(true);
  }

  async function saveRule(values: RuleCreatePayload) {
    if (!versionId) return;
    setSaving(true);
    try {
      if (editing) {
        await updateRule(versionId, editing.id, {
          rule_text: values.rule_text,
          severity: values.severity,
        });
        toast.success("Rule updated");
      } else {
        await createRule(versionId, values);
        toast.success("Rule created");
      }
      setDialogOpen(false);
      await loadRules();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to save rule");
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(rule: Rule) {
    try {
      await deactivateRule(versionId, rule.id);
      toast.success("Rule deactivated");
      await loadRules();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to deactivate rule");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-3xl">Rules</CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage deterministic constraints for the selected architecture version.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={versionId} onValueChange={setVersionId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Version" /></SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>v{version.version_number} ({humanize(version.status)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={openCreate} disabled={!versionId}>Add rule</Button>
          </div>
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row">
        <Input placeholder="Search rules..." value={search} onChange={(e) => setSearch(e.target.value)} className="lg:max-w-sm" />
        <Select value={ruleType} onValueChange={setRuleType}>
          <SelectTrigger className="lg:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ruleTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="lg:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {severities.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={active} onValueChange={setActive}>
          <SelectTrigger className="lg:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Components</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-5 w-56" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-9 w-28" /></TableCell>
                </TableRow>
              ))
            ) : filteredRules.length ? (
              filteredRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="max-w-xl">
                    <p className="truncate font-medium">{rule.rule_text}</p>
                    {rule.is_ai_generated ? (
                      <Badge variant="secondary" className="mt-1">AI {rule.confidence_score ? `${Math.round(rule.confidence_score * 100)}%` : ""}</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{rule.rule_type}</TableCell>
                  <TableCell className="text-sm">
                    {rule.source_component || "*"} {rule.target_component ? `→ ${rule.target_component}` : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.severity === "critical" ? "destructive" : rule.severity === "major" ? "secondary" : "outline"}>
                      {rule.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.is_active ? "default" : "outline"}>
                      {rule.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(rule)}>Edit</Button>
                      {rule.is_active ? (
                        <Button variant="destructive" size="sm" onClick={() => setDeactivatingRule(rule)}>
                          Deactivate
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                    <RiShieldLine className="size-12 text-muted-foreground" />
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">No rules found</h3>
                      <p className="text-sm text-muted-foreground">
                        Create rules to define allowed dependencies, layers, and constraints.
                      </p>
                    </div>
                    <Button onClick={openCreate} disabled={!versionId}>Add rule</Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <Form {...form}>
          <form onSubmit={form.handleSubmit(saveRule)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit rule" : "Add rule"}</DialogTitle>
              <DialogDescription>AI suggestions remain reviewable; only saved rules are enforced.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="rule_text"
                rules={{ required: "Rule text is required" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rule text</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!editing ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="rule_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rule type</FormLabel>
                          <Select value={field.value} onValueChange={(value) => field.onChange(value as RuleType)}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>{ruleTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="severity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Severity</FormLabel>
                          <Select value={field.value} onValueChange={(value) => field.onChange(value as Severity)}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>{severities.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="source_component"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Source component</FormLabel>
                          <Select value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Any source</SelectItem>
                              {components.map((item) => <SelectItem key={item.uid} value={item.name}>{item.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="target_component"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target component</FormLabel>
                          <Select value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Target" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Any target</SelectItem>
                              {components.map((item) => <SelectItem key={item.uid} value={item.name}>{item.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              ) : (
                <FormField
                  control={form.control}
                  name="severity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Severity</FormLabel>
                      <Select value={field.value} onValueChange={(value) => field.onChange(value as Severity)}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>{severities.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save rule"}</Button>
            </DialogFooter>
          </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deactivatingRule)} onOpenChange={(open) => !open && setDeactivatingRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Deactivating this rule removes it from active compliance checks for the selected architecture version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deactivatingRule) return;
                await removeRule(deactivatingRule);
                setDeactivatingRule(null);
              }}
            >
              Deactivate rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
