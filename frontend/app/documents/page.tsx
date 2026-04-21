"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Upload, Filter } from 'lucide-react';

import GovernanceActivityRow, { summarizeAuditEvent } from '../../components/governance-activity-row';
import AcceptanceRateTrendChip from '../../components/acceptance-rate-trend-chip';
import ReviewerIdentityChips from '../../components/reviewer-identity-chips';
import RouteGuard from '../../components/route-guard';
import {
  AuditEvent,
  AICandidateReviewTrendOut,
  applyDiagramHintsFromDocument,
  ArchitectureVersionOut,
  DeadLetterItemOut,
  deleteDocument,
  DocumentJobStatusOut,
  DocumentOut,
  DocumentFileType,
  extractRulesFromDocument,
  createProject,
  getAICandidateReviewTrend,
  getArchitectureVersions,
  getDeadLetterDocuments,
  getDocumentJobStatus,
  getProjects,
  listDocuments,
  processDocument,
  ProjectListItem,
  replayDeadLetterDocument,
  replayRetryableDeadLetterBatch,
  reviewDocumentAICandidates,
  uploadDocument,
} from '../../lib/api';
import {
  formatExtractorDiagnosticsTimestamp,
  summarizeExtractorDiagnosticsHistoryEntry,
} from '../../lib/extractor-diagnostics';
import useAuditEvents from '../../lib/use-audit-events';
import useGovernanceContext from '../../lib/use-governance-context';

type DocumentFilterStatus = 'all' | 'pending' | 'processing' | 'completed' | 'failed';

type DiagramHintRelationship = {
  source: string;
  target: string;
  relation: string;
};

type DocumentLoadOptions = {
  fileType?: string;
  status?: string;
  search?: string;
  refreshDeadLetter?: boolean;
  refreshAudit?: boolean;
  refreshJobStatuses?: boolean;
};

type AICandidateRuleView = {
  rule_text: string;
  rule_type: string;
  severity: string;
  source_component: string | null;
  target_component: string | null;
  confidence: number | null;
};

type AICandidateEntityView = {
  text: string;
  label: string;
  confidence: number | null;
};

type AICandidateRelationshipView = {
  source: string;
  target: string;
  relation: string;
  confidence: number | null;
};

type AICandidateReviewData = {
  architectureVersionId: string | null;
  rules: AICandidateRuleView[];
  entities: AICandidateEntityView[];
  relationships: AICandidateRelationshipView[];
  reviewHistory: Array<Record<string, unknown>>;
};

