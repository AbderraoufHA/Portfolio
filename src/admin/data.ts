import { projectSchema, siteSchema, type Project, type Site } from '../lib/schema';
import { GitHubClient, type FileToCommit } from './github';

export interface AdminContent {
  site: Site;
  projects: Project[];
  head: string;
}

export interface PendingFile extends FileToCommit {
  /** Public URL used for previews (not part of the commit). */
  previewUrl?: string;
}

export class ContentError extends Error {
  constructor(
    message: string,
    public file?: string,
  ) {
    super(message);
    this.name = 'ContentError';
  }
}

export function projectPath(client: GitHubClient, slug: string): string {
  return `${client.repo.contentDir}/${slug}.json`;
}

export function imageDir(client: GitHubClient, slug: string): string {
  return `${client.repo.imagesDir}/${slug}`;
}

export function imagePublicPath(client: GitHubClient, slug: string, name: string): string {
  return `${client.repo.imagesPublicPath}/${slug}/${name}`;
}

export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function loadContent(client: GitHubClient): Promise<AdminContent> {
  const head = await client.getHead();

  const siteFile = await client.getFileText(client.repo.siteFile);
  if (!siteFile) throw new ContentError(`Missing ${client.repo.siteFile}`, client.repo.siteFile);
  let siteJson: unknown;
  try {
    siteJson = JSON.parse(siteFile.text);
  } catch {
    throw new ContentError(`${client.repo.siteFile} is not valid JSON.`, client.repo.siteFile);
  }
  const siteResult = siteSchema.safeParse(siteJson);
  if (!siteResult.success) {
    const first = siteResult.error.issues[0];
    throw new ContentError(
      `${client.repo.siteFile}: ${first ? `${first.path.join('.')} — ${first.message}` : 'invalid content'}`,
      client.repo.siteFile,
    );
  }

  const entries = await client.listDirectory(client.repo.contentDir);
  const files = entries.filter((entry) => entry.type === 'file' && entry.name.endsWith('.json'));

  const projects = await Promise.all(
    files.map(async (entry) => {
      const file = await client.getFileText(entry.path);
      if (!file) throw new ContentError(`Could not read ${entry.path}`, entry.path);
      let json: unknown;
      try {
        json = JSON.parse(file.text);
      } catch {
        throw new ContentError(`${entry.path} is not valid JSON.`, entry.path);
      }
      const parsed = projectSchema.safeParse(json);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new ContentError(
          `${entry.path}: ${first ? `${first.path.join('.')} — ${first.message}` : 'invalid project'}`,
          entry.path,
        );
      }
      return parsed.data;
    }),
  );

  projects.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return { site: siteResult.data, projects, head };
}

export interface SaveOptions {
  expectedHead?: string;
  /** Files (images / demo assets) that must land in the same commit. */
  extraFiles?: FileToCommit[];
  /** Repo paths to remove in the same commit. */
  deletions?: string[];
  message?: string;
  /** Set when the slug changed, so the old JSON file is removed. */
  previousSlug?: string;
}

export interface SaveResult {
  sha: string;
  url: string;
  project: Project;
}

export async function saveProject(
  client: GitHubClient,
  input: Project,
  options: SaveOptions = {},
): Promise<SaveResult> {
  const project: Project = {
    ...input,
    updatedAt: new Date().toISOString(),
  };
  const parsed = projectSchema.safeParse(project);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ContentError(first ? `${first.path.join('.') || 'project'}: ${first.message}` : 'Project is invalid');
  }

  const files: FileToCommit[] = [
    { path: projectPath(client, project.slug), text: serialize(parsed.data) },
    ...(options.extraFiles ?? []),
  ];

  const deletions = [...(options.deletions ?? [])];
  if (options.previousSlug && options.previousSlug !== project.slug) {
    deletions.push(projectPath(client, options.previousSlug));
  }

  const isNew = !options.previousSlug && !options.expectedHead;
  const result = await client.commit({
    message:
      options.message ??
      `${isNew ? 'content: add' : 'content: update'} project ${project.slug}${project.status === 'draft' ? ' (draft)' : ''}`,
    files,
    deletions,
    expectedHead: options.expectedHead,
  });

  return { ...result, project: parsed.data };
}

export async function deleteProject(
  client: GitHubClient,
  project: Project,
  expectedHead?: string,
): Promise<{ sha: string; url: string }> {
  const deletions = [projectPath(client, project.slug)];
  // Best effort: remove images that live in the project's own folder.
  try {
    const dir = `${client.repo.imagesDir}/${project.slug}`;
    const entries = await client.listDirectory(dir);
    for (const entry of entries) {
      if (entry.type === 'file') deletions.push(entry.path);
    }
  } catch {
    /* images may be shared or missing — the JSON removal still matters */
  }

  return client.commit({
    message: `content: remove project ${project.slug}`,
    files: [],
    deletions,
    expectedHead,
  });
}

export async function saveSite(
  client: GitHubClient,
  site: Site,
  expectedHead?: string,
): Promise<{ sha: string; url: string }> {
  const parsed = siteSchema.safeParse(site);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ContentError(first ? `${first.path.join('.') || 'site'}: ${first.message}` : 'Site settings are invalid');
  }
  return client.commit({
    message: 'content: update site settings',
    files: [{ path: client.repo.siteFile, text: serialize(parsed.data) }],
    expectedHead,
  });
}

export async function reorderProjects(
  client: GitHubClient,
  projects: Project[],
  expectedHead?: string,
): Promise<{ sha: string; url: string }> {
  const files = projects.map((project, index) => ({
    path: projectPath(client, project.slug),
    text: serialize({ ...project, order: index }),
  }));
  return client.commit({
    message: 'content: reorder projects',
    files,
    expectedHead,
  });
}

export async function restoreFile(
  client: GitHubClient,
  path: string,
  ref: string,
  expectedHead?: string,
): Promise<{ sha: string; url: string }> {
  const file = await client.getFileText(path, ref);
  if (!file) throw new ContentError(`That file did not exist at ${ref.slice(0, 7)}.`, path);
  return client.commit({
    message: `content: restore ${path.split('/').pop()} from ${ref.slice(0, 7)}`,
    files: [{ path, text: file.text }],
    expectedHead,
  });
}

export async function listProjectFiles(client: GitHubClient): Promise<string[]> {
  const entries = await client.listDirectory(client.repo.contentDir);
  return entries.filter((entry) => entry.type === 'file' && entry.name.endsWith('.json')).map((entry) => entry.path);
}

export function emptyProject(client: GitHubClient, slug: string): Project {
  const now = new Date().toISOString();
  return {
    id: `${slug || 'project'}-${Date.now().toString(36)}`,
    slug: slug || 'new-project',
    title: 'Untitled project',
    summary: '',
    problem: '',
    solution: '',
    description: '',
    status: 'draft',
    featured: false,
    order: 0,
    startDate: new Date().toISOString().slice(0, 7),
    endDate: '',
    role: '',
    client: '',
    tags: [],
    stack: [],
    links: {},
    metrics: [],
    cover: {
      src: `${client.repo.imagesPublicPath}/placeholder/cover.webp`,
      alt: 'Project cover placeholder — replace me',
      width: 1600,
      height: 1000,
    },
    gallery: [],
    demos: [],
    seo: {},
    createdAt: now,
    updatedAt: now,
  };
}
