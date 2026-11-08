import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { projectSchema, siteSchema } from '../src/lib/schema';
import { getContentPaths, getAllProjects, getPublishedProjects, getSite } from '../src/lib/content';

const root = fileURLToPath(new URL('..', import.meta.url));

describe('site content', () => {
  it('parses src/content/site.json against the schema', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'src/content/site.json'), 'utf8'));
    const parsed = siteSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
    }
    expect(parsed.data.profile.name.length).toBeGreaterThan(0);
    expect(parsed.data.repo.branch.length).toBeGreaterThan(0);
  });

  it('keeps every project filename in sync with its slug', () => {
    const { projectsDir } = getContentPaths();
    const files = fs.readdirSync(projectsDir).filter((name) => name.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(projectsDir, file), 'utf8'));
      const parsed = projectSchema.safeParse(raw);
      expect(parsed.success, `${file}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
      if (parsed.success) expect(parsed.data.slug).toBe(file.replace(/\.json$/, ''));
    }
  });

  it('loads three sample projects with at least one demo each', () => {
    const projects = getAllProjects();
    expect(projects.length).toBeGreaterThanOrEqual(3);
    for (const project of projects) expect(project.demos.length, project.slug).toBeGreaterThan(0);
  });

  it('returns published projects in deterministic order', () => {
    const published = getPublishedProjects();
    expect(published.every((p) => p.status === 'published')).toBe(true);
    const again = getPublishedProjects();
    expect(again.map((p) => p.slug)).toEqual(published.map((p) => p.slug));
    const featured = published.filter((p) => p.featured);
    if (featured.length > 0) expect(published[0]?.featured).toBe(true);
  });

  it('resolves the admin repository config', () => {
    const site = getSite();
    expect(site.repo.siteFile).toMatch(/\.json$/);
    expect(site.repo.imagesPublicPath.startsWith('/')).toBe(true);
    expect(site.repo.demosDir.startsWith('public/')).toBe(true);
  });
});
