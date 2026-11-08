# Portfolio — static site, Git-backed admin

A production-ready portfolio for an engineer: a fast static Astro site, a typed content
layer, and a private `/admin` dashboard that writes directly to the repository through
the GitHub API. No database, no server, no runtime secrets.

Three sample case studies ship with runnable demos so you can see every surface working
before you replace the copy.

```
Visitor ──► GitHub Pages (static HTML/CSS/JS)
                 │
                 │  build time
                 ▼
        Astro + Zod ──► src/content/*.json
                 ▲              ▲
                 │              │ Git Data API (blobs → tree → commit → ref)
                 │              │
            /admin (React island, token in sessionStorage)
                 │
                 ▼
            api.github.com
```

- **Framework:** Astro 5, static output, TypeScript strict, Tailwind 3.4
- **Admin:** React 19, client-only island, no framework on the public site
- **Validation:** one Zod schema shared by the build and every admin form
- **Deploy:** GitHub Actions → GitHub Pages, with Lighthouse CI on pull requests
- **Content:** JSON on disk, reviewed like code, restorable from Git history

---

## Quick start

Requires Node **20.11+** (CI uses 22) and npm.

```bash
npm ci
npm run dev
```

Open <http://localhost:4321>. The site reads `src/content/site.json` and every
`src/content/projects/*.json` at build time; invalid content fails the build with the
exact field that broke.

| Command            | What it does                                               |
| ------------------ | ---------------------------------------------------------- |
| `npm run dev`      | Astro dev server with HMR                                  |
| `npm run build`    | Static build into `dist/`                                  |
| `npm run preview`  | Serve `dist/` locally (used by the E2E suite)              |
| `npm run check`    | `astro check` — TypeScript + Astro diagnostics             |
| `npm run lint`     | ESLint, zero warnings allowed                              |
| `npm run format`   | Prettier write; `format:check` verifies in CI              |
| `npm run test`     | Vitest unit tests (schemas, helpers, real content)         |
| `npm run test:e2e` | Playwright smoke tests against `npm run build` + `preview` |
| `npm run images`   | Regenerate sample WebP assets and brand icons              |
| `npm run verify`   | Check + lint + format + unit tests + build                 |

The build deliberately fails on:

- a JSON file whose `slug` does not match its filename
- duplicate slugs or duplicate project ids
- an image without alt text, a demo without a target, an unsafe URL
- a missing required field, an invalid date, an over-long field

That is the point: content errors surface in CI, not on the live site.

---

## Configuration

### Site settings — `src/content/site.json`

Everything visitor-facing lives here: profile, socials, services, skills, experience,
testimonials, contact, analytics, theme and the admin's repository binding. The shape is
enforced by `siteSchema` in `src/lib/schema.ts`.

The values that matter before launch:

```jsonc
{
  "profile": {
    "name": "Your Name", // placeholder → admin health check errors
    "cv": "/cv.pdf", // file in public/
    "terminalLines": ["whoami", "..."], // hero terminal
  },
  "socials": { "email": "you@example.com", "github": "https://github.com/your-username" },
  "contact": { "provider": "web3forms", "key": "", "email": "you@example.com" },
  "analytics": { "provider": "none", "siteId": "", "endpoint": "" },
  "theme": { "accent": "#5eead4", "mode": "dark" },
  "repo": {
    "owner": "your-username", // ← must change for /admin to render
    "name": "portfolio",
    "branch": "main",
  },
}
```

**Theme.** `theme.accent` is any six-digit hex. At build time it becomes CSS custom
properties (`--accent-rgb`) and the AA-safe text variant is derived by `darken()`.
`theme.mode` is `dark`, `light` or `system`; the toggle always wins and persists in
`localStorage`.

**Analytics.** `none`, `goatcounter` (site code in `siteId`, e.g. `yourname` for
`yourname.goatcounter.com`) or `umami` (`siteId` = website id, `endpoint` = your Umami
origin). The script is only injected when configured; the public site ships no analytics
by default. `connect-src` and `script-src` in the CSP are widened for exactly those
origins.

