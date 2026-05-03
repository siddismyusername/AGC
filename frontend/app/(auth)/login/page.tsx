"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ApiError, login } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function handleLogin(values: LoginFormValues) {
    form.clearErrors("root");

    try {
      await login(values);
      toast.success("Signed in");
      const redirectTarget =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("redirect")
          : null;
      router.replace(redirectTarget || "/dashboard");
    } catch (err) {
      const message = err instanceof ApiError ? err.detail : "Sign in failed";
      form.setError("root", { message });
    }
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.2fr)_520px]">
      <section className="hidden border-r border-border/70 bg-muted/25 px-10 py-10 lg:flex lg:flex-col lg:justify-between">
        <div className="space-y-6">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground">
            AG
          </div>
          <div className="max-w-xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Governance Access
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              Sign in to the architecture control plane.
            </h1>
            <p className="text-sm leading-7 text-muted-foreground">
              Review architecture drift, run compliance checks, inspect violations, and manage document-driven governance from one console.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm">
          <p className="text-sm font-medium">Workspace access is role-aware.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Administrative, architect, developer, and DevOps actions are separated once the session is established.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center p-4 sm:p-8">
      <Card className="w-full max-w-md border-border/70 bg-card/85 shadow-xl shadow-black/5">
        <CardHeader className="space-y-1">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            AG
          </div>
          <CardTitle className="text-2xl">Sign in to ArchGuard</CardTitle>
          <CardDescription>Access architecture compliance, rules, and reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
            {form.formState.errors.root?.message ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            ) : null}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              New to ArchGuard?{" "}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Create an account
              </Link>
            </p>
            </form>
          </Form>
        </CardContent>
      </Card>
      </section>
    </main>
  );
}
