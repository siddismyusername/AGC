"use client";

import { use, useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { RiFileList3Line } from "@remixicon/react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  applyDiagramHintsFromDocument,
  deleteDocument,
  extractRulesFromDocument,
  getDocumentJobStatus,
  listArchitectureVersions,
  listDocuments,
  processDocument,
  reviewDocumentAiCandidates,
  uploadDocument,
} from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import type {
  AiEntityCandidate,
  AiRelationshipCandidate,
  AiRuleCandidate,
  ArchitectureVersion,
  DiagramHintRelationshipSelection,
  UploadedDocument,
} from "@/lib/types";

const uploadSchema = z.object({
  description: z.string(),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

const accepted = [".pdf", ".png", ".jpg", ".jpeg", ".txt", ".md"];
const maxBytes = 10 * 1024 * 1024;

function inferType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "txt";
  if (extension === "md" || extension === "txt") return "text";
  if (extension === "pdf") return "pdf";
  return "image";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function toNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry));
}

function getExtractedData(document: UploadedDocument | null) {
  return document && isRecord(document.extracted_data) ? document.extracted_data : null;
}

function getAiCandidates(document: UploadedDocument | null) {
  const extractedData = getExtractedData(document);
  const value = extractedData && isRecord(extractedData.ai_candidates) ? extractedData.ai_candidates : null;
  if (!value) return null;
  return {
    architectureVersionId:
      typeof value.architecture_version_id === "string" ? value.architecture_version_id : "",
    analyzedAt: typeof value.analyzed_at === "string" ? value.analyzed_at : null,
    summary: typeof value.summary === "string" ? value.summary : "",
    keywords: toStringArray(value.keywords),
    inputSourceFields: toStringArray(value.input_source_fields),
    lastReviewedAt: typeof value.last_reviewed_at === "string" ? value.last_reviewed_at : null,
    lastReviewedBy: typeof value.last_reviewed_by === "string" ? value.last_reviewed_by : null,
    ruleCandidates: Array.isArray(value.rule_candidates)
      ? (value.rule_candidates as AiRuleCandidate[])
      : [],
    entityCandidates: Array.isArray(value.entity_candidates)
      ? (value.entity_candidates as AiEntityCandidate[])
      : [],
    relationshipCandidates: Array.isArray(value.relationship_candidates)
      ? (value.relationship_candidates as AiRelationshipCandidate[])
      : [],
  };
}

function getAiCandidateReviews(document: UploadedDocument | null) {
  const extractedData = getExtractedData(document);
  const value =
    extractedData && Array.isArray(extractedData.ai_candidates_reviews)
      ? extractedData.ai_candidates_reviews
      : [];

  return value
    .filter(isRecord)
    .map((entry) => ({
      reviewedAt: typeof entry.reviewed_at === "string" ? entry.reviewed_at : "",
      reviewedBy: typeof entry.reviewed_by === "string" ? entry.reviewed_by : "",
      note: typeof entry.note === "string" ? entry.note : null,
      acceptedRuleIndexes: toNumberArray(entry.accepted_rule_indexes),
      rejectedRuleIndexes: toNumberArray(entry.rejected_rule_indexes),
      acceptedEntityIndexes: toNumberArray(entry.accepted_entity_indexes),
      rejectedEntityIndexes: toNumberArray(entry.rejected_entity_indexes),
      acceptedRelationshipIndexes: toNumberArray(entry.accepted_relationship_indexes),
      rejectedRelationshipIndexes: toNumberArray(entry.rejected_relationship_indexes),
    }))
    .filter((entry) => entry.reviewedAt);
}

