// ── Auth / Users ──

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "architect" | "developer" | "viewer";
  organization_id: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Projects ──

export interface Project {
  id: string;
  name: string;
  description: string | null;
  repository_url: string | null;
  default_branch: string;
  language: string | null;
  organization_id: string | null;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Architecture ──

export type ArchStatus = "draft" | "under_review" | "approved" | "active" | "deprecated";

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

// ── Rules ──

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
  description: string | null;
  severity: Severity;
  is_ai_generated: boolean;
  confidence_score: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

// ── Graph ──

export interface GraphComponent {
  uid: string;
  name: string;
  component_type: string;
  layer_level: number | null;
  description: string | null;
}

export interface GraphRelationship {
  source_uid: string;
  target_uid: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface ArchitectureGraph {
  components: GraphComponent[];
  relationships: GraphRelationship[];
  stats: {
    total_components: number;
    total_relationships: number;
  };
}

// ── Documents ──

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

// ── Compliance ──

export interface ComplianceReport {
  id: string;
  project_id: string;
  version_id: string;
  health_score: number;
  total_violations: number;
  critical_violations: number;
  major_violations: number;
  minor_violations: number;
  created_at: string;
}

export interface Violation {
  id: string;
  report_id: string;
  rule_id: string;
  rule_type: RuleType;
  severity: Severity;
  source_component: string;
  target_component: string;
  description: string;
  remediation: string | null;
}

export interface HealthScoreResponse {
  current_score: number;
  previous_score: number | null;
  trend: string;
  delta: number;
  last_check: string;
}

// ── Analytics ──

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

// ── Audit ──

export interface AuditEvent {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}
