"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import RouteGuard from '../../../components/route-guard';
import {
  AuditEvent,
  ArchitectureVersionOut,
  createRule,
  deactivateRule,
  getArchitectureVersions,
  getAuditEvents,
  getProjects,
  listRules,
  ProjectListItem,
  RuleCreatePayload,
  RuleOut,
  RuleUpdatePayload,
  updateRule,
} from '../../../lib/api';

type RuleEditorDraft = {
  rule_text: string;
  severity: RuleOut['severity'];
};

const ruleTypes: Array<{ label: string; value: RuleOut['rule_type'] }> = [
  { label: 'Forbidden dependency', value: 'forbidden_dependency' },
  { label: 'Required dependency', value: 'required_dependency' },
  { label: 'Layer constraint', value: 'layer_constraint' },
  { label: 'Cycle prohibition', value: 'cycle_prohibition' },
  { label: 'Naming convention', value: 'naming_convention' },
  { label: 'Custom', value: 'custom' },
];

export default function RuleEditorPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [versions, setVersions] = useState<ArchitectureVersionOut[]>([]);
  const [rules, setRules] = useState<RuleOut[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');

  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [pendingRuleActionId, setPendingRuleActionId] = useState<string | null>(null);
  const [isBulkDeactivating, setIsBulkDeactivating] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 4;

  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<'all' | RuleOut['rule_type']>('all');
  const [filterSeverity, setFilterSeverity] = useState<'all' | RuleOut['severity']>('all');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [newRule, setNewRule] = useState<RuleCreatePayload>({
    rule_text: '',
    rule_type: 'forbidden_dependency',
    source_component: '',
    target_component: '',
    severity: 'major',
  });

  const [drafts, setDrafts] = useState<Record<string, RuleEditorDraft>>({});

  const activeRules = useMemo(() => rules.filter((rule) => rule.is_active), [rules]);
  const filteredActiveRules = useMemo(
    () => activeRules.filter((rule) => {
      const matchesText = searchText.trim().length === 0
        || rule.rule_text.toLowerCase().includes(searchText.toLowerCase())
        || (rule.source_component ?? '').toLowerCase().includes(searchText.toLowerCase())
        || (rule.target_component ?? '').toLowerCase().includes(searchText.toLowerCase());
      const matchesType = filterType === 'all' || rule.rule_type === filterType;
      const matchesSeverity = filterSeverity === 'all' || rule.severity === filterSeverity;
      return matchesText && matchesType && matchesSeverity;
    }),
    [activeRules, filterSeverity, filterType, searchText],
  );
  const totalPages = Math.max(1, Math.ceil(filteredActiveRules.length / pageSize));
  const paginatedRules = useMemo(
    () => filteredActiveRules.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredActiveRules],
  );
  const drilldownEvents = useMemo(
    () => auditEvents.filter((event) => event.entity_type === 'rule' || event.action.startsWith('architecture_version.')),
    [auditEvents],
  );

  async function loadProjects() {
    setIsLoadingProjects(true);
    setErrorMessage(null);

    try {
      const activeProjects = (await getProjects()).filter((project) => project.is_active);
      setProjects(activeProjects);

      if (activeProjects.length === 0) {
        setVersions([]);
        setRules([]);
        setAuditEvents([]);
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
      setRules([]);
      setAuditEvents([]);
    } finally {
      setIsLoadingProjects(false);
    }
  }

  async function loadVersions(projectId: string, preloadRules = false) {
    setIsLoadingVersions(true);
    setErrorMessage(null);

    try {
      const versionList = await getArchitectureVersions(projectId);
      setVersions(versionList);

      if (versionList.length === 0) {
        setSelectedVersionId('');
        setRules([]);
        setAuditEvents([]);
        return;
      }

      const nextVersionId = preloadRules
        ? selectedVersionId || versionList[0].id
        : versionList[0].id;
      setSelectedVersionId(nextVersionId);
      await loadRules(nextVersionId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load architecture versions.');
      setVersions([]);
      setRules([]);
      setAuditEvents([]);
      setSelectedVersionId('');
    } finally {
      setIsLoadingVersions(false);
    }
  }

  async function loadRules(versionId: string) {
    setIsLoadingRules(true);
    setErrorMessage(null);

    try {
      const [data, events] = await Promise.all([
        listRules(versionId),
        getAuditEvents(1, 12),
      ]);
      setRules(data);
      setAuditEvents(events);
      setCurrentPage(1);
      setDrafts(
        data.reduce<Record<string, RuleEditorDraft>>((acc, rule) => {
          acc[rule.id] = { rule_text: rule.rule_text, severity: rule.severity };
          return acc;
        }, {}),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load rules.');
      setRules([]);
      setDrafts({});
      setAuditEvents([]);
    } finally {
      setIsLoadingRules(false);
    }
  }

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  async function handleCreateRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!selectedVersionId) {
      setErrorMessage('Select an architecture version before creating a rule.');
      return;
    }

    if (!newRule.rule_text.trim()) {
      setErrorMessage('Rule text is required.');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      await createRule(selectedVersionId, {
        ...newRule,
        rule_text: newRule.rule_text.trim(),
        source_component: newRule.source_component?.trim() || undefined,
        target_component: newRule.target_component?.trim() || undefined,
      });
      setSuccessMessage('Rule created successfully.');
      setNewRule({
        rule_text: '',
        rule_type: newRule.rule_type,
        source_component: '',
        target_component: '',
        severity: newRule.severity,
      });
      await loadRules(selectedVersionId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create rule.');
    } finally {
      setIsSubmittingCreate(false);
    }
  }

  async function handleSaveRule(ruleId: string) {
    if (!selectedVersionId) {
      setErrorMessage('Select an architecture version before saving rules.');
      return;
    }

    const draft = drafts[ruleId];
    if (!draft?.rule_text.trim()) {
      setErrorMessage('Rule text cannot be empty.');
      return;
    }

    setPendingRuleActionId(ruleId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload: RuleUpdatePayload = {
        rule_text: draft.rule_text.trim(),
        severity: draft.severity,
      };
      await updateRule(selectedVersionId, ruleId, payload);
      setSuccessMessage('Rule updated successfully.');
      await loadRules(selectedVersionId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update rule.');
    } finally {
      setPendingRuleActionId(null);
    }
  }

  async function handleDeactivateRule(ruleId: string) {
    if (!selectedVersionId) {
      setErrorMessage('Select an architecture version before deactivating rules.');
      return;
    }

    setPendingRuleActionId(ruleId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await deactivateRule(selectedVersionId, ruleId);
      setSuccessMessage('Rule deactivated successfully.');
      await loadRules(selectedVersionId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to deactivate rule.');
    } finally {
      setPendingRuleActionId(null);
    }
  }

  async function handleBulkDeactivateFiltered() {
    if (!selectedVersionId) {
      setErrorMessage('Select an architecture version before bulk actions.');
      return;
    }

    if (filteredActiveRules.length === 0) {
      setErrorMessage('No filtered rules to deactivate.');
      return;
    }

    const confirmed = window.confirm(`Deactivate ${filteredActiveRules.length} filtered rules?`);
    if (!confirmed) {
      return;
    }

    setIsBulkDeactivating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const results = await Promise.allSettled(
      filteredActiveRules.map((rule) => deactivateRule(selectedVersionId, rule.id)),
    );

    const failedCount = results.filter((result) => result.status === 'rejected').length;
    const succeededCount = results.length - failedCount;

    if (failedCount > 0) {
      setErrorMessage(`${failedCount} rules failed to deactivate. ${succeededCount} succeeded.`);
    } else {
      setSuccessMessage(`Deactivated ${succeededCount} rules successfully.`);
    }

    await loadRules(selectedVersionId);
    setIsBulkDeactivating(false);
  }

  useEffect(() => {
    void loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RouteGuard>
      <main className="mx-auto min-h-screen max-w-7xl px-6 py-8 lg:px-10">
        <div className="space-y-8">
          <header className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">FR-14 rule editor</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Architecture rules</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Create, update, and deactivate architecture rules with strict API-backed validation.
                </p>
              </div>
              <Link
                href="/architecture/graph"
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200 transition hover:bg-white/10"
              >
                Open graph explorer
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-slate-300">
                Project
                <select
                  value={selectedProjectId}
                  onChange={(event) => {
                    const nextProjectId = event.target.value;
                    setSelectedProjectId(nextProjectId);
                    void loadVersions(nextProjectId);
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
                    const nextVersionId = event.target.value;
                    setSelectedVersionId(nextVersionId);
                    void loadRules(nextVersionId);
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

          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6">
              <h2 className="text-xl font-semibold text-white">Create rule</h2>
              <p className="mt-2 text-sm text-slate-300">Add a deterministic governance rule to this architecture version.</p>

              <form onSubmit={handleCreateRule} className="mt-5 space-y-4">
                <label className="flex flex-col gap-2 text-sm text-slate-300">
                  Rule text
                  <textarea
                    value={newRule.rule_text}
                    onChange={(event) => setNewRule((prev) => ({ ...prev, rule_text: event.target.value }))}
                    rows={4}
                    className="rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-white outline-none"
                    placeholder="Services must not call database directly"
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    Rule type
                    <select
                      value={newRule.rule_type}
                      onChange={(event) => setNewRule((prev) => ({ ...prev, rule_type: event.target.value as RuleOut['rule_type'] }))}
                      className="rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-white outline-none"
                    >
                      {ruleTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    Severity
                    <select
                      value={newRule.severity}
                      onChange={(event) => setNewRule((prev) => ({ ...prev, severity: event.target.value as RuleOut['severity'] }))}
                      className="rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-white outline-none"
                    >
                      <option value="critical">Critical</option>
                      <option value="major">Major</option>
                      <option value="minor">Minor</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    Source component
                    <input
                      value={newRule.source_component}
                      onChange={(event) => setNewRule((prev) => ({ ...prev, source_component: event.target.value }))}
                      className="rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-white outline-none"
                      placeholder="ServiceLayer"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-slate-300">
                    Target component
                    <input
                      value={newRule.target_component}
                      onChange={(event) => setNewRule((prev) => ({ ...prev, target_component: event.target.value }))}
                      className="rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-white outline-none"
                      placeholder="DatabaseLayer"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingCreate || !selectedVersionId}
                  className="inline-flex items-center rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingCreate ? 'Creating...' : 'Create rule'}
                </button>
              </form>
            </article>

            <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-white/45">Active rules</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Rule list and editor</h2>
                </div>
                <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs text-slate-200">
                  {filteredActiveRules.length}/{activeRules.length} shown
                </span>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-4">
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search text or component"
                  className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none md:col-span-2"
                />
                <select
                  value={filterType}
                  onChange={(event) => setFilterType(event.target.value as 'all' | RuleOut['rule_type'])}
                  className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="all">All types</option>
                  {ruleTypes.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                <select
                  value={filterSeverity}
                  onChange={(event) => setFilterSeverity(event.target.value as 'all' | RuleOut['severity'])}
                  className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="all">All severities</option>
                  <option value="critical">Critical</option>
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                </select>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => void handleBulkDeactivateFiltered()}
                  disabled={isBulkDeactivating || filteredActiveRules.length === 0}
                  className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBulkDeactivating ? 'Deactivating...' : `Deactivate filtered (${filteredActiveRules.length})`}
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-300">
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage <= 1}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>

              {isLoadingRules ? (
                <p className="mt-5 text-sm text-slate-300">Loading rules...</p>
              ) : paginatedRules.length > 0 ? (
                <div className="mt-5 space-y-4">
                  {paginatedRules.map((rule) => {
                    const draft = drafts[rule.id] ?? { rule_text: rule.rule_text, severity: rule.severity };
                    return (
                      <div key={rule.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-xs text-amber-200">
                            {rule.rule_type}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">
                            {rule.severity}
                          </span>
                        </div>

                        <textarea
                          value={draft.rule_text}
                          onChange={(event) => setDrafts((prev) => ({
                            ...prev,
                            [rule.id]: {
                              ...draft,
                              rule_text: event.target.value,
                            },
                          }))}
                          rows={3}
                          className="mt-3 w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none"
                        />

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <select
                            value={draft.severity}
                            onChange={(event) => setDrafts((prev) => ({
                              ...prev,
                              [rule.id]: {
                                ...draft,
                                severity: event.target.value as RuleOut['severity'],
                              },
                            }))}
                            className="rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none"
                          >
                            <option value="critical">Critical</option>
                            <option value="major">Major</option>
                            <option value="minor">Minor</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => void handleSaveRule(rule.id)}
                            disabled={pendingRuleActionId === rule.id}
                            className="rounded-xl bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {pendingRuleActionId === rule.id ? 'Saving...' : 'Save'}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDeactivateRule(rule.id)}
                            disabled={pendingRuleActionId === rule.id}
                            className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {pendingRuleActionId === rule.id ? 'Working...' : 'Deactivate'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                  No active rules found for this architecture version.
                </p>
              )}

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.3em] text-white/45">Audit drill-down</p>
                {drilldownEvents.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {drilldownEvents.slice(0, 5).map((event) => (
                      <li key={event.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                        <span className="text-white">{event.action}</span> on {event.entity_type}
                        {event.new_value?.rule_text ? `: ${String(event.new_value.rule_text)}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-slate-400">No rule-related audit activity available yet.</p>
                )}
              </div>
            </article>
          </section>
        </div>
      </main>
    </RouteGuard>
  );
}
