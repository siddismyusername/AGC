"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Trash2, Upload, Filter } from 'lucide-react';

import RouteGuard from '../../components/route-guard';
import {
  DeadLetterItemOut,
  deleteDocument,
  DocumentJobStatusOut,
  DocumentOut,
  DocumentFileType,
  getDeadLetterDocuments,
  getDocumentJobStatus,
  getProjects,
  listDocuments,
  processDocument,
  ProjectListItem,
  replayDeadLetterDocument,
  replayRetryableDeadLetterBatch,
  uploadDocument,
} from '../../lib/api';

type DocumentFilterStatus = 'all' | 'pending' | 'processing' | 'completed' | 'failed';

export default function DocumentsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [documents, setDocuments] = useState<DocumentOut[]>([]);
  const [jobStatusByDocumentId, setJobStatusByDocumentId] = useState<Record<string, DocumentJobStatusOut>>({});
  const [deadLetterItems, setDeadLetterItems] = useState<DeadLetterItemOut[]>([]);

  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingProcessId, setPendingProcessId] = useState<string | null>(null);
  const [pendingReplayId, setPendingReplayId] = useState<string | null>(null);
  const [isBulkReplaying, setIsBulkReplaying] = useState(false);

  const [fileType, setFileType] = useState<DocumentFileType>('text');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [filterFileType, setFilterFileType] = useState<'all' | DocumentFileType>('all');
  const [filterStatus, setFilterStatus] = useState<DocumentFilterStatus>('all');
  const [searchText, setSearchText] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const searchQuery = searchText.trim();

  function currentQueryOptions() {
    return {
      fileType: filterFileType === 'all' ? undefined : filterFileType,
      status: filterStatus === 'all' ? undefined : filterStatus,
      search: searchQuery || undefined,
    };
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

  async function loadDocuments(projectId: string, options?: { fileType?: string; status?: string; search?: string }) {
    setIsLoadingDocuments(true);
    setErrorMessage(null);

    try {
      const allDocs = await listDocuments(
        projectId,
        options?.fileType,
        options?.status,
        options?.search
      );
      setDocuments(allDocs);
      await loadJobStatuses(projectId, allDocs);
      await loadDeadLetter(projectId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load documents.');
      setDocuments([]);
      setJobStatusByDocumentId({});
      setDeadLetterItems([]);
    } finally {
      setIsLoadingDocuments(false);
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
      const timeout = window.setTimeout(() => {
        void loadDocuments(selectedProjectId, currentQueryOptions());
      }, 250);

      return () => window.clearTimeout(timeout);
    }
  }, [selectedProjectId, filterFileType, filterStatus, searchQuery]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    const hasProcessingDocuments = documents.some((doc) => doc.processing_status === 'processing');
    if (!hasProcessingDocuments) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadDocuments(selectedProjectId, currentQueryOptions());
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [documents, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }

    const hasActiveJobs = Object.values(jobStatusByDocumentId).some((jobStatus) => {
      const runtime = (jobStatus.runtime_state ?? '').toUpperCase();
      return runtime === 'PENDING' || runtime === 'STARTED' || runtime === 'RETRY' || jobStatus.job.status === 'queued';
    });

    if (!hasActiveJobs) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadDocuments(selectedProjectId, currentQueryOptions());
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [jobStatusByDocumentId, selectedProjectId]);

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
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Project
              </label>
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

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Documents</h2>
              <span className="text-sm text-gray-600">
                {documents.length} documents
              </span>
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
        </div>
      </div>
    </RouteGuard>
  );
}