export default function DocumentsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [documents, setDocuments] = useState<DocumentOut[]>([]);
  const [architectureVersions, setArchitectureVersions] = useState<ArchitectureVersionOut[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [autoCreateAiRules, setAutoCreateAiRules] = useState(true);
  const [jobStatusByDocumentId, setJobStatusByDocumentId] = useState<Record<string, DocumentJobStatusOut>>({});
  const [deadLetterItems, setDeadLetterItems] = useState<DeadLetterItemOut[]>([]);
  const { auditEvents, reloadAuditEvents } = useAuditEvents(1, 30, { enabled: !!selectedProjectId });

  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingProcessId, setPendingProcessId] = useState<string | null>(null);
  const [pendingReplayId, setPendingReplayId] = useState<string | null>(null);
  const [pendingAiExtractId, setPendingAiExtractId] = useState<string | null>(null);
  const [pendingAiReviewId, setPendingAiReviewId] = useState<string | null>(null);
  const [aiReviewDocId, setAiReviewDocId] = useState<string | null>(null);
  const [aiReviewNote, setAiReviewNote] = useState('');
  const [ruleDecisions, setRuleDecisions] = useState<Record<number, 'accept' | 'reject'>>({});
  const [entityDecisions, setEntityDecisions] = useState<Record<number, 'accept' | 'reject'>>({});
  const [relationshipDecisions, setRelationshipDecisions] = useState<Record<number, 'accept' | 'reject'>>({});
  const [pendingDiagramApplyId, setPendingDiagramApplyId] = useState<string | null>(null);
  const [diagramReviewDocId, setDiagramReviewDocId] = useState<string | null>(null);
  const [selectedDiagramComponents, setSelectedDiagramComponents] = useState<string[]>([]);
  const [selectedDiagramRelationshipKeys, setSelectedDiagramRelationshipKeys] = useState<string[]>([]);
  const [diagramReviewNote, setDiagramReviewNote] = useState('');
  const [aiReviewTrend, setAiReviewTrend] = useState<AICandidateReviewTrendOut | null>(null);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectRepositoryUrl, setNewProjectRepositoryUrl] = useState('');
  const [newProjectDefaultBranch, setNewProjectDefaultBranch] = useState('main');
  const [newProjectLanguage, setNewProjectLanguage] = useState('python');
  const { sessionUser, organizationMembersById } = useGovernanceContext();
  const [isBulkReplaying, setIsBulkReplaying] = useState(false);

  const [fileType, setFileType] = useState<DocumentFileType>('text');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [filterFileType, setFilterFileType] = useState<'all' | DocumentFileType>('all');
  const [filterStatus, setFilterStatus] = useState<DocumentFilterStatus>('all');
  const [searchText, setSearchText] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pollingIntervalMs, setPollingIntervalMs] = useState<number>(2000);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const loadDocumentsInFlightRef = useRef(false);
  const queuedLoadRef = useRef<{ projectId: string; options?: DocumentLoadOptions } | null>(null);

  const searchQuery = searchText.trim();

  function currentQueryOptions() {
    return {
      fileType: filterFileType === 'all' ? undefined : filterFileType,
      status: filterStatus === 'all' ? undefined : filterStatus,
      search: searchQuery || undefined,
    };
  }

  async function loadAICandidateReviewAnalytics(projectId: string) {
    try {
      const analytics = await getAICandidateReviewTrend(14, projectId);
      setAiReviewTrend(analytics);
    } catch {
      setAiReviewTrend(null);
    }
  }

  function isDocumentAuditEvent(event: AuditEvent): boolean {
    const action = event.action.toLowerCase();
    return event.entity_type === 'document' || action.startsWith('document.') || action.includes('document');
  }

  async function loadProjects() {
    setIsLoadingProjects(true);
    setErrorMessage(null);

    try {
      const activeProjects = (await getProjects()).filter((project) => project.is_active);
      setProjects(activeProjects);

      if (activeProjects.length === 0) {
        setDocuments([]);
        setSelectedProjectId('');
        return;
      }

      const nextProjectId = selectedProjectId || activeProjects[0].id;
      setSelectedProjectId(nextProjectId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load projects.');
      setProjects([]);
      setDocuments([]);
    } finally {
      setIsLoadingProjects(false);
    }
  }

  function openCreateProjectModal() {
    setIsCreateProjectOpen(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function closeCreateProjectModal() {
    setIsCreateProjectOpen(false);
    setNewProjectName('');
    setNewProjectDescription('');
    setNewProjectRepositoryUrl('');
    setNewProjectDefaultBranch('main');
    setNewProjectLanguage('python');
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = newProjectName.trim();
    if (!trimmedName) {
      setErrorMessage('Project name is required.');
      return;
    }

    setIsCreatingProject(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const createdProject = await createProject({
        name: trimmedName,
        description: newProjectDescription.trim() || null,
        repository_url: newProjectRepositoryUrl.trim() || null,
        default_branch: newProjectDefaultBranch.trim() || 'main',
        language: newProjectLanguage.trim() || 'python',
      });
      setSuccessMessage(`Project "${createdProject.name}" created successfully.`);
      closeCreateProjectModal();
      await loadProjects();
      setSelectedProjectId(createdProject.id);
      await loadAICandidateReviewAnalytics(createdProject.id);
      await loadDocuments(createdProject.id, currentQueryOptions());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create project.');
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function loadDocuments(projectId: string, options?: DocumentLoadOptions) {
    if (loadDocumentsInFlightRef.current) {
      queuedLoadRef.current = { projectId, options };
      return;
    }

    loadDocumentsInFlightRef.current = true;
    setIsLoadingDocuments(true);
    setErrorMessage(null);

    try {
      const allDocs = await listDocuments(
        projectId,
        options?.fileType,
        options?.status,
        options?.search,
      );
      setDocuments(allDocs);
      setLastRefreshedAt(new Date());
      const refreshJobStatuses = options?.refreshJobStatuses ?? true;
      const refreshDeadLetter = options?.refreshDeadLetter ?? true;
      const refreshAudit = options?.refreshAudit ?? true;

      const followUpTasks: Array<Promise<void>> = [];
      if (refreshJobStatuses) {
        followUpTasks.push(loadJobStatuses(projectId, allDocs));
      }
      if (refreshDeadLetter) {
        followUpTasks.push(loadDeadLetter(projectId));
      }
      if (refreshAudit) {
        followUpTasks.push(reloadAuditEvents());
      }
      await Promise.all(followUpTasks);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load documents.');
      setDocuments([]);
      setJobStatusByDocumentId({});
      setDeadLetterItems([]);
    } finally {
      setIsLoadingDocuments(false);
      loadDocumentsInFlightRef.current = false;
      if (queuedLoadRef.current) {
        const queued = queuedLoadRef.current;
        queuedLoadRef.current = null;
        void loadDocuments(queued.projectId, queued.options);
      }
    }
  }

  async function loadArchitectureVersions(projectId: string) {
    try {
      const versions = await getArchitectureVersions(projectId);
      setArchitectureVersions(versions);
      if (versions.length === 0) {
        setSelectedVersionId('');
        return;
      }

      if (selectedVersionId && versions.some((version) => version.id === selectedVersionId)) {
        return;
      }

      const preferred = versions.find((version) => version.status === 'active') ?? versions[0];
      setSelectedVersionId(preferred.id);
    } catch {
      setArchitectureVersions([]);
      setSelectedVersionId('');
    }
  }

  async function loadDeadLetter(projectId: string) {
    try {
      const payload = await getDeadLetterDocuments(projectId, true);
      setDeadLetterItems(payload.items);
    } catch {
      setDeadLetterItems([]);
    }
  }

  async function loadJobStatuses(projectId: string, docs: DocumentOut[]) {
    const candidates = docs.filter((doc) => doc.processing_status !== 'pending');
    if (candidates.length === 0) {
      setJobStatusByDocumentId({});
      return;
    }

    const results = await Promise.all(
      candidates.map(async (doc) => {
        try {
          const jobStatus = await getDocumentJobStatus(projectId, doc.id);
          return [doc.id, jobStatus] as const;
        } catch {
          return null;
        }
      }),
    );

    const nextMap: Record<string, DocumentJobStatusOut> = {};
    for (const entry of results) {
      if (!entry) {
        continue;
      }
      nextMap[entry[0]] = entry[1];
    }
    setJobStatusByDocumentId(nextMap);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedProjectId) {
      setErrorMessage('Select a project before uploading.');
      return;
    }

    if (!selectedFile) {
      setErrorMessage('Select a file before uploading.');
      return;
    }

    setIsUploading(true);

    try {
      await uploadDocument(selectedProjectId, selectedFile, fileType, description);
      setSuccessMessage('Document uploaded successfully.');
      setSelectedFile(null);
      setFileType('text');
      setDescription('');
      await loadDocuments(selectedProjectId, currentQueryOptions());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to upload document.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(docId: string) {
    if (!selectedProjectId) {
      setErrorMessage('Project not selected.');
      return;
    }

    const confirmed = window.confirm('Delete this document? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    setPendingDeleteId(docId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await deleteDocument(selectedProjectId, docId);
      setSuccessMessage('Document deleted successfully.');
      await loadDocuments(selectedProjectId, currentQueryOptions());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete document.');
    } finally {
      setPendingDeleteId(null);
    }
  }

  async function handleProcess(doc: DocumentOut) {
    if (!selectedProjectId) {
      setErrorMessage('Project not selected.');
      return;
    }

    const shouldForce = doc.processing_status === 'completed' || doc.processing_status === 'failed';
    setPendingProcessId(doc.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await processDocument(selectedProjectId, doc.id, 'background', shouldForce);
      setSuccessMessage(
        shouldForce
          ? 'Document reprocess queued. Tracking job state below.'
          : 'Document processing queued. Tracking job state below.',
      );
      await loadDocuments(selectedProjectId, currentQueryOptions());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to process document.');
    } finally {
      setPendingProcessId(null);
    }
  }

  async function handleReplayDeadLetter(docId: string) {
    if (!selectedProjectId) {
      setErrorMessage('Project not selected.');
      return;
    }

    setPendingReplayId(docId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const replay = await replayDeadLetterDocument(selectedProjectId, docId, false);
      setSuccessMessage(`Replay queued (${replay.queue_backend}).`);
      await loadDocuments(selectedProjectId, currentQueryOptions());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to replay dead-letter document.');
    } finally {
      setPendingReplayId(null);
    }
  }

  async function handleBulkReplay() {
    if (!selectedProjectId) {
      setErrorMessage('Project not selected.');
      return;
    }

    if (deadLetterItems.length === 0) {
      setErrorMessage('No retryable failed documents available.');
      return;
    }

    setIsBulkReplaying(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await replayRetryableDeadLetterBatch(selectedProjectId, 20, false);
      setSuccessMessage(`Bulk replay queued for ${result.queued_count} document(s).`);
      await loadDocuments(selectedProjectId, currentQueryOptions());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to run bulk replay.');
    } finally {
      setIsBulkReplaying(false);
    }
  }

  async function handleAiExtract(doc: DocumentOut) {
    if (!selectedProjectId) {
      setErrorMessage('Project not selected.');
      return;
    }
    if (!selectedVersionId) {
      setErrorMessage('Select an architecture version before running AI extraction.');
      return;
    }

    setPendingAiExtractId(doc.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await extractRulesFromDocument(selectedProjectId, doc.id, {
        architecture_version_id: selectedVersionId,
        auto_create_rules: autoCreateAiRules,
        persist_candidates: true,
      });

      const createdCount = result.created_rule_ids.length;
      setSuccessMessage(
        createdCount > 0
          ? `AI extraction completed and created ${createdCount} rule(s).`
          : `AI extraction completed with ${result.extracted_rules.length} rule candidate(s).`,
      );
      await loadDocuments(selectedProjectId, currentQueryOptions());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI extraction failed.');
    } finally {
      setPendingAiExtractId(null);
    }
  }

  function readDiagramHintData(doc: DocumentOut): { components: string[]; relationships: DiagramHintRelationship[] } {
    const extractedData = doc.extracted_data as Record<string, unknown> | null | undefined;
    const uploadIntake = extractedData?.upload_intake as Record<string, unknown> | undefined;
    const diagramHints = uploadIntake?.diagram_hints as Record<string, unknown> | undefined;
    const rawComponents = diagramHints?.components;
    const rawRelationships = diagramHints?.relationships;

    const components = Array.isArray(rawComponents)
      ? rawComponents
          .map((component) => String(component).trim())
          .filter((component) => component.length > 0)
      : [];

    const relationships = Array.isArray(rawRelationships)
      ? rawRelationships
          .map((rawRelationship) => {
            if (!rawRelationship || typeof rawRelationship !== 'object') {
              return null;
            }
            const payload = rawRelationship as Record<string, unknown>;
            const source = String(payload.source ?? '').trim();
            const target = String(payload.target ?? '').trim();
            const relation = String(payload.relation ?? 'depends_on').trim() || 'depends_on';
            if (!source || !target) {
              return null;
            }
            return { source, target, relation };
          })
          .filter((relationship): relationship is DiagramHintRelationship => relationship !== null)
      : [];

    return { components, relationships };
  }

  function readAICandidateData(doc: DocumentOut): AICandidateReviewData {
    const extractedData = doc.extracted_data as Record<string, unknown> | null | undefined;
    const aiCandidates = extractedData?.ai_candidates as Record<string, unknown> | undefined;

    const rawRules = Array.isArray(aiCandidates?.rule_candidates) ? aiCandidates?.rule_candidates : [];
    const rules = rawRules
      .map((candidate) => {
        if (!candidate || typeof candidate !== 'object') {
          return null;
        }
        const payload = candidate as Record<string, unknown>;
        const ruleText = String(payload.rule_text ?? '').trim();
        if (!ruleText) {
          return null;
        }
        return {
          rule_text: ruleText,
          rule_type: String(payload.rule_type ?? 'custom').trim() || 'custom',
          severity: String(payload.severity ?? 'major').trim() || 'major',
          source_component: typeof payload.source_component === 'string' ? payload.source_component : null,
          target_component: typeof payload.target_component === 'string' ? payload.target_component : null,
          confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
        } satisfies AICandidateRuleView;
      })
      .filter((candidate): candidate is AICandidateRuleView => candidate !== null);

    const rawEntities = Array.isArray(aiCandidates?.entity_candidates) ? aiCandidates?.entity_candidates : [];
    const entities = rawEntities
      .map((candidate) => {
        if (!candidate || typeof candidate !== 'object') {
          return null;
        }
        const payload = candidate as Record<string, unknown>;
        const text = String(payload.text ?? '').trim();
        if (!text) {
          return null;
        }
        return {
          text,
          label: String(payload.label ?? 'entity').trim() || 'entity',
          confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
        } satisfies AICandidateEntityView;
      })
      .filter((candidate): candidate is AICandidateEntityView => candidate !== null);

    const rawRelationships = Array.isArray(aiCandidates?.relationship_candidates) ? aiCandidates?.relationship_candidates : [];
    const relationships = rawRelationships
      .map((candidate) => {
        if (!candidate || typeof candidate !== 'object') {
          return null;
        }
        const payload = candidate as Record<string, unknown>;
        const source = String(payload.source ?? '').trim();
        const target = String(payload.target ?? '').trim();
        const relation = String(payload.relation ?? '').trim();
        if (!source || !target || !relation) {
          return null;
        }
        return {
          source,
          target,
          relation,
          confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
        } satisfies AICandidateRelationshipView;
      })
      .filter((candidate): candidate is AICandidateRelationshipView => candidate !== null);

    const reviewHistory = Array.isArray(extractedData?.ai_candidates_reviews)
      ? extractedData.ai_candidates_reviews.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
      : [];

    return {
      architectureVersionId: typeof aiCandidates?.architecture_version_id === 'string' ? aiCandidates.architecture_version_id : null,
      rules,
      entities,
      relationships,
      reviewHistory,
    };
  }

  function hasAICandidates(doc: DocumentOut): boolean {
    const aiData = readAICandidateData(doc);
    return aiData.rules.length > 0 || aiData.entities.length > 0 || aiData.relationships.length > 0;
  }

  function openAiReview(doc: DocumentOut) {
    if (!hasAICandidates(doc)) {
      setErrorMessage('Run AI Extract first to generate candidates for review.');
      return;
    }

    setAiReviewDocId(doc.id);
    setAiReviewNote('');
    setRuleDecisions({});
    setEntityDecisions({});
    setRelationshipDecisions({});
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function closeAiReview() {
    setAiReviewDocId(null);
    setAiReviewNote('');
    setRuleDecisions({});
    setEntityDecisions({});
    setRelationshipDecisions({});
  }

  function setRuleDecision(index: number, decision: 'accept' | 'reject' | null) {
    setRuleDecisions((prev) => {
      const next = { ...prev };
      if (!decision) {
        delete next[index];
      } else {
        next[index] = decision;
      }
      return next;
    });
  }

  function setEntityDecision(index: number, decision: 'accept' | 'reject' | null) {
    setEntityDecisions((prev) => {
      const next = { ...prev };
      if (!decision) {
        delete next[index];
      } else {
        next[index] = decision;
      }
      return next;
    });
  }

  function setRelationshipDecision(index: number, decision: 'accept' | 'reject' | null) {
    setRelationshipDecisions((prev) => {
      const next = { ...prev };
      if (!decision) {
        delete next[index];
      } else {
        next[index] = decision;
      }
      return next;
    });
  }

  async function handleSubmitAiReview() {
    if (!aiReviewDocId) {
      return;
    }
    if (!selectedProjectId) {
      setErrorMessage('Project not selected.');
      return;
    }

    const reviewDoc = documents.find((doc) => doc.id === aiReviewDocId);
    if (!reviewDoc) {
      setErrorMessage('Document no longer available. Refresh and try again.');
      closeAiReview();
      return;
    }

    const aiData = readAICandidateData(reviewDoc);
    const architectureVersionId = selectedVersionId || aiData.architectureVersionId;
    if (!architectureVersionId) {
      setErrorMessage('Select an architecture version before submitting AI review decisions.');
      return;
    }

    const acceptedRuleIndexes = Object.entries(ruleDecisions)
      .filter(([, decision]) => decision === 'accept')
      .map(([index]) => Number(index))
      .sort((left, right) => left - right);
    const rejectedRuleIndexes = Object.entries(ruleDecisions)
      .filter(([, decision]) => decision === 'reject')
      .map(([index]) => Number(index))
      .sort((left, right) => left - right);

    const acceptedEntityIndexes = Object.entries(entityDecisions)
      .filter(([, decision]) => decision === 'accept')
      .map(([index]) => Number(index))
      .sort((left, right) => left - right);
    const rejectedEntityIndexes = Object.entries(entityDecisions)
      .filter(([, decision]) => decision === 'reject')
      .map(([index]) => Number(index))
      .sort((left, right) => left - right);

    const acceptedRelationshipIndexes = Object.entries(relationshipDecisions)
      .filter(([, decision]) => decision === 'accept')
      .map(([index]) => Number(index))
      .sort((left, right) => left - right);
    const rejectedRelationshipIndexes = Object.entries(relationshipDecisions)
      .filter(([, decision]) => decision === 'reject')
      .map(([index]) => Number(index))
      .sort((left, right) => left - right);

    const totalSelections = acceptedRuleIndexes.length
      + rejectedRuleIndexes.length
      + acceptedEntityIndexes.length
      + rejectedEntityIndexes.length
      + acceptedRelationshipIndexes.length
      + rejectedRelationshipIndexes.length;
    if (totalSelections === 0) {
      setErrorMessage('Select at least one accept or reject decision before submitting review.');
      return;
    }

    setPendingAiReviewId(reviewDoc.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await reviewDocumentAICandidates(selectedProjectId, reviewDoc.id, {
        architecture_version_id: architectureVersionId,
        accepted_rule_indexes: acceptedRuleIndexes,
        rejected_rule_indexes: rejectedRuleIndexes,
        accepted_entity_indexes: acceptedEntityIndexes,
        rejected_entity_indexes: rejectedEntityIndexes,
        accepted_relationship_indexes: acceptedRelationshipIndexes,
        rejected_relationship_indexes: rejectedRelationshipIndexes,
        review_note: aiReviewNote.trim() || undefined,
      });
      setSuccessMessage(
        `AI review saved: +${result.accepted_rules_count} rule(s), +${result.accepted_entities_count} entit${result.accepted_entities_count === 1 ? 'y' : 'ies'}, +${result.accepted_relationships_count} relationship(s).`,
      );
      closeAiReview();
      await loadAICandidateReviewAnalytics(selectedProjectId);
      await loadDocuments(selectedProjectId, currentQueryOptions());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit AI review.');
    } finally {
      setPendingAiReviewId(null);
    }
  }

  function diagramRelationshipKey(relationship: DiagramHintRelationship): string {
    return `${relationship.source}::${relationship.relation}::${relationship.target}`;
  }

  function hasDiagramHints(doc: DocumentOut): boolean {
    const hintData = readDiagramHintData(doc);
    return hintData.components.length > 0;
  }

  function openDiagramReview(doc: DocumentOut) {
    const hintData = readDiagramHintData(doc);
    if (hintData.components.length === 0) {
      setErrorMessage('This document does not contain diagram hints yet.');
      return;
    }

    setDiagramReviewDocId(doc.id);
    setSelectedDiagramComponents(hintData.components);
    setSelectedDiagramRelationshipKeys(hintData.relationships.map((relationship) => diagramRelationshipKey(relationship)));
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function closeDiagramReview() {
    setDiagramReviewDocId(null);
    setSelectedDiagramComponents([]);
    setSelectedDiagramRelationshipKeys([]);
    setDiagramReviewNote('');
  }

  async function handleApplyDiagramHintsSelection() {
    if (!diagramReviewDocId) {
      return;
    }
    if (!selectedProjectId) {
      setErrorMessage('Project not selected.');
      return;
    }
    if (!selectedVersionId) {
      setErrorMessage('Select an architecture version before applying diagram hints.');
      return;
    }

    const reviewDoc = documents.find((doc) => doc.id === diagramReviewDocId);
    if (!reviewDoc) {
      setErrorMessage('Document no longer available. Refresh and try again.');
      closeDiagramReview();
      return;
    }

    const hintData = readDiagramHintData(reviewDoc);
    const selectedRelationships = hintData.relationships.filter((relationship) =>
      selectedDiagramRelationshipKeys.includes(diagramRelationshipKey(relationship)),
    );

    if (selectedDiagramComponents.length === 0 && selectedRelationships.length === 0) {
      setErrorMessage('Select at least one component or relationship before applying hints.');
      return;
    }

    setPendingDiagramApplyId(reviewDoc.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await applyDiagramHintsFromDocument(selectedProjectId, reviewDoc.id, {
        architecture_version_id: selectedVersionId,
        persist_applied_metadata: true,
        review_note: diagramReviewNote.trim() || undefined,
        selected_components: selectedDiagramComponents,
        selected_relationships: selectedRelationships,
      });

      setSuccessMessage(
        `Applied diagram hints: ${result.created_components_count} component(s), ${result.created_relationships_count} relationship(s), ${result.skipped_relationships_count} skipped.`,
      );
      closeDiagramReview();
      await loadDocuments(selectedProjectId, currentQueryOptions());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to apply diagram hints.');
    } finally {
      setPendingDiagramApplyId(null);
    }
  }

  function toggleDiagramComponentSelection(component: string) {
    setSelectedDiagramComponents((prev) =>
      prev.includes(component) ? prev.filter((value) => value !== component) : [...prev, component],
    );
  }

  function toggleDiagramRelationshipSelection(relationship: DiagramHintRelationship) {
    const key = diagramRelationshipKey(relationship);
    setSelectedDiagramRelationshipKeys((prev) =>
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key],
    );
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }

  useEffect(() => {
    void loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      void loadAICandidateReviewAnalytics(selectedProjectId);
      return;
    }
    setAiReviewTrend(null);
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      const timeout = window.setTimeout(() => {
        void Promise.all([
          loadDocuments(selectedProjectId, currentQueryOptions()),
          loadArchitectureVersions(selectedProjectId),
        ]);
      }, 250);

      return () => window.clearTimeout(timeout);
    }
  }, [selectedProjectId, filterFileType, filterStatus, searchQuery]);

  const hasProcessingDocuments = useMemo(
    () => documents.some((doc) => doc.processing_status === 'processing'),
    [documents],
  );

  const hasActiveJobs = useMemo(
    () => Object.values(jobStatusByDocumentId).some((jobStatus) => {
      const runtime = (jobStatus.runtime_state ?? '').toUpperCase();
      return runtime === 'PENDING' || runtime === 'STARTED' || runtime === 'RETRY' || jobStatus.job.status === 'queued';
    }),
    [jobStatusByDocumentId],
  );

  const isLivePolling = !!selectedProjectId && pollingIntervalMs > 0 && (hasProcessingDocuments || hasActiveJobs);

  useEffect(() => {
    if (!isLivePolling || !selectedProjectId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadDocuments(selectedProjectId, {
        ...currentQueryOptions(),
        refreshDeadLetter: false,
        refreshAudit: false,
      });
    }, pollingIntervalMs);

    return () => window.clearTimeout(timeout);
  }, [
    isLivePolling,
    selectedProjectId,
    filterFileType,
    filterStatus,
    searchQuery,
    pollingIntervalMs,
    hasProcessingDocuments,
    hasActiveJobs,
  ]);

  async function handleManualRefresh() {
    if (!selectedProjectId) {
      setErrorMessage('Select a project before refreshing.');
      return;
    }

    setIsManualRefreshing(true);
    setErrorMessage(null);
    try {
      await loadDocuments(selectedProjectId, currentQueryOptions());
      await loadAICandidateReviewAnalytics(selectedProjectId);
    } catch {
      // loadDocuments handles user-facing error state.
    } finally {
      setIsManualRefreshing(false);
    }
  }

  function renderJobState(doc: DocumentOut): string {
    const jobStatus = jobStatusByDocumentId[doc.id];
    if (!jobStatus) {
      return doc.processing_status === 'pending' ? 'Not queued' : 'No job metadata';
    }

    const runtime = jobStatus.runtime_state ? ` (${jobStatus.runtime_state})` : '';
    return `${jobStatus.job.status}${runtime}`;
  }

  function renderRetryHint(doc: DocumentOut): string | null {
    const jobStatus = jobStatusByDocumentId[doc.id];
    if (!jobStatus) {
      return null;
    }

    const runtime = (jobStatus.runtime_state ?? '').toUpperCase();
    if (runtime === 'FAILURE' || jobStatus.job.status === 'failed') {
      return 'Retry hint: use Reprocess to enqueue a new extraction job.';
    }

    if (jobStatus.job.queue_backend === 'fastapi-background' && jobStatus.job.status === 'queued') {
      return 'Fallback mode active: start Celery worker for queue-backed retries.';
    }

    return null;
  }

  function renderDiagnostics(doc: DocumentOut): string | null {
    const jobStatus = jobStatusByDocumentId[doc.id];
    if (!jobStatus) {
      return null;
    }

    const diagnostics = jobStatus.extractor_diagnostics;
    const details: string[] = [];
    if (diagnostics.request_id) {
      details.push(`req:${diagnostics.request_id.slice(0, 8)}`);
    }
    if (diagnostics.key_slot) {
      details.push(`key:${diagnostics.key_slot}`);
    }
    if (diagnostics.provider_attempts !== null && diagnostics.provider_attempts !== undefined) {
      details.push(`attempts:${diagnostics.provider_attempts}`);
    }
    if (diagnostics.error_code) {
      details.push(`error:${diagnostics.error_code}`);
    }

    if (details.length === 0) {
      return null;
    }
    return details.join(' • ');
  }

  function renderDiagnosticsHistoryLines(doc: DocumentOut): string[] {
    const jobStatus = jobStatusByDocumentId[doc.id];
    if (!jobStatus || jobStatus.extractor_diagnostics_history.length === 0) {
      return [];
    }

    return jobStatus.extractor_diagnostics_history
      .slice(-2)
      .reverse()
      .map((entry) => `${formatExtractorDiagnosticsTimestamp(entry.timestamp)} • ${summarizeExtractorDiagnosticsHistoryEntry(entry)}`);
  }

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const diagramReviewDoc = diagramReviewDocId
    ? documents.find((doc) => doc.id === diagramReviewDocId) ?? null
    : null;
  const aiReviewDoc = aiReviewDocId
    ? documents.find((doc) => doc.id === aiReviewDocId) ?? null
    : null;
  const diagramReviewHintData = diagramReviewDoc
    ? readDiagramHintData(diagramReviewDoc)
    : { components: [], relationships: [] as DiagramHintRelationship[] };
  const aiReviewData = aiReviewDoc
    ? readAICandidateData(aiReviewDoc)
    : { architectureVersionId: null, rules: [], entities: [], relationships: [], reviewHistory: [] as Array<Record<string, unknown>> };
  const documentActivityFeed = useMemo(() => {
    const documentIdSet = new Set(documents.map((doc) => doc.id));
    return auditEvents
      .filter(isDocumentAuditEvent)
      .filter((event) => !event.entity_id || documentIdSet.has(event.entity_id))
      .slice(0, 8);
  }, [auditEvents, documents]);
  const diagramReviewHistory = (() => {
    if (!diagramReviewDoc) {
      return [] as Array<Record<string, unknown>>;
    }
    const extractedData = diagramReviewDoc.extracted_data as Record<string, unknown> | null | undefined;
    const uploadIntake = extractedData?.upload_intake as Record<string, unknown> | undefined;
    const history = uploadIntake?.diagram_hint_reviews;
    return Array.isArray(history)
      ? history.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
      : [];
  })();

  return (
    <RouteGuard>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Document Management</h1>
            <p className="text-gray-600 mt-1">Upload and manage architecture documents and diagrams</p>
          </div>

          {errorMessage && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
              {successMessage}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="mb-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Project
                  </label>
                  {selectedProjectId ? (
                    <AcceptanceRateTrendChip
                      acceptanceRatePercent={aiReviewTrend?.acceptance_rate_percent ?? null}
                      reviewCount={aiReviewTrend?.total_reviews ?? 0}
                      points={aiReviewTrend?.points ?? []}
                      tone="light"
                      compact
                      emptyLabel={aiReviewTrend ? 'AI review trend ready' : 'Loading trend'}
                      className="max-w-full"
                    />
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={openCreateProjectModal}
                  className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Create Project
                </button>
              </div>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={isLoadingProjects || projects.length === 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="">
                  {isLoadingProjects ? 'Loading projects...' : 'Select a project'}
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    File Type
                  </label>
                  <select
                    value={fileType}
                    onChange={(e) => setFileType(e.target.value as DocumentFileType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="text">Text Document</option>
                    <option value="diagram">Diagram</option>
                    <option value="pdf">PDF</option>
                    <option value="markdown">Markdown</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    File
                  </label>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    disabled={isUploading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description for this document..."
                  disabled={isUploading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 h-20 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isUploading || !selectedProjectId || !selectedFile}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <Upload size={18} />
                {isUploading ? 'Uploading...' : 'Upload Document'}
              </button>
            </form>
          </div>

          {isCreateProjectOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
              <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
                <div className="border-b border-slate-200 px-6 py-4">
                  <h3 className="text-lg font-semibold text-slate-900">Create Project</h3>
                  <p className="mt-1 text-sm text-slate-600">Create a new active project so you can upload documents without Swagger.</p>
                </div>

                <form onSubmit={handleCreateProject} className="space-y-4 px-6 py-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm text-slate-700">
                      Project Name
                      <input
                        type="text"
                        value={newProjectName}
                        onChange={(event) => setNewProjectName(event.target.value)}
                        placeholder="Online Food Ordering System"
                        className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        autoFocus
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-slate-700">
                      Repository URL
                      <input
                        type="url"
                        value={newProjectRepositoryUrl}
                        onChange={(event) => setNewProjectRepositoryUrl(event.target.value)}
                        placeholder="https://example.com/repo.git"
                        className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-2 text-sm text-slate-700">
                    Description
                    <textarea
                      value={newProjectDescription}
                      onChange={(event) => setNewProjectDescription(event.target.value)}
                      placeholder="Initial architecture scope"
                      rows={3}
                      className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm text-slate-700">
                      Default Branch
                      <input
                        type="text"
                        value={newProjectDefaultBranch}
                        onChange={(event) => setNewProjectDefaultBranch(event.target.value)}
                        placeholder="main"
                        className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm text-slate-700">
                      Language
                      <input
                        type="text"
                        value={newProjectLanguage}
                        onChange={(event) => setNewProjectLanguage(event.target.value)}
                        placeholder="python"
                        className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      onClick={closeCreateProjectModal}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingProject}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCreatingProject ? 'Creating...' : 'Create Project'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Documents</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {documents.length} documents
                  {lastRefreshedAt ? ` • last refreshed ${lastRefreshedAt.toLocaleTimeString()}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${isLivePolling ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {isLivePolling ? 'Live polling on' : 'Live polling off'}
                </span>
                <label className="text-xs text-gray-600">
                  Cadence
                  <select
                    value={pollingIntervalMs}
                    onChange={(event) => setPollingIntervalMs(Number(event.target.value))}
                    className="ml-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                  >
                    <option value={0}>Off</option>
                    <option value={2000}>2s</option>
                    <option value={5000}>5s</option>
                    <option value={10000}>10s</option>
                  </select>
                </label>
                <button
                  onClick={() => void handleManualRefresh()}
                  disabled={isLoadingDocuments || isManualRefreshing || !selectedProjectId}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isManualRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900">Dead-letter replay controls</p>
                  <p className="text-xs text-amber-800">Retry failed retryable documents without leaving this screen.</p>
                </div>
                <button
                  onClick={() => handleBulkReplay()}
                  disabled={isBulkReplaying || deadLetterItems.length === 0}
                  className="px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-200 rounded hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBulkReplaying ? 'Queueing...' : `Replay all retryable (${deadLetterItems.length})`}
                </button>
              </div>

              {deadLetterItems.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {deadLetterItems.slice(0, 5).map((item) => (
                    <li key={item.document_id} className="flex items-center justify-between rounded bg-white px-3 py-2 text-xs text-gray-700">
                      <span>
                        {item.file_name} • {item.error_code ?? 'UNKNOWN_ERROR'} • replay #{item.replay_count}
                      </span>
                      <button
                        onClick={() => handleReplayDeadLetter(item.document_id)}
                        disabled={pendingReplayId === item.document_id}
                        className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {pendingReplayId === item.document_id ? 'Queueing...' : 'Replay'}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-amber-800">No retryable failed documents in dead-letter queue.</p>
              )}
            </div>

            <div className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-cyan-900">AI extraction controls</p>
                  <p className="text-xs text-cyan-800">Analyze document metadata and extraction context into rule candidates.</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-cyan-900">Architecture version</label>
                  <select
                    value={selectedVersionId}
                    onChange={(e) => setSelectedVersionId(e.target.value)}
                    disabled={architectureVersions.length === 0}
                    className="px-2 py-1 text-xs border border-cyan-300 rounded bg-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:bg-cyan-100"
                  >
                    {architectureVersions.length === 0 ? (
                      <option value="">No versions</option>
                    ) : (
                      architectureVersions.map((version) => (
                        <option key={version.id} value={version.id}>
                          v{version.version_number} • {version.status}
                        </option>
                      ))
                    )}
                  </select>

                  <label className="flex items-center gap-2 text-xs text-cyan-900">
                    <input
                      type="checkbox"
                      checked={autoCreateAiRules}
                      onChange={(e) => setAutoCreateAiRules(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-cyan-300"
                    />
                    Auto-create rules
                  </label>
                </div>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">AI review governance</p>
                  <p className="text-xs text-emerald-800">Accept and reject decisions become a measurable trend for this project.</p>
                </div>
                {aiReviewTrend ? (
                  <div className="text-right text-xs text-emerald-900">
                    <p className="font-semibold">
                      {aiReviewTrend.accepted_candidates} accepted • {aiReviewTrend.rejected_candidates} rejected
                    </p>
                    <p>
                      Acceptance rate:{' '}
                      {aiReviewTrend.acceptance_rate_percent !== null ? `${aiReviewTrend.acceptance_rate_percent.toFixed(1)}%` : 'n/a'}
                    </p>
                  </div>
                ) : null}
              </div>

              {aiReviewTrend ? (
                <div className="mt-3 space-y-2">
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="rounded bg-white px-3 py-2 text-xs text-emerald-900">
                      <p className="font-semibold">Reviews</p>
                      <p className="mt-1 text-slate-600">{aiReviewTrend.total_reviews} review event(s) across {aiReviewTrend.reviewed_documents} document(s).</p>
                    </div>
                    <div className="rounded bg-white px-3 py-2 text-xs text-emerald-900">
                      <p className="font-semibold">Latest review</p>
                      <p className="mt-1 text-slate-600">
                        {aiReviewTrend.last_reviewed_at ? new Date(aiReviewTrend.last_reviewed_at).toLocaleString() : 'No review activity yet.'}
                      </p>
                    </div>
                  </div>

                  {aiReviewTrend.points.length > 0 ? (
                    <ul className="space-y-2">
                      {aiReviewTrend.points.slice(-5).map((point) => (
                        <li key={point.bucket_start} className="flex items-center justify-between rounded bg-white px-3 py-2 text-xs text-slate-700">
                          <span>{new Date(point.bucket_start).toLocaleDateString()}</span>
                          <span>
                            {point.accepted_candidates} accepted • {point.rejected_candidates} rejected
                            {point.acceptance_rate_percent !== null ? ` • ${point.acceptance_rate_percent.toFixed(1)}% accept` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-emerald-800">No candidate-review decisions have been recorded for this project yet.</p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-emerald-800">No AI review analytics available yet.</p>
              )}
            </div>

            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Document activity timeline</p>
                  <p className="text-xs text-slate-600">Recent governance events scoped to currently listed documents.</p>
                </div>
              </div>

              {documentActivityFeed.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {documentActivityFeed.map((event) => (
                    <li key={event.id}>
                      <GovernanceActivityRow
                        event={event}
                        summary={summarizeAuditEvent(event)}
                        sessionUser={sessionUser}
                        membersById={organizationMembersById}
                        tone="light"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-slate-500">No document activity events yet for the current view.</p>
              )}
            </div>

            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Filter size={18} className="text-gray-600" />
                <span className="font-semibold text-gray-700">Filters</span>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    File Type
                  </label>
                  <select
                    value={filterFileType}
                    onChange={(e) => setFilterFileType(e.target.value as 'all' | DocumentFileType)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Types</option>
                    <option value="text">Text</option>
                    <option value="diagram">Diagram</option>
                    <option value="pdf">PDF</option>
                    <option value="markdown">Markdown</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Status
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as DocumentFilterStatus)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Search
                  </label>
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search by name or description..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {isLoadingDocuments ? (
              <div className="text-center py-8 text-gray-600">Loading documents...</div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                {searchQuery || filterFileType !== 'all' || filterStatus !== 'all'
                  ? 'No documents match your search or filters.'
                  : 'No documents uploaded yet.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-700">
                  <thead>
                    <tr className="border-b border-gray-300">
                      <th className="px-4 py-2 text-left font-semibold">File Name</th>
                      <th className="px-4 py-2 text-left font-semibold">Type</th>
                      <th className="px-4 py-2 text-left font-semibold">Status</th>
                      <th className="px-4 py-2 text-left font-semibold">Job State</th>
                      <th className="px-4 py-2 text-left font-semibold">Size</th>
                      <th className="px-4 py-2 text-left font-semibold">Uploaded</th>
                      <th className="px-4 py-2 text-center font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{doc.file_name}</p>
                            {doc.description && <p className="text-xs text-gray-500">{doc.description}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 capitalize">{doc.file_type}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${statusBadgeColor(doc.processing_status)}`}>
                            {doc.processing_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          <p className="font-medium text-gray-800">{renderJobState(doc)}</p>
                          {jobStatusByDocumentId[doc.id] ? (
                            <p className="mt-1 text-[11px] text-gray-500">
                              Queue: {jobStatusByDocumentId[doc.id].job.queue_backend}
                              {jobStatusByDocumentId[doc.id].job.task_id
                                ? ` • Task ${jobStatusByDocumentId[doc.id].job.task_id?.slice(0, 8)}...`
                                : ''}
                            </p>
                          ) : null}
                          {renderRetryHint(doc) ? (
                            <p className="mt-1 text-[11px] text-amber-700">{renderRetryHint(doc)}</p>
                          ) : null}
                          {renderDiagnostics(doc) ? (
                            <p className="mt-1 text-[11px] text-slate-500">{renderDiagnostics(doc)}</p>
                          ) : null}
                          {renderDiagnosticsHistoryLines(doc).map((line, index) => (
                            <p key={`${doc.id}-diag-history-${index}`} className="mt-1 text-[11px] text-slate-500">{line}</p>
                          ))}
                          {(() => {
                            const extractedData = doc.extracted_data ?? {};
                            const aiCandidates = extractedData.ai_candidates as Record<string, unknown> | undefined;
                            if (!aiCandidates || typeof aiCandidates !== 'object') {
                              return null;
                            }
                            const rules = Array.isArray(aiCandidates.rule_candidates) ? aiCandidates.rule_candidates.length : 0;
                            const entities = Array.isArray(aiCandidates.entity_candidates) ? aiCandidates.entity_candidates.length : 0;
                            const reviews = Array.isArray((doc.extracted_data as Record<string, unknown> | undefined)?.ai_candidates_reviews)
                              ? ((doc.extracted_data as Record<string, unknown>).ai_candidates_reviews as unknown[]).length
                              : 0;
                            return (
                              <p className="mt-1 text-[11px] text-cyan-700">
                                AI candidates: {rules} rule(s), {entities} entit{entities === 1 ? 'y' : 'ies'}
                                {reviews > 0 ? ` • reviews: ${reviews}` : ''}
                              </p>
                            );
                          })()}
                          {(() => {
                            const extractedData = doc.extracted_data as Record<string, unknown>;
                            const uploadIntake = extractedData.upload_intake as Record<string, unknown> | undefined;
                            const diagramHints = uploadIntake?.diagram_hints as Record<string, unknown> | undefined;
                            const components = diagramHints?.components;
                            if (!Array.isArray(components) || components.length === 0) {
                              return null;
                            }
                            const applied = uploadIntake?.diagram_hints_applied as Record<string, unknown> | undefined;
                            const reviewHistory = uploadIntake?.diagram_hint_reviews;
                            const reviewCount = Array.isArray(reviewHistory) ? reviewHistory.length : 0;
                            const createdComponents = typeof applied?.created_components_count === 'number'
                              ? applied.created_components_count
                              : null;
                            const createdRelationships = typeof applied?.created_relationships_count === 'number'
                              ? applied.created_relationships_count
                              : null;
                            return (
                              <p className="mt-1 text-[11px] text-indigo-700">
                                Diagram hints: {components.length} component(s)
                                {createdComponents !== null && createdRelationships !== null
                                  ? ` • last apply: +${createdComponents} component(s), +${createdRelationships} relationship(s)`
                                  : ''}
                                {reviewCount > 0 ? ` • reviews: ${reviewCount}` : ''}
                              </p>
                            );
                          })()}
                          {(() => {
                            const extractedData = doc.extracted_data as Record<string, unknown>;
                            const uploadIntake = extractedData.upload_intake as Record<string, unknown> | undefined;
                            const reviewHistory = uploadIntake?.diagram_hint_reviews;
                            if (!Array.isArray(reviewHistory) || reviewHistory.length === 0) {
                              return null;
                            }

                            const latestReview = reviewHistory[reviewHistory.length - 1] as Record<string, unknown>;
                            const reviewedBy = typeof latestReview?.reviewed_by === 'string' ? latestReview.reviewed_by : null;
                            return (
                              <ReviewerIdentityChips
                                reviewerId={reviewedBy}
                                sessionUser={sessionUser}
                                membersById={organizationMembersById}
                                className="mt-1 flex items-center gap-1.5"
                              />
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {(doc.file_size_bytes / 1024).toFixed(2)} KB
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {new Date(doc.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => handleProcess(doc)}
                              disabled={pendingProcessId === doc.id || doc.processing_status === 'processing'}
                              className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {pendingProcessId === doc.id
                                ? 'Working...'
                                : (doc.processing_status === 'completed' || doc.processing_status === 'failed')
                                  ? 'Reprocess'
                                  : 'Process'}
                            </button>
                            <button
                              onClick={() => handleAiExtract(doc)}
                              disabled={pendingAiExtractId === doc.id || !selectedVersionId}
                              className="px-3 py-1 text-xs font-medium text-cyan-700 bg-cyan-50 rounded hover:bg-cyan-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {pendingAiExtractId === doc.id ? 'Analyzing...' : 'AI Extract'}
                            </button>
                            <button
                              onClick={() => openAiReview(doc)}
                              disabled={pendingAiReviewId === doc.id || !hasAICandidates(doc)}
                              className="px-3 py-1 text-xs font-medium text-teal-700 bg-teal-50 rounded hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {pendingAiReviewId === doc.id ? 'Saving...' : 'Review AI'}
                            </button>
                            <button
                              onClick={() => openDiagramReview(doc)}
                              disabled={pendingDiagramApplyId === doc.id || !selectedVersionId || !hasDiagramHints(doc)}
                              className="px-3 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {pendingDiagramApplyId === doc.id ? 'Applying...' : 'Review Hints'}
                            </button>
                            <button
                              onClick={() => handleDelete(doc.id)}
                              disabled={pendingDeleteId === doc.id}
                              className="inline-flex items-center justify-center px-3 py-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {diagramReviewDoc ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
              <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
                <div className="border-b border-slate-200 px-5 py-4">
                  <p className="text-sm font-semibold text-slate-900">Review Diagram Hints</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {diagramReviewDoc.file_name} - choose which hints to apply to architecture graph.
                  </p>
                </div>

                <div className="grid gap-4 p-5 md:grid-cols-2">
                  <section className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Components</h3>
                      <span className="text-[11px] text-slate-500">{selectedDiagramComponents.length} selected</span>
                    </div>
                    <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                      {diagramReviewHintData.components.length === 0 ? (
                        <p className="text-xs text-slate-500">No components detected.</p>
                      ) : (
                        diagramReviewHintData.components.map((component) => (
                          <label key={component} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={selectedDiagramComponents.includes(component)}
                              onChange={() => toggleDiagramComponentSelection(component)}
                              className="h-3.5 w-3.5 rounded border-slate-300"
                            />
                            <span>{component}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Relationships</h3>
                      <span className="text-[11px] text-slate-500">{selectedDiagramRelationshipKeys.length} selected</span>
                    </div>
                    <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                      {diagramReviewHintData.relationships.length === 0 ? (
                        <p className="text-xs text-slate-500">No relationships detected.</p>
                      ) : (
                        diagramReviewHintData.relationships.map((relationship) => {
                          const relationKey = diagramRelationshipKey(relationship);
                          return (
                            <label key={relationKey} className="flex items-start gap-2 rounded px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={selectedDiagramRelationshipKeys.includes(relationKey)}
                                onChange={() => toggleDiagramRelationshipSelection(relationship)}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                              />
                              <span>
                                {relationship.source} {relationship.relation} {relationship.target}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </section>
                </div>

                <div className="px-5 pb-5">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Reviewer Note (optional)</label>
                  <textarea
                    value={diagramReviewNote}
                    onChange={(event) => setDiagramReviewNote(event.target.value)}
                    maxLength={1000}
                    placeholder="Document why these hints were accepted or rejected..."
                    className="h-20 w-full resize-none rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />

                  {diagramReviewHistory.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-slate-200 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Recent Review History</p>
                      <ul className="max-h-32 space-y-2 overflow-y-auto">
                        {diagramReviewHistory
                          .slice(-3)
                          .reverse()
                          .map((entry, index) => {
                            const reviewedAt = typeof entry.reviewed_at === 'string' ? entry.reviewed_at : null;
                            const reviewedBy = typeof entry.reviewed_by === 'string' ? entry.reviewed_by : null;
                            const note = typeof entry.note === 'string' ? entry.note : null;
                            const acceptedComponents = Array.isArray(entry.accepted_components) ? entry.accepted_components.length : 0;
                            const acceptedRelationships = Array.isArray(entry.accepted_relationships) ? entry.accepted_relationships.length : 0;
                            const rejectedComponents = Array.isArray(entry.rejected_components) ? entry.rejected_components.length : 0;
                            const rejectedRelationships = Array.isArray(entry.rejected_relationships) ? entry.rejected_relationships.length : 0;
                            return (
                              <li key={`${reviewedAt ?? 'review'}-${index}`} className="text-xs text-slate-600">
                                <p>
                                  {reviewedAt ? new Date(reviewedAt).toLocaleString() : 'Unknown time'}
                                  {` • +${acceptedComponents} comp, +${acceptedRelationships} rel, -${rejectedComponents} comp, -${rejectedRelationships} rel`}
                                </p>
                                <ReviewerIdentityChips
                                  reviewerId={reviewedBy}
                                  sessionUser={sessionUser}
                                  membersById={organizationMembersById}
                                  className="mt-1 flex items-center gap-1.5"
                                />
                                {note ? <p className="mt-0.5 text-slate-500">{note}</p> : null}
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
                  <p className="text-xs text-slate-500">
                    Architecture version required. Selected relationships can auto-create missing selected endpoints.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={closeDiagramReview}
                      disabled={pendingDiagramApplyId === diagramReviewDoc.id}
                      className="rounded px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleApplyDiagramHintsSelection()}
                      disabled={pendingDiagramApplyId === diagramReviewDoc.id || !selectedVersionId}
                      className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {pendingDiagramApplyId === diagramReviewDoc.id ? 'Applying...' : 'Apply Selected'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {aiReviewDoc ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
              <div className="w-full max-w-4xl rounded-xl bg-white shadow-2xl">
                <div className="border-b border-slate-200 px-5 py-4">
                  <p className="text-sm font-semibold text-slate-900">Review AI Candidates</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {aiReviewDoc.file_name} - accept, reject, or clear decisions before persisting review history.
                  </p>
                </div>

                <div className="grid gap-4 p-5 md:grid-cols-3">
                  <section className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Rules</h3>
                      <span className="text-[11px] text-slate-500">{aiReviewData.rules.length}</span>
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {aiReviewData.rules.length === 0 ? (
                        <p className="text-xs text-slate-500">No rule candidates.</p>
                      ) : (
                        aiReviewData.rules.map((rule, index) => {
                          const decision = ruleDecisions[index];
                          return (
                            <div key={`rule-${index}`} className="rounded border border-slate-200 p-2 text-xs">
                              <p className="font-medium text-slate-800">{rule.rule_text}</p>
                              <p className="mt-0.5 text-slate-500">{rule.rule_type} • {rule.severity}{rule.confidence !== null ? ` • ${(rule.confidence * 100).toFixed(0)}%` : ''}</p>
                              <div className="mt-2 flex items-center gap-1">
                                <button
                                  onClick={() => setRuleDecision(index, 'accept')}
                                  className={`rounded px-2 py-1 ${decision === 'accept' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => setRuleDecision(index, 'reject')}
                                  className={`rounded px-2 py-1 ${decision === 'reject' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => setRuleDecision(index, null)}
                                  className="rounded bg-slate-100 px-2 py-1 text-slate-600 hover:bg-slate-200"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Entities</h3>
                      <span className="text-[11px] text-slate-500">{aiReviewData.entities.length}</span>
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {aiReviewData.entities.length === 0 ? (
                        <p className="text-xs text-slate-500">No entity candidates.</p>
                      ) : (
                        aiReviewData.entities.map((entity, index) => {
                          const decision = entityDecisions[index];
                          return (
                            <div key={`entity-${index}`} className="rounded border border-slate-200 p-2 text-xs">
                              <p className="font-medium text-slate-800">{entity.text}</p>
                              <p className="mt-0.5 text-slate-500">{entity.label}{entity.confidence !== null ? ` • ${(entity.confidence * 100).toFixed(0)}%` : ''}</p>
                              <div className="mt-2 flex items-center gap-1">
                                <button
                                  onClick={() => setEntityDecision(index, 'accept')}
                                  className={`rounded px-2 py-1 ${decision === 'accept' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => setEntityDecision(index, 'reject')}
                                  className={`rounded px-2 py-1 ${decision === 'reject' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => setEntityDecision(index, null)}
                                  className="rounded bg-slate-100 px-2 py-1 text-slate-600 hover:bg-slate-200"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Relationships</h3>
                      <span className="text-[11px] text-slate-500">{aiReviewData.relationships.length}</span>
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {aiReviewData.relationships.length === 0 ? (
                        <p className="text-xs text-slate-500">No relationship candidates.</p>
                      ) : (
                        aiReviewData.relationships.map((relationship, index) => {
                          const decision = relationshipDecisions[index];
                          return (
                            <div key={`relationship-${index}`} className="rounded border border-slate-200 p-2 text-xs">
                              <p className="font-medium text-slate-800">{relationship.source} {relationship.relation} {relationship.target}</p>
                              <p className="mt-0.5 text-slate-500">{relationship.confidence !== null ? `${(relationship.confidence * 100).toFixed(0)}% confidence` : 'No confidence score'}</p>
                              <div className="mt-2 flex items-center gap-1">
                                <button
                                  onClick={() => setRelationshipDecision(index, 'accept')}
                                  className={`rounded px-2 py-1 ${decision === 'accept' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => setRelationshipDecision(index, 'reject')}
                                  className={`rounded px-2 py-1 ${decision === 'reject' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => setRelationshipDecision(index, null)}
                                  className="rounded bg-slate-100 px-2 py-1 text-slate-600 hover:bg-slate-200"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>
                </div>

                <div className="px-5 pb-5">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Reviewer Note (optional)</label>
                  <textarea
                    value={aiReviewNote}
                    onChange={(event) => setAiReviewNote(event.target.value)}
                    maxLength={1000}
                    placeholder="Capture why candidates were accepted or rejected..."
                    className="h-20 w-full resize-none rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />

                  {aiReviewData.reviewHistory.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-slate-200 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Recent AI Review History</p>
                      <ul className="max-h-32 space-y-2 overflow-y-auto">
                        {aiReviewData.reviewHistory
                          .slice(-3)
                          .reverse()
                          .map((entry, index) => {
                            const reviewedAt = typeof entry.reviewed_at === 'string' ? entry.reviewed_at : null;
                            const reviewedBy = typeof entry.reviewed_by === 'string' ? entry.reviewed_by : null;
                            const note = typeof entry.note === 'string' ? entry.note : null;
                            const acceptedRules = Array.isArray(entry.accepted_rule_indexes) ? entry.accepted_rule_indexes.length : 0;
                            const rejectedRules = Array.isArray(entry.rejected_rule_indexes) ? entry.rejected_rule_indexes.length : 0;
                            const acceptedEntities = Array.isArray(entry.accepted_entity_indexes) ? entry.accepted_entity_indexes.length : 0;
                            const rejectedEntities = Array.isArray(entry.rejected_entity_indexes) ? entry.rejected_entity_indexes.length : 0;
                            const acceptedRelationships = Array.isArray(entry.accepted_relationship_indexes) ? entry.accepted_relationship_indexes.length : 0;
                            const rejectedRelationships = Array.isArray(entry.rejected_relationship_indexes) ? entry.rejected_relationship_indexes.length : 0;
                            return (
                              <li key={`${reviewedAt ?? 'review'}-${index}`} className="text-xs text-slate-600">
                                <p>
                                  {reviewedAt ? new Date(reviewedAt).toLocaleString() : 'Unknown time'}
                                  {` • +${acceptedRules}R/-${rejectedRules}R • +${acceptedEntities}E/-${rejectedEntities}E • +${acceptedRelationships}Rel/-${rejectedRelationships}Rel`}
                                </p>
                                <ReviewerIdentityChips
                                  reviewerId={reviewedBy}
                                  sessionUser={sessionUser}
                                  membersById={organizationMembersById}
                                  className="mt-1 flex items-center gap-1.5"
                                />
                                {note ? <p className="mt-0.5 text-slate-500">{note}</p> : null}
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
                  <p className="text-xs text-slate-500">
                    Review decisions are persisted to this document and can be replayed in governance audits.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={closeAiReview}
                      disabled={pendingAiReviewId === aiReviewDoc.id}
                      className="rounded px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSubmitAiReview()}
                      disabled={pendingAiReviewId === aiReviewDoc.id}
                      className="rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {pendingAiReviewId === aiReviewDoc.id ? 'Saving...' : 'Save Review'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </RouteGuard>
  );
}
