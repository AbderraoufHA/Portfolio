import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  cx,
  darken,
  escapeHtml,
  formatDate,
  formatMonth,
  formatRange,
  hexToRgbChannels,
  isExternal,
  makeId,
  nextFreeSlug,
  normalizeOrder,
  relativeTime,
  slugify,
  sortProjects,
  truncate,
  unique,
  withBase,
  withBaseSrcset,
} from '../src/lib/utils';

describe('withBase', () => {
  it('prefixes site-relative paths for project pages', () => {
    expect(withBase('/projects', '/portfolio')).toBe('/portfolio/projects');
    expect(withBase('projects', '/portfolio/')).toBe('/portfolio/projects');
    expect(withBase('/', '/portfolio')).toBe('/portfolio/');
  });

  it('leaves paths alone for root deployments', () => {
    expect(withBase('/projects', '/')).toBe('/projects');
    expect(withBase('/projects', '')).toBe('/projects');
  });

  it('does not double-prefix an already-based path', () => {
    expect(withBase('/portfolio/projects', '/portfolio')).toBe('/portfolio/projects');
    expect(withBase('/portfolio', '/portfolio')).toBe('/portfolio');
  });

  it('never touches absolute, data or mailto URLs', () => {
    expect(withBase('https://example.com/x', '/portfolio')).toBe('https://example.com/x');
    expect(withBase('//cdn.example.com/x', '/portfolio')).toBe('//cdn.example.com/x');
    expect(withBase('data:image/png;base64,abc', '/portfolio')).toBe('data:image/png;base64,abc');
    expect(withBase('mailto:a@b.co', '/portfolio')).toBe('mailto:a@b.co');
  });
});

describe('withBaseSrcset', () => {
  it('bases every candidate and keeps descriptors', () => {
    expect(withBaseSrcset('/a-640.webp 640w, /a.webp 1600w', '/repo')).toBe(
      '/repo/a-640.webp 640w, /repo/a.webp 1600w',
    );
  });

  it('returns undefined for an empty srcset', () => {
    expect(withBaseSrcset(undefined, '/repo')).toBeUndefined();
    expect(withBaseSrcset('', '/repo')).toBeUndefined();
  });
});

describe('slugify', () => {
  it('normalises accents, punctuation and whitespace', () => {
    expect(slugify('Héllo, Wörld!')).toBe('hello-world');
    expect(slugify('  Edge   Metrics  ')).toBe('edge-metrics');
    expect(slugify("Client's project (v2)")).toBe('clients-project-v2');
  });

  it('never emits leading, trailing or double hyphens', () => {
    expect(slugify('---a---b---')).toBe('a-b');
    expect(slugify('!!!')).toBe('');
  });

  it('caps the slug at 80 characters', () => {
    expect(slugify('a'.repeat(120))).toHaveLength(80);
  });
});

describe('date formatting', () => {
  it('formats YYYY-MM and YYYY-MM-DD', () => {
    expect(formatMonth('2025-01', 'en')).toBe('Jan 2025');
    expect(formatMonth('2025-01-15', 'en')).toBe('Jan 15, 2025');
  });

  it('passes through unknown shapes instead of inventing dates', () => {
    expect(formatMonth(undefined)).toBe('');
    expect(formatMonth('not-a-date')).toBe('not-a-date');
  });

  it('renders ranges with an open end', () => {
    expect(formatRange('2024-03', '2024-09', 'en')).toBe('Mar 2024 — Sep 2024');
    expect(formatRange('2024-03', '', 'en')).toBe('Mar 2024 — Present');
    expect(formatRange('', '2024-09', 'en')).toBe('');
  });

  it('formats absolute and relative dates', () => {
    expect(formatDate('2025-06-01T00:00:00Z', 'en')).toBe('Jun 1, 2025');
    expect(relativeTime('2025-06-01T00:00:00Z', new Date('2025-06-03T00:00:00Z'))).toBe('2 days ago');
    expect(relativeTime('2025-06-01T00:00:00Z', new Date('2025-06-01T00:00:00Z'))).toBe('just now');
  });
});

describe('colour helpers', () => {
  it('converts hex to space-separated channels', () => {
    expect(hexToRgbChannels('#5eead4')).toBe('94 234 212');
    expect(hexToRgbChannels('#fff')).toBe('255 255 255');
  });

  it('falls back to the default accent on malformed input', () => {
    expect(hexToRgbChannels('teal')).toBe('94 234 212');
    expect(hexToRgbChannels('#12345')).toBe('94 234 212');
  });

  it('darkens towards black', () => {
    expect(darken('#ffffff', 0.5)).toBe('128 128 128');
    expect(darken('#000000', 0.5)).toBe('0 0 0');
  });
});

describe('absoluteUrl', () => {
  it('joins site and path without duplicate slashes', () => {
    expect(absoluteUrl('/x.webp', 'https://example.com')).toBe('https://example.com/x.webp');
    expect(absoluteUrl('/x.webp', 'https://example.com/')).toBe('https://example.com/x.webp');
    expect(absoluteUrl('x.webp', 'https://example.com')).toBe('https://example.com/x.webp');
  });

  it('keeps absolute URLs and handles a missing site', () => {
    expect(absoluteUrl('https://cdn.example.com/x.webp', 'https://example.com')).toBe('https://cdn.example.com/x.webp');
    expect(absoluteUrl('/x.webp', undefined)).toBe('https://example.com/x.webp');
  });
});

describe('text helpers', () => {
  it('escapes HTML entities', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('truncates with an ellipsis and never exceeds the cap', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a much longer sentence', 10)).toBe('a much lo…');
    expect(truncate('a much longer sentence', 10).length).toBe(10);
  });

  it('detects external URLs', () => {
    expect(isExternal('https://example.com')).toBe(true);
    expect(isExternal('/projects')).toBe(false);
  });

  it('joins truthy class names', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('deduplicates values', () => {
    expect(unique(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });
});

describe('project ordering', () => {
  const projects = [
    { title: 'B', featured: false, order: 1, startDate: '2024-01' },
    { title: 'A', featured: false, order: 1, startDate: '2024-06' },
    { title: 'F', featured: false, order: 0, startDate: '2020-01' },
    { title: 'C', featured: true, order: 9, startDate: '2023-01' },
  ];

  it('puts featured projects first, then order ascending, then newest, then title', () => {
    expect(sortProjects(projects).map((p) => p.title)).toEqual(['C', 'F', 'A', 'B']);
  });

  it('does not mutate the input', () => {
    const input = [...projects];
    sortProjects(input);
    expect(input).toEqual(projects);
  });

  it('renumbers order by position', () => {
    expect(normalizeOrder([{ order: 7 }, { order: 2 }])).toEqual([{ order: 0 }, { order: 1 }]);
  });
});

describe('nextFreeSlug', () => {
  it('returns the root slug when free', () => {
    expect(nextFreeSlug('New Project', [])).toBe('new-project');
  });

  it('walks numeric suffixes until one is free', () => {
    expect(nextFreeSlug('New Project', ['new-project'])).toBe('new-project-2');
    expect(nextFreeSlug('New Project', ['new-project', 'new-project-2'])).toBe('new-project-3');
  });

  it('falls back to "project" for unusable input', () => {
    expect(nextFreeSlug('!!!', [])).toBe('project');
  });
});

describe('makeId', () => {
  it('prefixes and stays unique enough for a single session', () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeId('demo')));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^demo-[a-z0-9]+-[a-z0-9]+$/);
  });
});
