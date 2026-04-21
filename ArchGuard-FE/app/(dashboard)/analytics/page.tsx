"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";

interface WorkerHealth {
  queue_backend: string;
  redis_status: string;
  redis_latency_ms: number | null;
  celery_worker_count: number;
  worker_status: string;
  checked_at: string;
}

export default function AnalyticsPage() {
  const [workerHealth, setWorkerHealth] = useState<WorkerHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<WorkerHealth>("/analytics/worker-health");
        setWorkerHealth(data);
        setError(null);
      } catch (err) {
        const msg = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Failed to load";
        console.warn("Worker health error:", msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const getStatusColor = (status: string) => {
    if (status === "healthy" || status === "ready") return "bg-green-500";
    if (status === "degraded") return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Global metrics across all architecture projects.
        </p>
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AI Worker Health</CardTitle>
            <CardDescription>Backend worker and queue status</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : workerHealth ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(workerHealth.worker_status)}`}></div>
                      <span className="font-medium">Celery Worker</span>
                    </div>
                    <Badge variant={workerHealth.worker_status === "healthy" ? "default" : "secondary"}>
                      {workerHealth.worker_status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {workerHealth.celery_worker_count} worker(s) running
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(workerHealth.redis_status)}`}></div>
                      <span className="font-medium">Redis Queue</span>
                    </div>
                    <Badge variant="outline">{workerHealth.redis_status}</Badge>
                  </div>
                  {workerHealth.redis_latency_ms && (
                    <div className="text-sm text-muted-foreground">
                      Latency: {workerHealth.redis_latency_ms}ms
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Backend</span>
                    </div>
                    <Badge variant="outline">{workerHealth.queue_backend}</Badge>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No worker health data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Backend connectivity</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>PostgreSQL</span>
                    <Badge variant="default">Connected</Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Neo4j Graph DB</span>
                    <Badge variant={error ? "destructive" : "default"}>
                      {error ? "Disconnected" : "Connected"}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Redis Queue</span>
                    <Badge variant="default">Connected</Badge>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}