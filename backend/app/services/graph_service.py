"""Neo4j graph service — manages intended & actual architecture graphs."""
from __future__ import annotations

from uuid import uuid4
from typing import Any

from neo4j import AsyncSession as Neo4jSession


# ═══════════════════════════════════════════════════════════════════
# INTENDED GRAPH OPERATIONS
# ═══════════════════════════════════════════════════════════════════

async def create_intended_component(
    session: Neo4jSession,
    *,
    name: str,
    component_type: str,
    layer_level: int | None,
    description: str | None,
    architecture_version_id: str,
    project_id: str,
) -> dict:
    uid = str(uuid4())
    result = await session.run(
        """
        CREATE (c:IntendedComponent {
            uid: $uid,
            name: $name,
            component_type: $component_type,
            layer_level: $layer_level,
            description: $description,
            architecture_version_id: $arch_version_id,
            project_id: $project_id,
            created_at: datetime()
        })
        RETURN c {.uid, .name, .component_type, .layer_level, .description} AS component
        """,
        uid=uid,
        name=name,
        component_type=component_type,
        layer_level=layer_level,
        description=description,
        arch_version_id=architecture_version_id,
        project_id=project_id,
    )
    record = await result.single()
    return record["component"] if record else {}


async def create_intended_components_batch(
    session: Neo4jSession,
    *,
    components: list[dict],
    architecture_version_id: str,
    project_id: str,
) -> list[dict]:
    results = []
    for comp in components:
        r = await create_intended_component(
            session,
            name=comp["name"],
            component_type=comp["component_type"],
            layer_level=comp.get("layer_level"),
            description=comp.get("description"),
            architecture_version_id=architecture_version_id,
            project_id=project_id,
        )
        results.append(r)
    return results


async def create_relationship(
    session: Neo4jSession,
    *,
    source_uid: str,
    target_uid: str,
    rel_type: str,
    architecture_version_id: str,
    properties: dict | None = None,
) -> dict:
    props = properties or {}
    # Dynamic relationship type via APOC or string concat
    # Using a parameterized approach with CASE
    query = f"""
    MATCH (a:IntendedComponent {{uid: $source_uid}})
    MATCH (b:IntendedComponent {{uid: $target_uid}})
    CREATE (a)-[r:{rel_type} {{
        architecture_version_id: $arch_version_id,
        created_at: datetime()
    }}]->(b)
    RETURN type(r) AS type, a.uid AS source_uid, b.uid AS target_uid
    """
    # Add optional properties
    if "rule_id" in props:
        query = f"""
        MATCH (a:IntendedComponent {{uid: $source_uid}})
        MATCH (b:IntendedComponent {{uid: $target_uid}})
        CREATE (a)-[r:{rel_type} {{
            architecture_version_id: $arch_version_id,
            rule_id: $rule_id,
            severity: $severity,
            created_at: datetime()
        }}]->(b)
        RETURN type(r) AS type, a.uid AS source_uid, b.uid AS target_uid
        """

    params = {
        "source_uid": source_uid,
        "target_uid": target_uid,
        "arch_version_id": architecture_version_id,
        **props,
    }

    result = await session.run(query, **params)
    record = await result.single()
    if record:
        return {
            "source_uid": record["source_uid"],
            "target_uid": record["target_uid"],
            "type": record["type"],
        }
    return {}


async def delete_relationship(
    session: Neo4jSession,
    *,
    source_uid: str,
    target_uid: str,
    rel_type: str,
    architecture_version_id: str,
) -> bool:
    result = await session.run(
        f"""
        MATCH (a:IntendedComponent {{uid: $source_uid, architecture_version_id: $version_id}})
        MATCH (b:IntendedComponent {{uid: $target_uid, architecture_version_id: $version_id}})
        MATCH (a)-[r:{rel_type} {{architecture_version_id: $version_id}}]->(b)
        DELETE r
        RETURN count(r) AS deleted
        """,
        source_uid=source_uid,
        target_uid=target_uid,
        version_id=architecture_version_id,
    )
    record = await result.single()
    return record["deleted"] > 0 if record else False


