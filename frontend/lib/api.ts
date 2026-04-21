export type ApiEnvelope<T> = {
  status: 'success' | 'error';
  data: T;
  meta?: {
    request_id: string;
    timestamp: string;
  };
  pagination?: {
    page: number;
    per_page: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
};

export const ACCESS_TOKEN_KEY = 'archguard_access_token';
export const REFRESH_TOKEN_KEY = 'archguard_refresh_token';
export const USER_KEY = 'archguard_user';

export type UserOut = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  organization_id: string;
  is_active: boolean;
  created_at: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  full_name: string;
  organization_name: string;
};

export type LoginResponse = {
  user: UserOut;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type ProjectListItem = {
  id: string;
  name: string;
  description?: string | null;
  language: string;
  is_active: boolean;
  created_at: string;
};

export type ProjectOut = {
  id: string;
  name: string;
  description?: string | null;
  repository_url?: string | null;
  default_branch: string;
  language: string;
  organization_id: string;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectCreatePayload = {
  name: string;
  description?: string | null;
  repository_url?: string | null;
  default_branch?: string;
  language?: string;
};

export type HealthScoreOut = {
  health_score: number;
  total_violations: number;
  critical_count: number;
  major_count: number;
  minor_count: number;
  info_count: number;
  report_id: string;
  checked_at: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  user_email: string | null;
  ip_address: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
};

export type OrganizationOut = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  members_count: number;
  projects_count: number;
};

export type OrganizationMemberOut = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

export type OrganizationUpdatePayload = {
  name?: string;
  description?: string | null;
};

export type AnalyticsSummaryOut = {
  active_projects: number;
  total_reports: number;
  average_health_score: number;
  critical_violations: number;
  recent_audit_events: number;
  last_report_at: string | null;
  total_documents: number;
  pending_documents: number;
  processing_documents: number;
  completed_documents: number;
  failed_documents: number;
};

export type AnalyticsHistoryPointOut = {
  bucket_start: string;
  average_health_score: number;
  reports_count: number;
  critical_violations: number;
};

export type AnalyticsHistoryOut = {
  days: number;
  points: AnalyticsHistoryPointOut[];
};

export type DocumentMetricsTrendPointOut = {
  bucket_start: string;
  uploaded_count: number;
  completed_count: number;
  failed_count: number;
  processing_count: number;
  uploaded_delta_day_over_day: number;
  completed_delta_day_over_day: number;
  failed_delta_day_over_day: number;
  processing_delta_day_over_day: number;
  success_rate_percent: number | null;
  failure_rate_percent: number | null;
};

export type DocumentMetricsTrendOut = {
  days: number;
  points: DocumentMetricsTrendPointOut[];
};

export type AICandidateReviewTrendPointOut = {
  bucket_start: string;
  review_count: number;
  reviewed_documents: number;
  accepted_candidates: number;
  rejected_candidates: number;
  acceptance_rate_percent: number | null;
};

export type AICandidateReviewTrendOut = {
  days: number;
  project_id: string | null;
  total_reviews: number;
  reviewed_documents: number;
  accepted_candidates: number;
  rejected_candidates: number;
  acceptance_rate_percent: number | null;
  last_reviewed_at: string | null;
  points: AICandidateReviewTrendPointOut[];
};

export type WorkerHealthOut = {
  queue_backend: string;
  redis_status: 'healthy' | 'unreachable';
  redis_latency_ms: number | null;
  celery_worker_count: number;
  worker_status: 'healthy' | 'degraded' | 'down';
  checked_at: string;
};

export type WorkerOpsCommandOut = {
  label: string;
  command: string;
  when_to_use: string;
};

export type WorkerOpsHintsOut = {
  queue_backend: string;
  worker_status: 'healthy' | 'degraded' | 'down';
  recommended_actions: string[];
  runbook_commands: WorkerOpsCommandOut[];
  last_replay_requested_at: string | null;
  last_replay_document_count: number;
  checked_at: string;
};

export type ArchitectureVersionOut = {
  id: string;
  project_id: string;
  version_number: number;
  status: 'draft' | 'under_review' | 'approved' | 'active' | 'deprecated';
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
};

export type GraphComponentOut = {
  uid: string;
  name: string;
  component_type: string;
  layer_level: number | null;
  description: string | null;
};

export type GraphComponentCreatePayload = {
  name: string;
  component_type: 'service' | 'layer' | 'module' | 'database' | 'ui' | 'api' | 'gateway' | 'external' | 'queue';
  layer_level?: number;
  description?: string;
};

export type GraphRelationshipOut = {
  id?: string | null;
  source_uid: string;
  target_uid: string;
  type: string;
  properties: Record<string, unknown>;
};

export type GraphRelationshipCreatePayload = {
  source_uid: string;
  target_uid: string;
  type: 'ALLOWED_DEPENDENCY' | 'FORBIDDEN_DEPENDENCY' | 'REQUIRES' | 'LAYER_ABOVE';
  rule_id?: string;
};

export type GraphOut = {
  components: GraphComponentOut[];
  relationships: GraphRelationshipOut[];
  stats: {
    total_components: number;
    total_relationships: number;
  };
};

export type RuleOut = {
  id: string;
  architecture_version_id: string;
  rule_text: string;
  rule_type: 'forbidden_dependency' | 'required_dependency' | 'layer_constraint' | 'cycle_prohibition' | 'naming_convention' | 'custom';
  source_component: string | null;
  target_component: string | null;
  severity: 'critical' | 'major' | 'minor';
  is_ai_generated: boolean;
  confidence_score: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

export type RuleCreatePayload = {
  rule_text: string;
  rule_type: RuleOut['rule_type'];
  source_component?: string;
  target_component?: string;
  severity: RuleOut['severity'];
};

export type RuleUpdatePayload = {
  rule_text?: string;
  severity?: RuleOut['severity'];
  is_active?: boolean;
};

export type DocumentFileType = 'text' | 'diagram' | 'pdf' | 'markdown';

export type DocumentOut = {
  id: string;
  project_id: string;
  file_name: string;
  file_type: DocumentFileType;
  description?: string | null;
  file_size_bytes: number;
  content_type: string;
  storage_key: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  extracted_data?: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ExtractorDiagnosticsHistoryEntry = {
  timestamp: string;
  event: string;
  trigger?: string;
  processing_status: DocumentOut['processing_status'];
  queue_backend: string | null;
  task_id: string | null;
  request_id: string | null;
  key_slot: string | null;
  provider_attempts: number | null;
  error_code: string | null;
  retryable: boolean | null;
};

export type ExtractorDiagnosticsSummary = {
  project_name: string;
  document_name: string;
  file_type: DocumentFileType;
  processing_status: DocumentOut['processing_status'];
  queue_backend: string | null;
  request_id: string | null;
  key_slot: string | null;
  provider_attempts: number | null;
  error_code: string | null;
  retryable: boolean | null;
  history: ExtractorDiagnosticsHistoryEntry[];
  updated_at: string;
};

export type DocumentProcessResponse =
  | DocumentOut
  | {
      document_id: string;
      processing_status: 'processing';
      message: string;
    };

export type DocumentJobStatusOut = {
  document_id: string;
  processing_status: DocumentOut['processing_status'];
  job: {
    mode: 'background';
    task_id: string | null;
    queue_backend: 'celery' | 'fastapi-background';
    status: string;
    queued_at: string;
    started_at?: string;
    completed_at?: string;
    failed_at?: string;
    error?: string;
  };
  runtime_state: string | null;
  extractor_diagnostics: {
    provider_name: string | null;
    provider_endpoint: string | null;
    provider_attempts: number | null;
    request_id: string | null;
    key_slot: string | null;
    error_code: string | null;
  };
  extractor_diagnostics_history: ExtractorDiagnosticsHistoryEntry[];
  updated_at: string | null;
};

export type DeadLetterItemOut = {
  document_id: string;
  file_name: string;
  retryable: boolean;
  error_code: string | null;
  error_message: string | null;
  failed_at: string | null;
  replay_count: number;
  last_replay_requested_at: string | null;
};

export type DeadLetterListOut = {
  project_id: string;
  total: number;
  items: DeadLetterItemOut[];
};

export type WorkerReplayQueueItemOut = {
  document_id: string;
  queue_backend: string;
  task_id: string | null;
  replay_count: number;
};

export type WorkerReplayQueueOut = {
  project_id: string;
  requested_limit: number;
  queued_count: number;
  items: WorkerReplayQueueItemOut[];
  checked_at: string;
};

export type AIDocumentExtractionPayload = {
  architecture_version_id: string;
  auto_create_rules?: boolean;
  persist_candidates?: boolean;
};

export type AIDocumentCandidateReviewPayload = {
  architecture_version_id: string;
  accepted_rule_indexes?: number[];
  rejected_rule_indexes?: number[];
  accepted_entity_indexes?: number[];
  rejected_entity_indexes?: number[];
  accepted_relationship_indexes?: number[];
  rejected_relationship_indexes?: number[];
  review_note?: string;
};

export type AIDocumentCandidateReviewOut = {
  project_id: string;
  document_id: string;
  architecture_version_id: string;
  reviewed_at: string;
  reviewed_by: string;
  accepted_rules_count: number;
  rejected_rules_count: number;
  accepted_entities_count: number;
  rejected_entities_count: number;
  accepted_relationships_count: number;
  rejected_relationships_count: number;
  review_history_count: number;
};

export type AIDiagramHintsApplyPayload = {
  architecture_version_id: string;
  persist_applied_metadata?: boolean;
  review_note?: string;
  selected_components?: string[];
  selected_relationships?: Array<{
    source: string;
    target: string;
    relation: string;
  }>;
};

export type AIDiagramHintsApplyOut = {
  project_id: string;
  document_id: string;
  architecture_version_id: string;
  created_components_count: number;
  created_relationships_count: number;
  skipped_relationships_count: number;
  component_name_to_uid: Record<string, string>;
};

export type AIDocumentRuleExtractionOut = {
  summary: string;
  keywords: string[];
  extracted_rules: Array<{
    rule_text: string;
    rule_type: RuleOut['rule_type'];
    source_component: string | null;
    target_component: string | null;
    severity: RuleOut['severity'];
    confidence: number | null;
    model_version: string | null;
  }>;
  entities: Array<{
    text: string;
    label: string;
    start: number | null;
    end: number | null;
    confidence: number | null;
  }>;
  relationships: Array<{
    source: string;
    target: string;
    relation: string;
    confidence: number | null;
  }>;
  processing_time_ms: number;
  model_info: Record<string, unknown>;
  created_rule_ids: string[];
  architecture_version_id: string;
  project_id: string;
  document_id: string;
  file_name: string;
  file_type: string;
  input_source_fields: string[];
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1';

let refreshInFlight: Promise<string> | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function getSessionTokens(): { accessToken: string | null; refreshToken: string | null } {
  if (!isBrowser()) {
    return { accessToken: null, refreshToken: null };
  }

  return {
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
  };
}

export function storeAuthSession(payload: { access_token: string; refresh_token: string; user?: UserOut }): void {
  if (!isBrowser()) {
    return;
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, payload.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, payload.refresh_token);
  if (payload.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  }
}

export function clearAuthSession(): void {
  if (!isBrowser()) {
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await parseJson<{ detail?: { code?: string; message?: string } | string }>(response);
    let message = `Request failed with status ${response.status}`;

    if (typeof errorBody.detail === 'string') {
      message = errorBody.detail;
    } else if (errorBody.detail?.message) {
      message = errorBody.detail.message;
    }

    throw new Error(message);
  }

  return parseJson<ApiEnvelope<T>>(response);
}

async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = getSessionTokens();
  if (!refreshToken) {
    clearAuthSession();
    throw new Error('Session expired. Please sign in again.');
  }

  const response = await apiRequest<Pick<LoginResponse, 'access_token' | 'refresh_token' | 'token_type' | 'expires_in'>>(
    '/auth/refresh',
    {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );

  storeAuthSession({
    access_token: response.data.access_token,
    refresh_token: response.data.refresh_token,
  });

  return response.data.access_token;
}

async function getValidAccessToken(): Promise<string> {
  const { accessToken } = getSessionTokens();
  if (!accessToken) {
    throw new Error('Sign in required');
  }
  return accessToken;
}

async function apiRequestWithAuth<T>(path: string, options: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const accessToken = await getValidAccessToken();

  try {
    return await apiRequest<T>(path, options, accessToken);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('status 401')) {
      throw error;
    }

    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken();
    }

    try {
      const refreshedAccessToken = await refreshInFlight;
      return await apiRequest<T>(path, options, refreshedAccessToken);
    } finally {
      refreshInFlight = null;
    }
  }
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  storeAuthSession({
    access_token: response.data.access_token,
    refresh_token: response.data.refresh_token,
    user: response.data.user,
  });
  return response.data;
}

export async function register(payload: RegisterPayload): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  storeAuthSession({
    access_token: response.data.access_token,
    refresh_token: response.data.refresh_token,
    user: response.data.user,
  });
  return response.data;
}

export async function getCurrentUser(): Promise<UserOut> {
  const response = await apiRequestWithAuth<UserOut>('/auth/me');
  return response.data;
}

export async function getProjects(): Promise<ProjectListItem[]> {
  const response = await apiRequestWithAuth<ProjectListItem[]>('/projects?per_page=20');
  return response.data;
}

export async function createProject(payload: ProjectCreatePayload): Promise<ProjectOut> {
  const response = await apiRequestWithAuth<ProjectOut>('/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function getProject(projectId: string): Promise<ProjectOut> {
  const response = await apiRequestWithAuth<ProjectOut>(`/projects/${projectId}`);
  return response.data;
}

export async function getProjectHealth(projectId: string): Promise<HealthScoreOut | null> {
  try {
    const response = await apiRequestWithAuth<HealthScoreOut>(`/projects/${projectId}/compliance/health`);
    return response.data;
  } catch {
    return null;
  }
}

export async function getAuditEvents(page = 1, perPage = 8): Promise<AuditEvent[]> {
  const response = await apiRequestWithAuth<AuditEvent[]>(`/audit/events?page=${page}&per_page=${perPage}`);
  return response.data;
}

export async function getOrganization(): Promise<OrganizationOut> {
  const response = await apiRequestWithAuth<OrganizationOut>('/organizations/me');
  return response.data;
}

export async function getOrganizationMembers(): Promise<OrganizationMemberOut[]> {
  const response = await apiRequestWithAuth<OrganizationMemberOut[]>('/organizations/me/members');
  return response.data;
}

export async function updateOrganization(payload: OrganizationUpdatePayload): Promise<OrganizationOut> {
  const response = await apiRequestWithAuth<OrganizationOut>('/organizations/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummaryOut> {
  const response = await apiRequestWithAuth<AnalyticsSummaryOut>('/analytics/summary');
  return response.data;
}

export async function getAnalyticsHistory(days = 14): Promise<AnalyticsHistoryOut> {
  const response = await apiRequestWithAuth<AnalyticsHistoryOut>(`/analytics/history?days=${days}`);
  return response.data;
}

export async function getDocumentMetricsTrend(days = 14): Promise<DocumentMetricsTrendOut> {
  const response = await apiRequestWithAuth<DocumentMetricsTrendOut>(`/analytics/documents/trends?days=${days}`);
  return response.data;
}

export async function getAICandidateReviewTrend(days = 14, projectId?: string): Promise<AICandidateReviewTrendOut> {
  const params = new URLSearchParams({ days: String(days) });
  if (projectId) {
    params.set('project_id', projectId);
  }
  const response = await apiRequestWithAuth<AICandidateReviewTrendOut>(`/analytics/ai-candidate-reviews?${params.toString()}`);
  return response.data;
}

export async function getWorkerHealth(): Promise<WorkerHealthOut> {
  const response = await apiRequestWithAuth<WorkerHealthOut>('/analytics/worker-health');
  return response.data;
}

export async function getWorkerOpsHints(): Promise<WorkerOpsHintsOut> {
  const response = await apiRequestWithAuth<WorkerOpsHintsOut>('/analytics/worker-ops');
  return response.data;
}

export async function getArchitectureVersions(projectId: string): Promise<ArchitectureVersionOut[]> {
  const response = await apiRequestWithAuth<ArchitectureVersionOut[]>(`/projects/${projectId}/architecture`);
  return response.data;
}

export async function getArchitectureGraph(versionId: string): Promise<GraphOut> {
  const response = await apiRequestWithAuth<GraphOut>(`/architecture/${versionId}/graph`);
  return response.data;
}

export async function createArchitectureComponent(versionId: string, payload: GraphComponentCreatePayload): Promise<GraphComponentOut> {
  const response = await apiRequestWithAuth<GraphComponentOut>(`/architecture/${versionId}/components`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function createArchitectureRelationship(versionId: string, payload: GraphRelationshipCreatePayload): Promise<GraphRelationshipOut> {
  const response = await apiRequestWithAuth<GraphRelationshipOut>(`/architecture/${versionId}/relationships`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function deleteArchitectureRelationship(
  versionId: string,
  payload: GraphRelationshipCreatePayload,
): Promise<void> {
  const query = new URLSearchParams({
    source_uid: payload.source_uid,
    target_uid: payload.target_uid,
    type: payload.type,
  });

  await apiRequestWithAuth<{ message: string }>(`/architecture/${versionId}/relationships?${query.toString()}`, {
    method: 'DELETE',
  });
}

export async function deleteArchitectureComponent(versionId: string, componentUid: string): Promise<void> {
  await apiRequestWithAuth<{ message: string }>(`/architecture/${versionId}/components/${componentUid}`, {
    method: 'DELETE',
  });
}

export async function listRules(versionId: string): Promise<RuleOut[]> {
  const response = await apiRequestWithAuth<RuleOut[]>(`/architecture/${versionId}/rules`);
  return response.data;
}

export async function createRule(versionId: string, payload: RuleCreatePayload): Promise<RuleOut> {
  const response = await apiRequestWithAuth<RuleOut>(`/architecture/${versionId}/rules`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function updateRule(versionId: string, ruleId: string, payload: RuleUpdatePayload): Promise<RuleOut> {
  const response = await apiRequestWithAuth<RuleOut>(`/architecture/${versionId}/rules/${ruleId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function deactivateRule(versionId: string, ruleId: string): Promise<void> {
  await apiRequestWithAuth<{ message: string }>(`/architecture/${versionId}/rules/${ruleId}`, {
    method: 'DELETE',
  });
}

export async function listDocuments(
  projectId: string,
  fileType?: string,
  status?: string,
  search?: string
): Promise<DocumentOut[]> {
  const params = new URLSearchParams();
  if (fileType) {
    params.append('file_type', fileType);
  }
  if (status) {
    params.append('processing_status', status);
  }
  if (search) {
    params.append('search', search);
  }
  const query = params.toString();
  const response = await apiRequestWithAuth<DocumentOut[]>(
    `/projects/${projectId}/documents${query ? `?${query}` : ''}`
  );
  return response.data;
}

export async function uploadDocument(
  projectId: string,
  file: File,
  fileType: DocumentFileType,
  description?: string
): Promise<DocumentOut> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('file_type', fileType);
  if (description) {
    formData.append('description', description);
  }

  const accessToken = await getValidAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/documents/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await parseJson<{ detail?: { code?: string; message?: string } | string }>(response);
    let message = `Upload failed with status ${response.status}`;
    if (typeof errorBody.detail === 'string') {
      message = errorBody.detail;
    } else if (errorBody.detail?.message) {
      message = errorBody.detail.message;
    }
    throw new Error(message);
  }

  const envelope = await parseJson<ApiEnvelope<DocumentOut>>(response);
  return envelope.data;
}

export async function deleteDocument(projectId: string, docId: string): Promise<void> {
  await apiRequestWithAuth<{ message: string }>(`/projects/${projectId}/documents/${docId}`, {
    method: 'DELETE',
  });
}

export async function processDocument(
  projectId: string,
  docId: string,
  mode: 'inline' | 'background' = 'inline',
  force = false,
): Promise<DocumentProcessResponse> {
  const response = await apiRequestWithAuth<DocumentProcessResponse>(
    `/projects/${projectId}/documents/${docId}/process`,
    {
      method: 'POST',
      body: JSON.stringify({ mode, force }),
    },
  );
  return response.data;
}

export async function getDocumentJobStatus(projectId: string, docId: string): Promise<DocumentJobStatusOut> {
  const response = await apiRequestWithAuth<DocumentJobStatusOut>(`/projects/${projectId}/documents/${docId}/job`);
  return response.data;
}

export async function getDeadLetterDocuments(projectId: string, retryableOnly = true): Promise<DeadLetterListOut> {
  const query = new URLSearchParams({ retryable_only: String(retryableOnly) });
  const response = await apiRequestWithAuth<DeadLetterListOut>(`/projects/${projectId}/documents/dead-letter?${query.toString()}`);
  return response.data;
}

export async function replayDeadLetterDocument(projectId: string, docId: string, allowNonRetryable = false): Promise<{ document_id: string; processing_status: string; queue_backend: string; replay_count: number; }> {
  const response = await apiRequestWithAuth<{ document_id: string; processing_status: string; queue_backend: string; replay_count: number; }>(
    `/projects/${projectId}/documents/${docId}/replay`,
    {
      method: 'POST',
      body: JSON.stringify({ allow_non_retryable: allowNonRetryable }),
    },
  );
  return response.data;
}

export async function replayRetryableDeadLetterBatch(projectId: string, limit = 10, allowNonRetryable = false): Promise<WorkerReplayQueueOut> {
  const response = await apiRequestWithAuth<WorkerReplayQueueOut>(
    '/analytics/worker-actions/replay-retryable',
    {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, limit, allow_non_retryable: allowNonRetryable }),
    },
  );
  return response.data;
}

export async function extractRulesFromDocument(
  projectId: string,
  docId: string,
  payload: AIDocumentExtractionPayload,
): Promise<AIDocumentRuleExtractionOut> {
  const response = await apiRequestWithAuth<AIDocumentRuleExtractionOut>(
    `/ai/projects/${projectId}/documents/${docId}/rules/extract`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return response.data;
}

export async function applyDiagramHintsFromDocument(
  projectId: string,
  docId: string,
  payload: AIDiagramHintsApplyPayload,
): Promise<AIDiagramHintsApplyOut> {
  const response = await apiRequestWithAuth<AIDiagramHintsApplyOut>(
    `/ai/projects/${projectId}/documents/${docId}/diagram-hints/apply`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return response.data;
}

export async function reviewDocumentAICandidates(
  projectId: string,
  docId: string,
  payload: AIDocumentCandidateReviewPayload,
): Promise<AIDocumentCandidateReviewOut> {
  const response = await apiRequestWithAuth<AIDocumentCandidateReviewOut>(
    `/ai/projects/${projectId}/documents/${docId}/candidates/review`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return response.data;
}