**Contact.** `web3forms` or `formspree` with a public form key, or `mailto` for a
no-service fallback. With no key the form degrades to a `mailto:` link. The form has a
hidden `company` honeypot, a 60-second client-side cooldown, and inline validation.
A public form key is public by design — never put a secret in `site.json`.

### Environment — `SITE_URL` and `BASE_PATH`

Read from the shell first, then a git-ignored `.env` (copy `.env.example`).

| Hosting                                | `SITE_URL`                 | `BASE_PATH` |
| -------------------------------------- | -------------------------- | ----------- |
| User/org page (`<user>.github.io`)     | `https://<user>.github.io` | _(empty)_   |
| Project page (`<user>.github.io/repo`) | `https://<user>.github.io` | `/<repo>`   |
| Custom domain                          | `https://your-domain.tld`  | _(empty)_   |

`BASE_PATH` is normalised to a leading slash and no trailing slash. Every internal link,
asset, image `srcset`, RSS/sitemap entry and the admin URL run through `withBase()`, so a
project-page deploy works without editing files. The CI job builds once with
`BASE_PATH=/portfolio` specifically to catch hard-coded paths.

### Fonts and images

Inter and JetBrains Mono are self-hosted as variable WOFF2 in `src/assets/fonts/` and
preloaded with `font-display: swap`; no Google Fonts request, no layout shift from a
third-party connection.

Project images are plain WebP files in `public/images/projects/<slug>/`. The sample
assets are generated, not stock:

```bash
python3 scripts/generate_images.py        # covers, galleries, OG image
python3 scripts/generate_brand_assets.py  # favicon, PNG icons, placeholder cover, CV PDF
npm run images                             # both
```

Replace `public/cv.pdf`, the icons and the placeholder cover with your own. The admin
produces two WebP widths (1600 + 900) at quality 0.82 and writes the `srcset` string into
the project JSON.

---

## The admin dashboard

`/admin/` is a private React island that reads and writes this repository through the
GitHub REST + Git Data API. There is no backend and no OAuth app to host.

### 1. Bind the repository

Set `repo.owner`, `repo.name` and `repo.branch` in `src/content/site.json`, commit, and
let the deploy rebuild. Until `owner` stops being `your-username`, `/admin/` renders a
configuration notice instead of the app. The coordinates are baked into the HTML at
build time because the browser needs them before it has a token.

### 2. Create a fine-grained token

GitHub → Settings → Developer settings → **Fine-grained personal access tokens**:

| Permission   | Access       | Why                                    |
| ------------ | ------------ | -------------------------------------- |
| **Contents** | Read & write | read JSON, commit via the Git Data API |
| **Actions**  | Read         | deploy status and recent workflow runs |
| **Metadata** | Read         | mandatory, granted automatically       |

Scope it to **only this repository**, set the shortest expiry you tolerate, and paste it
into `/admin/`. No other scopes are needed.

### 3. Session model

- Token is stored in **`sessionStorage`** — per tab, cleared when the tab closes.
- Never in `localStorage`, a cookie, a URL, the build, or a log.
- Session expires after **30 minutes without input**; a warning appears **2 minutes**
  before expiry so a long edit is not lost silently.
- The only network destination is `api.github.com`, enforced in production by the page's
  CSP `connect-src`.
- "Sign out" clears the session immediately.

### What you can do

- **Overview** — repository KPIs, latest deploy + workflow runs, recent commits,
  GoatCounter public counter (graceful CORS failure), Umami dashboard link, health checks
  and image-weight probes.
- **Projects** — search, filter by status, drag to reorder, publish/unpublish, duplicate,
  delete, create. Reordering writes normalised `order` values for every project.
- **Editor** — Zod-validated fields, live Markdown preview (`marked` + DOMPurify), cover
  and gallery uploads with WebP conversion, metrics, demos, SEO overrides. `Cmd/Ctrl+S`
  saves; unsaved changes trigger a leave guard.
