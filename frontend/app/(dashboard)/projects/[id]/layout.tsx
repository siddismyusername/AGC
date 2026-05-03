"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "overview", label: "Overview", path: "", primary: true },
  { value: "graph", label: "Graph", path: "graph" },
  { value: "rules", label: "Rules", path: "rules" },
  { value: "compliance", label: "Compliance", path: "compliance" },
  { value: "violations", label: "Violations", path: "violations" },
  { value: "documents", label: "Documents", path: "documents" },
];

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pathname = usePathname();

  const active =
    tabs.find((tab) => tab.path && pathname.endsWith(`/${tab.path}`))?.value ?? "overview";

  return (
    <div className="space-y-6">
      <Tabs value={active}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl border border-border/70 bg-card/75 p-1 shadow-sm">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "rounded-xl border border-transparent px-4 py-2.5 text-sm data-[state=active]:border-border/80 data-[state=active]:bg-background data-[state=active]:shadow-sm",
                tab.primary
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground data-[state=active]:text-foreground"
              )}
              asChild
            >
              <Link href={`/projects/${id}${tab.path ? `/${tab.path}` : ""}`}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {children}
    </div>
  );
}
