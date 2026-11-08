import type { Project, Site } from '../lib/schema';
import { formatDate } from '../lib/utils';

export interface HealthIssue {
  id: string;
  severity: 'error' | 'warn' | 'info';
  title: string;
  detail: string;
  projectSlug?: string;
}

const PLACEHOLDERS = [
  'your name',
  'your-username',
  'you@example.com',
  'your-form-key',
  'your-domain',
  'example.com',
  'lorem ipsum',
];

function containsPlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return PLACEHOLDERS.some((token) => lower.includes(token));
}

export function checkProject(project: Project): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const slug = project.slug;

  if (project.status === 'draft') {
    issues.push({
      id: `${slug}-draft`,
      severity: 'info',
      title: 'Draft — not on the public site',
      detail: 'Set the status to published to include it in the next build.',
      projectSlug: slug,
    });
  }
  if (!project.cover.src || !project.cover.alt) {
    issues.push({
      id: `${slug}-cover`,
      severity: 'error',
      title: 'Missing cover image or alt text',
      detail: 'Covers are required for the card grid, OG tags and the case study hero.',
      projectSlug: slug,
    });
  }
  if (project.summary.length < 60) {
    issues.push({
      id: `${slug}-summary`,
      severity: 'warn',
      title: 'Short summary',
      detail: 'Summaries under ~60 characters look thin in the grid and in search results.',
      projectSlug: slug,
    });
  }
  if (project.demos.length === 0) {
    issues.push({
      id: `${slug}-demos`,
      severity: 'warn',
      title: 'No demo attached',
      detail: 'Add a live link, an embed or a static build so visitors can try the work.',
      projectSlug: slug,
    });
  }
  for (const demo of project.demos) {
    if (demo.type !== 'video' || !demo.url || !/\.(mp4|webm|ogv)(\?.*)?$/i.test(demo.url)) continue;
    if (!demo.captions) {
      issues.push({
        id: `${slug}-captions-${demo.id}`,
        severity: 'warn',
        title: 'Local video has no captions',
        detail: 'WCAG 1.2.2 needs a WebVTT track for prerecorded video with audio. Add a captions path on the demo.',
        projectSlug: slug,
      });
    }
  }
  if (!project.links.repo && !project.links.live) {
    issues.push({
      id: `${slug}-links`,
      severity: 'warn',
      title: 'No repo or live link',
      detail: 'At least one external link builds trust. NDA projects can point at a private note instead.',
      projectSlug: slug,
    });
  }
  if (!project.seo.description) {
    issues.push({
      id: `${slug}-seo`,
      severity: 'info',
      title: 'No custom SEO description',
      detail: 'The summary is used as a fallback, but a tailored 150-character description performs better.',
      projectSlug: slug,
    });
  }
  if (project.metrics.length === 0) {
    issues.push({
      id: `${slug}-metrics`,
      severity: 'info',
      title: 'No metrics',
      detail: 'One or two numbers make a case study far more convincing.',
      projectSlug: slug,
    });
  }
  for (const [index, image] of project.gallery.entries()) {
    if (!image.alt) {
      issues.push({
        id: `${slug}-gallery-${index}`,
        severity: 'error',
        title: `Gallery image ${index + 1} has no alt text`,
        detail: 'Alt text is required for WCAG 2.2 AA.',
        projectSlug: slug,
      });
    }
  }
  if (
    containsPlaceholder(project.title) ||
    containsPlaceholder(project.summary) ||
    containsPlaceholder(project.client)
  ) {
    issues.push({
      id: `${slug}-placeholder`,
      severity: 'warn',
      title: 'Placeholder text in project',
      detail: 'Replace example.com / your-username style copy before launch.',
      projectSlug: slug,
    });
  }

  const urls = [
    project.links.repo,
    project.links.live,
    project.links.caseStudy,
    ...project.demos.map((demo) => demo.url ?? demo.path),
  ].filter((value): value is string => Boolean(value));

  for (const url of urls) {
    if (containsPlaceholder(url)) {
      issues.push({
        id: `${slug}-url-${url}`,
        severity: 'warn',
        title: 'Placeholder URL',
        detail: `${url} points at an example domain.`,
        projectSlug: slug,
      });
    }
  }

  return issues;
}