- **Demos** — four types: `live`, `embed`, `video`, `static-build`. Upload a zipped
  static build and it is committed in the same commit as the project JSON.
- **Settings** — profile, socials, services, skills, experience, testimonials, contact,
  analytics, theme and repository paths, all against the same schema.
- **History** — browse commits, inspect the diff of a JSON file, restore an older
  version as a new commit. Binary files are intentionally restore-by-hand.
- **Backup** — export `{ site, projects, head }` as JSON; import in merge or replace mode
  with a confirmation listing the deletions.

### How a save works

Every write is one atomic commit built with the Git Data API:

1. create blobs for changed JSON and staged binary files
2. create a tree based on the current head
3. create a commit with the current head as parent
4. patch the branch ref with `expectedHead`

If the branch moved between load and save (another tab, a phone, a manual push), GitHub
rejects the ref update; the client surfaces a conflict modal with the remote head and
offers reload. Nothing is force-pushed and no edit is silently merged.

Static build uploads are unzipped in the browser with `fflate` before committing. Limits:
**30 MB** compressed, **80 MB** expanded, **400 files**, `index.html` required at the
root, executable/script-like extensions and dotfiles dropped, and a single wrapping
directory is stripped automatically. Only files referenced by the current demo paths are
kept when an older build is replaced.

### Security limits — read this

- **`noindex` is not access control.** The admin HTML is public; the token is the lock.
  A token with Contents write can do anything you can do to the repo.
- **CSP is a meta tag, not a server header.** It blocks injected scripts and restricts
  `connect-src` in modern browsers, but it is served by GitHub Pages, which does not let
  you set headers. Treat it as defence in depth.
- **XSS would be enough.** Content you render is sanitized (`sanitize-html` at build,
  DOMPurify in the preview) and Astro escapes by default, but a compromised dependency
  running in the admin page could read the token. Keep dependencies updated; Dependabot
  is configured.
- **Revocation is manual.** Delete the token on GitHub; there is no server session to
  kill. Rotate it if a device is lost.
- **No audit trail beyond Git.** Commits show what changed, not who typed it — commits
  are authored by the token owner.

If you want real access control, put the admin behind **Cloudflare Access** or a
Cloudflare Worker that performs the GitHub OAuth web flow and injects the token
server-side. That is the natural upgrade; it is intentionally not required to run this.

---

## Content authoring

See **[CONTENT-GUIDE.md](./CONTENT-GUIDE.md)** for field-by-field instructions, demo
recipes, image sizes and a launch checklist. In short:

- One project per file: `src/content/projects/<slug>.json`; `slug` must equal the filename.
- `status`: `draft` (not built), `published` (indexed, in sitemap/RSS), `archived`
  (reachable by URL, absent from index/sitemap).
- `featured` projects sort first, then `order` ascending, then newest `startDate`.
- Markdown is GFM, sanitized with a strict allow-list; raw HTML in Markdown is dropped.
- Empty `testimonials` hides the section. Empty sections do not render.
- Sample testimonials are labelled "Sample testimonial" and flagged in the admin.

Public surface:

| Route               | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `/`                 | Hero, featured work, services, stack, about, testimonials |
| `/projects/`        | Full index with tag filters and live search               |
| `/projects/<slug>/` | Case study: problem, solution, metrics, gallery, demos    |
| `/admin/`           | Private dashboard (noindex, no public navigation)         |
| `/sitemap.xml`      | Published pages only, absolute URLs with base path        |
| `/rss.xml`          | Published projects, newest first                          |
| `/robots.txt`       | Allows public routes, disallows `/admin`                  |
| `/404.html`         | Static not-found page with recovery links                 |

SEO: per-page title/description/canonical/OG/Twitter, JSON-LD `Person` + `WebSite` on the
home page, `CreativeWork` on case studies, absolute OG images, `max-image-preview:large`.
No cookie banner because there are no cookies.

---

## Deployment

### GitHub Pages

