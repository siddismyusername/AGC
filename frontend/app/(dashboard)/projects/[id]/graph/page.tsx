"use client";

import { use, useEffect, useMemo, useState } from "react";
import { RiGitBranchLine } from "@remixicon/react";
import {
  addEdge,
  Background,
  Connection,
  Controls,
  Edge,
  MarkerType,
  Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useForm, useWatch } from "react-hook-form";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  createArchitectureComponent,
  createArchitectureRelationship,
  deleteArchitectureComponent,
  deleteArchitectureRelationship,
  getArchitectureGraph,
  listArchitectureVersions,
} from "@/lib/api";
import type {
  ArchitectureGraph,
  ArchitectureVersion,
  ComponentType,
  GraphComponent,
  GraphRelationship,
  RelationshipType,
} from "@/lib/types";

const componentTypes: ComponentType[] = ["service", "layer", "module", "database", "ui", "api", "gateway", "external", "queue"];
const relationshipTypes: RelationshipType[] = ["ALLOWED_DEPENDENCY", "FORBIDDEN_DEPENDENCY", "REQUIRES", "LAYER_ABOVE"];

const colorClasses: Record<string, string> = {
  service: "border-cyan-600",
  layer: "border-violet-600",
  module: "border-emerald-600",
  database: "border-amber-600",
  ui: "border-orange-600",
  api: "border-sky-600",
  gateway: "border-pink-600",
  external: "border-slate-500",
  queue: "border-lime-600",
};

function layoutNodes(components: GraphComponent[]): Node[] {
  const sorted = [...components].sort((a, b) => (a.layer_level ?? 99) - (b.layer_level ?? 99) || a.name.localeCompare(b.name));
  const layerCounts = new Map<number, number>();
  return sorted.map((component, index) => {
    const layer = component.layer_level ?? Math.floor(index / 5);
    const count = layerCounts.get(layer) ?? 0;
    layerCounts.set(layer, count + 1);
    return {
      id: component.uid,
      position: { x: count * 220 + 40, y: layer * 140 + 40 },
      data: { label: `${component.name}\n${component.component_type}` },
      className: `w-44 rounded-lg border-2 bg-card px-3 py-2 text-xs whitespace-pre-line ${colorClasses[component.component_type] ?? "border-slate-500"}`,
    };
  });
}

function layoutEdges(relationships: GraphRelationship[]): Edge[] {
  return relationships.map((relationship, index) => ({
    id: relationship.id || `${relationship.source_uid}-${relationship.target_uid}-${relationship.type}-${index}`,
    source: relationship.source_uid,
    target: relationship.target_uid,
    label: relationship.type,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    className: relationship.type === "FORBIDDEN_DEPENDENCY" ? "stroke-destructive" : "stroke-muted-foreground",
  }));
}

