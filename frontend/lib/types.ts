export interface ApiMeta {
  request_id: string;
  timestamp: string;
}

export interface ApiPagination {
  page: number;
  per_page: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ApiEnvelope<T> {
  status: "success" | "error";
  data: T;
  meta?: ApiMeta;
  pagination?: ApiPagination;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: ApiPagination | null;
}

export type UserRole = "admin" | "architect" | "developer" | "devops" | "viewer";

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  organization_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  full_name: string;
  organization_name: string;
}

export interface LoginResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in: number;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  members_count: number;
  projects_count: number;
}

export interface OrganizationUpdatePayload {
  name?: string | null;
  description?: string | null;
}

export interface OrganizationMember {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole | string;
  is_active: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repository_url: string | null;
  default_branch: string;
  language: string;
  organization_id: string | null;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ProjectListItem = Pick<
  Project,
  "id" | "name" | "description" | "language" | "is_active" | "created_at"
>;

export interface ProjectCreatePayload {
  name: string;
  description?: string | null;
  repository_url?: string | null;
  default_branch?: string;
  language?: string;
}

export type ProjectUpdatePayload = Partial<
  Pick<ProjectCreatePayload, "name" | "description" | "repository_url" | "default_branch">
>;

export type ArchStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "active"
  | "deprecated";

export interface ArchitectureVersion {
  id: string;
  project_id: string;
  version_number: number;
  status: ArchStatus;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
}

export interface ArchitectureVersionCreatePayload {
  description?: string | null;
}

export interface ArchitectureVersionStatusPayload {
  status: ArchStatus;
}

export type RuleType =
  | "forbidden_dependency"
  | "required_dependency"
  | "layer_constraint"
  | "cycle_prohibition"
  | "naming_convention"
  | "custom";

export type Severity = "critical" | "major" | "minor";

export interface Rule {
  id: string;
  architecture_version_id: string;
  rule_text: string;
  rule_type: RuleType;
  source_component: string | null;
  target_component: string | null;
  severity: Severity;
  is_ai_generated: boolean;
  confidence_score: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface RuleCreatePayload {
  rule_text: string;
  rule_type: RuleType;
  source_component?: string | null;
  target_component?: string | null;
  severity: Severity;
}

export interface RuleBatchCreatePayload {
  rules: RuleCreatePayload[];
}

export interface RuleBatchCreateResponse {
  created_count: number;
  rules: Rule[];
}

export interface RuleUpdatePayload {
  rule_text?: string;
  severity?: Severity;
  is_active?: boolean;
}

export type ComponentType =
  | "service"
  | "layer"
  | "module"
  | "database"
  | "ui"
  | "api"
  | "gateway"
  | "external"
  | "queue";

export type RelationshipType =
  | "ALLOWED_DEPENDENCY"
  | "FORBIDDEN_DEPENDENCY"
  | "REQUIRES"
  | "LAYER_ABOVE";

export interface GraphComponent {
  uid: string;
  name: string;
  component_type: ComponentType | string;
  layer_level: number | null;
  description: string | null;
}

export interface GraphComponentCreatePayload {
  name: string;
  component_type: ComponentType;
  layer_level?: number | null;
  description?: string | null;
}

export interface GraphRelationship {
  id?: string | null;
  source_uid: string;
  target_uid: string;
  type: RelationshipType | string;
  properties: Record<string, unknown>;
}

export interface GraphRelationshipCreatePayload {
  source_uid: string;
  target_uid: string;
  type: RelationshipType;
  rule_id?: string | null;
}

export interface ArchitectureGraph {
  components: GraphComponent[];
  relationships: GraphRelationship[];
  stats: {
    total_components?: number;
    total_relationships?: number;
    [key: string]: number | undefined;
  };
}

export interface ComplianceOptions {
  fail_on_critical: boolean;
  fail_on_major: boolean;
  skip_cycle_detection: boolean;
  auto_analyze: boolean;
}

export interface ComplianceCheckPayload {
  commit_hash: string;
  branch: string;
  architecture_version_id?: string | null;
  trigger: "manual" | "ci_cd" | "scheduled";
  options?: ComplianceOptions;
}

export interface ComplianceReport {
  id: string;
  project_id: string;
  architecture_version_id: string;
  commit_hash: string | null;
  branch: string | null;
  trigger: string;
  status: string;
  health_score: number | null;
  total_violations: number;
  critical_count: number;
  major_count: number;
  minor_count: number;
  execution_time_ms: number | null;
  summary: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Violation {
  id: string;
  compliance_report_id: string;
  rule_id: string | null;
  violation_type: string;
  severity: Severity | string;
  source_component: string;
  target_component: string | null;
  source_file: string | null;
  source_line: number | null;
  description: string;
  suggestion: string | null;
  created_at: string;
}

export interface HealthScoreResponse {
  health_score: number | null;
  total_violations: number;
  critical_count: number;
  major_count: number;
  minor_count: number;
  info_count: number;
  report_id: string | null;
  checked_at: string | null;
}

export type ProcessingStatus =
  | "pending"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface UploadedDocument {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  content_type: string | null;
  file_size_bytes: number;
  storage_key: string | null;
  description: string | null;
  processing_status: ProcessingStatus;
  extracted_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentProcessResponse {
  document_id: string;
  processing_status: ProcessingStatus;
  queue_backend?: string;
}

export interface DocumentJobStatus {
  document_id: string;
  processing_status: ProcessingStatus;
  queue_backend?: string;
  retry_count?: number;
  last_error?: string | null;
}

export interface AiRuleCandidate {
  rule_text: string;
  rule_type: RuleType | string;
  source_component?: string | null;
  target_component?: string | null;
  severity: Severity | string;
  confidence?: number | null;
  model_version?: string | null;
}

export interface AiEntityCandidate {
  text: string;
  label: string;
  start?: number | null;
  end?: number | null;
  confidence?: number | null;
}

export interface AiRelationshipCandidate {
  source: string;
  target: string;
  relation: string;
  confidence?: number | null;
}

export interface DocumentAiExtractionPayload {
  architecture_version_id: string;
  auto_create_rules?: boolean;
  persist_candidates?: boolean;
}

export interface DiagramHintRelationshipSelection {
  source: string;
  target: string;
  relation?: string;
}

export interface DocumentDiagramHintsApplyPayload {
  architecture_version_id: string;
  persist_applied_metadata?: boolean;
  selected_components?: string[] | null;
  selected_relationships?: DiagramHintRelationshipSelection[] | null;
  review_note?: string | null;
}

export interface DocumentAiCandidateReviewPayload {
  architecture_version_id: string;
  accepted_rule_indexes: number[];
  rejected_rule_indexes: number[];
  accepted_entity_indexes: number[];
  rejected_entity_indexes: number[];
  accepted_relationship_indexes: number[];
  rejected_relationship_indexes: number[];
  review_note?: string | null;
}

export interface AiExtractionResult {
  summary: string;
  keywords?: string[];
  extracted_rules?: AiRuleCandidate[];
  entities?: AiEntityCandidate[];
  relationships?: AiRelationshipCandidate[];
  processing_time_ms?: number;
  model_info?: Record<string, unknown>;
  architecture_version_id?: string;
  project_id?: string;
  document_id?: string;
  file_name?: string;
  file_type?: string;
  input_source_fields?: string[];
  created_rule_ids?: string[];
}

export interface DocumentAiCandidateReviewResult {
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
}

export interface DocumentDiagramHintsApplyResult {
  project_id: string;
  document_id: string;
  architecture_version_id: string;
  created_components_count: number;
  created_relationships_count: number;
  skipped_relationships_count: number;
  component_name_to_uid: Record<string, string>;
}

export interface ProjectAnalysisOptionsPayload {
  include_patterns?: string[];
  exclude_patterns?: string[];
  max_depth?: number;
}

export interface ProjectAnalysisPayload {
  architecture_version_id: string;
  repository_path: string;
  commit_hash: string;
  branch: string;
  repository_url?: string | null;
  analysis_scope?: string;
  options?: ProjectAnalysisOptionsPayload;
}

export interface ProjectAnalysisResult {
  status: string;
  architecture_version_id: string;
  stats: Record<string, unknown>;
  module_count: number;
  dependency_count: number;
  cycles: unknown[];
}

export interface AnalyticsSummary {
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
}

export interface AnalyticsHistoryPoint {
  bucket_start: string;
  average_health_score: number;
  reports_count: number;
  critical_violations: number;
}

export interface AnalyticsHistory {
  days: number;
  points: AnalyticsHistoryPoint[];
}

export interface DocumentTrendPoint {
  bucket_start: string;
  uploaded_count: number;
  completed_count: number;
  failed_count: number;
  processing_count: number;
  success_rate_percent: number | null;
  failure_rate_percent: number | null;
}

export interface DocumentTrend {
  days: number;
  points: DocumentTrendPoint[];
}

export interface AiCandidateReviewTrendPoint {
  bucket_start: string;
  review_count: number;
  reviewed_documents: number;
  accepted_candidates: number;
  rejected_candidates: number;
  acceptance_rate_percent: number | null;
}

export interface AiCandidateReviewTrend {
  days: number;
  points: AiCandidateReviewTrendPoint[];
}

export interface WorkerHealth {
  queue_backend: string;
  redis_status: string;
  redis_latency_ms: number | null;
  celery_worker_count: number;
  worker_status: string;
  checked_at: string;
}

export interface WorkerOpsHints {
  retryable_dead_letters?: number;
  failed_documents?: number;
  queue_backend?: string;
  [key: string]: unknown;
}

export interface AuditEvent {
  id: string;
  user_id: string | null;
  user_email?: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}
