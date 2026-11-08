/**
 * Typed GitHub REST / Git Data API client.
 *
 * The admin only ever uses a fine-grained PAT scoped to this single repository with:
 *   - Contents: read & write  (read content, commit via the Git Data API)
 *   - Actions: read only      (deploy status)
 *   - Metadata: read only     (mandatory, added automatically by GitHub)
 *
 * The token lives in sessionStorage and is never logged, committed or sent anywhere
 * except api.github.com.
 */

const API = 'https://api.github.com';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public hint?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ConflictError extends Error {
  constructor(public remoteHead: string) {
    super('The branch moved while you were editing.');
    this.name = 'ConflictError';
  }
}

export interface RepoConfig {
  owner: string;
  name: string;
  branch: string;
  siteFile: string;
  contentDir: string;
  imagesDir: string;
  imagesPublicPath: string;
  demosDir: string;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface RepoInfo {
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  permissions?: { admin: boolean; maintain: boolean; push: boolean; triage: boolean; pull: boolean };
}

export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  author: string;
  avatar?: string;
  url: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | 'requested' | 'waiting' | 'pending';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'neutral' | 'timed_out' | 'action_required' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_number: number;
  head_sha: string;
}

export interface RateLimit {
  remaining: number;
  limit: number;
  reset: number;
}

export interface CommitFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
}

export interface CommitDetail {
  sha: string;
  message: string;
  date: string;
  author: string;
  files: CommitFile[];
}

interface CommitPayload {
  message: string;
  tree: string;
  parents: string[];
}

interface TreePayload {
  sha: string;
  tree: Array<{ path?: string; sha?: string | null; mode?: string; type?: string }>;
}

interface RefPayload {
  object: { sha: string };
}

interface ContentFile {
  sha: string;
  content?: string;
  encoding?: string;
  download_url?: string | null;
  size: number;
}

interface ContentDirEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
}

export interface FileToCommit {
  path: string;
  /** Raw UTF-8 text. Mutually exclusive with base64. */
  text?: string;
  /** Base64 payload for binaries (WebP images). */
  base64?: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8ToBase64(value: string): string {
  const bytes = encoder.encode(value);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToUtf8(value: string): string {
  const clean = value.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return decoder.decode(bytes);
}

function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export class GitHubClient {
  private rate: RateLimit | null = null;

  constructor(
    private readonly token: string,
    public readonly repo: RepoConfig,
  ) {}

  get rateLimit(): RateLimit | null {
    return this.rate;
  }

  private async request<T>(path: string, init: RequestInit = {}, retries = 0): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('X-GitHub-Api-Version', '2022-11-28');
    if (init.body) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetch(`${API}${path}`, { ...init, headers, cache: 'no-store' });
    } catch {
      throw new ApiError(0, 'Network error — check your connection, or a browser extension blocking api.github.com.');
    }

    const remaining = Number(response.headers.get('x-ratelimit-remaining') ?? '');
    if (!Number.isNaN(remaining)) {
      this.rate = {
        remaining,
        limit: Number(response.headers.get('x-ratelimit-limit') ?? '0'),
        reset: Number(response.headers.get('x-ratelimit-reset') ?? '0'),
      };
    }

    if (response.status === 204) return undefined as T;

    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = raw;
    }

    if (response.ok) return payload as T;

    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : response.statusText || `HTTP ${response.status}`;

