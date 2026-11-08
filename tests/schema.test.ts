import { describe, expect, it } from 'vitest';
import {
  analyticsSchema,
  demoSchema,
  httpUrl,
  imageSchema,
  linkSchema,
  projectSchema,
  siteSchema,
  slugSchema,
  themeSchema,
} from '../src/lib/schema';

const ISO = '2026-05-01T10:00:00.000Z';

function validProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    slug: 'edge-metrics',
    title: 'EdgeMetrics',
    summary: 'Realtime observability for edge workers, built for a team of four.',
    problem: 'Dashboards lagged behind deploys by minutes.',
    solution: 'A streaming aggregation service with per-tenant rollups.',
    description: '## Problem\n\nDashboards lagged.\n\n## Build\n\nStreaming aggregation.',
    status: 'published',
    featured: true,
    order: 1,
    startDate: '2025-01',
    endDate: '2025-06',
    role: 'Lead engineer',
    client: 'Acme',
    tags: ['observability', 'edge'],
    stack: ['TypeScript', 'ClickHouse'],
    links: { repo: 'https://github.com/example/repo', live: '', caseStudy: '' },
    metrics: [{ label: 'p95 latency', value: '-82%' }],
    cover: { src: '/images/projects/edge-metrics/cover.webp', alt: 'EdgeMetrics dashboard' },
    gallery: [],
    demos: [{ id: 'demo-1', label: 'Production', type: 'live', url: 'https://example.com' }],
    seo: { title: '', description: '', ogImage: '' },
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

describe('slugSchema', () => {
  it.each(['edge-metrics', 'k8s-rollout-operator', 'a', 'project-2'])('accepts %s', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(['', 'Edge-Metrics', 'edge_metrics', '-edge', 'edge-', 'edge--metrics', 'a'.repeat(81)])(
    'rejects %s',
    (slug) => {
      expect(slugSchema.safeParse(slug).success).toBe(false);
    },
  );
});

describe('url schemas', () => {
  it('accepts http(s) URLs only', () => {
    expect(httpUrl.safeParse('https://example.com').success).toBe(true);
    expect(httpUrl.safeParse('http://localhost:4321/x').success).toBe(true);
    expect(httpUrl.safeParse('ftp://example.com').success).toBe(false);
    expect(httpUrl.safeParse('example.com').success).toBe(false);
    expect(httpUrl.safeParse('javascript:alert(1)').success).toBe(false);
  });

  it('accepts site-relative links but not protocol-relative or traversal paths', () => {
    expect(linkSchema.safeParse('/demos/edge-metrics/1.4.0/index.html').success).toBe(true);
    expect(linkSchema.safeParse('https://example.com/x').success).toBe(true);
    expect(linkSchema.safeParse('//evil.example.com/x').success).toBe(false);
    expect(linkSchema.safeParse('/images/../../etc/passwd').success).toBe(false);
    expect(linkSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(linkSchema.safeParse('').success).toBe(false);
  });

  it('requires alt text on images', () => {
    expect(imageSchema.safeParse({ src: '/x.webp', alt: 'A dashboard' }).success).toBe(true);
    expect(imageSchema.safeParse({ src: '/x.webp', alt: '' }).success).toBe(false);
  });
});

describe('demoSchema', () => {
  it('requires a target for the demo type', () => {
    expect(demoSchema.safeParse({ id: 'd1', label: 'Live', type: 'live' }).success).toBe(false);
    expect(demoSchema.safeParse({ id: 'd1', label: 'Build', type: 'static-build' }).success).toBe(false);
    expect(demoSchema.safeParse({ id: 'd1', label: 'Live', type: 'live', url: 'https://example.com' }).success).toBe(
      true,
    );
  });

  it('keeps static builds inside /demos/', () => {
    expect(
      demoSchema.safeParse({ id: 'd1', label: 'v1', type: 'static-build', path: '/demos/x/1.0.0/index.html' }).success,
    ).toBe(true);
    expect(
      demoSchema.safeParse({ id: 'd1', label: 'v1', type: 'static-build', path: '/other/index.html' }).success,
    ).toBe(false);
  });

  it('accepts recognised video hosts and local files', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://vimeo.com/123456789',
      'https://cdn.example.com/demo.mp4',
      '/demos/video.webm',
    ]) {
      expect(demoSchema.safeParse({ id: 'd1', label: 'Video', type: 'video', url }).success, url).toBe(true);
    }
    expect(
      demoSchema.safeParse({ id: 'd1', label: 'Video', type: 'video', url: 'https://example.com/not-a-video' }).success,
    ).toBe(false);
  });

  it('defaults status to stable and rejects unknown types', () => {
    const parsed = demoSchema.parse({ id: 'd1', label: 'Live', type: 'live', url: 'https://example.com' });
    expect(parsed.status).toBe('stable');
    expect(demoSchema.safeParse({ id: 'd1', label: 'X', type: 'hologram', url: 'https://example.com' }).success).toBe(
      false,
    );
  });
});

