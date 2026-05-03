"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { RiFolderLine } from "@remixicon/react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, createProject, deleteProject, listProjects, updateProject } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { ApiPagination, ProjectCreatePayload, ProjectListItem } from "@/lib/types";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required."),
  description: z.string(),
  repository_url: z.string(),
  default_branch: z.string().min(1, "Default branch is required."),
  language: z.string().min(1, "Language is required."),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

const emptyForm: ProjectCreatePayload = {
  name: "",
  description: "",
  repository_url: "",
  default_branch: "main",
  language: "python",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [pagination, setPagination] = useState<ApiPagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: emptyForm.name,
      description: emptyForm.description ?? "",
      repository_url: emptyForm.repository_url ?? "",
      default_branch: emptyForm.default_branch ?? "main",
      language: emptyForm.language ?? "python",
    },
  });

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  async function loadProjects() {
    setLoading(true);
    try {
      const result = await listProjects({ page, per_page: 20, search: debouncedSearch });
      setProjects(result.data);
      setPagination(result.pagination);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadProjects();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch]);

  function openCreate() {
    setEditingId(null);
    form.reset({
      name: emptyForm.name,
      description: emptyForm.description ?? "",
      repository_url: emptyForm.repository_url ?? "",
      default_branch: emptyForm.default_branch ?? "main",
      language: emptyForm.language ?? "python",
    });
    setDialogOpen(true);
  }

  function openEdit(project: ProjectListItem) {
    setEditingId(project.id);
    form.reset({
      name: project.name,
      description: project.description ?? "",
      repository_url: "",
      default_branch: "main",
      language: project.language || "python",
    });
    setDialogOpen(true);
  }

  async function saveProject(values: ProjectFormValues) {
    setSaving(true);
    try {
      if (editingId) {
        await updateProject(editingId, {
          name: values.name,
          description: values.description,
          repository_url: values.repository_url,
          default_branch: values.default_branch,
        });
        toast.success("Project updated");
      } else {
        await createProject({
          name: values.name,
          description: values.description,
          repository_url: values.repository_url,
          default_branch: values.default_branch,
          language: values.language,
        });
        toast.success("Project created");
      }
      setDialogOpen(false);
      await loadProjects();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to save project");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setSaving(true);
    try {
      await deleteProject(deleteId);
      toast.success("Project deleted");
      setDeleteId(null);
      await loadProjects();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to delete project");
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
              Repository Portfolio
            </p>
            <div className="space-y-1">
              <CardTitle className="text-3xl">Projects</CardTitle>
              <p className="text-sm text-muted-foreground">
                Create and manage repositories under architecture governance.
              </p>
            </div>
          </div>
          <Button onClick={openCreate}>Create project</Button>
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "Visible Projects",
            value: loading ? <Skeleton className="h-10 w-20" /> : projects.length,
            detail: "Current page",
          },
          {
            title: "Total Projects",
            value: pagination?.total_items ?? projects.length,
            detail: "Workspace repositories",
          },
          {
            title: "Active Repositories",
            value: projects.filter((project) => project.is_active).length,
            detail: "On current page",
          },
          {
            title: "Languages",
            value: new Set(projects.map((project) => project.language)).size,
            detail: "Visible in results",
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
              <p className="text-xs text-muted-foreground">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 bg-muted/20 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Search portfolio</p>
            <p className="text-xs text-muted-foreground">
              Narrow the repository set and open project workspaces directly.
            </p>
          </div>
          <div className="flex w-full max-w-md items-center gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects..."
            className="w-full"
          />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-sm">
      <CardHeader>
        <CardTitle>Tracked Repositories</CardTitle>
        <p className="text-sm text-muted-foreground">
          Governed repositories and their current operational state.
        </p>
      </CardHeader>
      <CardContent className="p-0">
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/80 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Repository</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-5 w-52" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-60" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-9 w-28" /></TableCell>
                </TableRow>
              ))
            ) : projects.length ? (
              projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
                        {project.name}
                      </Link>
                      <p className="max-w-xl truncate text-xs text-muted-foreground">
                        {project.description || "No description"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Repository pending in list response</span>
                      <span>Open to inspect full metadata</span>
                    </div>
                  </TableCell>
                  <TableCell>{project.language}</TableCell>
                  <TableCell>
                    <Badge variant={project.is_active ? "default" : "outline"}>
                      {project.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(project.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/projects/${project.id}`}>Open</Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(project)}>
                        Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleteId(project.id)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                    <RiFolderLine className="size-12 text-muted-foreground" />
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">No projects found</h3>
                      <p className="text-sm text-muted-foreground">
                        Create your first governed repository.
                      </p>
                    </div>
                    <Button onClick={openCreate}>Create project</Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      </CardContent>
      </Card>

      {pagination && pagination.total_pages > 1 ? (
        <Card className="border-border/70 bg-card/80 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Page {pagination.page} of {pagination.total_pages} · {pagination.total_items} total
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.has_prev}
                onClick={() => setPage(pagination.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.has_next}
                onClick={() => setPage(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <Form {...form}>
          <form onSubmit={form.handleSubmit(saveProject)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit project" : "Create project"}</DialogTitle>
              <DialogDescription>Register the repository and its primary architecture language.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
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
              <FormField
                control={form.control}
                name="repository_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repository URL</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="default_branch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default branch</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Language</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={Boolean(editingId)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes the project and removes it from active governance views.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={saving}
              onClick={confirmDelete}
            >
              {saving ? "Deleting..." : "Delete project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