export default function ArchitectureGraphPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [versions, setVersions] = useState<ArchitectureVersion[]>([]);
  const [versionId, setVersionId] = useState("");
  const [graph, setGraph] = useState<ArchitectureGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphComponent | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [componentDialog, setComponentDialog] = useState(false);
  const [relationshipDialog, setRelationshipDialog] = useState(false);
  const [componentToDelete, setComponentToDelete] = useState<GraphComponent | null>(null);
  const [relationshipToDelete, setRelationshipToDelete] = useState<Edge | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const componentForm = useForm({
    defaultValues: { name: "", component_type: "service" as ComponentType, layer_level: "", description: "" },
  });
  const relationshipForm = useForm({
    defaultValues: { source_uid: "", target_uid: "", type: "ALLOWED_DEPENDENCY" as RelationshipType },
  });
  const relationshipSource = useWatch({
    control: relationshipForm.control,
    name: "source_uid",
  });
  const relationshipTarget = useWatch({
    control: relationshipForm.control,
    name: "target_uid",
  });
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  async function loadVersions() {
    const data = await listArchitectureVersions(id);
    setVersions(data);
    const active = data.find((version) => version.status === "active") ?? data[0];
    setVersionId((current) => current || active?.id || "");
  }

  async function loadGraph(nextVersionId = versionId) {
    if (!nextVersionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getArchitectureGraph(nextVersionId);
      setGraph(data);
      setNodes(layoutNodes(data.components));
      setEdges(layoutEdges(data.relationships));
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadVersions().catch((err) =>
        setError(err instanceof ApiError ? err.detail : "Failed to load versions")
      );
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadGraph();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId]);

  const componentOptions = graph?.components ?? [];
  const selectedVersion = versions.find((version) => version.id === versionId);
  const selectedComponent = useMemo(
    () => graph?.components.find((item) => item.uid === selectedNode?.uid) ?? null,
    [graph, selectedNode]
  );
  const selectedRelationship = useMemo(
    () =>
      graph?.relationships.find(
        (item) =>
          item.source_uid === selectedEdge?.source &&
          item.target_uid === selectedEdge?.target &&
          item.type === selectedEdge?.label
      ) ?? null,
    [graph, selectedEdge]
  );

  async function handleConnect(connection: Connection) {
    if (!versionId || !connection.source || !connection.target) return;
    try {
      const created = await createArchitectureRelationship(versionId, {
        source_uid: connection.source,
        target_uid: connection.target,
        type: "ALLOWED_DEPENDENCY",
      });
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: created.id || `${connection.source}-${connection.target}`,
            label: created.type,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          current
        )
      );
      toast.success("Relationship created");
      await loadGraph();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to create relationship");
    }
  }

  async function saveComponent(values: { name: string; component_type: ComponentType; layer_level: string; description: string }) {
    if (!versionId) return;
    setSaving(true);
    try {
      await createArchitectureComponent(versionId, {
        name: values.name,
        component_type: values.component_type,
        layer_level: values.layer_level ? Number(values.layer_level) : null,
        description: values.description || null,
      });
      toast.success("Component added");
      setComponentDialog(false);
      componentForm.reset({ name: "", component_type: "service", layer_level: "", description: "" });
      await loadGraph();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to add component");
    } finally {
      setSaving(false);
    }
  }

  async function saveRelationship(values: { source_uid: string; target_uid: string; type: RelationshipType }) {
    if (!versionId) return;
    setSaving(true);
    try {
      await createArchitectureRelationship(versionId, values);
      toast.success("Relationship added");
      setRelationshipDialog(false);
      relationshipForm.reset({ source_uid: "", target_uid: "", type: "ALLOWED_DEPENDENCY" });
      await loadGraph();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to add relationship");
    } finally {
      setSaving(false);
    }
  }

  async function removeComponent(uid: string) {
    if (!versionId) return;
    try {
      await deleteArchitectureComponent(versionId, uid);
      toast.success("Component deleted");
      setSelectedNode(null);
      await loadGraph();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to delete component");
    }
  }

  async function removeRelationship(edge: Edge) {
    if (!versionId || !edge.source || !edge.target || !edge.label) return;
    try {
      await deleteArchitectureRelationship(versionId, {
        source_uid: edge.source,
        target_uid: edge.target,
        type: String(edge.label) as RelationshipType,
      });
      toast.success("Relationship deleted");
      await loadGraph();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to delete relationship");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-3xl">Architecture Graph</CardTitle>
            <p className="text-sm text-muted-foreground">
              Edit the intended component graph and dependency constraints.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={versionId} onValueChange={setVersionId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Version" /></SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>v{version.version_number} ({version.status})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setRelationshipDialog(true)} disabled={!versionId || componentOptions.length < 2}>Add relationship</Button>
            <Button onClick={() => setComponentDialog(true)} disabled={!versionId}>Add component</Button>
          </div>
        </CardHeader>
      </Card>

      {selectedVersion ? <Badge variant="outline">{selectedVersion.status}</Badge> : null}
      {error ? (
        <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="h-[640px] overflow-hidden">
          <CardContent className="h-full p-0">
            {loading ? (
              <div className="space-y-3 p-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : nodes.length ? (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
                onNodeClick={(_, node) => {
                  setSelectedNode(graph?.components.find((item) => item.uid === node.id) ?? null);
                  setSelectedEdge(null);
                }}
                onEdgeClick={(_, edge) => {
                  setSelectedEdge(edge);
                  setSelectedNode(null);
                }}
                onPaneClick={() => {
                  setSelectedNode(null);
                  setSelectedEdge(null);
                }}
                fitView
              >
                <Controls />
                <Background gap={14} size={1} />
              </ReactFlow>
            ) : (
              <div className="flex h-full items-center justify-center p-8">
                <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                  <RiGitBranchLine className="size-12 text-muted-foreground" />
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold">No graph data</h3>
                    <p className="text-sm text-muted-foreground">
                      Add components to model the intended architecture.
                    </p>
                  </div>
                  <Button onClick={() => setComponentDialog(true)} disabled={!versionId}>Add component</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Components</p>
                  <p className="text-xl font-semibold">{graph?.stats.total_components ?? graph?.components.length ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Relationships</p>
                  <p className="text-xl font-semibold">{graph?.stats.total_relationships ?? graph?.relationships.length ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">Legend</p>
              <div className="grid gap-2">
                {componentTypes.map((type) => (
                  <div key={type} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className={colorClasses[type] ?? "border-slate-500"}>
                      {type}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">Selection</p>
              {selectedComponent ? (
                <>
                  <div>
                    <p className="text-sm font-medium">{selectedComponent.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedComponent.description || "No description"}</p>
                  </div>
                  <Badge variant="outline">{selectedComponent.component_type}</Badge>
                  <Button variant="destructive" size="sm" onClick={() => setComponentToDelete(selectedComponent)}>
                    Delete component
                  </Button>
                </>
              ) : selectedRelationship ? (
                <>
                  <div>
                    <p className="text-sm font-medium">{selectedRelationship.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedRelationship.source_uid} → {selectedRelationship.target_uid}
                    </p>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => setRelationshipToDelete(selectedEdge)}>
                    Delete relationship
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select a node or relationship to inspect and manage it.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={componentDialog} onOpenChange={setComponentDialog}>
        <DialogContent>
          <Form {...componentForm}>
          <form onSubmit={componentForm.handleSubmit(saveComponent)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add component</DialogTitle>
              <DialogDescription>Create a node in the intended architecture graph.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <FormField control={componentForm.control} name="name" rules={{ required: "Name is required" }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField control={componentForm.control} name="component_type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={(value) => field.onChange(value as ComponentType)}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>{componentTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={componentForm.control} name="layer_level" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Layer level</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={componentForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving}>{saving ? "Adding..." : "Add component"}</Button>
            </DialogFooter>
          </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={relationshipDialog} onOpenChange={setRelationshipDialog}>
        <DialogContent>
          <Form {...relationshipForm}>
          <form onSubmit={relationshipForm.handleSubmit(saveRelationship)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add relationship</DialogTitle>
              <DialogDescription>Define an intended dependency constraint between components.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <FormField control={relationshipForm.control} name="source_uid" rules={{ required: "Source component is required" }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Source component</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Source component" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>{componentOptions.map((item) => <SelectItem key={item.uid} value={item.uid}>{item.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={relationshipForm.control} name="target_uid" rules={{ required: "Target component is required" }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Target component</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Target component" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>{componentOptions.map((item) => <SelectItem key={item.uid} value={item.uid}>{item.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={relationshipForm.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Relationship type</FormLabel>
                  <Select value={field.value} onValueChange={(value) => field.onChange(value as RelationshipType)}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>{relationshipTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving || !relationshipSource || !relationshipTarget}>{saving ? "Adding..." : "Add relationship"}</Button>
            </DialogFooter>
          </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(componentToDelete)} onOpenChange={(open) => !open && setComponentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this component?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the component and any connected relationships from the architecture graph.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!componentToDelete) return;
                await removeComponent(componentToDelete.uid);
                setComponentToDelete(null);
              }}
            >
              Delete component
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(relationshipToDelete)} onOpenChange={(open) => !open && setRelationshipToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this relationship?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected dependency constraint from the intended architecture graph.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!relationshipToDelete) return;
                await removeRelationship(relationshipToDelete);
                setRelationshipToDelete(null);
                setSelectedEdge(null);
              }}
            >
              Delete relationship
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
