"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import { use } from "react";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const pathname = usePathname();
  const { id } = use(params);
  
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    // In a real app we'd fetch the project details here to show in the header
    // Using a mock fallback for now since backend might not be running
    const mockProject = {
      id,
      name: id === "p1" ? "Payment Service" : id === "p2" ? "API Gateway" : "Project " + id,
      description: "Service overview",
    } as Project;
    
    api.get<Project>(`/projects/${id}`)
      .then(setProject)
      .catch(() => setProject(mockProject));
  }, [id]);

  // Determine which tab is active based on the URL
  let activeTab = "overview";
  if (pathname.includes("/graph")) activeTab = "graph";
  else if (pathname.includes("/rules")) activeTab = "rules";
  else if (pathname.includes("/documents")) activeTab = "documents";
  else if (pathname.includes("/violations")) activeTab = "violations";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{project?.name || "Loading..."}</h1>
        <p className="text-muted-foreground">{project?.description || "Manage architecture and compliance"}</p>
      </div>

      <Tabs value={activeTab} className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger 
            value="overview" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2.5 pt-2"
            asChild
          >
            <Link href={`/projects/${id}`}>Overview</Link>
          </TabsTrigger>
          <TabsTrigger 
            value="graph" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2.5 pt-2"
            asChild
          >
            <Link href={`/projects/${id}/graph`}>Architecture Graph</Link>
          </TabsTrigger>
          <TabsTrigger 
            value="rules" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2.5 pt-2"
            asChild
          >
            <Link href={`/projects/${id}/rules`}>Rules</Link>
          </TabsTrigger>
          <TabsTrigger 
            value="violations" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2.5 pt-2"
            asChild
          >
            <Link href={`/projects/${id}/violations`}>Violations</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="pt-2">{children}</div>
    </div>
  );
}