async def get_intended_graph(
    session: Neo4jSession,
    *,
    architecture_version_id: str,
) -> dict:
    """Get all components and relationships for an architecture version."""
    # Get components
    comp_result = await session.run(
        """
        MATCH (c:IntendedComponent {architecture_version_id: $version_id})
        RETURN c {.uid, .name, .component_type, .layer_level, .description} AS component
        ORDER BY c.layer_level ASC, c.name ASC
        """,
        version_id=architecture_version_id,
    )
    components = [record["component"] async for record in comp_result]

    # Get relationships
    rel_result = await session.run(
        """
        MATCH (a:IntendedComponent {architecture_version_id: $version_id})
              -[r]->(b:IntendedComponent {architecture_version_id: $version_id})
        RETURN a.uid AS source_uid, b.uid AS target_uid,
               type(r) AS type, properties(r) AS props
        """,
        version_id=architecture_version_id,
    )
    relationships = []
    async for record in rel_result:
        props = dict(record["props"]) if record["props"] else {}
        # Remove internal props from display
        props.pop("architecture_version_id", None)
        props.pop("created_at", None)
        relationships.append({
            "source_uid": record["source_uid"],
            "target_uid": record["target_uid"],
            "type": record["type"],
            "properties": props,
        })

    return {
        "components": components,
        "relationships": relationships,
        "stats": {
            "total_components": len(components),
            "total_relationships": len(relationships),
        },
    }


async def delete_intended_component(
    session: Neo4jSession,
    *,
    component_uid: str,
) -> bool:
    result = await session.run(
        """
        MATCH (c:IntendedComponent {uid: $uid})
        DETACH DELETE c
        RETURN count(c) AS deleted
        """,
        uid=component_uid,
    )
    record = await result.single()
    return record["deleted"] > 0 if record else False


# ═══════════════════════════════════════════════════════════════════
# ACTUAL GRAPH OPERATIONS (built by static analysis)
# ═══════════════════════════════════════════════════════════════════

async def store_actual_component(
    session: Neo4jSession,
    *,
    name: str,
    component_type: str,
    file_path: str,
    line_number: int | None,
    project_id: str,
    commit_hash: str,
    analysis_id: str,
) -> dict:
    uid = str(uuid4())
    result = await session.run(
        """
        CREATE (c:ActualComponent {
            uid: $uid,
            name: $name,
            component_type: $component_type,
            file_path: $file_path,
            line_number: $line_number,
            project_id: $project_id,
            commit_hash: $commit_hash,
            analysis_id: $analysis_id,
            created_at: datetime()
        })
        RETURN c {.uid, .name, .component_type, .file_path} AS component
        """,
        uid=uid,
        name=name,
        component_type=component_type,
        file_path=file_path,
        line_number=line_number,
        project_id=project_id,
        commit_hash=commit_hash,
        analysis_id=analysis_id,
    )
    record = await result.single()
    return record["component"] if record else {}


async def store_actual_dependency(
    session: Neo4jSession,
    *,
    source_uid: str,
    target_uid: str,
    import_statement: str,
    file_path: str,
    line_number: int,
    commit_hash: str,
    analysis_id: str,
) -> dict:
    result = await session.run(
        """
        MATCH (a:ActualComponent {uid: $source_uid})
        MATCH (b:ActualComponent {uid: $target_uid})
        CREATE (a)-[r:DEPENDS_ON {
            import_statement: $import_stmt,
            file_path: $file_path,
            line_number: $line_number,
            commit_hash: $commit_hash,
            analysis_id: $analysis_id
        }]->(b)
        RETURN a.uid AS source, b.uid AS target
        """,
        source_uid=source_uid,
        target_uid=target_uid,
        import_stmt=import_statement,
        file_path=file_path,
        line_number=line_number,
        commit_hash=commit_hash,
        analysis_id=analysis_id,
    )
    record = await result.single()
    return {"source": record["source"], "target": record["target"]} if record else {}


