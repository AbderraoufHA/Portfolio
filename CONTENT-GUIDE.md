# Content guide

Everything the site renders comes from two places:

```
src/content/site.json               → profile, services, skills, experience, contact, theme
src/content/projects/<slug>.json    → one case study per file
```

Both are validated by `src/lib/schema.ts` at build time. If a field is wrong, the build
stops with the file and the exact path (`projects.0.cover.alt: Alt text is required`).
The same schemas power the admin forms, so the dashboard cannot save something the build
would reject.

You can edit JSON by hand or use `/admin/`. Both produce the same commits; pick whichever
is in front of you.

---

## 1. Site settings

`src/content/site.json` — the fields you will touch most:

```jsonc
{
  "locale": "en",
  "profile": {
    "name": "Your Name",
    "title": "Full-stack & DevOps Engineer",
    "tagline": "One sentence, present tense, concrete.",
    "location": "Remote · Worldwide",
    "timezone": "UTC+1",
    "availability": { "available": true, "label": "Available for new projects — Q1 2027" },
    "yearsExperience": 8,
    "about": "Two short paragraphs separated by a blank line.",
    "cv": "/cv.pdf",
    "avatar": "",
    "terminalLines": ["whoami", "cat role.txt", "ls ./stack", "echo $AVAILABILITY"],
  },
  "socials": {
    "github": "…",
    "linkedin": "…",
    "x": "",
    "telegram": "…",
    "whatsapp": "",
    "calendly": "…",
    "email": "…",
  },
  "services": [{ "id": "product-engineering", "title": "…", "description": "…", "deliverables": ["…"] }],
  "skills": [{ "group": "Frontend", "items": ["TypeScript", "React"] }],
  "experience": [
    {
      "company": "…",
      "role": "…",
      "period": "2023 — Present",
      "summary": "…",
      "highlights": ["…"],
      "url": "",
      "current": true,
    },
  ],
  "testimonials": [{ "id": "t-01", "quote": "…", "author": "…", "role": "…", "company": "…" }],
  "contact": {
    "provider": "web3forms",
    "key": "",
    "email": "…",
    "bookingUrl": "…",
    "responseTime": "…",
    "endpoint": "",
  },
  "analytics": { "provider": "none", "siteId": "", "endpoint": "" },
  "theme": { "accent": "#5eead4", "mode": "dark" },
  "repo": { "owner": "your-username", "name": "portfolio", "branch": "main" },
}
```

Rules and behaviour:

| Field                     | Notes                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `profile.name`            | Also used in the terminal handle, OG title, JSON-LD and footer. Keep it short.             |
| `profile.tagline`         | Hero H1. Max 200 chars. Write an outcome, not a job title.                                 |
| `profile.about`           | Plain text; blank lines become paragraphs. Max 2,000 chars.                                |
| `profile.cv`              | Site-relative path to a PDF in `public/`, e.g. `/cv.pdf`. Empty hides the CV links.        |
| `profile.avatar`          | Optional site-relative image path. Empty hides the avatar.                                 |
| `profile.terminalLines`   | Up to 8 commands; the hero types them and prints the matching output.                      |
| `profile.yearsExperience` | Optional integer; drives the "8+ yrs" stat. Omit for "—".                                  |
| `socials`                 | Only filled values render. `email` is the copy-email action and mailto fallback source.    |
| `services`                | Rendered in order. `deliverables` max 8, each max 80 chars.                                |
| `skills`                  | Each group renders as a terminal-style list. Max 40 items per group.                       |
| `experience`              | `current: true` gets the accent dot. `highlights` max 6, each max 160 chars.               |
| `testimonials`            | Empty array hides the entire section. The samples are labelled and flagged in the admin.   |
| `contact.provider`        | `web3forms`, `formspree` or `mailto`. With no `key`, the form falls back to email.         |
| `contact.responseTime`    | Shown on the contact panel and the hero stat. First clause is used in the hero.            |
| `analytics.provider`      | `none` injects nothing. `goatcounter` needs `siteId`; `umami` needs `siteId` + `endpoint`. |
| `theme.accent`            | Six-digit hex. Text-safe accent is derived automatically.                                  |
| `theme.mode`              | `dark`, `light` or `system`. The visitor's toggle persists over it.                        |
| `repo`                    | Admin binding. `owner` must not be `your-username` or the island refuses to mount.         |

**Sections that hide themselves:** services, skills, experience, testimonials, booking
button, CV links and social links all disappear when their data is empty. You do not need
to delete markup.

**IDs** must be unique within their array, 2–64 characters, alphanumeric with `-` or `_`.
The admin generates them for you.

---

## 2. Projects

File name = slug. `src/content/projects/edge-metrics.json` must contain
`"slug": "edge-metrics"`. The build rejects a mismatch, a duplicate slug or a duplicate
`id`.

