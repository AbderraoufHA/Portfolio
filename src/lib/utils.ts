/** Small, dependency-free helpers shared by the public site and the admin. */

/** Prefix a site-relative path with Astro's configured base (handles GitHub Pages project sites). */
export function withBase(path: string, base: string = import.meta.env.BASE_URL): string {
  if (!path) return path;
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('mailto:')) return path;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!normalizedBase) return normalizedPath;
  if (normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`)) return normalizedPath;
  return `${normalizedBase}${normalizedPath}`;
}

/** Bases every entry of an HTML srcset string. */
export function withBaseSrcset(
  srcset: string | undefined,
  base: string = import.meta.env.BASE_URL,
): string | undefined {
  if (!srcset) return undefined;
  return srcset
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, ...descriptor] = entry.split(/\s+/);
      return [withBase(url ?? '', base), ...descriptor].join(' ');
    })
    .join(', ');
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

export function formatMonth(value: string | undefined, locale = 'en'): string {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month) return value;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, day ? Number(day) : 1));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, {
    month: 'short',
    year: 'numeric',
    ...(day ? { day: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

export function formatRange(start: string | undefined, end: string | undefined, locale = 'en'): string {
  const from = formatMonth(start, locale);
  if (!from) return '';
  const to = end ? formatMonth(end, locale) : 'Present';
  return `${from} — ${to}`;
}

export function formatDate(value: string | Date, locale = 'en'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function relativeTime(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = Math.round((date.getTime() - now.getTime()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, seconds] of units) {
    if (Math.abs(diff) >= seconds) return rtf.format(Math.round(diff / seconds), unit);
  }
  return 'just now';
}

/** "#5eead4" -> "94 234 212" so CSS can apply alpha with rgb(var(--x) / a). */
export function hexToRgbChannels(hex: string): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return '94 234 212';
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)).join(' ');
}

/** Darkens a hex colour by mixing towards black — used for AA-contrast accent text on light backgrounds. */
export function darken(hex: string, amount = 0.42): string {
  const channels = hexToRgbChannels(hex).split(' ').map(Number);
  return channels.map((c) => Math.max(0, Math.round(c * (1 - amount)))).join(' ');
}

export function absoluteUrl(path: string, site: string | undefined): string {
  const origin = (site ?? 'https://example.com').replace(/\/+$/, '');
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (origin.endsWith('/') && normalized.startsWith('/')) return `${origin}${normalized.slice(1)}`;
  return `${origin}${normalized}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/** Published projects: featured first, then the explicit order, newest first as a tie-break. */
export function sortProjects<T extends { featured: boolean; order: number; startDate: string; title: string }>(
  projects: T[],
): T[] {
  return [...projects].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    if (a.startDate !== b.startDate) return b.startDate.localeCompare(a.startDate);
    return a.title.localeCompare(b.title);
  });
}

export function normalizeOrder<T extends { order: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, order: index }));
}

export function nextFreeSlug(base: string, taken: readonly string[]): string {
  const root = slugify(base) || 'project';
  if (!taken.includes(root)) return root;
  let n = 2;
  while (taken.includes(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

/** Minimal CSV-safe id source for demos / metrics created in the admin. */
export function makeId(prefix = 'id'): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