function getDiagramHints(document: UploadedDocument | null) {
  const extractedData = getExtractedData(document);
  const uploadIntake =
    extractedData && isRecord(extractedData.upload_intake) ? extractedData.upload_intake : null;
  const hints = uploadIntake && isRecord(uploadIntake.diagram_hints) ? uploadIntake.diagram_hints : null;

  const components = hints ? toStringArray(hints.components) : [];
  const relationships =
    hints && Array.isArray(hints.relationships)
      ? hints.relationships
          .filter(isRecord)
          .map((entry) => ({
            source: String(entry.source ?? "").trim(),
            target: String(entry.target ?? "").trim(),
            relation: String(entry.relation ?? "depends_on").trim() || "depends_on",
          }))
          .filter((entry) => entry.source && entry.target)
      : [];

  const applied =
    uploadIntake && isRecord(uploadIntake.diagram_hints_applied)
      ? uploadIntake.diagram_hints_applied
      : null;
  const appliedAt = applied && typeof applied.applied_at === "string" ? applied.applied_at : null;
  const createdComponentsCount =
    applied && typeof applied.created_components_count === "number"
      ? applied.created_components_count
      : 0;
  const createdRelationshipsCount =
    applied && typeof applied.created_relationships_count === "number"
      ? applied.created_relationships_count
      : 0;

  const reviews =
    uploadIntake && Array.isArray(uploadIntake.diagram_hint_reviews)
      ? uploadIntake.diagram_hint_reviews.filter(isRecord)
      : [];

  return {
    components,
    relationships,
    appliedAt,
    createdComponentsCount,
    createdRelationshipsCount,
    reviewCount: reviews.length,
  };
}

function relationshipKey(relationship: DiagramHintRelationshipSelection | AiRelationshipCandidate) {
  return `${relationship.source}::${relationship.relation}::${relationship.target}`;
}

function allIndexes(length: number) {
  return Array.from({ length }, (_, index) => index);
}

