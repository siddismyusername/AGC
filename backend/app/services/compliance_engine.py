"""
Compliance Engine
Compares the intended architecture graph (from Neo4j) with the actual code
dependency graph to detect violations and calculate a health score.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4
import time

from sqlalchemy.ext.asyncio import AsyncSession
from neo4j import AsyncSession as Neo4jSession

from app.models.compliance import ComplianceReport, Violation
from app.services import graph_service


# Scoring weights
SEVERITY_PENALTY = {
    "critical": 10,
    "major": 5,
    "minor": 1,
}


async def run_compliance_check(
    db: AsyncSession,
    neo4j_session: Neo4jSession,
    *,
    project_id: UUID,
    architecture_version_id: UUID,
    commit_hash: str,
    branch: str = "main",
    trigger: str = "manual",
    pipeline_id: UUID | None = None,
    options: dict | None = None,
) -> ComplianceReport:
    """
    Execute a full compliance check:
    1. Load intended architecture graph
    2. Load actual code dependency graph
    3. Run violation detectors
    4. Calculate health score
    5. Store report + violations
    """
    opts = options or {}
    skip_cycles = opts.get("skip_cycle_detection", False)

    # Create initial report record
    report = ComplianceReport(
        project_id=project_id,
        architecture_version_id=architecture_version_id,
        commit_hash=commit_hash,
        branch=branch,
        trigger=trigger,
        pipeline_id=pipeline_id,
        status="running",
        started_at=datetime.now(timezone.utc),
    )
    db.add(report)
    await db.flush()

    start_time = time.time()
    all_violations: list[dict] = []

    try:
        version_id_str = str(architecture_version_id)
        project_id_str = str(project_id)

        # ── 1. Detect forbidden dependency violations ──
        forbidden = await graph_service.detect_forbidden_violations(
            neo4j_session,
            architecture_version_id=version_id_str,
            commit_hash=commit_hash,
        )
        for v in forbidden:
            all_violations.append({
                "violation_type": "forbidden_dependency",
                "severity": v.get("severity", "critical"),
                "source_component": v["forbidden_source"],
                "target_component": v["forbidden_target"],
                "source_file": v.get("violation_file"),
                "source_line": v.get("violation_line"),
                "rule_id": v.get("rule_id"),
                "description": (
                    f"Forbidden dependency: {v['forbidden_source']} → {v['forbidden_target']}. "
                    f"Actual: {v['actual_source']} → {v['actual_target']}"
                ),
                "suggestion": (
                    f"Remove the dependency from {v['actual_source']} to {v['actual_target']}. "
                    f"Consider using an intermediary layer."
                ),
            })

        # ── 2. Detect missing required dependencies ──
        missing = await graph_service.detect_missing_dependencies(
            neo4j_session,
            architecture_version_id=version_id_str,
            commit_hash=commit_hash,
        )
        for v in missing:
            all_violations.append({
                "violation_type": "missing_dependency",
                "severity": "major",
                "source_component": v["source"],
                "target_component": v["required_target"],
                "source_file": None,
                "source_line": None,
                "rule_id": v.get("rule_id"),
                "description": (
                    f"Missing required dependency: {v['source']} should depend on {v['required_target']}."
                ),
                "suggestion": (
                    f"Add a dependency from {v['actual_source']} to {v['actual_target']}."
                ),
            })

        # ── 3. Detect layer skipping ──
        layer_skips = await graph_service.detect_layer_violations(
            neo4j_session,
            architecture_version_id=version_id_str,
            commit_hash=commit_hash,
        )
        for v in layer_skips:
            all_violations.append({
                "violation_type": "layer_skip",
                "severity": "major",
                "source_component": v["upper_layer"],
                "target_component": v["lower_layer"],
                "source_file": v.get("file"),
                "source_line": v.get("line"),
                "rule_id": None,
                "description": (
                    f"Layer skipping: {v['upper_layer']} directly accesses {v['lower_layer']}, "
                    f"bypassing intermediate layers."
                ),
                "suggestion": (
                    f"Route the dependency through the intermediate layers between "
                    f"{v['upper_layer']} and {v['lower_layer']}."
                ),
            })

        # ── 4. Detect cycles ──
        if not skip_cycles:
            cycles = await graph_service.detect_cycles(
                neo4j_session,
                project_id=project_id_str,
                commit_hash=commit_hash,
            )
            for c in cycles:
                cycle_str = " → ".join(c["components"])
                all_violations.append({
                    "violation_type": "cycle",
                    "severity": "critical",
                    "source_component": c["components"][0] if c["components"] else "unknown",
                    "target_component": c["components"][-1] if c["components"] else "unknown",
                    "source_file": None,
                    "source_line": None,
                    "rule_id": None,
                    "description": f"Circular dependency detected: {cycle_str}",
                    "suggestion": (
                        "Break the cycle by introducing an abstraction layer, "
                        "using dependency injection, or restructuring the module boundaries."
                    ),
                })

        # ── 5. Store violations ──
        violation_records = []
        for v_data in all_violations:
            violation = Violation(
                compliance_report_id=report.id,
                rule_id=v_data.get("rule_id"),
                violation_type=v_data["violation_type"],
                severity=v_data["severity"],
                source_component=v_data["source_component"],
                target_component=v_data.get("target_component"),
                source_file=v_data.get("source_file"),
                source_line=v_data.get("source_line"),
                description=v_data["description"],
                suggestion=v_data.get("suggestion"),
            )
            db.add(violation)
            violation_records.append(violation)

        # ── 6. Calculate health score ──
        critical_count = sum(1 for v in all_violations if v["severity"] == "critical")
        major_count = sum(1 for v in all_violations if v["severity"] == "major")
        minor_count = sum(1 for v in all_violations if v["severity"] == "minor")
        total_penalty = (
            critical_count * SEVERITY_PENALTY["critical"]
            + major_count * SEVERITY_PENALTY["major"]
            + minor_count * SEVERITY_PENALTY["minor"]
        )
        health_score = max(0.0, 100.0 - total_penalty)

        # ── 7. Update report ──
        execution_time = int((time.time() - start_time) * 1000)
        report.status = "passed" if len(all_violations) == 0 else "failed"
        report.health_score = health_score
        report.total_violations = len(all_violations)
        report.critical_count = critical_count
        report.major_count = major_count
        report.minor_count = minor_count
        report.execution_time_ms = execution_time
        report.completed_at = datetime.now(timezone.utc)
        report.summary = {
            "scoring_breakdown": {
                "base_score": 100,
                "critical_penalty": -(critical_count * SEVERITY_PENALTY["critical"]),
                "major_penalty": -(major_count * SEVERITY_PENALTY["major"]),
                "minor_penalty": -(minor_count * SEVERITY_PENALTY["minor"]),
                "final_score": health_score,
            },
            "violation_summary": {
                "total": len(all_violations),
                "by_severity": {
                    "critical": critical_count,
                    "major": major_count,
                    "minor": minor_count,
                },
                "by_type": _count_by_type(all_violations),
            },
        }

        # Check fail conditions
        fail_on_critical = opts.get("fail_on_critical", True)
        fail_on_major = opts.get("fail_on_major", False)
        if fail_on_critical and critical_count > 0:
            report.status = "failed"
        elif fail_on_major and major_count > 0:
            report.status = "failed"
        elif len(all_violations) == 0:
            report.status = "passed"

        await db.commit()
        await db.refresh(report)
        return report

    except Exception as e:
        report.status = "error"
        report.completed_at = datetime.now(timezone.utc)
        report.execution_time_ms = int((time.time() - start_time) * 1000)
        report.summary = {"error": str(e)}
        await db.commit()
        raise


def _count_by_type(violations: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for v in violations:
        vtype = v["violation_type"]
        counts[vtype] = counts.get(vtype, 0) + 1
    return counts
