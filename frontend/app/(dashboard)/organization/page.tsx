"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { RiBuilding2Line } from "@remixicon/react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  getCurrentUser,
  getMyOrganization,
  getStoredUser,
  listOrganizationMembers,
  updateMyOrganization,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Organization, OrganizationMember, User } from "@/lib/types";

const organizationSchema = z.object({
  name: z.string().min(1, "Organization name is required."),
  description: z.string(),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

export default function OrganizationPage() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const form = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const canEdit = user?.role === "admin";

  async function load() {
    setLoading(true);
    try {
      const [organizationData, memberData, userData] = await Promise.all([
        getMyOrganization(),
        listOrganizationMembers().catch(() => []),
        getCurrentUser().catch(() => getStoredUser()),
      ]);
      setOrganization(organizationData);
      setMembers(memberData);
      setUser(userData);
      form.reset({
        name: organizationData.name,
        description: organizationData.description ?? "",
      });
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load organization");
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
  }, []);

  async function saveOrganization(values: OrganizationFormValues) {
    setSaving(true);
    try {
      const updated = await updateMyOrganization({
        name: values.name.trim() || undefined,
        description: values.description.trim() || null,
      });
      setOrganization(updated);
      setDialogOpen(false);
      toast.success("Organization updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to update organization");
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
              Workspace Administration
            </p>
            <div className="space-y-1">
              <CardTitle className="text-3xl">
                {organization?.name || "Organization"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {organization?.description ||
                  "Shared governance workspace, members, and ownership."}
              </p>
            </div>
          </div>
          {canEdit ? (
            <Button onClick={() => setDialogOpen(true)} disabled={!organization}>
              Edit organization
            </Button>
          ) : null}
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Members", value: loading ? <span className="inline-block h-10 w-20"><Skeleton className="h-10 w-20" /></span> : organization?.members_count ?? 0 },
          { title: "Projects", value: loading ? <span className="inline-block h-10 w-20"><Skeleton className="h-10 w-20" /></span> : organization?.projects_count ?? 0 },
          { title: "Slug", value: organization?.slug || "N/A" },
          { title: "Updated", value: organization ? formatDate(organization.updated_at) : "N/A" },
        ].map((metric) => (
          <Card key={metric.title} className="border-border/70 bg-card/85 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {metric.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tracking-tight">{metric.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle>Workspace Details</CardTitle>
          <p className="text-sm text-muted-foreground">
            Organization metadata used across projects and governance reporting.
          </p>
        </CardHeader>
        <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Name</p>
            <p className="mt-1 text-sm text-muted-foreground">{organization?.name || "N/A"}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Slug</p>
            <p className="mt-1 text-sm text-muted-foreground">{organization?.slug || "N/A"}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-sm font-medium">Description</p>
            <p className="mt-1 text-sm text-muted-foreground">{organization?.description || "No description"}</p>
          </div>
        </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <p className="text-sm text-muted-foreground">
            Current workspace membership and role assignment.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card/80 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : members.length ? (
                  members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        <div className="space-y-1">
                          <p>{member.full_name || "Unnamed"}</p>
                          <p className="text-xs text-muted-foreground">{member.id.slice(0, 8)}</p>
                        </div>
                      </TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{member.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.is_active ? "default" : "outline"}>
                          {member.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(member.created_at)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                        <RiBuilding2Line className="size-12 text-muted-foreground" />
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold">No members available</h3>
                          <p className="text-sm text-muted-foreground">
                            Membership data is empty for this workspace.
                          </p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <Form {...form}>
          <form onSubmit={form.handleSubmit(saveOrganization)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Edit organization</DialogTitle>
              <DialogDescription>Only admin users can update workspace metadata.</DialogDescription>
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
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
