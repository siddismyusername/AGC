"use client";

import { useEffect, useState, useCallback } from "react";
import { use } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import { api, ApiError } from "@/lib/api";
import type { ArchitectureGraph, ArchitectureVersion, GraphComponent, GraphRelationship } from "@/lib/types";

const componentTypeColors: Record<string, string> = {
  service: "#3b82f6",
  layer: "#8b5cf6",
  module: "#10b981",
  database: "#f59e0b",
  api: "#06b6d4",
  gateway: "#ec4899",
  ui: "#f97316",
  queue: "#84cc16",
  external: "#6b7280",
};

interface GraphPageProps {
  params: Promise<{ id: string }>;
}

export default function ArchitectureGraphPage({ params }: GraphPageProps) {
  const { id } = use(params);
  const { resolvedTheme } = useTheme();
  
  const [versions, setVersions] = useState<ArchitectureVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [graph, setGraph] = useState<ArchitectureGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Load versions first
  useEffect(() => {
    async function loadVersions() {
      try {
        const data = await api.get<{ data: ArchitectureVersion[] }>(`/projects/${id}/architecture`);
        const vers = data.data || [];
        setVersions(vers);
        
        // Auto-select active version or first one
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
  }, [id]);

  // Load graph when version is selected
  useEffect(() => {
    async function loadGraph() {
      if (!selectedVersion) return;
      
      setLoading(true);
      try {
        const data = await api.get<ArchitectureGraph>(`/architecture/${selectedVersion}/graph`);
        setGraph(data);
        setError(null);
        
        // Convert to React Flow format
        const flowNodes: Node[] = data.components.map((comp: GraphComponent, index: number) => ({
          id: comp.uid,
          position: { x: (index % 4) * 200 + 50, y: Math.floor(index / 4) * 150 + 50 },
          data: { label: comp.name },
          style: {
            backgroundColor: "var(--card)",
            color: "var(--foreground)",
            border: `2px solid ${componentTypeColors[comp.component_type] || "#6b7280"}`,
            borderRadius: "8px",
            padding: "10px",
            width: 150,
          },
        }));
        
        const flowEdges: Edge[] = data.relationships.map((rel: GraphRelationship, i: number) => ({
          id: `e${i}`,
          source: rel.source_uid,
          target: rel.target_uid,
          type: "smoothstep",
          animated: false,
          style: { stroke: "#6b7280" },
          markerEnd: { type: MarkerType.ArrowClosed },
        }));
        
        setNodes(flowNodes);
        setEdges(flowEdges);
      } catch (err) {
        const msg = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Failed to load";
        console.warn("Graph load error:", msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    loadGraph();
  }, [selectedVersion, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge({ ...params, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges],
  );

  return (
    <div className="space-y-4">
      {/* Header with version selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Architecture Graph</h1>
          <p className="text-muted-foreground text-sm">
            Visualize and manage your intended architecture
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
          <Button variant="outline">Add Component</Button>
        </div>
      </div>

      {error && !loading && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="pt-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ {error}. Showing empty state.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Graph */}
      <Card className="w-full h-[600px] relative overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Skeleton className="h-[500px] w-full" />
          </div>
        ) : nodes.length > 0 ? (
          <>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              fitView
              colorMode={resolvedTheme === "dark" ? "dark" : "light"}
            >
              <Controls />
              <Background gap={12} size={1} />
            </ReactFlow>
            
            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-background/80 backdrop-blur-sm border p-3 rounded-lg text-xs space-y-2 max-w-[200px]">
              <div className="font-semibold mb-1">Component Types</div>
              {Object.entries(componentTypeColors).slice(0, 6).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }}></div>
                  <span className="capitalize">{type}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-lg font-medium">No graph data</p>
            <p className="text-sm">Create an architecture version and add components</p>
          </div>
        )}
      </Card>

      {/* Stats */}
      {graph && (
        <div className="flex gap-4">
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Components</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{graph.stats.total_components}</div>
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Relationships</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{graph.stats.total_relationships}</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}