"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ApiError, register } from "@/lib/api";
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

const registerSchema = z
  .object({
    full_name: z.string().min(1, "Full name is required."),
    email: z.email("Enter a valid email address."),
    organization_name: z.string().min(1, "Organization is required."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      email: "",
      organization_name: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function handleRegister(values: RegisterFormValues) {
    form.clearErrors("root");

    try {
      await register({
        full_name: values.full_name,
        email: values.email,
        organization_name: values.organization_name,
        password: values.password,
      });
      toast.success("Account created");
      router.replace("/dashboard");
    } catch (err) {
      form.setError("root", {
        message: err instanceof ApiError ? err.detail : "Registration failed",
      });
    }
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.1fr)_560px]">
      <section className="hidden border-r border-border/70 bg-muted/25 px-10 py-10 lg:flex lg:flex-col lg:justify-between">
        <div className="space-y-6">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground">
            AG
          </div>
          <div className="max-w-xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Workspace Setup
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              Create the governance workspace for your engineering organization.
            </h1>
            <p className="text-sm leading-7 text-muted-foreground">
              Registration provisions the initial organization, the first admin user, and the secure session needed to start governing repositories immediately.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm">
          <p className="text-sm font-medium">The first registered user becomes the workspace admin.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Additional members and role assignment are managed after organization creation.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center p-4 sm:p-8">
      <Card className="w-full max-w-md border-border/70 bg-card/85 shadow-xl shadow-black/5">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            AG
          </div>
          <CardTitle className="text-2xl">Create your ArchGuard account</CardTitle>
          <CardDescription>Set up an organization workspace for governance checks.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleRegister)} className="space-y-4">
            {form.formState.errors.root?.message ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            ) : null}
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
              name="organization_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization</FormLabel>
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
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating..." : "Create account"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
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
