"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { Rule, RuleType, Severity, ArchitectureVersion, ArchitectureGraph, GraphComponent } from "@/lib/types";

interface RulesPageProps {
  params: Promise<{ id: string }>;
}

export default function RulesPage({ params }: RulesPageProps) {
  const { id: projectId } = use(params);
  
  const [rules, setRules] = useState<Rule[]>([]);
  const [versions, setVersions] = useState<ArchitectureVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [components, setComponents] = useState<GraphComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  // Form state
  const [newRule, setNewRule] = useState({
    rule_type: "forbidden_dependency" as RuleType,
    source_component: "",
    target_component: "",
    severity: "major" as Severity,
    description: "",
  });

  // Load versions first
  useEffect(() => {
    async function loadVersions() {
      try {
        const data = await api.get<{ data: ArchitectureVersion[] }>(`/projects/${projectId}/architecture`);
        const vers = data.data || [];
        setVersions(vers);
        
        const active = vers.find((v: ArchitectureVersion) => v.status === "active");
        if (active) {
          setSelectedVersion(active.id);
        } else if (vers.length > 0) {
          setSelectedVersion(vers[0].id);
        }
      } catch (err) {
        console.warn("Failed to load versions:", err);
      }
    }
    loadVersions();
  }, [projectId]);

  // Load rules and graph when version changes
  useEffect(() => {
    async function loadData() {
      if (!selectedVersion) return;
      
      setLoading(true);
      try {
        const [rulesData, graphData] = await Promise.all([
          api.get<{ data: Rule[] }>(`/architecture/${selectedVersion}/rules`),
          api.get<ArchitectureGraph>(`/architecture/${selectedVersion}/graph`).catch(() => null),
        ]);
        
        setRules(rulesData.data || []);
        if (graphData?.components) {
          setComponents(graphData.components);
        }
        setError(null);
      } catch (err) {
        const msg = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Failed to load";
        console.warn("Rules load error:", msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedVersion]);

  const toggleRule = async (ruleId: string, currentStatus: boolean) => {
    try {
      await api.patch(`/architecture/${selectedVersion}/rules/${ruleId}`, { is_active: !currentStatus });
      setRules(rules.map((r) => (r.id === ruleId ? { ...r, is_active: !currentStatus } : r)));
    } catch (err) {
      console.warn("Failed to toggle rule:", err);
    }
  };

  const createRule = async () => {
    if (!selectedVersion || !newRule.source_component) return;
    
    try {
      const created = await api.post<Rule>(`/architecture/${selectedVersion}/rules`, {
        rule_text: newRule.description || `${newRule.source_component} ${newRule.rule_type} ${newRule.target_component}`,
        rule_type: newRule.rule_type,
        source_component: newRule.source_component,
        target_component: newRule.target_component || null,
        severity: newRule.severity,
      });
      
      setRules([...rules, created]);
      setIsAddOpen(false);
      setNewRule({
        rule_type: "forbidden_dependency",
        source_component: "",
        target_component: "",
        severity: "major",
        description: "",
      });
    } catch (err) {
      console.warn("Failed to create rule:", err);
    }
  };

  const filteredRules = rules.filter(
    (r) =>
      (r.description?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (r.source_component?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (r.target_component?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const getSeverityVariant = (sev: Severity) => {
    if (sev === "critical") return "destructive";
    if (sev === "major") return "default";
    return "secondary";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rules</h1>
          <p className="text-muted-foreground text-sm">
            Manage architectural constraints for this project
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm bg-background"
          >
            {versions.length === 0 ? (
              <option value="">No versions</option>
            ) : (
              versions.map((v: ArchitectureVersion) => (
                <option key={v.id} value={v.id}>
                  v{v.version_number} ({v.status})
                </option>
              ))
            )}
          </select>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button disabled={!selectedVersion}>Add Rule</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add Architectural Rule</DialogTitle>
                <DialogDescription>
                  Define a new constraint for this architecture version.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="type" className="text-right">Rule Type</Label>
                  <Select 
                    value={newRule.rule_type} 
                    onValueChange={(v) => setNewRule({ ...newRule, rule_type: v as RuleType })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select rule type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="forbidden_dependency">Forbidden Dependency</SelectItem>
                      <SelectItem value="required_dependency">Required Dependency</SelectItem>
                      <SelectItem value="layer_constraint">Layer Constraint</SelectItem>
                      <SelectItem value="cycle_prohibition">Cycle Prohibition</SelectItem>
                      <SelectItem value="naming_convention">Naming Convention</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="source" className="text-right">Source</Label>
                  <Select 
                    value={newRule.source_component} 
                    onValueChange={(v) => setNewRule({ ...newRule, source_component: v })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select source component" />
                    </SelectTrigger>
                    <SelectContent>
                      {components.map((c: GraphComponent) => (
                        <SelectItem key={c.uid} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="target" className="text-right">Target</Label>
                  <Select 
                    value={newRule.target_component} 
                    onValueChange={(v) => setNewRule({ ...newRule, target_component: v })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select target component" />
                    </SelectTrigger>
                    <SelectContent>
                      {components.map((c: GraphComponent) => (
                        <SelectItem key={c.uid} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="severity" className="text-right">Severity</Label>
                  <Select 
                    value={newRule.severity} 
                    onValueChange={(v) => setNewRule({ ...newRule, severity: v as Severity })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="major">Major</SelectItem>
                      <SelectItem value="minor">Minor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="desc" className="text-right mt-2">Description</Label>
                  <Input 
                    id="desc" 
                    placeholder="Rule explanation (optional)"
                    value={newRule.description}
                    onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                    className="col-span-3" 
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" onClick={createRule}>Save Rule</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && !loading && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="pt-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ {error}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Input
        placeholder="Search rules..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Rules Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Active</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source → Target</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Severity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-64" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                </TableRow>
              ))
            ) : filteredRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  {search ? "No rules match your search." : "No rules defined yet. Create one to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filteredRules.map((rule) => (
                <TableRow key={rule.id} className={!rule.is_active ? "opacity-50" : ""}>
                  <TableCell>
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => toggleRule(rule.id, rule.is_active)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {rule.rule_type}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">{rule.source_component || "*"}</span>
                      {rule.target_component && (
                        <>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-semibold">{rule.target_component}</span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {rule.description || rule.rule_type}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getSeverityVariant(rule.severity)}>
                      {rule.severity}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}