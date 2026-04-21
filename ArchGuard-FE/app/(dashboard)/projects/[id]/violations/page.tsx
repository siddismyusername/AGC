"use client";

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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

const initialViolations = [
  {
    id: "v1",
    severity: "critical",
    rule_type: "forbidden_dependency",
    source: "payment-service",
    target: "auth-db",
    description: "Payment service directly accessing auth database bypasses auth-service API.",
    remediation: `// Qwen 2.5 Remediation Suggestion:
// Remove direct DB driver import and use the Auth Service HTTP client.

- import { AuthDB } from "auth-db-driver";
+ import { AuthClient } from "@internal/auth-client";

  async function getUserData(userId) {
-   return await AuthDB.users.findOne(userId);
+   return await AuthClient.getUser(userId);
  }`,
  },
  {
    id: "v2",
    severity: "major",
    rule_type: "layer_constraint",
    source: "web-ui",
    target: "core-domain",
    description: "UI layer directly calling core domain logic instead of use-cases layer.",
    remediation: `// Qwen 2.5 Remediation Suggestion:
// Inject UseCase instead of Domain Entity directly.

- import { CalculateTax } from "domain/tax";
+ import { CheckoutUseCase } from "application/checkout";

  export function handleCheckout() {
-   const tax = CalculateTax(cart);
+   const useCase = new CheckoutUseCase();
+   const result = useCase.execute(cart);
  }`,
  },
];

export default function ViolationsPage() {
  const [violations, setViolations] = useState(initialViolations);

  const handleDismiss = (id: string) => {
    setViolations(violations.filter(v => v.id !== id));
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium">Active Violations</h2>
          <p className="text-sm text-muted-foreground">Review architectural drift and AI remediation suggestions.</p>
        </div>
      </div>

      <div className="rounded-md border">
        {violations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No active violations. Your architecture is completely healthy!
          </div>
        ) : (
          <Accordion type="multiple" className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Severity</TableHead>
                  <TableHead>Rule Type</TableHead>
                  <TableHead>Source &rarr; Target</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {violations.map((violation) => (
                  <TableRow key={violation.id} className="group hover:bg-muted/50 p-0">
                    <TableCell colSpan={4} className="p-0 border-b-0">
                      <AccordionItem value={violation.id} className="border-b-0">
                        <AccordionTrigger className="hover:no-underline py-3 px-4 w-full">
                          <div className="flex items-center w-full gap-4 text-left">
                            <div className="w-[100px]">
                              <Badge
                                variant={violation.severity === "critical" ? "destructive" : "default"}
                              >
                                {violation.severity}
                              </Badge>
                            </div>
                            <div className="flex-1 font-mono text-xs text-muted-foreground">
                              {violation.rule_type}
                            </div>
                            <div className="flex-2 flex items-center gap-2 text-sm font-medium">
                              <span>{violation.source}</span>
                              <span className="text-muted-foreground">&rarr;</span>
                              <span>{violation.target}</span>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div className="pl-[116px] pr-4 space-y-4">
                            <p className="text-sm">{violation.description}</p>
                            
                            <div className="bg-muted/50 rounded-lg border overflow-hidden">
                              <div className="bg-muted px-4 py-2 border-b text-xs font-mono font-semibold flex items-center gap-2">
                                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">AI</span>
                                Remediation Suggestion
                              </div>
                              <pre className="p-4 text-xs font-mono overflow-x-auto text-muted-foreground">
                                <code>
                                  {violation.remediation.split('\n').map((line, i) => {
                                    if (line.startsWith('+')) return <div key={i} className="text-green-500 bg-green-500/10 w-full">{line}</div>;
                                    if (line.startsWith('-')) return <div key={i} className="text-red-500 bg-red-500/10 w-full">{line}</div>;
                                    if (line.startsWith('//')) return <div key={i} className="text-muted-foreground/60">{line}</div>;
                                    return <div key={i}>{line}</div>;
                                  })}
                                </code>
                              </pre>
                            </div>

                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm">Create Ticket</Button>
                              
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                    Dismiss
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Dismiss Violation?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will ignore the architectural drift. If the rule is still active, it may be flagged again on the next compliance check.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDismiss(violation.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                      Dismiss
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Accordion>
        )}
      </div>
    </div>
  );
}
