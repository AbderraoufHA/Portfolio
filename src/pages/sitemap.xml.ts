import type { APIRoute } from 'astro';
import { getPublishedProjects, getSite } from '../lib/content';
import { withBase } from '../lib/utils';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const profile = getSite().profile;
  const origin = (site?.toString() ?? 'https://example.com').replace(/\/$/, '');
  const base = import.meta.env.BASE_URL;
  const projects = getPublishedProjects();

  const urls: Array<{ loc: string; lastmod?: string; changefreq?: string; priority?: string }> = [
    { loc: `${origin}${base}`, changefreq: 'weekly', priority: '1.0' },
    { loc: `${origin}${withBase('/projects/')}`, changefreq: 'weekly', priority: '0.8' },
    ...projects.map((project) => ({
      loc: `${origin}${withBase(`/projects/${project.slug}/`)}`,
      lastmod: new Date(project.updatedAt).toISOString().slice(0, 10),
      changefreq: 'monthly',
      priority: project.featured ? '0.9' : '0.7',
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>${url.lastmod ? `\n    <lastmod>${url.lastmod}</lastmod>` : ''}${url.changefreq ? `\n    <changefreq>${url.changefreq}</changefreq>` : ''}${url.priority ? `\n    <priority>${url.priority}</priority>` : ''}
  </url>`,
  )
  .join('\n')}
</urlset>
<!-- ${profile.name} · generated ${new Date().toISOString()} -->
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