describe('projectSchema', () => {
  it('parses a complete project and applies defaults', () => {
    const parsed = projectSchema.parse(
      validProject({
        tags: undefined,
        stack: undefined,
        gallery: undefined,
        demos: undefined,
        seo: undefined,
        metrics: undefined,
        links: undefined,
      }),
    );
    expect(parsed.tags).toEqual([]);
    expect(parsed.stack).toEqual([]);
    expect(parsed.gallery).toEqual([]);
    expect(parsed.demos).toEqual([]);
    expect(parsed.seo).toEqual({});
    expect(parsed.links).toEqual({});
  });

  it('rejects an invalid status, date or order', () => {
    expect(projectSchema.safeParse(validProject({ status: 'live' })).success).toBe(false);
    expect(projectSchema.safeParse(validProject({ startDate: '2025-13' })).success).toBe(false);
    expect(projectSchema.safeParse(validProject({ startDate: '2025-1' })).success).toBe(false);
    expect(projectSchema.safeParse(validProject({ order: -1 })).success).toBe(false);
  });

  it('requires ISO timestamps with an offset', () => {
    expect(projectSchema.safeParse(validProject({ createdAt: '2025-05-01' })).success).toBe(false);
    expect(projectSchema.safeParse(validProject({ createdAt: '2025-05-01T10:00:00+02:00' })).success).toBe(true);
  });

  it('caps tags, stack and metrics', () => {
    expect(projectSchema.safeParse(validProject({ tags: Array.from({ length: 13 }, (_, i) => `t${i}`) })).success).toBe(
      false,
    );
    expect(
      projectSchema.safeParse(validProject({ stack: Array.from({ length: 25 }, (_, i) => `s${i}`) })).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse(
        validProject({ metrics: Array.from({ length: 7 }, (_, i) => ({ label: `m${i}`, value: '1' })) }),
      ).success,
    ).toBe(false);
  });

  it('rejects unsafe SEO image URLs', () => {
    expect(projectSchema.safeParse(validProject({ seo: { ogImage: 'javascript:alert(1)' } })).success).toBe(false);
  });
});

describe('siteSchema', () => {
  const minimalSite = {
    locale: 'en',
    profile: {
      name: 'Your Name',
      title: 'Engineer',
      tagline: 'I build things.',
      location: 'Remote',
      timezone: 'UTC',
      availability: { available: true, label: 'Available' },
      about: 'A short bio.',
    },
    socials: { email: 'you@example.com' },
    contact: { provider: 'mailto', email: 'you@example.com' },
    theme: { accent: '#5eead4' },
    repo: { owner: 'your-username', name: 'portfolio' },
  };

  it('applies defaults for lists, analytics and repo paths', () => {
    const parsed = siteSchema.parse(minimalSite);
    expect(parsed.services).toEqual([]);
    expect(parsed.skills).toEqual([]);
    expect(parsed.testimonials).toEqual([]);
    expect(parsed.analytics.provider).toBe('none');
    expect(parsed.repo.branch).toBe('main');
    expect(parsed.repo.contentDir).toBe('src/content/projects');
    expect(parsed.repo.imagesDir).toBe('public/images/projects');
    expect(parsed.repo.demosDir).toBe('public/demos');
    expect(parsed.theme.mode).toBe('dark');
  });

  it('rejects malformed contact, theme and analytics config', () => {
    expect(siteSchema.safeParse({ ...minimalSite, contact: { provider: 'fax', email: 'a@b.co' } }).success).toBe(false);
    expect(siteSchema.safeParse({ ...minimalSite, theme: { accent: 'teal' } }).success).toBe(false);
    expect(themeSchema.safeParse({ accent: '#ABCDEF' }).success).toBe(true);
    expect(
      analyticsSchema.safeParse({ provider: 'umami', siteId: 'abc', endpoint: 'https://analytics.example.com' })
        .success,
    ).toBe(true);
    expect(analyticsSchema.safeParse({ provider: 'plausible' }).success).toBe(false);
  });

  it('requires a valid profile email and a repo owner', () => {
    expect(siteSchema.safeParse({ ...minimalSite, socials: { email: 'not-an-email' } }).success).toBe(false);
    expect(siteSchema.safeParse({ ...minimalSite, repo: { owner: '', name: 'portfolio' } }).success).toBe(false);
  });
});