export function checkSite(site: Site, projects: Project[]): HealthIssue[] {
  const issues: HealthIssue[] = [];

  if (containsPlaceholder(site.profile.name)) {
    issues.push({
      id: 'site-name',
      severity: 'error',
      title: 'Profile name is still a placeholder',
      detail: 'Edit src/content/site.json (or Admin → Settings) before sharing the site.',
    });
  }
  if (containsPlaceholder(site.contact.email)) {
    issues.push({
      id: 'site-email',
      severity: 'error',
      title: 'Contact email is a placeholder',
      detail: 'The contact form and mailto fallback both point at you@example.com.',
    });
  }
  if (site.contact.provider !== 'mailto' && !site.contact.key) {
    issues.push({
      id: 'site-form-key',
      severity: 'warn',
      title: 'Contact provider has no key',
      detail: 'The form falls back to email until a public Web3Forms/Formspree key is added.',
    });
  }
  if (site.analytics.provider !== 'none' && !site.analytics.siteId) {
    issues.push({
      id: 'site-analytics',
      severity: 'info',
      title: 'Analytics enabled without a site id',
      detail: 'Nothing will be collected until siteId is set.',
    });
  }
  if (containsPlaceholder(site.socials.github)) {
    issues.push({
      id: 'site-social',
      severity: 'warn',
      title: 'Social links use placeholder handles',
      detail: 'Update GitHub/LinkedIn/Telegram in Settings.',
    });
  }
  if (site.testimonials.some((item) => item.author.toLowerCase().includes('sample'))) {
    issues.push({
      id: 'site-testimonials',
      severity: 'info',
      title: 'Sample testimonials are still published',
      detail: 'Replace them with real quotes or clear the array to hide the section.',
    });
  }
  if (projects.length === 0) {
    issues.push({
      id: 'site-projects',
      severity: 'error',
      title: 'No projects',
      detail: 'The work section is empty. Add at least one project.',
    });
  }

  return issues;
}

export function checkAll(site: Site, projects: Project[]): HealthIssue[] {
  return [...checkSite(site, projects), ...projects.flatMap(checkProject)];
}

/** Best-effort size probe. Same-origin HEAD requests only — external hosts usually block CORS. */
export async function checkImageWeights(
  projects: Project[],
  budgetBytes = 350 * 1024,
  /** Maps a site-relative path to the URL the admin is actually served from (base path aware). */
  resolve: (src: string) => string = (src) => src,
): Promise<HealthIssue[]> {
  const urls = new Set<string>();
  for (const project of projects) {
    urls.add(project.cover.src);
    for (const image of project.gallery) urls.add(image.src);
  }
  const issues: HealthIssue[] = [];
  await Promise.all(
    [...urls].slice(0, 40).map(async (src) => {
      if (!src.startsWith('/')) return;
      try {
        const response = await fetch(resolve(src), { method: 'HEAD', cache: 'no-store' });
        const length = Number(response.headers.get('content-length') ?? '0');
        if (length > budgetBytes) {
          issues.push({
            id: `weight-${src}`,
            severity: 'warn',
            title: 'Heavy image',
            detail: `${src.split('/').pop()} is ${(length / 1024).toFixed(0)} kB. Aim for under 350 kB.`,
          });
        }
      } catch {
        /* CORS or offline — ignore */
      }
    }),
  );
  return issues;
}

export function contentStats(site: Site, projects: Project[]) {
  const published = projects.filter((project) => project.status === 'published');
  const drafts = projects.filter((project) => project.status === 'draft');
  const archived = projects.filter((project) => project.status === 'archived');
  const demos = projects.reduce((sum, project) => sum + project.demos.length, 0);
  const updated = projects.map((project) => project.updatedAt).sort((a, b) => b.localeCompare(a))[0];
  return {
    total: projects.length,
    published: published.length,
    drafts: drafts.length,
    archived: archived.length,
    demos,
    lastUpdate: updated ? formatDate(updated) : '—',
    placeholders: [site.profile.name, site.contact.email, site.socials.github].filter((value) =>
      containsPlaceholder(value),
    ).length,
  };
}
