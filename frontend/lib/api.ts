import type {
  AiExtractionResult,
  AnalyticsHistory,
  AnalyticsSummary,
  ApiEnvelope,
  ArchitectureGraph,
  ArchitectureVersion,
  ArchitectureVersionCreatePayload,
  ArchitectureVersionStatusPayload,
  AuditEvent,
  ComplianceCheckPayload,
  ComplianceReport,
  DocumentJobStatus,
  DocumentAiCandidateReviewPayload,
  DocumentAiCandidateReviewResult,
  DocumentAiExtractionPayload,
  DocumentDiagramHintsApplyResult,
  DocumentDiagramHintsApplyPayload,
  DocumentProcessResponse,
  DocumentTrend,
  GraphComponent,
  GraphComponentCreatePayload,
  GraphRelationship,
  GraphRelationshipCreatePayload,
  HealthScoreResponse,
  LoginPayload,
  LoginResponse,
  Organization,
  OrganizationMember,
  OrganizationUpdatePayload,
  PaginatedResult,
  Project,
  ProjectAnalysisPayload,
  ProjectAnalysisResult,
  ProjectCreatePayload,
  ProjectListItem,
  ProjectUpdatePayload,
  RegisterPayload,
  Rule,
  RuleBatchCreatePayload,
  RuleBatchCreateResponse,
  RuleCreatePayload,
  RuleUpdatePayload,
  UploadedDocument,
  User,
  Violation,
  WorkerHealth,
  WorkerOpsHints,
  AiCandidateReviewTrend,
} from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

let refreshInFlight: Promise<void> | null = null;
let cachedUser: User | null = null;

export class ApiError extends Error {
  status: number;
  code: string;
  detail: string;

