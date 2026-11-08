import type { APIRoute } from 'astro';
import { withBase } from '../lib/utils';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = (site?.toString() ?? 'https://example.com').replace(/\/$/, '');
  const body = `# robots.txt for ${origin}
User-agent: *
Allow: /
Disallow: /admin

# Content is public and static. Admin is token-gated and noindexed.
Sitemap: ${origin}${withBase('/sitemap.xml')}
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
