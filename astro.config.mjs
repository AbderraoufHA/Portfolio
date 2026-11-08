import { loadEnv } from 'vite';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

/**
 * GitHub Pages needs both `site` and `base`.
 * - User/org page (repo = <user>.github.io): SITE_URL=https://<user>.github.io, BASE_PATH unset
 * - Project page: SITE_URL=https://<user>.github.io, BASE_PATH=/<repo>
 * - Custom domain: SITE_URL=https://your-domain.tld, BASE_PATH unset
 * The deploy workflow derives these automatically; for local builds set them in the
 * shell or in a git-ignored `.env` (see .env.example). Shell values win over .env.
 *
 * Astro does not hand a `mode` to astro.config.mjs, so read `.env` with the mode
 * Vite/Astro set on NODE_ENV (production for builds, development for `astro dev`).
 */
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const site = process.env.SITE_URL || env.SITE_URL || 'https://your-username.github.io';
const rawBase = (process.env.BASE_PATH ?? env.BASE_PATH ?? '').trim();
const base = !rawBase || rawBase === '/' ? '/' : `/${rawBase.replace(/^\/+|\/+$/g, '')}`;

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  integrations: [react()],
  build: {
    inlineStylesheets: 'auto',
    assets: '_assets',
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  devToolbar: { enabled: false },
});