```jsonc
{
  "id": "proj-edge-metrics",
  "slug": "edge-metrics",
  "title": "EdgeMetrics",
  "summary": "One or two sentences for the card, meta description fallback and RSS.",
  "problem": "What was broken, slow, missing or expensive?",
  "solution": "What you built, and the one decision that made it work.",
  "description": "Markdown body — context, architecture, trade-offs, result.",
  "status": "published",
  "featured": true,
  "order": 1,
  "startDate": "2025-01",
  "endDate": "2025-06",
  "role": "Lead engineer",
  "client": "Acme",
  "tags": ["observability", "edge"],
  "stack": ["TypeScript", "ClickHouse", "Cloudflare Workers"],
  "links": {
    "repo": "https://github.com/you/repo",
    "live": "https://demo.example.com",
    "caseStudy": "",
  },
  "metrics": [{ "label": "p95 latency", "value": "-82%" }],
  "cover": {
    "src": "/images/projects/edge-metrics/cover.webp",
    "alt": "Dashboard showing ingest throughput and p95 latency",
    "width": 1600,
    "height": 1000,
    "srcset": "/images/projects/edge-metrics/cover-640.webp 640w, /images/projects/edge-metrics/cover.webp 1600w",
  },
  "architecture": { "src": "…", "alt": "…" },
  "gallery": [{ "src": "…", "alt": "…", "caption": "Optional caption" }],
  "demos": [],
  "seo": { "title": "", "description": "", "ogImage": "" },
  "createdAt": "2025-01-12T09:00:00.000Z",
  "updatedAt": "2025-06-30T16:20:00.000Z",
}
```

### Status

| Value       | Home / index | Case study URL | Sitemap + RSS |
| ----------- | ------------ | -------------- | ------------- |
| `draft`     | no           | not built      | no            |
| `published` | yes          | yes            | yes           |
| `archived`  | no           | yes            | no            |

Use `archived` for old work you still want linkable. Use `draft` while writing; its page
does not exist in the build at all.

### Order

Featured projects first, then `order` ascending, then newest `startDate`, then title.
The admin's drag handles rewrite `order` to `0..n-1` across the whole set. Hand-editing?
Leave gaps if you like; only relative order matters.

### Dates

`startDate` and `endDate` accept `YYYY-MM` or `YYYY-MM-DD`. `endDate` empty means
"Present". `createdAt` / `updatedAt` must be full ISO-8601 timestamps with an offset —
the admin writes `new Date().toISOString()`.

### Writing the case study

- `summary` max 240 chars. It is the card copy, the meta description fallback and the RSS
  description. Make it stand alone.
- `problem` and `solution` max 800 chars each. They render as two labelled panels above
  the body and are the fastest way for a reader to decide whether to keep reading.
- `description` is GFM Markdown up to 20,000 chars. Use `##`/`###` headings, lists, tables,
  fenced code, blockquotes and images. Raw HTML is stripped. External links open in a new
  tab with `rel="noopener noreferrer"`.
- `metrics` max 6. Label ≤ 40 chars, value ≤ 24 chars. Numbers with a baseline beat
  adjectives: `p95 1.9s → 380ms`, `-38% cloud spend`, `40k events/s`.
- `role` is required (even for solo work: "Solo engineer"). `client` is optional and
  public — leave it empty for NDA work.
- `links.repo` must be `http(s)`. `links.live` and `links.caseStudy` accept a full URL or
  a site-relative path.

### Images

| Use            | Recommended size       | Notes                                     |
| -------------- | ---------------------- | ----------------------------------------- |
| `cover`        | 1600×1000 (16:10) WebP | Card grid, case-study hero, OG fallback   |
| `gallery`      | 1400–1600 px wide WebP | Up to 12; each needs its own alt text     |
| `architecture` | 1600 px wide diagram   | Optional, rendered inline                 |
| OG override    | 1200×630 WebP/PNG      | Only if the cover is a bad social preview |

Alt text is required on every image and is enforced. Write what the image shows, not
"project screenshot". `width`/`height` prevent layout shift; the admin fills them in.
`srcset` is optional but recommended — the admin writes a 1600w + 900w pair.

The admin uploads to `public/images/projects/<slug>/<slug>-<stamp>-<width>.webp` and
commits the binary and JSON together. Hand-adding images? Put them in the same folder and
reference them with `/images/projects/<slug>/filename.webp`.

---

## 3. Demos

Up to 12 per project. Every demo needs `id`, `label`, `type`, and a target for its type.

### `live` — a deployed URL

```jsonc
{
  "id": "demo-live",
  "label": "Production",
  "type": "live",
  "url": "https://app.example.com",
  "description": "Opens in a new tab. No account required.",
  "status": "stable",
  "date": "2025-06",
}
```

Renders a launch panel, not an iframe. Best for real apps that need auth or a full window.

### `embed` — an iframe you control

```jsonc
{
  "id": "demo-embed",
  "label": "Query explorer",
  "type": "embed",
  "url": "https://demo.example.com/explorer",
  "description": "Try the query builder on 10M synthetic rows.",
}
```

