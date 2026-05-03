"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { clearSession, getCurrentUser } from "@/lib/api";

function labelFor(segment: string) {
  if (segment.length > 18) return "Project";
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .catch(() => {
        clearSession();
        router.replace("/login");
      })
      .finally(() => setChecking(false));
  }, [router]);

  const crumbs = useMemo(
    () => pathname.split("/").filter(Boolean).map(labelFor),
    [pathname]
  );

  if (checking) {
    return (
      <div className="flex min-h-screen bg-background">
        <div className="hidden w-64 border-r border-border/60 bg-muted/20 p-4 md:block">
          <div className="space-y-3">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-11/12" />
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <div className="border-b border-border/60 px-4 py-3 md:px-6">
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="space-y-4 p-4 md:p-6">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/85 px-4 backdrop-blur md:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 !h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {crumbs.map((crumb, index) => (
                  <BreadcrumbItem key={`${crumb}-${index}`}>
                    <BreadcrumbPage>{crumb}</BreadcrumbPage>
                    {index < crumbs.length - 1 ? <BreadcrumbSeparator /> : null}
                  </BreadcrumbItem>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