    if (response.status === 401) {
      throw new ApiError(
        401,
        'GitHub rejected the token.',
        'It may be expired, copied wrong, or scoped to another repository.',
      );
    }
    if (response.status === 403) {
      const isRate = remaining === 0;
      throw new ApiError(
        403,
        isRate ? 'GitHub rate limit reached.' : 'This token is not allowed to do that.',
        isRate
          ? `The limit resets at ${new Date(Number(response.headers.get('x-ratelimit-reset') ?? '0') * 1000).toLocaleTimeString()}.`
          : 'The fine-grained token needs Contents: read and write, Actions: read, and access to this repository.',
      );
    }
    if (response.status === 404) {
      throw new ApiError(
        404,
        'Not found on GitHub.',
        `Check owner/name/branch in src/content/site.json (repo). ${message}`,
      );
    }
    if (response.status === 409 || response.status === 422) {
      if (retries === 0 && message.toLowerCase().includes('sha')) {
        const head = await this.getHead().catch(() => '');
        if (head) throw new ConflictError(head);
      }
      throw new ApiError(response.status, message, 'The repository changed underneath us. Reload and try again.');
    }
    if (response.status === 429) {
      throw new ApiError(429, 'Too many requests to GitHub.', 'Wait a minute and retry.');
    }
    throw new ApiError(response.status, message);
  }

  /* --------------------------------------------------------------- identity */

  getUser(): Promise<GitHubUser> {
    return this.request<GitHubUser>('/user');
  }

  getRepo(): Promise<RepoInfo> {
    return this.request<RepoInfo>(`/repos/${this.repo.owner}/${this.repo.name}`);
  }

  async checkWriteAccess(): Promise<{ ok: boolean; detail: string }> {
    const info = await this.getRepo();
    const push = info.permissions?.push ?? false;
    return {
      ok: push,
      detail: push
        ? `Contents read/write confirmed on ${info.full_name}`
        : 'The token can read this repo but not write to it. Update it to Contents: read and write.',
    };
  }

  /* ------------------------------------------------------------------- refs */

  async getHead(): Promise<string> {
    const ref = await this.request<RefPayload>(`/git/ref/heads/${encodePath(this.repo.branch)}`);
    return ref.object.sha;
  }

  /* ---------------------------------------------------------------- content */

  async getFileText(path: string, ref?: string): Promise<{ text: string; sha: string; head: string } | null> {
    try {
      const file = await this.request<ContentFile>(
        `/repos/${this.repo.owner}/${this.repo.name}/contents/${encodePath(path)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`,
      );
      if (Array.isArray(file)) return null;
      if (!file.content && file.download_url) {
        const response = await fetch(file.download_url, { cache: 'no-store' });
        return { text: await response.text(), sha: file.sha, head: file.sha };
      }
      return { text: base64ToUtf8(file.content ?? ''), sha: file.sha, head: file.sha };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  async listDirectory(path: string): Promise<ContentDirEntry[]> {
    try {
      const entries = await this.request<ContentDirEntry[] | ContentFile>(
        `/repos/${this.repo.owner}/${this.repo.name}/contents/${encodePath(path)}`,
      );
      if (!Array.isArray(entries)) return [];
      return entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        sha: entry.sha,
        size: 'size' in entry ? entry.size : 0,
        type: entry.type as 'file' | 'dir',
      }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return [];
      throw error;
    }
  }

  /* ----------------------------------------------------------------- commits */

  async listCommits(path: string | undefined, perPage = 20): Promise<CommitInfo[]> {
    const query = new URLSearchParams({ sha: this.repo.branch, per_page: String(perPage) });
    if (path) query.set('path', path);
    const commits = await this.request<
      Array<{
        sha: string;
        html_url: string;
        commit: { message: string; author: { name: string; date: string } };
        author: { avatar_url: string } | null;
      }>
    >(`/repos/${this.repo.owner}/${this.repo.name}/commits?${query.toString()}`);
    return commits.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message.split('\n')[0] ?? commit.commit.message,
      date: commit.commit.author.date,
      author: commit.commit.author.name,
      avatar: commit.author?.avatar_url,
      url: commit.html_url,
    }));
  }

  /** Full commit detail including the paths it touched, used by the restore flow. */
  async getCommit(sha: string): Promise<CommitDetail> {
    const commit = await this.request<{
      sha: string;
      commit: { message: string; author: { name: string; date: string } };
      files?: CommitFile[];
    }>(`/repos/${this.repo.owner}/${this.repo.name}/commits/${encodeURIComponent(sha)}`);
    return {
      sha: commit.sha,
      message: commit.commit.message.split('\n')[0] ?? commit.commit.message,
      date: commit.commit.author.date,
      author: commit.commit.author.name,
      files: commit.files ?? [],
    };
  }

  /**
   * One atomic commit for any number of files and deletions, using the Git Data API.
   * `expectedHead` implements optimistic concurrency: if the branch moved, we throw
   * ConflictError instead of silently overwriting someone else's commit.
   */
  async commit(options: {
    message: string;
    files: FileToCommit[];
    deletions?: string[];
    expectedHead?: string;
  }): Promise<{ sha: string; url: string }> {
    const head = await this.getHead();
    if (options.expectedHead && head !== options.expectedHead) throw new ConflictError(head);

    const parent = await this.request<CommitPayload>(`/git/commits/${head}`);
    const parentTree = await this.request<TreePayload>(`/git/trees/${parent.tree}`);

    const blobs = await Promise.all(
      options.files.map(async (file) => {
        const content = file.base64 ?? utf8ToBase64(file.text ?? '');
        const blob = await this.request<{ sha: string }>('/git/blobs', {
          method: 'POST',
          body: JSON.stringify({ content, encoding: 'base64' }),
        });
        return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
      }),
    );

    const deletions = (options.deletions ?? []).map((path) => ({
      path,
      mode: '100644',
      type: 'blob',
      sha: null,
    }));

    const tree = await this.request<TreePayload>('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: parentTree.sha, tree: [...blobs, ...deletions] }),
    });

    const commit = await this.request<{ sha: string; html_url: string }>('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message: options.message, tree: tree.sha, parents: [head] }),
    });

    try {
      await this.request(`/git/refs/heads/${encodePath(this.repo.branch)}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 422 || error.status === 409)) {
        throw new ConflictError(await this.getHead().catch(() => head));
      }
      throw error;
    }

    return { sha: commit.sha, url: commit.html_url };
  }

  /* ----------------------------------------------------------------- actions */

  async latestRun(): Promise<WorkflowRun | null> {
    const runs = await this.request<{ workflow_runs: WorkflowRun[] }>(
      `/repos/${this.repo.owner}/${this.repo.name}/actions/runs?branch=${encodeURIComponent(this.repo.branch)}&per_page=1`,
    );
    return runs.workflow_runs[0] ?? null;
  }

  async runJobs(runId: number): Promise<Array<{ name: string; status: string; conclusion: string | null }>> {
    const jobs = await this.request<{ jobs: Array<{ name: string; status: string; conclusion: string | null }> }>(
      `/repos/${this.repo.owner}/${this.repo.name}/actions/runs/${runId}/jobs`,
    );
    return jobs.jobs;
  }
}