Use a site-relative path (`/demos/...`) or an `https://` URL. The iframe is sandboxed with
`allow-scripts allow-same-origin allow-forms allow-popups`. Only embed content you trust:
`allow-same-origin` plus `allow-scripts` lets the framed page run its own code.

### `video` — YouTube, Vimeo or a local file

```jsonc
{
  "id": "demo-video",
  "label": "2-minute walkthrough",
  "type": "video",
  "url": "https://www.youtube.com/watch?v=…",
  "poster": "/images/projects/edge-metrics/cover.webp",
  "captions": "/demos/edge-metrics/walkthrough.vtt",
}
```

YouTube and Vimeo use a click-to-load poster (no third-party request until the visitor
presses play) and `youtube-nocookie.com`. A local `.mp4`/`.webm` renders a native player;
add a WebVTT `captions` file for accessibility — the admin flags local videos without one.

### `static-build` — a versioned build in the repo

```jsonc
{
  "id": "demo-v140",
  "label": "v1.4.0 — static snapshot",
  "type": "static-build",
  "path": "/demos/edge-metrics/1.4.0/index.html",
  "status": "stable",
  "date": "2025-04",
}
```

Layout:

```
public/demos/<project-slug>/<version>/
  index.html          ← required, at the root of this folder
  assets/…
```

The path must start with `/demos/`. The build is served from the site's own origin inside
the sandboxed iframe, so it must be fully static: no server routes, no API keys, no
external fonts that block. Keep each build self-contained.

**Uploading from the admin:** zip the folder that contains `index.html` (not its parent),
then attach it in the demo row. Limits: 30 MB compressed, 80 MB expanded, 400 files.
A single wrapping directory is stripped automatically. Executables and dotfiles are
dropped. The files are committed in the same commit as the project JSON.

**Replacing a build:** use a new version folder (`1.5.0`) and update `path`. Older
versions stay online as long as another demo references them; unreferenced files are
removed when you upload a replacement through the admin. This is deliberate — old demos
are part of the case study.

---

## 4. Editing through the admin

1. Open `/admin/`, paste the fine-grained token (Contents RW, Actions R).
2. **Projects → New** (or click a row).
3. Fill the form. The Markdown preview is live and sanitized.
4. Upload a cover; it becomes WebP at two widths and is staged in memory.
5. **Save** (`Cmd/Ctrl+S`). One atomic commit: blobs → tree → commit → ref.
6. Wait for the deploy workflow; the Overview tab shows the run.

If the branch moved while you were editing, the save is refused and a conflict modal
appears. Reload to take the remote head, then re-apply your change. Nothing is
force-pushed.

**History** restores JSON from any commit as a new commit. Use it when a hand edit or
import went wrong. **Backup** exports everything as one JSON file; import supports merge
(update by slug, keep the rest) and replace (delete projects absent from the file, with a
confirmation listing them).

---

## 5. Validation errors

The build prints the file and path:

```
✖ Invalid content in /…/src/content/projects/edge-metrics.json
  cover.alt: Alt text is required
  demos.0.url: A URL is required
```

Common ones:

| Message                                   | Fix                                                  |
| ----------------------------------------- | ---------------------------------------------------- |
| `slug "x" must match the filename "y"`    | Rename the file or change `slug`.                    |
| `Use YYYY-MM or YYYY-MM-DD`               | `2025-01` or `2025-01-15`, not `Jan 2025`.           |
| `Alt text is required`                    | Fill `cover.alt` / every `gallery[].alt`.            |
| `Static builds must live under /demos/`   | Path must start `/demos/<slug>/<version>/`.          |
| `Use https://… or a path starting with /` | No protocol-relative `//host` and no `..` traversal. |
| `createdAt: Invalid datetime`             | Full ISO timestamp: `2025-01-12T09:00:00.000Z`.      |
| `Unrecognized key`                        | Field renamed or typo — compare with this guide.     |

Run `npm run check` for types and `npm run build` for content validation before pushing.

---

## 6. Launch checklist

- [ ] `profile.name`, `title`, `tagline`, `about`, `location`, `timezone` are yours.
- [ ] `socials.email` and `contact.email` are real; `repo.owner` is not `your-username`.
- [ ] `public/cv.pdf` replaced; `profile.cv` points at it.
- [ ] At least one `published` project with a cover, alt text, a metric and a demo.
- [ ] Every gallery image has specific alt text.
- [ ] `theme.accent` passes contrast with the dark and light backgrounds.
- [ ] Contact provider + key tested (or `mailto` chosen deliberately).
- [ ] Analytics configured or `provider: "none"`.
- [ ] `SITE_URL` / `BASE_PATH` match the hosting target; canonical URLs are absolute.
- [ ] `/admin/` returns `noindex`; the token is scoped to this repo only.
- [ ] `npm run verify` is green; `npm run test:e2e` passes after a build.
- [ ] The deploy workflow ran once; the Overview tab shows the deploy.
- [ ] Sample testimonials replaced or removed.
- [ ] Favicon, 192/512 icons, maskable icon and manifest name are yours.