async def get_actual_graph(
    session: Neo4jSession,
    *,
    project_id: str,
    commit_hash: str,
) -> dict:
    # Components
    comp_result = await session.run(
        """
        MATCH (c:ActualComponent {project_id: $project_id, commit_hash: $commit_hash})
        RETURN c {.uid, .name, .component_type, .file_path} AS component
        ORDER BY c.name
        """,
        project_id=project_id,
        commit_hash=commit_hash,
    )
    components = [record["component"] async for record in comp_result]

    # Dependencies
    dep_result = await session.run(
        """
        MATCH (a:ActualComponent {project_id: $project_id, commit_hash: $commit_hash})
              -[r:DEPENDS_ON]->(b:ActualComponent)
        RETURN a.uid AS source_uid, b.uid AS target_uid,
               r.import_statement AS import_statement,
               r.file_path AS file_path,
               r.line_number AS line_number
        """,
        project_id=project_id,
        commit_hash=commit_hash,
    )
    dependencies = []
    async for record in dep_result:
        dependencies.append({
            "source_uid": record["source_uid"],
            "target_uid": record["target_uid"],
            "import_statement": record["import_statement"],
            "file_path": record["file_path"],
            "line_number": record["line_number"],
        })

    # Detect cycles
    cycle_result = await session.run(
        """
        MATCH path = (c:ActualComponent {project_id: $project_id, commit_hash: $commit_hash})
                     -[:DEPENDS_ON*2..10]->(c)
        RETURN [node IN nodes(path) | node.name] AS cycle_components,
               length(path) AS cycle_length
        LIMIT 50
        """,
        project_id=project_id,
        commit_hash=commit_hash,
    )
    cycles = []
    async for record in cycle_result:
        cycles.append({
            "components": record["cycle_components"],
            "length": record["cycle_length"],
        })

    return {
        "commit_hash": commit_hash,
        "components": components,
        "dependencies": dependencies,
        "cycles": cycles,
        "stats": {
            "total_components": len(components),
            "total_dependencies": len(dependencies),
            "total_cycles": len(cycles),
        },
    }


async def clean_analysis_data(session: Neo4jSession, *, analysis_id: str) -> int:
    result = await session.run(
        """
        MATCH (c:ActualComponent {analysis_id: $analysis_id})
        WITH c, count(c) AS cnt
        DETACH DELETE c
        RETURN cnt AS deleted
        """,
        analysis_id=analysis_id,
    )
    record = await result.single()
    return record["deleted"] if record else 0


# ═══════════════════════════════════════════════════════════════════
# MAPPING (Intended ↔ Actual)
# ═══════════════════════════════════════════════════════════════════

async def create_mapping(
    session: Neo4jSession,
    *,
    intended_uid: str,
    actual_uid: str,
    mapping_type: str = "manual",
    confidence: float = 1.0,
) -> dict:
    result = await session.run(
        """
        MATCH (i:IntendedComponent {uid: $intended_uid})
        MATCH (a:ActualComponent {uid: $actual_uid})
        CREATE (i)-[r:MAPS_TO {
            mapping_type: $mapping_type,
            confidence: $confidence,
            created_at: datetime()
        }]->(a)
        RETURN i.uid AS intended, a.uid AS actual
        """,
        intended_uid=intended_uid,
        actual_uid=actual_uid,
        mapping_type=mapping_type,
        confidence=confidence,
    )
    record = await result.single()
    return {"intended": record["intended"], "actual": record["actual"]} if record else {}


# ═══════════════════════════════════════════════════════════════════
# COMPLIANCE QUERIES
# ═══════════════════════════════════════════════════════════════════

async def detect_forbidden_violations(
    session: Neo4jSession,
    *,
    architecture_version_id: str,
    commit_hash: str,
) -> list[dict]:
    result = await session.run(
        """
        MATCH (fi:IntendedComponent)-[fb:FORBIDDEN_DEPENDENCY {architecture_version_id: $version_id}]->(ti:IntendedComponent)
        MATCH (fi)-[:MAPS_TO]->(fa:ActualComponent {commit_hash: $commit_hash})
        MATCH (ti)-[:MAPS_TO]->(ta:ActualComponent {commit_hash: $commit_hash})
        MATCH (fa)-[dep:DEPENDS_ON]->(ta)
        RETURN fi.name AS forbidden_source,
               ti.name AS forbidden_target,
               fa.name AS actual_source,
               ta.name AS actual_target,
               dep.file_path AS violation_file,
               dep.line_number AS violation_line,
               fb.rule_id AS rule_id,
               fb.severity AS severity
        """,
        version_id=architecture_version_id,
        commit_hash=commit_hash,
    )
    violations = []
    async for record in result:
        violations.append(dict(record))
    return violations


