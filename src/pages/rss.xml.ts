import type { APIRoute } from 'astro';
import { getPublishedProjects, getSite } from '../lib/content';
import { escapeHtml, withBase } from '../lib/utils';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const siteData = getSite();
  const origin = (site?.toString() ?? 'https://example.com').replace(/\/$/, '');
  const projects = [...getPublishedProjects()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const items = projects
    .map((project) => {
      const url = `${origin}${withBase(`/projects/${project.slug}/`)}`;
      return `    <item>
      <title>${escapeHtml(project.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${escapeHtml(project.summary)}</description>
      <pubDate>${new Date(project.updatedAt).toUTCString()}</pubDate>
      <category>${escapeHtml(project.tags[0] ?? 'project')}</category>
    </item>`;
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(siteData.profile.name)} — projects</title>
    <link>${origin}${withBase('/projects/')}</link>
    <description>${escapeHtml(siteData.profile.tagline)}</description>
    <language>${siteData.locale}</language>
    <atom:link href="${origin}${withBase('/rss.xml')}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