export default function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detailStep, setDetailStep] = useState<"overview" | "ai-review" | "diagram-hints" | "danger-zone">("overview");
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [versions, setVersions] = useState<ArchitectureVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<UploadedDocument | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [actionBusy, setActionBusy] = useState<null | "extract" | "review" | "diagram" | "process" | "delete">(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [acceptedRules, setAcceptedRules] = useState<number[]>([]);
  const [rejectedRules, setRejectedRules] = useState<number[]>([]);
  const [acceptedEntities, setAcceptedEntities] = useState<number[]>([]);
  const [rejectedEntities, setRejectedEntities] = useState<number[]>([]);
  const [acceptedRelationships, setAcceptedRelationships] = useState<number[]>([]);
  const [rejectedRelationships, setRejectedRelationships] = useState<number[]>([]);
  const [selectedHintComponents, setSelectedHintComponents] = useState<string[]>([]);
  const [selectedHintRelationships, setSelectedHintRelationships] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<UploadedDocument | null>(null);
  const [reviewSummary, setReviewSummary] = useState<string | null>(null);
  const [diagramSummary, setDiagramSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadForm = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { description: "" },
  });
  const notesForm = useForm<{ reviewNote: string; diagramNote: string }>({
    defaultValues: {
      reviewNote: "",
      diagramNote: "",
    },
  });
  const reviewNote = useWatch({ control: notesForm.control, name: "reviewNote" }) ?? "";
  const diagramNote = useWatch({ control: notesForm.control, name: "diagramNote" }) ?? "";

  const aiCandidates = getAiCandidates(selected);
  const aiReviews = getAiCandidateReviews(selected);
  const diagramHints = getDiagramHints(selected);
  const reviewSelectionsCount =
    acceptedRules.length +
    rejectedRules.length +
    acceptedEntities.length +
    rejectedEntities.length +
    acceptedRelationships.length +
    rejectedRelationships.length;

  function initializeSelectionState(document: UploadedDocument | null) {
    if (!document) {
      notesForm.reset({ reviewNote: "", diagramNote: "" });
      setReviewSummary(null);
      setDiagramSummary(null);
      setAcceptedRules([]);
      setRejectedRules([]);
      setAcceptedEntities([]);
      setRejectedEntities([]);
      setAcceptedRelationships([]);
      setRejectedRelationships([]);
      setSelectedHintComponents([]);
      setSelectedHintRelationships([]);
      return;
    }

    const persistedCandidates = getAiCandidates(document);
    const persistedHints = getDiagramHints(document);
    setReviewSummary(null);
    setDiagramSummary(null);
    if (persistedCandidates?.architectureVersionId) {
      setSelectedVersionId((current) => current || persistedCandidates.architectureVersionId);
    }
    notesForm.reset({ reviewNote: "", diagramNote: "" });
    setAcceptedRules([]);
    setRejectedRules([]);
    setAcceptedEntities([]);
    setRejectedEntities([]);
    setAcceptedRelationships([]);
    setRejectedRelationships([]);
    setSelectedHintComponents(persistedHints.components);
    setSelectedHintRelationships(
      persistedHints.relationships.map((relationship) => relationshipKey(relationship))
    );
  }

  function openDocument(document: UploadedDocument) {
    setSelected(document);
    setDetailStep("overview");
    initializeSelectionState(document);
  }

  function closeDocument() {
    setSelected(null);
    setDetailStep("overview");
    initializeSelectionState(null);
  }

  async function load(nextSelectedId?: string) {
    setLoading(true);
    try {
      const [documentData, versionData] = await Promise.all([
        listDocuments(id, {
          processing_status: statusFilter === "all" ? undefined : statusFilter,
        }),
        listArchitectureVersions(id).catch(() => []),
      ]);
      setDocuments(documentData);
      setVersions(versionData);
      const activeVersion = versionData.find((version) => version.status === "active") ?? versionData[0];
      setSelectedVersionId((current) => current || activeVersion?.id || "");
      setSelected((current) => {
        const targetId = nextSelectedId ?? current?.id;
        const nextSelected = targetId
          ? documentData.find((document) => document.id === targetId) ?? null
          : null;
        initializeSelectionState(nextSelected);
        return nextSelected;
      });
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load documents");
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
  }, [id, statusFilter]);

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) return;
    const extension = `.${nextFile.name.split(".").pop()?.toLowerCase()}`;
    if (!accepted.includes(extension)) {
      toast.error("Unsupported file type");
      return;
    }
    if (nextFile.size > maxBytes) {
      toast.error("File must be 10MB or smaller");
      return;
    }
    setFile(nextFile);
  }

  function toggleDecision(
    index: number,
    decision: "accept" | "reject",
    acceptedState: number[],
    rejectedState: number[],
    setAcceptedState: React.Dispatch<React.SetStateAction<number[]>>,
    setRejectedState: React.Dispatch<React.SetStateAction<number[]>>
  ) {
    const currentlyAccepted = acceptedState.includes(index);
    const currentlyRejected = rejectedState.includes(index);

    if (decision === "accept") {
      setAcceptedState((current) =>
        currentlyAccepted ? current.filter((value) => value !== index) : [...current, index].sort((a, b) => a - b)
      );
      if (currentlyRejected) {
        setRejectedState((current) => current.filter((value) => value !== index));
      }
      return;
    }

    setRejectedState((current) =>
      currentlyRejected ? current.filter((value) => value !== index) : [...current, index].sort((a, b) => a - b)
    );
    if (currentlyAccepted) {
      setAcceptedState((current) => current.filter((value) => value !== index));
    }
  }

  function toggleHintComponent(component: string, checked: boolean) {
    setSelectedHintComponents((current) =>
      checked ? [...current, component].filter((value, index, array) => array.indexOf(value) === index) : current.filter((value) => value !== component)
    );
  }

  function toggleHintRelationship(key: string, checked: boolean) {
    setSelectedHintRelationships((current) =>
      checked ? [...current, key].filter((value, index, array) => array.indexOf(value) === index) : current.filter((value) => value !== key)
    );
  }

  async function handleUpload(values: UploadFormValues) {
    if (!file) return;
    setProcessing(true);
    setProgress(20);
    try {
      const uploaded = await uploadDocument(id, file, inferType(file), values.description || undefined);
      setProgress(55);
      await processDocument(id, uploaded.id);
      setProgress(70);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const status = await getDocumentJobStatus(id, uploaded.id).catch(() => null);
        if (status?.processing_status === "completed" || status?.processing_status === "failed") break;
        setProgress(Math.min(95, 70 + attempt));
      }
      setProgress(100);
      toast.success("Document uploaded");
      setUploadOpen(false);
      setFile(null);
      uploadForm.reset({ description: "" });
      await load(uploaded.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Upload failed");
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  }

  async function runProcess(document: UploadedDocument) {
    setActionBusy("process");
    try {
      await processDocument(id, document.id, true);
      toast.success("Processing started");
      await load(document.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to process document");
    } finally {
      setActionBusy(null);
    }
  }

  async function extractCandidates(document: UploadedDocument) {
    if (!selectedVersionId) {
      toast.error("Select an architecture version first");
      return;
    }

    setActionBusy("extract");
    try {
      const result = await extractRulesFromDocument(id, document.id, {
        architecture_version_id: selectedVersionId,
        auto_create_rules: false,
        persist_candidates: true,
      });
      toast.success(
        `AI candidates refreshed: ${result.extracted_rules?.length ?? 0} rules, ${result.entities?.length ?? 0} entities`
      );
      await load(document.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "AI extraction failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function submitReview(document: UploadedDocument) {
    if (!selectedVersionId) {
      toast.error("Select an architecture version first");
      return;
    }
    if (!reviewSelectionsCount) {
      toast.error("Select at least one candidate decision before submitting");
      return;
    }

    setActionBusy("review");
    try {
      const result = await reviewDocumentAiCandidates(id, document.id, {
        architecture_version_id: selectedVersionId,
        accepted_rule_indexes: acceptedRules,
        rejected_rule_indexes: rejectedRules,
        accepted_entity_indexes: acceptedEntities,
        rejected_entity_indexes: rejectedEntities,
        accepted_relationship_indexes: acceptedRelationships,
        rejected_relationship_indexes: rejectedRelationships,
        review_note: reviewNote.trim() || null,
      });
      const summary = `Saved ${reviewSelectionsCount} review decisions across rules, entities, and relationships.`;
      toast.success(
        `Review saved: ${result.accepted_rules_count} rules accepted, ${result.rejected_rules_count} rules rejected`
      );
      await load(document.id);
      setReviewSummary(summary);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to save review");
    } finally {
      setActionBusy(null);
    }
  }

  async function applyDiagramHints(document: UploadedDocument) {
    if (!selectedVersionId) {
      toast.error("Select an architecture version first");
      return;
    }
    if (!selectedHintComponents.length && !selectedHintRelationships.length) {
      toast.error("Select at least one component or relationship to apply");
      return;
    }

    setActionBusy("diagram");
    try {
      const selectedRelationshipsPayload = diagramHints.relationships.filter((relationship) =>
        selectedHintRelationships.includes(relationshipKey(relationship))
      );
      const result = await applyDiagramHintsFromDocument(id, document.id, {
        architecture_version_id: selectedVersionId,
        persist_applied_metadata: true,
        selected_components: selectedHintComponents,
        selected_relationships: selectedRelationshipsPayload,
        review_note: diagramNote.trim() || null,
      });
      const summary = `Applied ${result.created_components_count} components and ${result.created_relationships_count} relationships to the architecture graph.`;
      toast.success(
        `Diagram hints applied: ${result.created_components_count} components, ${result.created_relationships_count} relationships`
      );
      await load(document.id);
      setDiagramSummary(summary);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to apply diagram hints");
    } finally {
      setActionBusy(null);
    }
  }

  async function remove(document: UploadedDocument) {
    setActionBusy("delete");
    try {
      await deleteDocument(id, document.id);
      toast.success("Document deleted");
      closeDocument();
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Failed to delete document");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-3xl">Documents</CardTitle>
            <p className="text-sm text-muted-foreground">
              Upload architecture documents, persist AI candidates, and submit reviewed decisions.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)}>Upload document</Button>
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardContent className="p-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-5 w-52" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-9 w-28" /></TableCell>
                </TableRow>
              ))
            ) : documents.length ? (
              documents.map((document) => (
                <TableRow key={document.id}>
                  <TableCell>
                    <p className="font-medium">{document.file_name}</p>
                    <p className="max-w-xl truncate text-xs text-muted-foreground">
                      {document.description || "No description"}
                    </p>
                  </TableCell>
                  <TableCell>{document.file_type}</TableCell>
                  <TableCell>{formatBytes(document.file_size_bytes)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{document.processing_status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(document.updated_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openDocument(document)}>
                        Inspect
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runProcess(document)}
                        disabled={actionBusy !== null}
                      >
                        Process
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                    <RiFileList3Line className="size-12 text-muted-foreground" />
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">No documents</h3>
                      <p className="text-sm text-muted-foreground">
                        Upload architecture text, PDFs, or diagrams to extract candidate rules.
                      </p>
                    </div>
                    <Button onClick={() => setUploadOpen(true)}>Upload document</Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </CardContent>
      </Card>

      <Dialog open={uploadOpen} onOpenChange={(open) => !processing && setUploadOpen(open)}>
        <DialogContent>
          <Form {...uploadForm}>
          <form onSubmit={uploadForm.handleSubmit(handleUpload)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Upload document</DialogTitle>
              <DialogDescription>
                Document processing is asynchronous. AI output is probabilistic and requires review.
              </DialogDescription>
            </DialogHeader>
            <div
              className="cursor-pointer rounded-lg border border-dashed p-8 text-center hover:bg-muted/50"
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                chooseFile(event.dataTransfer.files[0]);
              }}
            >
              <p className="text-sm font-medium">
                {file ? file.name : "Drop a file here or click to browse"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, PNG, JPG, TXT, or MD · max 10MB
              </p>
            </div>
            <Input
              ref={fileRef}
              type="file"
              accept={accepted.join(",")}
              className="hidden"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            <FormField
              control={uploadForm.control}
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
            {processing ? <Progress value={progress} /> : null}
            <DialogFooter>
              <Button type="submit" disabled={!file || processing}>
                {processing ? "Uploading..." : "Upload and process"}
              </Button>
            </DialogFooter>
          </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && closeDocument()}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selected?.file_name}</DialogTitle>
            <DialogDescription>
              Review persisted AI candidates and selectively apply diagram hints to the intended graph.
            </DialogDescription>
          </DialogHeader>

          {selected ? (
            <Form {...notesForm}>
            <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
              <div className="rounded-lg border p-2">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["overview", "Overview"],
                    ["ai-review", "AI Review"],
                    ["diagram-hints", "Diagram Hints"],
                    ["danger-zone", "Danger Zone"],
                  ].map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      variant={detailStep === value ? "default" : "outline"}
                      onClick={() => setDetailStep(value as "overview" | "ai-review" | "diagram-hints" | "danger-zone")}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {detailStep === "overview" ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <div className="mt-2">
                        <Badge variant="outline">{selected.processing_status}</Badge>
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="mt-2 text-sm font-medium">{selected.file_type}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Size</p>
                      <p className="mt-2 text-sm font-medium">{formatBytes(selected.file_size_bytes)}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Updated</p>
                      <p className="mt-2 text-sm font-medium">{formatDate(selected.updated_at)}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                      <div>
                        <p className="text-sm font-medium">Architecture Version</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Required for AI extraction, review persistence, and diagram import.
                        </p>
                      </div>
                      <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a version" />
                        </SelectTrigger>
                        <SelectContent>
                          {versions.map((version) => (
                            <SelectItem key={version.id} value={version.id}>
                              v{version.version_number} · {version.status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {!versions.length ? (
                      <p className="mt-3 text-sm text-destructive">
                        No architecture versions are available for this project yet.
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-medium">Next recommended step</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Continue sequentially: extract candidates, review them, then apply diagram hints.
                        </p>
                      </div>
                      <Button type="button" onClick={() => setDetailStep("ai-review")}>
                        Start AI review
                      </Button>
                    </div>
                  </div>
                </>
              ) : null}

              {detailStep === "ai-review" ? (
              <div className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-medium">AI Candidates</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Extract rule, entity, and relationship candidates from the document metadata.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => extractCandidates(selected)}
                      disabled={!selectedVersionId || actionBusy !== null}
                    >
                      {actionBusy === "extract" ? "Extracting..." : "Extract candidates"}
                    </Button>
                    <Button
                      onClick={() => submitReview(selected)}
                      disabled={!selectedVersionId || !reviewSelectionsCount || actionBusy !== null}
                    >
                      {actionBusy === "review" ? "Saving review..." : "Save review"}
                    </Button>
                  </div>
                </div>

                {reviewSummary ? (
                  <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
                    {reviewSummary}
                  </div>
                ) : null}

                {aiCandidates ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                      <p className="font-medium">{aiCandidates.summary || "No summary returned"}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {aiCandidates.analyzedAt ? <span>Analyzed {formatDate(aiCandidates.analyzedAt)}</span> : null}
                        {aiCandidates.lastReviewedAt ? (
                          <span>Last reviewed {formatDate(aiCandidates.lastReviewedAt)}</span>
                        ) : null}
                        {aiCandidates.lastReviewedBy ? (
                          <span>Reviewer {aiCandidates.lastReviewedBy.slice(0, 8)}</span>
                        ) : null}
                        {aiCandidates.keywords.map((keyword) => (
                          <span key={keyword} className="rounded border px-2 py-0.5">
                            {keyword}
                          </span>
                        ))}
                      </div>
                      {aiCandidates.inputSourceFields.length ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Source fields: {aiCandidates.inputSourceFields.join(", ")}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          Rule candidates ({aiCandidates.ruleCandidates.length})
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAcceptedRules(allIndexes(aiCandidates.ruleCandidates.length));
                              setRejectedRules([]);
                            }}
                          >
                            Accept all
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAcceptedRules([]);
                              setRejectedRules([]);
                            }}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      {aiCandidates.ruleCandidates.length ? (
                        aiCandidates.ruleCandidates.map((candidate, index) => {
                          const isAccepted = acceptedRules.includes(index);
                          const isRejected = rejectedRules.includes(index);
                          return (
                            <div key={`${candidate.rule_text}-${index}`} className="rounded-lg border p-3">
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <p className="text-sm font-medium">{candidate.rule_text}</p>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant="outline">{candidate.rule_type}</Badge>
                                    <Badge variant={candidate.severity === "critical" ? "destructive" : candidate.severity === "major" ? "secondary" : "outline"}>
                                      {candidate.severity}
                                    </Badge>
                                    {candidate.confidence !== null && candidate.confidence !== undefined ? (
                                      <span className="rounded border px-2 py-1 text-xs text-muted-foreground">
                                        Confidence {(candidate.confidence * 100).toFixed(0)}%
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {candidate.source_component || "Any source"} →{" "}
                                    {candidate.target_component || "Any target"}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant={isAccepted ? "secondary" : "outline"}
                                    size="sm"
                                    onClick={() =>
                                      toggleDecision(
                                        index,
                                        "accept",
                                        acceptedRules,
                                        rejectedRules,
                                        setAcceptedRules,
                                        setRejectedRules
                                      )
                                    }
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    variant={isRejected ? "destructive" : "outline"}
                                    size="sm"
                                    onClick={() =>
                                      toggleDecision(
                                        index,
                                        "reject",
                                        acceptedRules,
                                        rejectedRules,
                                        setAcceptedRules,
                                        setRejectedRules
                                      )
                                    }
                                  >
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                          <RiFileList3Line className="size-12 text-muted-foreground" />
                          <div className="space-y-1">
                            <h3 className="text-base font-semibold">No rule candidates</h3>
                            <p className="text-sm text-muted-foreground">
                              Run extraction to persist rule suggestions on this document.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">
                            Entity candidates ({aiCandidates.entityCandidates.length})
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAcceptedEntities([]);
                              setRejectedEntities([]);
                            }}
                          >
                            Clear
                          </Button>
                        </div>
                        {aiCandidates.entityCandidates.length ? (
                          aiCandidates.entityCandidates.map((candidate, index) => {
                            const isAccepted = acceptedEntities.includes(index);
                            const isRejected = rejectedEntities.includes(index);
                            return (
                              <div key={`${candidate.text}-${index}`} className="rounded-lg border p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium">{candidate.text}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {candidate.label}
                                      {candidate.confidence !== null && candidate.confidence !== undefined
                                        ? ` · ${(candidate.confidence * 100).toFixed(0)}% confidence`
                                        : ""}
                                    </p>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant={isAccepted ? "secondary" : "outline"}
                                      size="sm"
                                      onClick={() =>
                                        toggleDecision(
                                          index,
                                          "accept",
                                          acceptedEntities,
                                          rejectedEntities,
                                          setAcceptedEntities,
                                          setRejectedEntities
                                        )
                                      }
                                    >
                                      Accept
                                    </Button>
                                    <Button
                                      variant={isRejected ? "destructive" : "outline"}
                                      size="sm"
                                      onClick={() =>
                                        toggleDecision(
                                          index,
                                          "reject",
                                          acceptedEntities,
                                          rejectedEntities,
                                          setAcceptedEntities,
                                          setRejectedEntities
                                        )
                                      }
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                            <RiFileList3Line className="size-12 text-muted-foreground" />
                            <h3 className="text-base font-semibold">No entity candidates</h3>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">
                            Relationship candidates ({aiCandidates.relationshipCandidates.length})
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAcceptedRelationships([]);
                              setRejectedRelationships([]);
                            }}
                          >
                            Clear
                          </Button>
                        </div>
                        {aiCandidates.relationshipCandidates.length ? (
                          aiCandidates.relationshipCandidates.map((candidate, index) => {
                            const isAccepted = acceptedRelationships.includes(index);
                            const isRejected = rejectedRelationships.includes(index);
                            return (
                              <div key={relationshipKey(candidate)} className="rounded-lg border p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium">
                                      {candidate.source} {candidate.relation} {candidate.target}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {candidate.confidence !== null && candidate.confidence !== undefined
                                        ? `${(candidate.confidence * 100).toFixed(0)}% confidence`
                                        : "No confidence score"}
                                    </p>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant={isAccepted ? "secondary" : "outline"}
                                      size="sm"
                                      onClick={() =>
                                        toggleDecision(
                                          index,
                                          "accept",
                                          acceptedRelationships,
                                          rejectedRelationships,
                                          setAcceptedRelationships,
                                          setRejectedRelationships
                                        )
                                      }
                                    >
                                      Accept
                                    </Button>
                                    <Button
                                      variant={isRejected ? "destructive" : "outline"}
                                      size="sm"
                                      onClick={() =>
                                        toggleDecision(
                                          index,
                                          "reject",
                                          acceptedRelationships,
                                          rejectedRelationships,
                                          setAcceptedRelationships,
                                          setRejectedRelationships
                                        )
                                      }
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                            <RiFileList3Line className="size-12 text-muted-foreground" />
                            <h3 className="text-base font-semibold">No relationship candidates</h3>
                          </div>
                        )}
                      </div>
                    </div>

                    <FormField
                      control={notesForm.control}
                      name="reviewNote"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Review note</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Capture why these candidates were accepted or rejected."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {aiReviews.length ? (
                      <div className="space-y-2 rounded-lg border p-3">
                        <p className="text-sm font-medium">Recent review history</p>
                        <div className="space-y-2">
                          {aiReviews.slice(-3).reverse().map((review) => (
                            <div key={`${review.reviewedAt}-${review.reviewedBy}`} className="rounded border p-2 text-xs">
                              <div className="flex flex-wrap gap-3 text-muted-foreground">
                                <span>{formatDate(review.reviewedAt)}</span>
                                <span>{review.reviewedBy.slice(0, 8)}</span>
                                <span>Rules +{review.acceptedRuleIndexes.length} / -{review.rejectedRuleIndexes.length}</span>
                                <span>Entities +{review.acceptedEntityIndexes.length} / -{review.rejectedEntityIndexes.length}</span>
                                <span>
                                  Relationships +{review.acceptedRelationshipIndexes.length} / -{review.rejectedRelationshipIndexes.length}
                                </span>
                              </div>
                              {review.note ? <p className="mt-1 text-muted-foreground">{review.note}</p> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                      <RiFileList3Line className="size-12 text-muted-foreground" />
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold">No persisted AI candidates</h3>
                        <p className="text-sm text-muted-foreground">
                          Run extraction to store candidates on this document before reviewing them.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              ) : null}

              {detailStep === "diagram-hints" ? (
              <div className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-medium">Diagram Hints</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Apply selected diagram components and relationships to the intended architecture graph.
                    </p>
                  </div>
                  <Button
                    onClick={() => applyDiagramHints(selected)}
                    disabled={
                      !selectedVersionId ||
                      (!selectedHintComponents.length && !selectedHintRelationships.length) ||
                      actionBusy !== null
                    }
                  >
                    {actionBusy === "diagram" ? "Applying..." : "Apply selected hints"}
                  </Button>
                </div>

                {diagramSummary ? (
                  <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
                    {diagramSummary}
                  </div>
                ) : null}

                {diagramHints.components.length || diagramHints.relationships.length ? (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{diagramHints.components.length} components</span>
                      <span>{diagramHints.relationships.length} relationships</span>
                      {diagramHints.appliedAt ? (
                        <span>
                          Last applied {formatDate(diagramHints.appliedAt)} · {diagramHints.createdComponentsCount} components /{" "}
                          {diagramHints.createdRelationshipsCount} relationships
                        </span>
                      ) : null}
                      {diagramHints.reviewCount ? <span>{diagramHints.reviewCount} recorded review entries</span> : null}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Components</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedHintComponents(diagramHints.components)}
                          >
                            Select all
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {diagramHints.components.map((component) => (
                            <label key={component} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
                              <Checkbox
                                checked={selectedHintComponents.includes(component)}
                                onCheckedChange={(checked) => toggleHintComponent(component, Boolean(checked))}
                              />
                              <span>{component}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Relationships</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setSelectedHintRelationships(
                                diagramHints.relationships.map((relationship) => relationshipKey(relationship))
                              )
                            }
                          >
                            Select all
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {diagramHints.relationships.map((relationship) => {
                            const key = relationshipKey(relationship);
                            return (
                              <label key={key} className="flex items-start gap-2 rounded border px-3 py-2 text-sm">
                                <Checkbox
                                  checked={selectedHintRelationships.includes(key)}
                                  onCheckedChange={(checked) =>
                                    toggleHintRelationship(key, Boolean(checked))
                                  }
                                />
                                <div>
                                  <p className="font-medium">
                                    {relationship.source} {relationship.relation} {relationship.target}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <FormField
                      control={notesForm.control}
                      name="diagramNote"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Diagram review note</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Capture which hints were intentionally applied or skipped."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                      <RiFileList3Line className="size-12 text-muted-foreground" />
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold">No diagram hints available</h3>
                        <p className="text-sm text-muted-foreground">
                          This document does not currently contain diagram components or relationships to apply.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              ) : null}

              {detailStep === "danger-zone" ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">Danger Zone</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reprocessing can overwrite extraction state, and deletion permanently removes this document.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => runProcess(selected)}
                    disabled={actionBusy !== null}
                  >
                    {actionBusy === "process" ? "Processing..." : "Reprocess document"}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteTarget(selected)}
                    disabled={actionBusy !== null}
                  >
                    {actionBusy === "delete" ? "Deleting..." : "Delete document"}
                  </Button>
                </div>
              </div>
              ) : null}
            </div>
            </Form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the document and its persisted extraction, review, and hint metadata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actionBusy !== null}
              onClick={async () => {
                if (!deleteTarget) return;
                await remove(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              {actionBusy === "delete" ? "Deleting..." : "Delete document"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