1. Push the repository to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main` (or run **Deploy to GitHub Pages** manually).

`.github/workflows/deploy.yml` runs type-check, lint, format check and unit tests, then
`actions/configure-pages` resolves the origin and base path from the repository's Pages
settings. That is what makes the same code work on a user page, a project page and a
custom domain without edits. Build output goes to `dist/` and is published with
`actions/deploy-pages`.

Custom domain: add it in Pages settings (or a `public/CNAME` file), set `SITE_URL` in the
build environment if you want canonical URLs before DNS propagates, and keep `BASE_PATH`
empty.

### Pull requests

`.github/workflows/ci.yml` runs on every PR:

1. types, lint, format, unit tests
2. a build with `BASE_PATH=/portfolio` to prove base-path safety
3. Playwright smoke tests at the root base
4. Lighthouse CI (performance, accessibility, best practices, SEO) with warnings

Lighthouse asserts are **warnings**, not hard gates, so a noisy CI runner cannot block a
content fix. Tighten them in `lighthouserc.json` once you have a baseline. Dependabot
opens grouped weekly npm and monthly Actions updates.

The production CSP is a `<meta http-equiv>` tag only outside `astro dev` — Vite's HMR
needs inline scripts and websockets that the production policy deliberately forbids.
To verify the shipped policy, build and check `dist/index.html`: the inline theme boot
script's SHA-256 is computed into the policy during the build, so the two cannot drift.

---

## Project layout

```
src/
  content/
    site.json                  # all site settings + repo binding
    projects/*.json            # one case study per file
  lib/
    schema.ts                  # Zod schemas — the single contract
    content.ts                 # build-time load + validation
    markdown.ts                # marked + sanitize-html
    utils.ts                   # base-path, dates, ordering, colours
  layouts/BaseLayout.astro     # SEO, JSON-LD, CSP, fonts, analytics
  components/                  # public sections, palette, demos, cards
  pages/                       # routes + sitemap/robots/rss endpoints
  scripts/site.ts              # public behaviour (no framework)
  admin/
    AdminApp.tsx               # shell, hash routing, auth, conflicts
    github.ts                  # REST + Git Data client, atomic commits
    data.ts                    # load/save/reorder/restore helpers
    image.ts / zip.ts          # WebP pipeline, static build extraction
    health.ts                  # content + image-weight checks
    screens/                   # Overview, Projects, Editor, Settings, History, Backup
  styles/global.css            # tokens, components, prose, admin primitives
public/
  demos/<slug>/<version>/      # runnable static demos
  images/projects/<slug>/      # WebP covers and galleries
  cv.pdf, favicon.svg, icons, site.webmanifest
tests/                         # Vitest
e2e/                           # Playwright
scripts/                       # asset generators
```

---

## Quality

- **Type safety:** `astro check` with `strict`, `noUncheckedIndexedAccess`,
  `noUnusedLocals`, `verbatimModuleSyntax`.
- **Content safety:** every JSON file parsed by Zod at build time; the admin imports the
  same schemas, so the form and the build cannot disagree.
- **Markdown:** rendered by `marked`, then sanitized by `sanitize-html` with an explicit
  tag/attribute allow-list; external links get `rel="noopener noreferrer"`. The admin
  preview uses DOMPurify with an equivalent allow-list.
- **E2E:** metadata, theme persistence, command palette, project filters, demo tabs,
  static endpoints, admin noindex, 404 status, mobile CTA.
- **a11y:** skip link, focus-visible styles, labelled controls, tab semantics on demos,
  `aria-live` counts, reduced-motion media query, no keyboard traps in the palette.

Run everything:

```bash
npm run check && npm run lint && npm run format:check && npm run test
npm run build && npm run test:e2e
```

---

## What ships as sample content

| Project              | Story                                    | Demos                               |
| -------------------- | ---------------------------------------- | ----------------------------------- |
| EdgeMetrics          | Realtime observability at the edge       | live, static snapshot, video, embed |
| k8s-rollout-operator | Safe progressive delivery for Kubernetes | live, static simulator, embed       |
| LedgerLite           | Double-entry accounting for a fintech    | live, static sandbox, video         |

The static demos in `public/demos/` are real, self-contained pages: open them directly or
via the case-study tab switcher. They are sandboxed iframes
(`allow-scripts allow-same-origin allow-forms allow-popups`) — that combination allows a
demo to run its own JS but is not a security boundary against the demo's own code. Only
commit demos you trust, and prefer separate origins for untrusted third-party builds.

---

## Limits of a static site + GitHub-API admin

Be clear-eyed about the trade-offs:

1. **Build latency is publish latency.** A save is a commit; the site changes when Pages
   finishes the workflow (tens of seconds). There is no instant preview and no draft
   preview URL out of the box.
2. **GitHub API limits.** Fine-grained tokens get 5,000 requests/hour; Git Data commits
   use a handful each. Large media (many MB per image, hundreds of files per build) is a
   poor fit — use a CDN or Git LFS for video.
3. **No real access control.** Anyone can load `/admin/`. The token is the only gate, and
   a compromised browser/dependency can read it. Put Cloudflare Access or an OAuth
   Worker in front for genuine auth.
4. **No server-side image processing.** WebP conversion happens in the browser, so the
   admin needs a modern browser; EXIF stripping and colour profiles depend on canvas.
5. **No comments, search index, or form backend.** Contact relies on Web3Forms/Formspree
   or `mailto`; search is client-side over the loaded cards.
6. **Analytics are privacy-first and limited.** GoatCounter's public counter is read-only;
   Umami's stats API needs a server key, so the admin links to its dashboard instead.
7. **Binary history is not restorable in-app.** History restores JSON text; images and
   static builds are restored by re-uploading or via Git.
8. **GitHub Pages cannot set headers.** CSP is a meta tag, no HSTS/COOP/COEP control,
   and no server redirects (Astro emits static pages).
9. **The schema is the contract.** Renaming a field means updating `schema.ts`, the
   affected admin form and existing JSON in the same commit. There is no migration tool.

---

## Customise first

1. `src/content/site.json` — name, title, tagline, email, socials, location, availability.
   The admin's health panel lists every remaining placeholder.
2. `public/cv.pdf` — replace the generated placeholder.
3. `src/content/projects/*.json` — rewrite the three samples; keep one until you have a
   real replacement so the layout never looks empty.
4. `public/images/projects/<slug>/` — real screenshots, 1600px wide WebP covers.
5. `repo.owner` / `repo.name` — bind `/admin`, rebuild.
6. `theme.accent` — one hex value re-themes the entire site.
7. Contact provider + key, then analytics if you want them.
8. `public/favicon.svg`, `icon-*.png`, `apple-touch-icon.png`, `site.webmanifest` — your
   own mark and name.

## Revisit as it grows

- Move uploaded media to object storage or a CDN when images pass ~50 MB total.
- Add Cloudflare Access or the OAuth Worker before sharing `/admin` beyond one person.
- Split content into Astro content collections if you want per-file Markdown bodies and
  schema-derived types from `src/content.config.ts`.
- Add `@astrojs/sitemap` with `i18n` if the site becomes multilingual; the custom endpoint
  is deliberately simple.
- Replace client-side filtering with a prebuilt JSON index (Pagefind) after ~50 projects.
- Add visual regression snapshots for the case-study layout if more than one person edits.
- If deploys get slow, cache `node_modules` and skip the duplicate root build in CI; the
  base-path build already proves the risky part.
- Re-evaluate the token model if GitHub ships fine-grained token restrictions per origin;
  today it is the simplest secure-enough option for a one-person site.

---

## Credits

Astro, React, Tailwind CSS, Zod, marked, sanitize-html, DOMPurify, fflate, Vitest,
Playwright. Fonts: Inter (Rasmus Andersson), JetBrains Mono (JetBrains), SIL Open Font
License. All sample copy and imagery are generated for this repository.
