"""initial schema

Revision ID: 20260416_0001
Revises: 
Create Date: 2026-04-16 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260416_0001"
down_revision = None
branch_labels = None
depends_on = None


user_role = postgresql.ENUM("admin", "architect", "developer", "devops", "viewer", name="user_role", create_type=False)
arch_status = postgresql.ENUM(
    "draft", "under_review", "approved", "active", "deprecated", name="arch_status", create_type=False
)
rule_type = postgresql.ENUM(
    "forbidden_dependency",
    "required_dependency",
    "layer_constraint",
    "cycle_prohibition",
    "naming_convention",
    "custom",
    name="rule_type",
    create_type=False,
)
severity_level = postgresql.ENUM("critical", "major", "minor", name="severity_level", create_type=False)
trigger_type = postgresql.ENUM("manual", "ci_cd", "scheduled", name="trigger_type", create_type=False)
report_status = postgresql.ENUM("pending", "running", "passed", "failed", "error", name="report_status", create_type=False)
violation_type = postgresql.ENUM(
    "forbidden_dependency",
    "missing_dependency",
    "layer_skip",
    "cycle",
    "naming_violation",
    "unauthorized_access",
    name="violation_type",
    create_type=False,
)
ci_provider = postgresql.ENUM("github_actions", "gitlab_ci", "jenkins", "custom", name="ci_provider", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    for enum_type in [user_role, arch_status, rule_type, severity_level, trigger_type, report_status, violation_type, ci_provider]:
        enum_type.create(bind, checkfirst=True)

    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_organizations_slug"),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("replaced_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["replaced_by"], ["refresh_tokens.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("repository_url", sa.String(length=2048), nullable=True),
        sa.Column("default_branch", sa.String(length=255), nullable=False),
        sa.Column("language", sa.String(length=50), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "architecture_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", arch_status, nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "version_number", name="uq_architecture_versions_project_version"),
    )

    op.create_table(
        "architecture_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("architecture_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule_text", sa.Text(), nullable=False),
        sa.Column("rule_type", rule_type, nullable=False),
        sa.Column("source_component", sa.String(length=255), nullable=True),
        sa.Column("target_component", sa.String(length=255), nullable=True),
        sa.Column("severity", severity_level, nullable=False),
        sa.Column("is_ai_generated", sa.Boolean(), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["architecture_version_id"], ["architecture_versions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "pipelines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("provider", ci_provider, nullable=False),
        sa.Column("webhook_secret", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "compliance_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("architecture_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("pipeline_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("commit_hash", sa.String(length=40), nullable=True),
        sa.Column("branch", sa.String(length=255), nullable=True),
        sa.Column("trigger", trigger_type, nullable=False),
        sa.Column("status", report_status, nullable=False),
        sa.Column("health_score", sa.Float(), nullable=True),
        sa.Column("total_violations", sa.Integer(), nullable=False),
        sa.Column("critical_count", sa.Integer(), nullable=False),
        sa.Column("major_count", sa.Integer(), nullable=False),
        sa.Column("minor_count", sa.Integer(), nullable=False),
        sa.Column("execution_time_ms", sa.Integer(), nullable=True),
        sa.Column("summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["architecture_version_id"], ["architecture_versions.id"]),
        sa.ForeignKeyConstraint(["pipeline_id"], ["pipelines.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "violations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("compliance_report_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("violation_type", violation_type, nullable=False),
        sa.Column("severity", severity_level, nullable=False),
        sa.Column("source_component", sa.String(length=255), nullable=False),
        sa.Column("target_component", sa.String(length=255), nullable=True),
        sa.Column("source_file", sa.String(length=1024), nullable=True),
        sa.Column("source_line", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("suggestion", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["compliance_report_id"], ["compliance_reports.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rule_id"], ["architecture_rules.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "ci_cd_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("permissions", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("old_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_users_organization_id", "users", ["organization_id"])
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])
    op.create_index("ix_projects_organization_id", "projects", ["organization_id"])
    op.create_index("ix_projects_created_by", "projects", ["created_by"])
    op.create_index("ix_architecture_versions_project_id", "architecture_versions", ["project_id"])
    op.create_index("ix_architecture_rules_architecture_version_id", "architecture_rules", ["architecture_version_id"])
    op.create_index("ix_compliance_reports_project_id", "compliance_reports", ["project_id"])
    op.create_index("ix_compliance_reports_commit_hash", "compliance_reports", ["commit_hash"])
    op.create_index("ix_violations_compliance_report_id", "violations", ["compliance_report_id"])
    op.create_index("ix_violations_rule_id", "violations", ["rule_id"])
    op.create_index("ix_pipelines_project_id", "pipelines", ["project_id"])
    op.create_index("ix_ci_cd_tokens_project_id", "ci_cd_tokens", ["project_id"])
    op.create_index("ix_ci_cd_tokens_token_hash", "ci_cd_tokens", ["token_hash"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_ci_cd_tokens_token_hash", table_name="ci_cd_tokens")
    op.drop_index("ix_ci_cd_tokens_project_id", table_name="ci_cd_tokens")
    op.drop_index("ix_pipelines_project_id", table_name="pipelines")
    op.drop_index("ix_violations_rule_id", table_name="violations")
    op.drop_index("ix_violations_compliance_report_id", table_name="violations")
    op.drop_index("ix_compliance_reports_commit_hash", table_name="compliance_reports")
    op.drop_index("ix_compliance_reports_project_id", table_name="compliance_reports")
    op.drop_index("ix_architecture_rules_architecture_version_id", table_name="architecture_rules")
    op.drop_index("ix_architecture_versions_project_id", table_name="architecture_versions")
    op.drop_index("ix_projects_created_by", table_name="projects")
    op.drop_index("ix_projects_organization_id", table_name="projects")
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_index("ix_users_organization_id", table_name="users")

    op.drop_table("audit_logs")
    op.drop_table("ci_cd_tokens")
    op.drop_table("violations")
    op.drop_table("compliance_reports")
    op.drop_table("pipelines")
    op.drop_table("architecture_rules")
    op.drop_table("architecture_versions")
    op.drop_table("projects")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.drop_table("organizations")

    bind = op.get_bind()
    for enum_type in [ci_provider, violation_type, report_status, trigger_type, severity_level, rule_type, arch_status, user_role]:
        enum_type.drop(bind, checkfirst=True)