  constructor(status: number, detail: string, code = "API_ERROR") {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function extractError(status: number, body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const detail = record.detail;

    if (detail && typeof detail === "object") {
      const detailRecord = detail as Record<string, unknown>;
      return {
        code: String(detailRecord.code ?? "API_ERROR"),
        message: String(detailRecord.message ?? fallback),
      };
    }

    if (typeof detail === "string") {
      return { code: "API_ERROR", message: detail };
    }

    if (typeof record.message === "string") {
      return { code: "API_ERROR", message: record.message };
    }
  }

  return { code: "API_ERROR", message: `${fallback} (status ${status})` };
}

function clearTokens() {
  cachedUser = null;
}

export function clearSession() {
  clearTokens();
}

export function getStoredUser(): User | null {
  return cachedUser;
}

async function requestEnvelope<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiEnvelope<T>> {
  const headers = new Headers(options.headers);
  const hasBody = options.body !== undefined && options.body !== null;

  if (hasBody && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  const body = await parseJson<unknown>(response).catch(() => undefined);

  if (!response.ok) {
    const parsed = extractError(response.status, body, response.statusText);
    throw new ApiError(response.status, parsed.message, parsed.code);
  }

  if (body && typeof body === "object" && "data" in body) {
    return body as ApiEnvelope<T>;
  }

  return {
    status: "success",
    data: body as T,
  };
}

async function refreshTokens() {
  await requestEnvelope<
    Pick<LoginResponse, "access_token" | "refresh_token" | "token_type" | "expires_in">
  >("/auth/refresh", {
    method: "POST",
  });
}

async function authenticatedEnvelope<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiEnvelope<T>> {
  try {
    return await requestEnvelope<T>(path, options);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    if (!refreshInFlight) {
      refreshInFlight = refreshTokens();
    }

    try {
      await refreshInFlight;
      return await requestEnvelope<T>(path, options);
    } catch (refreshError) {
      clearTokens();
      throw refreshError;
    } finally {
      refreshInFlight = null;
    }
  }
}

async function authData<T>(path: string, options: RequestInit = {}) {
  const envelope = await authenticatedEnvelope<T>(path, options);
  return envelope.data;
}

async function authPage<T>(path: string, options: RequestInit = {}): Promise<PaginatedResult<T>> {
  const envelope = await authenticatedEnvelope<T[]>(path, options);
  return {
    data: envelope.data,
    pagination: envelope.pagination ?? null,
  };
}

function query(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function login(payload: LoginPayload) {
  const envelope = await requestEnvelope<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  cachedUser = envelope.data.user;
  return envelope.data;
}

export async function register(payload: RegisterPayload) {
  const envelope = await requestEnvelope<LoginResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  cachedUser = envelope.data.user;
  return envelope.data;
}

export async function logout() {
  try {
    await requestEnvelope("/auth/logout", {
      method: "POST",
    });
  } catch {
    // Best effort - always clear locally
  }
  clearSession();
}

export async function getCurrentUser() {
  if (cachedUser) return cachedUser;
  const user = await authData<User>("/auth/me");
  cachedUser = user;
  return user;
}

export function getMyOrganization() {
  return authData<Organization>("/organizations/me");
}

export function updateMyOrganization(payload: OrganizationUpdatePayload) {
  return authData<Organization>("/organizations/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function listOrganizationMembers() {
  return authData<OrganizationMember[]>("/organizations/me/members");
}

export function listProjects(params: { page?: number; per_page?: number; search?: string } = {}) {
  return authPage<ProjectListItem>(
    `/projects${query({ page: params.page ?? 1, per_page: params.per_page ?? 20, search: params.search })}`
  );
}

export function createProject(payload: ProjectCreatePayload) {
  return authData<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getProject(projectId: string) {
  return authData<Project>(`/projects/${projectId}`);
}

export function updateProject(projectId: string, payload: ProjectUpdatePayload) {
  return authData<Project>(`/projects/${projectId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteProject(projectId: string) {
  return authData<{ message: string }>(`/projects/${projectId}`, {
    method: "DELETE",
  });
}

export function listArchitectureVersions(projectId: string) {
  return authData<ArchitectureVersion[]>(`/projects/${projectId}/architecture`);
}

export function createArchitectureVersion(
  projectId: string,
  payload: ArchitectureVersionCreatePayload
) {
  return authData<ArchitectureVersion>(`/projects/${projectId}/architecture`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateArchitectureVersionStatus(
  projectId: string,
  versionId: string,
  payload: ArchitectureVersionStatusPayload
) {
  return authData<ArchitectureVersion>(
    `/projects/${projectId}/architecture/${versionId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export function getProjectHealth(projectId: string, versionId?: string) {
  return authData<HealthScoreResponse>(
    `/projects/${projectId}/compliance/health${query({ version_id: versionId })}`
  );
}

export function runComplianceCheck(projectId: string, payload: ComplianceCheckPayload) {
  return authData<ComplianceReport>(`/projects/${projectId}/compliance/check`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function triggerProjectAnalysis(projectId: string, payload: ProjectAnalysisPayload) {
  return authData<ProjectAnalysisResult>(`/projects/${projectId}/analyze`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listComplianceReports(
  projectId: string,
  params: { page?: number; page_size?: number } = {}
) {
  return authPage<ComplianceReport>(
    `/projects/${projectId}/compliance/reports${query({
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
    })}`
  );
}

export function getComplianceReport(projectId: string, reportId: string) {
  return authData<ComplianceReport>(`/projects/${projectId}/compliance/reports/${reportId}`);
}

export function listViolations(
  projectId: string,
  reportId: string,
  params: { page?: number; page_size?: number; severity?: string; violation_type?: string } = {}
) {
  return authPage<Violation>(
    `/projects/${projectId}/compliance/reports/${reportId}/violations${query({
      page: params.page ?? 1,
      page_size: params.page_size ?? 50,
      severity: params.severity,
      violation_type: params.violation_type,
    })}`
  );
}

export function listRules(
  versionId: string,
  params: { rule_type?: string; severity?: string; is_active?: boolean | "all" } = {}
) {
  return authData<Rule[]>(
    `/architecture/${versionId}/rules${query({
      rule_type: params.rule_type,
      severity: params.severity,
      is_active: params.is_active === "all" ? undefined : params.is_active ?? true,
    })}`
  );
}

export function createRule(versionId: string, payload: RuleCreatePayload) {
  return authData<Rule>(`/architecture/${versionId}/rules`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createRulesBatch(versionId: string, payload: RuleBatchCreatePayload) {
  return authData<RuleBatchCreateResponse>(`/architecture/${versionId}/rules/batch`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateRule(versionId: string, ruleId: string, payload: RuleUpdatePayload) {
  return authData<Rule>(`/architecture/${versionId}/rules/${ruleId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deactivateRule(versionId: string, ruleId: string) {
  return authData<{ message: string }>(`/architecture/${versionId}/rules/${ruleId}`, {
    method: "DELETE",
  });
}

export function getArchitectureGraph(versionId: string) {
  return authData<ArchitectureGraph>(`/architecture/${versionId}/graph`);
}

export function createArchitectureComponent(
  versionId: string,
  payload: GraphComponentCreatePayload
) {
  return authData<GraphComponent>(`/architecture/${versionId}/components`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createArchitectureRelationship(
  versionId: string,
  payload: GraphRelationshipCreatePayload
) {
  return authData<GraphRelationship>(`/architecture/${versionId}/relationships`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteArchitectureComponent(versionId: string, componentUid: string) {
  return authData<{ message: string }>(`/architecture/${versionId}/components/${componentUid}`, {
    method: "DELETE",
  });
}

export function deleteArchitectureRelationship(
  versionId: string,
  payload: Pick<GraphRelationshipCreatePayload, "source_uid" | "target_uid" | "type">
) {
  return authData<{ message: string }>(
    `/architecture/${versionId}/relationships${query(payload)}`,
    {
      method: "DELETE",
    }
  );
}

export function listDocuments(
  projectId: string,
  params: { file_type?: string; processing_status?: string; search?: string } = {}
) {
  return authData<UploadedDocument[]>(
    `/projects/${projectId}/documents${query({
      file_type: params.file_type,
      processing_status: params.processing_status,
      search: params.search,
    })}`
  );
}

export async function uploadDocument(
  projectId: string,
  file: File,
  fileType: string,
  description?: string
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("file_type", fileType);
  if (description) formData.append("description", description);

  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/documents/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  const body = await parseJson<unknown>(response).catch(() => undefined);

  if (!response.ok) {
    const parsed = extractError(response.status, body, response.statusText);
    throw new ApiError(response.status, parsed.message, parsed.code);
  }

  return (body as ApiEnvelope<UploadedDocument>).data;
}

export function getDocument(projectId: string, docId: string) {
  return authData<UploadedDocument>(`/projects/${projectId}/documents/${docId}`);
}

export function deleteDocument(projectId: string, docId: string) {
  return authData<{ message: string }>(`/projects/${projectId}/documents/${docId}`, {
    method: "DELETE",
  });
}

export function processDocument(projectId: string, docId: string, force = false) {
  return authData<DocumentProcessResponse>(`/projects/${projectId}/documents/${docId}/process`, {
    method: "POST",
    body: JSON.stringify({ mode: "background", force }),
  });
}

export function getDocumentJobStatus(projectId: string, docId: string) {
  return authData<DocumentJobStatus>(`/projects/${projectId}/documents/${docId}/job`);
}

export function extractRulesFromDocument(
  projectId: string,
  docId: string,
  payload: DocumentAiExtractionPayload
) {
  return authData<AiExtractionResult>(
    `/ai/projects/${projectId}/documents/${docId}/rules/extract`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function applyDiagramHintsFromDocument(
  projectId: string,
  docId: string,
  payload: DocumentDiagramHintsApplyPayload
) {
  return authData<DocumentDiagramHintsApplyResult>(
    `/ai/projects/${projectId}/documents/${docId}/diagram-hints/apply`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function reviewDocumentAiCandidates(
  projectId: string,
  docId: string,
  payload: DocumentAiCandidateReviewPayload
) {
  return authData<DocumentAiCandidateReviewResult>(
    `/ai/projects/${projectId}/documents/${docId}/candidates/review`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function getAnalyticsSummary() {
  return authData<AnalyticsSummary>("/analytics/summary");
}

export function getAnalyticsHistory(days = 14) {
  return authData<AnalyticsHistory>(`/analytics/history${query({ days })}`);
}

export function getDocumentTrends(days = 14) {
  return authData<DocumentTrend>(`/analytics/documents/trends${query({ days })}`);
}

export function getAiCandidateReviewTrend(days = 14, projectId?: string) {
  return authData<AiCandidateReviewTrend>(
    `/analytics/ai-candidate-reviews${query({ days, project_id: projectId })}`
  );
}

export function getWorkerHealth() {
  return authData<WorkerHealth>("/analytics/worker-health");
}

export function getWorkerOpsHints() {
  return authData<WorkerOpsHints>("/analytics/worker-ops");
}

export function getAuditEvents(params: { page?: number; per_page?: number } = {}) {
  return authPage<AuditEvent>(
    `/audit/events${query({ page: params.page ?? 1, per_page: params.per_page ?? 10 })}`
  );
}

export { API_BASE_URL };
