import fs from 'node:fs';
import path from 'node:path';
import { projectSchema, siteSchema, type Project, type Site } from './schema';
import { sortProjects } from './utils';

/**
 * Resolve content from the project root, not from the bundled module location.
 * Astro emits page modules into `dist/pages/…`, so `import.meta.url` would point
 * at `dist/` during the build. `process.cwd()` is the repo root for `astro build`,
 * `astro dev` and Vitest.
 */
const root = process.env.PORTFOLIO_ROOT ? path.resolve(process.env.PORTFOLIO_ROOT) : process.cwd();
const contentDir = path.join(root, 'src', 'content');
const projectsDir = path.join(contentDir, 'projects');

let siteCache: Site | undefined;
let projectsCache: Project[] | undefined;

function fail(file: string, error: unknown): never {
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(`\n✖ Invalid content in ${file}\n${detail}\n`);
}

export function getSite(): Site {
  if (siteCache) return siteCache;
  const file = path.join(contentDir, 'site.json');
  const raw = fs.readFileSync(file, 'utf8');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    fail(file, error);
  }
  const parsed = siteSchema.safeParse(json);
  if (!parsed.success) fail(file, parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
  siteCache = parsed.data;
  return siteCache;
}

export function getAllProjects(): Project[] {
  if (projectsCache) return projectsCache;
  if (!fs.existsSync(projectsDir)) {
    projectsCache = [];
    return projectsCache;
  }
  const files = fs
    .readdirSync(projectsDir)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  const projects = files.map((name) => {
    const file = path.join(projectsDir, name);
    let json: unknown;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      fail(file, error);
    }
    const parsed = projectSchema.safeParse(json);
    if (!parsed.success) {
      fail(
        file,
        parsed.error.issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n'),
      );
    }
    const expectedSlug = name.replace(/\.json$/, '');
    if (parsed.data.slug !== expectedSlug) {
      throw new Error(`\n✖ ${file}\n  slug "${parsed.data.slug}" must match the filename "${expectedSlug}.json".\n`);
    }
    return parsed.data;
  });

  const slugs = new Set<string>();
  const ids = new Set<string>();
  for (const project of projects) {
    if (slugs.has(project.slug)) throw new Error(`\n✖ Duplicate project slug: ${project.slug}\n`);
    if (ids.has(project.id)) throw new Error(`\n✖ Duplicate project id: ${project.id}\n`);
    slugs.add(project.slug);
    ids.add(project.id);
  }

  projectsCache = projects;
  return projectsCache;
}

/** Public listing: published only. Archived projects stay reachable by URL but leave the index. */
export function getPublishedProjects(): Project[] {
  return sortProjects(getAllProjects().filter((p) => p.status === 'published'));
}

export function getArchivedProjects(): Project[] {
  return sortProjects(getAllProjects().filter((p) => p.status === 'archived'));
}

export function getProjectBySlug(slug: string): Project | undefined {
  return getAllProjects().find((p) => p.slug === slug);
}

/** Prev/next within the published set, wrapping around for a smooth reading loop. */
export function getProjectNeighbours(slug: string): { prev: Project; next: Project } | null {
  const published = getPublishedProjects();
  if (published.length < 2) return null;
  const index = published.findIndex((p) => p.slug === slug);
  if (index === -1) return null;
  const prev = published[(index - 1 + published.length) % published.length]!;
  const next = published[(index + 1) % published.length]!;
  return { prev, next };
}

export function getProjectTags(): string[] {
  return Array.from(new Set(getPublishedProjects().flatMap((p) => p.tags))).sort((a, b) => a.localeCompare(b));
}

export function getContentPaths(): { siteFile: string; projectsDir: string } {
  return { siteFile: path.join(contentDir, 'site.json'), projectsDir };
}
