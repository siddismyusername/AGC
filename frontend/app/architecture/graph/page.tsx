"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Network, RefreshCw } from 'lucide-react';

import RouteGuard from '../../../components/route-guard';
import {
  ArchitectureVersionOut,
  createArchitectureComponent,
  deleteArchitectureRelationship,
  createArchitectureRelationship,
  deleteArchitectureComponent,
  GraphComponentCreatePayload,
  GraphRelationshipCreatePayload,
  GraphOut,
  getArchitectureGraph,
  getArchitectureVersions,
  getProjects,
  ProjectListItem,
} from '../../../lib/api';

export default function GraphExplorerPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [versions, setVersions] = useState<ArchitectureVersionOut[]>([]);
  const [graph, setGraph] = useState<GraphOut | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');

  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);
  const [isSubmittingComponent, setIsSubmittingComponent] = useState(false);
  const [isSubmittingRelationship, setIsSubmittingRelationship] = useState(false);
  const [deletingComponentUid, setDeletingComponentUid] = useState<string | null>(null);
  const [selectedRelationshipKey, setSelectedRelationshipKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [componentForm, setComponentForm] = useState<GraphComponentCreatePayload>({
    name: '',
    component_type: 'service',
    description: '',
  });

  const [relationshipForm, setRelationshipForm] = useState<GraphRelationshipCreatePayload>({
    source_uid: '',
    target_uid: '',
    type: 'ALLOWED_DEPENDENCY',
  });

  const componentNameMap = useMemo(() => {
    const pairs = graph?.components.map((component) => [component.uid, component.name] as [string, string]) ?? [];
    return new Map<string, string>(pairs);
  }, [graph]);

  const selectedRelationship = useMemo(
    () => graph?.relationships.find((relationship) => {
      const key = `${relationship.source_uid}:${relationship.target_uid}:${relationship.type}`;
      return key === selectedRelationshipKey;
    }) ?? null,
    [graph, selectedRelationshipKey],
  );

  const validationHints = useMemo(() => {
    const hints: string[] = [];

    if (!selectedVersionId) {
      hints.push('Select an architecture version to enable graph edits.');
    }
    if (!graph?.components.length) {
      hints.push('Create at least one component before adding relationships.');
    }
    if (relationshipForm.source_uid && relationshipForm.target_uid && relationshipForm.source_uid === relationshipForm.target_uid) {
      hints.push('Self-referential relationships are usually a modeling smell. Verify this intentionally.');
    }
    if (graph?.relationships.some((relationship) =>
      relationship.source_uid === relationshipForm.source_uid
      && relationship.target_uid === relationshipForm.target_uid
      && relationship.type === relationshipForm.type,
    )) {
      hints.push('A relationship with the same source, target, and type already exists. Editing will replace it.');
    }

    return hints;
  }, [graph, relationshipForm.source_uid, relationshipForm.target_uid, relationshipForm.type, selectedVersionId]);

  async function loadProjects() {
    setIsLoadingProjects(true);
    setErrorMessage(null);

    try {
      const activeProjects = (await getProjects()).filter((project) => project.is_active);
      setProjects(activeProjects);

      if (activeProjects.length === 0) {
        setVersions([]);
        setGraph(null);
        setSelectedProjectId('');
        setSelectedVersionId('');
        return;
      }

      const nextProjectId = selectedProjectId || activeProjects[0].id;
      setSelectedProjectId(nextProjectId);
      await loadVersions(nextProjectId, true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load projects.');
      setProjects([]);
      setVersions([]);
      setGraph(null);
    } finally {
      setIsLoadingProjects(false);
    }
  }

  async function loadVersions(projectId: string, preloadGraph = false) {
    setIsLoadingVersions(true);
    setErrorMessage(null);

    try {
      const versionList = await getArchitectureVersions(projectId);
      setVersions(versionList);

      if (versionList.length === 0) {
        setGraph(null);
        setSelectedVersionId('');
        return;
      }

      const nextVersionId = preloadGraph
        ? selectedVersionId || versionList[0].id
        : versionList[0].id;
      setSelectedVersionId(nextVersionId);
      await loadGraph(nextVersionId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load architecture versions.');
      setVersions([]);
      setGraph(null);
      setSelectedVersionId('');
    } finally {
      setIsLoadingVersions(false);
    }
  }

  async function loadGraph(versionId: string) {
    setIsLoadingGraph(true);
    setErrorMessage(null);

    try {
      const graphData = await getArchitectureGraph(versionId);
      setGraph(graphData);
      if (!relationshipForm.source_uid && graphData.components.length > 0) {
        setRelationshipForm((prev) => ({
          ...prev,
          source_uid: graphData.components[0].uid,
          target_uid: graphData.components[0].uid,
        }));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load architecture graph.');
      setGraph(null);
    } finally {
      setIsLoadingGraph(false);
    }
  }

  useEffect(() => {
    void loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateComponent() {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedVersionId) {
      setErrorMessage('Select an architecture version before creating components.');
      return;
    }

    if (!componentForm.name.trim()) {
      setErrorMessage('Component name is required.');
      return;
    }

    setIsSubmittingComponent(true);
    try {
      await createArchitectureComponent(selectedVersionId, {
        name: componentForm.name.trim(),
        component_type: componentForm.component_type,
        description: componentForm.description?.trim() || undefined,
        layer_level: componentForm.layer_level,
      });
      setSuccessMessage('Component created successfully.');
      setComponentForm((prev) => ({ ...prev, name: '', description: '' }));
      await loadGraph(selectedVersionId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create component.');
    } finally {
      setIsSubmittingComponent(false);
    }
  }

  async function handleCreateRelationship() {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedVersionId) {
      setErrorMessage('Select an architecture version before creating relationships.');
      return;
    }

    if (!relationshipForm.source_uid || !relationshipForm.target_uid) {
      setErrorMessage('Source and target components are required for relationships.');
      return;
    }

    setIsSubmittingRelationship(true);
    try {
      await createArchitectureRelationship(selectedVersionId, {
        source_uid: relationshipForm.source_uid,
        target_uid: relationshipForm.target_uid,
        type: relationshipForm.type,
      });
      setSuccessMessage('Relationship created successfully.');
      await loadGraph(selectedVersionId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create relationship.');
    } finally {
      setIsSubmittingRelationship(false);
    }
  }

  async function handleSaveRelationship() {
    if (!selectedVersionId) {
      setErrorMessage('Select an architecture version before editing relationships.');
      return;
    }

    const original = selectedRelationship;
    if (!original) {
      setErrorMessage('Choose a relationship from the list first.');
      return;
    }

    setIsSubmittingRelationship(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await deleteArchitectureRelationship(selectedVersionId, {
        source_uid: original.source_uid,
        target_uid: original.target_uid,
        type: original.type as GraphRelationshipCreatePayload['type'],
      });
      await createArchitectureRelationship(selectedVersionId, relationshipForm);
      setSuccessMessage('Relationship updated successfully.');
      setSelectedRelationshipKey(null);
      await loadGraph(selectedVersionId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update relationship.');
    } finally {
      setIsSubmittingRelationship(false);
    }
  }

  async function handleDeleteRelationship(relationship: GraphRelationshipCreatePayload) {
    if (!selectedVersionId) {
      setErrorMessage('Select an architecture version before deleting relationships.');
      return;
    }

    setIsSubmittingRelationship(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await deleteArchitectureRelationship(selectedVersionId, relationship);
      setSuccessMessage('Relationship deleted successfully.');
      if (selectedRelationshipKey === `${relationship.source_uid}:${relationship.target_uid}:${relationship.type}`) {
        setSelectedRelationshipKey(null);
      }
      await loadGraph(selectedVersionId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete relationship.');
    } finally {
      setIsSubmittingRelationship(false);
    }
  }

  async function handleDeleteComponent(componentUid: string) {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedVersionId) {
      setErrorMessage('Select an architecture version before deleting components.');
      return;
    }

    setDeletingComponentUid(componentUid);
    try {
      await deleteArchitectureComponent(selectedVersionId, componentUid);
      setSuccessMessage('Component deleted successfully.');
      await loadGraph(selectedVersionId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete component.');
    } finally {
      setDeletingComponentUid(null);
    }
  }

  return (
    <RouteGuard>
      <main className="mx-auto min-h-screen max-w-7xl px-6 py-8 lg:px-10">
        <div className="space-y-8">
          <header className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">FR-13 graph explorer</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Architecture graph</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Explore intended architecture components and relationships from Neo4j by project version.
                </p>
              </div>
              <div className="inline-flex items-center gap-3">
                <Link
                  href="/architecture/rules"
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/10"
                >
                  Open rule editor
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedVersionId) {
                      void loadGraph(selectedVersionId);
                    } else {
                      void loadProjects();
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/10"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-slate-300">
                Project
                <select
                  value={selectedProjectId}
                  onChange={(event) => {
                    const projectId = event.target.value;
                    setSelectedProjectId(projectId);
                    void loadVersions(projectId);
                  }}
                  disabled={isLoadingProjects || projects.length === 0}
                  className="rounded-2xl border border-white/15 bg-slate-950/80 px-4 py-3 text-white outline-none"
                >
                  {projects.length === 0 ? <option value="">No active projects</option> : null}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-300">
                Architecture version
                <select
                  value={selectedVersionId}
                  onChange={(event) => {
                    const versionId = event.target.value;
                    setSelectedVersionId(versionId);
                    void loadGraph(versionId);
                  }}
                  disabled={isLoadingVersions || versions.length === 0}
                  className="rounded-2xl border border-white/15 bg-slate-950/80 px-4 py-3 text-white outline-none"
                >
                  {versions.length === 0 ? <option value="">No versions found</option> : null}
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      v{version.version_number} - {version.status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {errorMessage ? (
              <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {errorMessage}
              </p>
            ) : null}
            {successMessage ? (
              <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {successMessage}
              </p>
            ) : null}
          </header>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-teal-400/10 p-3 text-teal-300">
                  <Network className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/45">Components</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Node inventory</h2>
                </div>
              </div>

              {isLoadingGraph ? (
                <p className="mt-5 text-sm text-slate-300">Loading graph data...</p>
              ) : graph?.components.length ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {graph.components.map((component) => (
                    <div key={component.uid} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-sm uppercase tracking-[0.2em] text-white/45">{component.component_type}</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">{component.name}</h3>
                      <p className="mt-2 text-xs text-slate-400">UID: {component.uid}</p>
                      {component.layer_level !== null ? (
                        <p className="mt-2 text-xs text-amber-200">Layer level: {component.layer_level}</p>
                      ) : null}
                      {component.description ? (
                        <p className="mt-2 text-sm text-slate-300">{component.description}</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleDeleteComponent(component.uid)}
                        disabled={deletingComponentUid === component.uid}
                        className="mt-3 rounded-lg border border-rose-300/30 bg-rose-400/10 px-2 py-1 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingComponentUid === component.uid ? 'Deleting...' : 'Delete component'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                  No components found for this architecture version.
                </p>
              )}
            </article>

            <aside className="space-y-6">
              <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6">
                <p className="text-sm uppercase tracking-[0.3em] text-white/45">Graph stats</p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total components</p>
                    <p className="mt-1 text-3xl font-semibold text-white">{graph?.stats.total_components ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total relationships</p>
                    <p className="mt-1 text-3xl font-semibold text-white">{graph?.stats.total_relationships ?? 0}</p>
                  </div>
                </div>
              </article>

              <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6">
                <p className="text-sm uppercase tracking-[0.3em] text-white/45">Edit graph</p>

                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
                  <p className="font-semibold">Validation hints</p>
                  {validationHints.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {validationHints.map((hint) => (
                        <li key={hint}>• {hint}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-emerald-100">Graph edit form looks valid.</p>
                  )}
                </div>

                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-white">Create component</p>
                    <input
                      value={componentForm.name}
                      onChange={(event) => setComponentForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Component name"
                      className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={componentForm.component_type}
                        onChange={(event) => setComponentForm((prev) => ({ ...prev, component_type: event.target.value as GraphComponentCreatePayload['component_type'] }))}
                        className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      >
                        <option value="service">service</option>
                        <option value="layer">layer</option>
                        <option value="module">module</option>
                        <option value="database">database</option>
                        <option value="ui">ui</option>
                        <option value="api">api</option>
                        <option value="gateway">gateway</option>
                        <option value="external">external</option>
                        <option value="queue">queue</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        value={componentForm.layer_level ?? ''}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          setComponentForm((prev) => ({
                            ...prev,
                            layer_level: Number.isNaN(parsed) ? undefined : parsed,
                          }));
                        }}
                        placeholder="Layer"
                        className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      />
                    </div>
                    <input
                      value={componentForm.description ?? ''}
                      onChange={(event) => setComponentForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="Description (optional)"
                      className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCreateComponent()}
                      disabled={isSubmittingComponent || !selectedVersionId}
                      className="rounded-xl bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmittingComponent ? 'Creating...' : 'Create component'}
                    </button>
                  </div>

                  <div className="space-y-2 border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">Create or edit relationship</p>
                      {selectedRelationship ? (
                        <button
                          type="button"
                          onClick={() => {
                            setRelationshipForm({
                              source_uid: selectedRelationship.source_uid,
                              target_uid: selectedRelationship.target_uid,
                              type: selectedRelationship.type as GraphRelationshipCreatePayload['type'],
                            });
                          }}
                          className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 transition hover:bg-white/10"
                        >
                          Load selected
                        </button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={relationshipForm.source_uid}
                        onChange={(event) => setRelationshipForm((prev) => ({ ...prev, source_uid: event.target.value }))}
                        className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      >
                        {graph?.components.length ? graph.components.map((component) => (
                          <option key={`src-${component.uid}`} value={component.uid}>{component.name}</option>
                        )) : <option value="">No components</option>}
                      </select>
                      <select
                        value={relationshipForm.target_uid}
                        onChange={(event) => setRelationshipForm((prev) => ({ ...prev, target_uid: event.target.value }))}
                        className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      >
                        {graph?.components.length ? graph.components.map((component) => (
                          <option key={`tgt-${component.uid}`} value={component.uid}>{component.name}</option>
                        )) : <option value="">No components</option>}
                      </select>
                    </div>
                    <select
                      value={relationshipForm.type}
                      onChange={(event) => setRelationshipForm((prev) => ({ ...prev, type: event.target.value as GraphRelationshipCreatePayload['type'] }))}
                      className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="ALLOWED_DEPENDENCY">ALLOWED_DEPENDENCY</option>
                      <option value="FORBIDDEN_DEPENDENCY">FORBIDDEN_DEPENDENCY</option>
                      <option value="REQUIRES">REQUIRES</option>
                      <option value="LAYER_ABOVE">LAYER_ABOVE</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => (selectedRelationship ? void handleSaveRelationship() : void handleCreateRelationship())}
                      disabled={isSubmittingRelationship || !selectedVersionId || !graph?.components.length}
                      className="rounded-xl bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmittingRelationship ? 'Working...' : selectedRelationship ? 'Save relationship' : 'Create relationship'}
                    </button>
                  </div>
                </div>
              </article>

              <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
                <p className="text-sm uppercase tracking-[0.3em] text-white/45">Relationships</p>
                {isLoadingGraph ? (
                  <p className="mt-4 text-sm text-slate-300">Loading relationship map...</p>
                ) : graph?.relationships.length ? (
                  <ul className="mt-4 space-y-3">
                    {graph.relationships.map((relationship, index) => (
                      <li key={`${relationship.source_uid}-${relationship.target_uid}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-white">{componentNameMap.get(relationship.source_uid) ?? relationship.source_uid}</p>
                            <p className="text-xs uppercase tracking-[0.2em] text-amber-200">{relationship.type}</p>
                            <p className="text-slate-300">{componentNameMap.get(relationship.target_uid) ?? relationship.target_uid}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRelationshipKey(`${relationship.source_uid}:${relationship.target_uid}:${relationship.type}`);
                                setRelationshipForm({
                                  source_uid: relationship.source_uid,
                                  target_uid: relationship.target_uid,
                                  type: relationship.type as GraphRelationshipCreatePayload['type'],
                                });
                              }}
                              className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 transition hover:bg-white/10"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteRelationship({
                                source_uid: relationship.source_uid,
                                target_uid: relationship.target_uid,
                                type: relationship.type as GraphRelationshipCreatePayload['type'],
                              })}
                              className="rounded-lg border border-rose-300/30 bg-rose-400/10 px-2 py-1 text-xs text-rose-200 transition hover:bg-rose-400/20"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                    No relationships found for this version.
                  </p>
                )}
              </article>
            </aside>
          </section>
        </div>
      </main>
    </RouteGuard>
  );
}
