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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1';

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

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function getProjects(accessToken: string): Promise<ProjectListItem[]> {
  const response = await apiRequest<ProjectListItem[]>('/projects?per_page=20', {}, accessToken);
  return response.data;
}

export async function getProject(projectId: string, accessToken: string): Promise<ProjectOut> {
  const response = await apiRequest<ProjectOut>(`/projects/${projectId}`, {}, accessToken);
  return response.data;
}

export async function getProjectHealth(projectId: string, accessToken: string): Promise<HealthScoreOut | null> {
  try {
    const response = await apiRequest<HealthScoreOut>(`/projects/${projectId}/compliance/health`, {}, accessToken);
    return response.data;
  } catch (error) {
    return null;
  }
}