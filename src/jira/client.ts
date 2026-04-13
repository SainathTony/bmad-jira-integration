import axios, { AxiosInstance } from 'axios';
import { SyncConfig } from '../types';

export interface JiraIssuePayload {
  fields: {
    project: { key: string };
    summary: string;
    description?: object;
    issuetype: { name: string };
    labels?: string[];
    parent?: { key: string };
  };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string };
  };
}

export class JiraClient {
  private http: AxiosInstance;
  private projectKey: string;

  constructor(config: SyncConfig['jira']) {
    this.projectKey = config.projectKey;

    const token = config.apiToken.startsWith('${')
      ? process.env[config.apiToken.slice(2, -1)] ?? ''
      : config.apiToken;

    const baseUrl = config.baseUrl.replace(/\/$/, ''); // strip trailing slash

    this.http = axios.create({
      baseURL: `${baseUrl}/rest/api/3`,
      auth: { username: config.email, password: token },
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });

    // Intercept errors and surface Jira's response body in the message
    this.http.interceptors.response.use(
      (r) => r,
      (err) => {
        if (axios.isAxiosError(err) && err.response) {
          const body = JSON.stringify(err.response.data, null, 2);
          const status = err.response.status;
          throw new Error(`Jira API ${status}: ${body}`);
        }
        throw err;
      }
    );
  }

  async createIssue(payload: JiraIssuePayload): Promise<JiraIssue> {
    const { data } = await this.http.post<JiraIssue>('/issue', payload);
    return data;
  }

  async listProjects(): Promise<Array<{ id: string; key: string; name: string }>> {
    // Try /project first (returns a flat array, works in all Jira Cloud configs)
    const { data } = await this.http.get<Array<{ id: string; key: string; name: string }>>(
      '/project',
      { params: { maxResults: 100 } }
    );
    if (Array.isArray(data) && data.length > 0) return data;

    // Fallback: /project/search (returns { values: [...] })
    const { data: searchData } = await this.http.get<{ values: Array<{ id: string; key: string; name: string }> }>(
      '/project/search',
      { params: { maxResults: 100 } }
    );
    return searchData.values ?? [];
  }

  async getIssueTypes(): Promise<Array<{ id: string; name: string; subtask: boolean }>> {
    const { data } = await this.http.get<{ issueTypes: Array<{ id: string; name: string; subtask: boolean }> }>(
      `/project/${this.projectKey}`
    );
    return data.issueTypes ?? [];
  }

  async getIssue(key: string): Promise<JiraIssue> {
    const { data } = await this.http.get<JiraIssue>(`/issue/${key}`);
    return data;
  }

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const { data } = await this.http.get<{ transitions: JiraTransition[] }>(
      `/issue/${issueKey}/transitions`
    );
    return data.transitions;
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.http.post(`/issue/${issueKey}/transitions`, {
      transition: { id: transitionId },
    });
  }

  async findTransitionId(issueKey: string, targetStatusName: string): Promise<string | null> {
    const transitions = await this.getTransitions(issueKey);
    const match = transitions.find(
      (t) => t.to.name.toLowerCase() === targetStatusName.toLowerCase()
    );
    return match ? match.id : null;
  }

  async searchByLabel(label: string): Promise<JiraIssue[]> {
    const jql = `project = "${this.projectKey}" AND labels = "${label}" ORDER BY created ASC`;
    const { data } = await this.http.get<{ issues: JiraIssue[] }>('/search', {
      params: { jql, fields: 'summary,status', maxResults: 500 },
    });
    return data.issues;
  }

  async updateIssue(issueKey: string, payload: { fields: Partial<JiraIssuePayload['fields']> }): Promise<void> {
    await this.http.put(`/issue/${issueKey}`, payload);
  }
}
