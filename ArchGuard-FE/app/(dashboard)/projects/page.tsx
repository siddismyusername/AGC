"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import type { Project } from "@/lib/types";

interface PaginatedResponse<T> {
  data: T[];
  pagination?: {
    page: number;
    per_page: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [pagination, setPagination] = useState<PaginatedResponse<Project>["pagination"] | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const queryParams = new URLSearchParams();
        queryParams.set("page", "1");
        queryParams.set("per_page", "20");
        if (searchQuery) queryParams.set("search", searchQuery);
        if (languageFilter !== "all") queryParams.set("language", languageFilter);

        const data = await api.get<PaginatedResponse<Project>>(`/projects?${queryParams}`);
        
        if (Array.isArray(data)) {
          // Legacy non-paginated response
          setProjects(data);
        } else {
          // Paginated response
          setProjects(data.data || []);
          setPagination(data.pagination);
        }
        setError(null);
      } catch (err) {
        const msg = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Failed to load";
        console.warn("Projects load error:", msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    
    // Debounce search
    const timeout = setTimeout(load, searchQuery ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [searchQuery, languageFilter]);

  const filteredProjects = projects.filter((project) => {
    const matchesLanguage = languageFilter === "all" || project.language?.toLowerCase() === languageFilter.toLowerCase();
    return matchesLanguage;
  });

  const languages = Array.from(new Set(projects.map((p) => p.language).filter(Boolean))) as string[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Manage and monitor your architectural repositories.
          </p>
        </div>
        <Button>Create Project</Button>
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

      <div className="flex flex-col gap-4 sm:flex-row">
        <Input
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select value={languageFilter} onValueChange={setLanguageFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Languages</SelectItem>
            {languages.map((lang) => (
              <SelectItem key={lang} value={lang.toLowerCase()}>
                {lang}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Pagination info */}
      {pagination && (
        <div className="text-sm text-muted-foreground">
          Showing {projects.length} of {pagination.total_items} projects
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="flex flex-col">
                <CardHeader>
                  <Skeleton className="h-6 w-2/3 mb-2" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </CardHeader>
                <CardContent className="flex-1" />
                <CardFooter>
                  <Skeleton className="h-9 w-full" />
                </CardFooter>
              </Card>
            ))
          : filteredProjects.map((project) => (
              <Card key={project.id} className="flex flex-col hover:border-primary/50 transition-colors">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg line-clamp-1" title={project.name}>
                      {project.name}
                    </CardTitle>
                    {project.language && (
                      <Badge variant="secondary" className="shrink-0 text-[10px] uppercase font-mono">
                        {project.language}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="line-clamp-2 min-h-[40px]">
                    {project.description || "No description provided."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
                      {project.default_branch}
                    </span>
                    <span className="truncate">{project.repository_url?.replace("https://github.com/", "")}</span>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/projects/${project.id}`}>View Architecture</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
      </div>
      
      {!loading && filteredProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg border-dashed">
          <p className="text-lg font-medium">No projects found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery || languageFilter !== "all" 
              ? "Try adjusting your search or filters." 
              : "Create your first project to get started."}
          </p>
        </div>
      )}
    </div>
  );
}