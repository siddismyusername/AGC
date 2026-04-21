"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

// Fallback Compliance Report Data
const fallbackReports = [
  {
    id: "rep-001",
    health_score: 82,
    total_violations: 4,
    critical_violations: 1,
    major_violations: 3,
    minor_violations: 0,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: "rep-002",
    health_score: 75,
    total_violations: 7,
    critical_violations: 2,
    major_violations: 4,
    minor_violations: 1,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: "rep-003",
    health_score: 95,
    total_violations: 1,
    critical_violations: 0,
    major_violations: 0,
    minor_violations: 1,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(),
  },
];

export default function CompliancePage() {
  const [reports, setReports] = useState(fallbackReports);
  const [isScanning, setIsScanning] = useState(false);

  const runComplianceCheck = () => {
    setIsScanning(true);
    toast("Initiating compliance scan...");

    setTimeout(() => {
      setIsScanning(false);
      setReports([
        {
          id: `rep-${Date.now()}`,
          health_score: 85,
          total_violations: 3,
          critical_violations: 0,
          major_violations: 2,
          minor_violations: 1,
          created_at: new Date().toISOString(),
        },
        ...reports,
      ]);
      toast.success("Compliance scan completed!");
    }, 2500);
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium">Compliance History</h2>
          <p className="text-sm text-muted-foreground">Historical records of architectural scans and health scores.</p>
        </div>
        
        <Button onClick={runComplianceCheck} disabled={isScanning}>
          {isScanning ? "Scanning..." : "Run Compliance Check"}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report ID</TableHead>
              <TableHead>Health Score</TableHead>
              <TableHead>Total Violations</TableHead>
              <TableHead>Breakdown</TableHead>
              <TableHead className="text-right">Date Run</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                <TableCell className="font-mono text-xs">
                  {report.id}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{report.health_score}%</span>
                    <Progress value={report.health_score} className="w-16 h-1.5" />
                  </div>
                </TableCell>
                <TableCell className="font-medium text-center sm:text-left">
                  {report.total_violations}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {report.critical_violations > 0 && (
                      <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                        {report.critical_violations} C
                      </Badge>
                    )}
                    {report.major_violations > 0 && (
                      <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                        {report.major_violations} M
                      </Badge>
                    )}
                    {report.minor_violations > 0 && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {report.minor_violations} m
                      </Badge>
                    )}
                    {report.total_violations === 0 && (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-green-600 border-green-600">
                        Clean
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {new Date(report.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