async def detect_missing_dependencies(
    session: Neo4jSession,
    *,
    architecture_version_id: str,
    commit_hash: str,
) -> list[dict]:
    result = await session.run(
        """
        MATCH (ri:IntendedComponent)-[req:REQUIRES {architecture_version_id: $version_id}]->(ti:IntendedComponent)
        MATCH (ri)-[:MAPS_TO]->(ra:ActualComponent {commit_hash: $commit_hash})
        MATCH (ti)-[:MAPS_TO]->(ta:ActualComponent {commit_hash: $commit_hash})
        WHERE NOT EXISTS { MATCH (ra)-[:DEPENDS_ON]->(ta) }
        RETURN ri.name AS source,
               ti.name AS required_target,
               ra.name AS actual_source,
               ta.name AS actual_target,
               req.rule_id AS rule_id
        """,
        version_id=architecture_version_id,
        commit_hash=commit_hash,
    )
    violations = []
    async for record in result:
        violations.append(dict(record))
    return violations


async def detect_layer_violations(
    session: Neo4jSession,
    *,
    architecture_version_id: str,
    commit_hash: str,
) -> list[dict]:
    result = await session.run(
        """
        MATCH (upper:IntendedComponent {architecture_version_id: $version_id})
              -[:LAYER_ABOVE*2..]->(lower:IntendedComponent {architecture_version_id: $version_id})
        WHERE NOT EXISTS {
            MATCH (upper)-[:LAYER_ABOVE]->(lower)
        }
        MATCH (upper)-[:MAPS_TO]->(au:ActualComponent {commit_hash: $commit_hash})
        MATCH (lower)-[:MAPS_TO]->(al:ActualComponent {commit_hash: $commit_hash})
        MATCH (au)-[dep:DEPENDS_ON]->(al)
        RETURN upper.name AS upper_layer,
               lower.name AS lower_layer,
               au.name AS actual_source,
               al.name AS actual_target,
               dep.file_path AS file,
               dep.line_number AS line
        """,
        version_id=architecture_version_id,
        commit_hash=commit_hash,
    )
    violations = []
    async for record in result:
        violations.append(dict(record))
    return violations


async def detect_cycles(
    session: Neo4jSession,
    *,
    project_id: str,
    commit_hash: str,
) -> list[dict]:
    result = await session.run(
        """
        MATCH path = (c:ActualComponent {project_id: $project_id, commit_hash: $commit_hash})
                     -[:DEPENDS_ON*2..8]->(c)
        RETURN [node IN nodes(path) | node.name] AS cycle_components,
               length(path) AS cycle_length
        LIMIT 50
        """,
        project_id=project_id,
        commit_hash=commit_hash,
    )
    cycles = []
    async for record in result:
        cycles.append({
            "components": record["cycle_components"],
            "length": record["cycle_length"],
        })
    return cycles


# ═══════════════════════════════════════════════════════════════════
# INDEX SETUP
# ═══════════════════════════════════════════════════════════════════

async def setup_indexes(session: Neo4jSession) -> None:
    """Create Neo4j indexes on startup."""
    indexes = [
        "CREATE INDEX intended_uid IF NOT EXISTS FOR (c:IntendedComponent) ON (c.uid)",
        "CREATE INDEX intended_version IF NOT EXISTS FOR (c:IntendedComponent) ON (c.architecture_version_id)",
        "CREATE INDEX intended_project IF NOT EXISTS FOR (c:IntendedComponent) ON (c.project_id)",
        "CREATE INDEX actual_uid IF NOT EXISTS FOR (c:ActualComponent) ON (c.uid)",
        "CREATE INDEX actual_project IF NOT EXISTS FOR (c:ActualComponent) ON (c.project_id)",
        "CREATE INDEX actual_commit IF NOT EXISTS FOR (c:ActualComponent) ON (c.commit_hash)",
        "CREATE INDEX actual_analysis IF NOT EXISTS FOR (c:ActualComponent) ON (c.analysis_id)",
    ]
    for idx in indexes:
        await session.run(idx)
