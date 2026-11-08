import { useEffect, useMemo, useRef, useState } from 'react';
import { projectSchema, type Project } from '../../lib/schema';
import { slugify } from '../../lib/utils';
import { ConflictError, type FileToCommit, type GitHubClient } from '../github';
import { saveProject } from '../data';
import { readingMinutes, renderPreview, wordCount } from '../markdown';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Switch, Textarea, useToast } from '../ui';
import MediaField, { type PendingMedia } from '../parts/MediaField';
import DemosEditor from '../parts/DemosEditor';
import type { ZodError } from 'zod';

type Tab = 'basics' | 'content' | 'media' | 'demos' | 'seo';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'content', label: 'Content' },
  { id: 'media', label: 'Media' },
  { id: 'demos', label: 'Demos' },
  { id: 'seo', label: 'SEO' },
];

interface Props {
  client: GitHubClient;
  project: Project;
  mode: 'new' | 'edit';
  head: string;
  base: string;
  existingSlugs: string[];
  onSaved: (project: Project) => Promise<void>;
  onBack: () => void;
  onConflictReload: () => void;
}

function errorMap(error: ZodError): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_root';
    if (!map[key]) map[key] = issue.message;
  }
  return map;
}

function tabForPath(path: string): Tab {
  if (path.startsWith('cover') || path.startsWith('gallery') || path.startsWith('architecture')) return 'media';
  if (path.startsWith('demos')) return 'demos';
  if (path.startsWith('seo')) return 'seo';
  if (
    path.startsWith('description') ||
    path.startsWith('problem') ||
    path.startsWith('solution') ||
    path.startsWith('tags') ||
    path.startsWith('stack') ||
    path.startsWith('metrics')
  ) {
    return 'content';
  }
  return 'basics';
}

/** Drops empty gallery and metric rows so a stray blank card cannot block the save. */
function prepare(draft: Project): Project {
  return {
    ...draft,
    tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    stack: draft.stack.map((item) => item.trim()).filter(Boolean),
    metrics: draft.metrics.filter((metric) => metric.label.trim() && metric.value.trim()),
    gallery: draft.gallery.filter((image) => image.src.trim().length > 0),
    problem: draft.problem ?? '',
    solution: draft.solution ?? '',
    endDate: draft.endDate ?? '',
    client: draft.client ?? '',
  };
}

function referencedImages(project: Project): Set<string> {
  const set = new Set<string>();
  if (project.cover.src) set.add(project.cover.src);
  if (project.architecture?.src) set.add(project.architecture.src);
  for (const image of project.gallery) if (image.src) set.add(image.src);
  return set;
}

function staticPrefixes(project: Project, client: GitHubClient): string[] {
  return project.demos
    .filter((demo) => demo.type === 'static-build' && demo.path)
    .map((demo) => {
      const match = demo.path?.match(/^\/demos\/([^/]+)\/([^/]+)\//);
      return match ? `${client.repo.demosDir}/${match[1]}/${match[2]}` : '';
    })
    .filter(Boolean);
}

function publicSitePath(base: string, slug: string, status: Project['status']): string | null {
  if (status === 'draft') return null;
  return `${base.replace(/\/$/, '')}/projects/${slug}/`;
}

export default function Editor({
  client,
  project,
  mode,
  head,
  base,
  existingSlugs,
  onSaved,
  onBack,
  onConflictReload,
}: Props) {
  const toast = useToast();
  const [draft, setDraft] = useState<Project>(() => project);
  const [baseline, setBaseline] = useState(() => JSON.stringify(prepare(project)));
  const [tab, setTab] = useState<Tab>('basics');
  const [showErrors, setShowErrors] = useState(false);
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [staticFiles, setStaticFiles] = useState<FileToCommit[]>([]);
  const [busy, setBusy] = useState(false);
  const [slugEdited, setSlugEdited] = useState(mode === 'edit');
  const [tagsText, setTagsText] = useState(() => project.tags.join(', '));
  const [stackText, setStackText] = useState(() => project.stack.join(', '));
  const [preview, setPreview] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const saveRef = useRef<(overrideHead?: string) => Promise<void>>(async () => {});

  const prepared = useMemo(() => prepare(draft), [draft]);
  const validation = useMemo(() => projectSchema.safeParse(prepared), [prepared]);
  const errors = useMemo(() => (validation.success ? {} : errorMap(validation.error)), [validation]);
  const errorCount = Object.keys(errors).length;

  const pendingMap = useMemo(() => new Map(pending.map((item) => [item.publicPath, item])), [pending]);
  const previewFor = useMemo(() => (src: string) => pendingMap.get(src)?.previewUrl, [pendingMap]);

  const dirty = useMemo(() => {
    if (JSON.stringify(prepared) !== baseline) return true;
    const referenced = referencedImages(prepared);
    if (pending.some((item) => !item.committed && referenced.has(item.publicPath))) return true;
    return staticFiles.length > 0;
  }, [prepared, baseline, pending, staticFiles]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function update(changes: Partial<Project>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function addPending(files: PendingMedia[]) {
    setPending((current) => [...current, ...files]);
  }

  async function save(overrideHead?: string) {
    if (busy) return;
    setBusy(true);
    setShowErrors(true);

    const next = prepare(draft);
    const parsed = projectSchema.safeParse(next);
    if (!parsed.success) {
      const map = errorMap(parsed.error);
      const first = parsed.error.issues[0];
      const nextTab = first ? tabForPath(first.path.join('.')) : 'basics';
      setTab(nextTab);
      toast.push(
        `Fix ${Object.keys(map).length} field(s) before saving — ${first?.message ?? 'invalid content'}.`,
        'bad',
      );
      setBusy(false);
      return;
    }

    const slugChanged = mode === 'edit' ? parsed.data.slug !== project.slug : true;
    if (slugChanged && existingSlugs.includes(parsed.data.slug) && parsed.data.slug !== project.slug) {
      setTab('basics');
      toast.push(`The slug “${parsed.data.slug}” is already used by another project.`, 'bad');
      setBusy(false);
      return;
    }

    const referenced = referencedImages(parsed.data);
    const mediaFiles = pending
      .filter((item) => !item.committed && referenced.has(item.publicPath))
      .map((item) => item.file);
    const prefixes = staticPrefixes(parsed.data, client);
    const builds = staticFiles.filter((file) => prefixes.some((prefix) => file.path.startsWith(`${prefix}/`)));

    try {
      const result = await saveProject(client, parsed.data, {
        expectedHead: overrideHead ?? head,
        previousSlug: mode === 'edit' ? project.slug : undefined,
        extraFiles: [...mediaFiles, ...builds],
        message: `${mode === 'edit' ? 'content: update' : 'content: add'} project ${parsed.data.slug}${
          parsed.data.status === 'draft' ? ' (draft)' : ''
        }`,
      });
      setDraft(result.project);
      setBaseline(JSON.stringify(prepare(result.project)));
      setPending((current) =>
        current.map((item) => (referenced.has(item.publicPath) ? { ...item, committed: true } : item)),
      );
      setStaticFiles([]);
      setShowErrors(false);
      toast.push(
        `Committed ${result.sha.slice(0, 7)}${mediaFiles.length || builds.length ? ` with ${mediaFiles.length + builds.length} asset(s)` : ''}. Deploy starts in a moment.`,
        'ok',
      );
      await onSaved(result.project);
    } catch (caught) {
      if (caught instanceof ConflictError) {
        setConflict(caught.remoteHead);
        return;
      }
      toast.push(caught instanceof Error ? caught.message : 'Save failed.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  function requestBack() {
    if (dirty) setLeaveOpen(true);
    else onBack();
  }

  const sitePath = publicSitePath(base, draft.slug, draft.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={requestBack} className="mono text-[11px] text-muted hover:text-accent">
            ← all projects
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{draft.title || 'Untitled project'}</h1>
            <Badge tone={draft.status === 'published' ? 'ok' : draft.status === 'draft' ? 'warn' : 'muted'}>
              {draft.status}
            </Badge>
            {dirty && <span className="mono text-[10px] uppercase tracking-wider text-amber-300">unsaved</span>}
          </div>
          <p className="mono mt-1 text-[10.5px] text-muted">
            {client.repo.contentDir}/{draft.slug}.json
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sitePath && (
            <a href={sitePath} target="_blank" rel="noopener noreferrer">
              <Button size="sm">View live ↗</Button>
            </a>
          )}
          <Button size="sm" onClick={requestBack}>
            Close
          </Button>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void save()} disabled={busy}>
            {mode === 'new' ? 'Create project' : 'Save & commit'}
          </Button>
        </div>
      </div>

      {showErrors && errorCount > 0 && (
        <Alert tone="bad" title={`${errorCount} field${errorCount === 1 ? '' : 's'} need attention`}>
          <ul className="mt-1 space-y-0.5">
            {Object.entries(errors)
              .slice(0, 4)
              .map(([path, message]) => (
                <li key={path}>
                  <button
                    type="button"
                    className="text-left underline decoration-red-400/40 underline-offset-4 hover:decoration-red-400"
                    onClick={() => setTab(tabForPath(path))}
                  >
                    <span className="mono">{path}</span> — {message}
                  </button>
                </li>
              ))}
          </ul>
        </Alert>
      )}

      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Project editor sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={
              tab === item.id
                ? 'border-b-2 border-accent px-3 py-2 text-[13px] font-medium text-ink'
                : 'border-b-2 border-transparent px-3 py-2 text-[13px] text-muted hover:text-ink'
            }
          >
            {item.label}
            {item.id === 'demos' && draft.demos.length > 0 && (
              <span className="mono ml-1.5 text-[10px] text-muted">{draft.demos.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'basics' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" htmlFor="p-title" required error={errors['title']} className="sm:col-span-2">
                <Input
                  id="p-title"
                  value={draft.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    update({ title, ...(slugEdited ? {} : { slug: slugify(title) }) });
                  }}
                  aria-invalid={errors['title'] ? 'true' : undefined}
                />
              </Field>

              <Field
                label="Slug"
                htmlFor="p-slug"
                required
                error={errors['slug']}
                hint={`Public URL: /projects/${draft.slug || 'slug'}/`}
              >
                <Input
                  id="p-slug"
                  value={draft.slug}
                  onChange={(event) => {
                    setSlugEdited(true);
                    update({ slug: event.target.value });
                  }}
                  className="mono"
                  aria-invalid={errors['slug'] ? 'true' : undefined}
                />
              </Field>

              <Field label="Role" htmlFor="p-role" required error={errors['role']}>
                <Input
                  id="p-role"
                  value={draft.role}
                  onChange={(event) => update({ role: event.target.value })}
                  placeholder="Lead engineer"
                  aria-invalid={errors['role'] ? 'true' : undefined}
                />
              </Field>

              <Field
                label="Summary"
                htmlFor="p-summary"
                required
                error={errors['summary']}
                hint={`${draft.summary.length}/240 — used on cards, search results and the meta description fallback`}
                className="sm:col-span-2"
              >
                <Textarea
                  id="p-summary"
                  rows={3}
                  value={draft.summary}
                  onChange={(event) => update({ summary: event.target.value })}
                  aria-invalid={errors['summary'] ? 'true' : undefined}
                />
              </Field>

              <Field
                label="Start date"
                htmlFor="p-start"
                required
                error={errors['startDate']}
                hint="YYYY-MM or YYYY-MM-DD"
              >
                <Input
                  id="p-start"
                  value={draft.startDate}
                  onChange={(event) => update({ startDate: event.target.value })}
                  className="mono"
                />
              </Field>
              <Field label="End date" htmlFor="p-end" error={errors['endDate']} hint="Leave empty for ongoing work">
                <Input
                  id="p-end"
                  value={draft.endDate ?? ''}
                  onChange={(event) => update({ endDate: event.target.value })}
                  className="mono"
                />
              </Field>

              <Field label="Status" htmlFor="p-status">
                <Select
                  id="p-status"
                  value={draft.status}
                  onChange={(event) => update({ status: event.target.value as Project['status'] })}
                >
                  <option value="draft">Draft — hidden from the site</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived — page stays, unlisted</option>
                </Select>
              </Field>
              <Field label="Order" htmlFor="p-order" hint="Lower sorts first within featured / normal groups">
                <Input
                  id="p-order"
                  type="number"
                  min={0}
                  max={9999}
                  value={draft.order}
                  onChange={(event) => update({ order: Number(event.target.value) || 0 })}
                  className="mono"
                />
              </Field>

              <div className="sm:col-span-2">
                <Switch
                  checked={draft.featured}
                  onChange={(featured) => update({ featured })}
                  label="Featured"
                  description="Featured projects appear first on the home page and in the command palette."
                />
              </div>

              <Field label="Client (optional)" htmlFor="p-client" error={errors['client']}>
                <Input
                  id="p-client"
                  value={draft.client ?? ''}
                  onChange={(event) => update({ client: event.target.value })}
                  placeholder="Confidential — Series A SaaS"
                />
              </Field>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-[13px] font-semibold">Links</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Repository" htmlFor="p-repo" error={errors['links.repo']}>
                <Input
                  id="p-repo"
                  value={draft.links.repo ?? ''}
                  onChange={(event) => update({ links: { ...draft.links, repo: event.target.value } })}
                  placeholder="https://github.com/…"
                  className="mono"
                />
              </Field>
              <Field label="Live site" htmlFor="p-live" error={errors['links.live']}>
                <Input
                  id="p-live"
                  value={draft.links.live ?? ''}
                  onChange={(event) => update({ links: { ...draft.links, live: event.target.value } })}
                  placeholder="https://…"
                  className="mono"
                />
              </Field>
              <Field label="Case study" htmlFor="p-case" error={errors['links.caseStudy']}>
                <Input
                  id="p-case"
                  value={draft.links.caseStudy ?? ''}
                  onChange={(event) => update({ links: { ...draft.links, caseStudy: event.target.value } })}
                  placeholder="/projects/other/"
                  className="mono"
                />
              </Field>
            </div>
          </Card>
        </div>
      )}

      {tab === 'content' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Problem" htmlFor="p-problem" hint={`${(draft.problem ?? '').length}/800`}>
                <Textarea
                  id="p-problem"
                  rows={4}
                  value={draft.problem ?? ''}
                  onChange={(event) => update({ problem: event.target.value })}
                  placeholder="What was broken, slow, missing or expensive?"
                />
              </Field>
              <Field label="Solution" htmlFor="p-solution" hint={`${(draft.solution ?? '').length}/800`}>
                <Textarea
                  id="p-solution"
                  rows={4}
                  value={draft.solution ?? ''}
                  onChange={(event) => update({ solution: event.target.value })}
                  placeholder="What you built, and the one decision that made it work."
                />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div>
                <h2 className="text-[13px] font-semibold">Case study</h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  Markdown · {wordCount(draft.description)} words · {readingMinutes(draft.description)} min read
                </p>
              </div>
              <div className="flex gap-1" role="group" aria-label="Editor mode">
                <Button
                  size="sm"
                  variant={preview ? 'quiet' : 'ghost'}
                  onClick={() => setPreview(false)}
                  aria-pressed={!preview}
                >
                  Write
                </Button>
                <Button
                  size="sm"
                  variant={preview ? 'ghost' : 'quiet'}
                  onClick={() => setPreview(true)}
                  aria-pressed={preview}
                >
                  Preview
                </Button>
              </div>
            </div>
            <div className="p-4">
              {preview ? (
                <div className="prose-doc min-h-[18rem] rounded-lg border border-line bg-bg p-4">
                  {draft.description.trim() ? (
                    <div dangerouslySetInnerHTML={{ __html: renderPreview(draft.description) }} />
                  ) : (
                    <p className="text-muted">Nothing to preview yet.</p>
                  )}
                </div>
              ) : (
                <Field
                  label="Description"
                  htmlFor="p-description"
                  required
                  error={errors['description']}
                  hint="Supports headings, lists, tables, code blocks and links. Raw HTML is stripped."
                >
                  <Textarea
                    id="p-description"
                    rows={18}
                    value={draft.description}
                    onChange={(event) => update({ description: event.target.value })}
                    className="mono text-[12.5px]"
                    aria-invalid={errors['description'] ? 'true' : undefined}
                  />
                </Field>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-[13px] font-semibold">Metrics</h2>
            <div className="space-y-2">
              {draft.metrics.map((metric, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    value={metric.label}
                    onChange={(event) => {
                      const metrics = [...draft.metrics];
                      metrics[index] = { ...metric, label: event.target.value };
                      update({ metrics });
                    }}
                    placeholder="p95 latency"
                    aria-label={`Metric ${index + 1} label`}
                  />
                  <Input
                    value={metric.value}
                    onChange={(event) => {
                      const metrics = [...draft.metrics];
                      metrics[index] = { ...metric, value: event.target.value };
                      update({ metrics });
                    }}
                    placeholder="-82%"
                    aria-label={`Metric ${index + 1} value`}
                    className="mono"
                  />
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => update({ metrics: draft.metrics.filter((_, current) => current !== index) })}
                    aria-label={`Remove metric ${index + 1}`}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => update({ metrics: [...draft.metrics, { label: '', value: '' }] })}
              disabled={draft.metrics.length >= 6}
            >
              Add metric
            </Button>
            <p className="field-hint">Up to six. Empty rows are dropped on save.</p>
          </Card>

          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tags" htmlFor="p-tags" hint="Comma separated, max 12. Shown on cards and used by filters.">
                <Input
                  id="p-tags"
                  value={tagsText}
                  onChange={(event) => {
                    setTagsText(event.target.value);
                    update({
                      tags: event.target.value
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                        .slice(0, 12),
                    });
                  }}
                  placeholder="distributed systems, observability"
                />
              </Field>
              <Field label="Stack" htmlFor="p-stack" hint="Comma separated, max 24.">
                <Input
                  id="p-stack"
                  value={stackText}
                  onChange={(event) => {
                    setStackText(event.target.value);
                    update({
                      stack: event.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .slice(0, 24),
                    });
                  }}
                  placeholder="Go, ClickHouse, Kubernetes"
                />
              </Field>
            </div>
          </Card>
        </div>
      )}

      {tab === 'media' && (
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-1 text-[13px] font-semibold">Cover</h2>
            <p className="mb-3 text-[11.5px] text-muted">
              Used on the card grid, the case study hero and the Open Graph image. Uploads convert to WebP at two
              widths.
            </p>
            <MediaField
              label="Cover image"
              slug={draft.slug}
              client={client}
              base={base}
              required
              widths={[1600, 900]}
              value={draft.cover.src ? draft.cover : undefined}
              error={errors['cover.src'] ?? errors['cover.alt']}
              previewFor={previewFor}
              onFiles={addPending}
              onChange={(image) => update({ cover: image ?? { src: '', alt: '' } })}
            />
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-[13px] font-semibold">Architecture diagram (optional)</h2>
            <p className="mb-3 text-[11.5px] text-muted">Rendered between the summary and the case study body.</p>
            <MediaField
              label="Architecture"
              slug={draft.slug}
              client={client}
              base={base}
              widths={[1600, 900]}
              value={draft.architecture?.src ? draft.architecture : undefined}
              previewFor={previewFor}
              onFiles={addPending}
              onChange={(image) => update({ architecture: image })}
            />
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[13px] font-semibold">Gallery</h2>
                <p className="text-[11.5px] text-muted">Up to 12 images. Each needs alt text.</p>
              </div>
              <Button
                size="sm"
                onClick={() => update({ gallery: [...draft.gallery, { src: '', alt: '' }] })}
                disabled={draft.gallery.length >= 12}
              >
                Add image
              </Button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {draft.gallery.map((image, index) => (
                <MediaField
                  key={index}
                  label={`Image ${index + 1}`}
                  slug={draft.slug}
                  client={client}
                  base={base}
                  compact
                  widths={[1400, 700]}
                  value={image.src ? image : undefined}
                  error={errors[`gallery.${index}.alt`] ?? errors[`gallery.${index}.src`]}
                  previewFor={previewFor}
                  onFiles={addPending}
                  onChange={(next) => {
                    const gallery = [...draft.gallery];
                    if (next) gallery[index] = next;
                    else gallery.splice(index, 1);
                    update({ gallery });
                  }}
                />
              ))}
            </div>
            {draft.gallery.length === 0 && (
              <p className="text-[12px] text-muted">No gallery images. The cover carries the page on its own.</p>
            )}
          </Card>

          <Alert tone="info" title="Images are committed with the JSON">
            Uploaded files land in{' '}
            <span className="mono">
              {client.repo.imagesDir}/{draft.slug}/
            </span>{' '}
            in the same commit as this project, so the two can never drift apart. Replacing an image does not delete the
            old file from Git history.
          </Alert>
        </div>
      )}

      {tab === 'demos' && (
        <Card className="p-4">
          <div className="mb-3">
            <h2 className="text-[13px] font-semibold">Demos</h2>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Live links, iframe embeds, video facades, and versioned static builds uploaded as a zip.
            </p>
          </div>
          <DemosEditor
            demos={draft.demos}
            errors={errors}
            slug={draft.slug}
            client={client}
            base={base}
            onChange={(demos) => update({ demos })}
            onStaticFiles={(files) => setStaticFiles((current) => [...current, ...files])}
          />
          {staticFiles.length > 0 && (
            <p className="mt-2 text-[11.5px] text-amber-300">
              {staticFiles.length} static build file(s) staged — they commit when you save this project.
            </p>
          )}
        </Card>
      )}

      {tab === 'seo' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid gap-3">
              <Field
                label="SEO title"
                htmlFor="p-seo-title"
                hint={`${(draft.seo.title ?? '').length}/70 — falls back to the project title`}
                error={errors['seo.title']}
              >
                <Input
                  id="p-seo-title"
                  value={draft.seo.title ?? ''}
                  onChange={(event) => update({ seo: { ...draft.seo, title: event.target.value } })}
                />
              </Field>
              <Field
                label="SEO description"
                htmlFor="p-seo-desc"
                hint={`${(draft.seo.description ?? '').length}/200 — falls back to the summary`}
                error={errors['seo.description']}
              >
                <Textarea
                  id="p-seo-desc"
                  rows={3}
                  value={draft.seo.description ?? ''}
                  onChange={(event) => update({ seo: { ...draft.seo, description: event.target.value } })}
                />
              </Field>
              <Field
                label="Open Graph image path"
                htmlFor="p-seo-image"
                hint="Empty uses the cover image. A 1200×630 crop is ideal."
                error={errors['seo.ogImage']}
              >
                <Input
                  id="p-seo-image"
                  value={draft.seo.ogImage ?? ''}
                  onChange={(event) => update({ seo: { ...draft.seo, ogImage: event.target.value } })}
                  className="mono"
                  placeholder="/images/projects/slug/og.webp"
                />
              </Field>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-2 text-[13px] font-semibold">Search preview</h2>
            <div className="rounded-lg border border-line bg-white p-3 text-[#1a0dab]">
              <p className="truncate text-[12px] text-[#202124]">
                {new URL(base || '/', 'https://example.com').pathname.replace(/\/$/, '')}/projects/{draft.slug}/
              </p>
              <p className="truncate text-[16px] leading-snug">
                {draft.seo.title || draft.title || 'Untitled project'}
              </p>
              <p className="line-clamp-2 text-[12.5px] leading-snug text-[#4d5156]">
                {draft.seo.description || draft.summary || 'No description yet.'}
              </p>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              JSON-LD for the case study is generated at build time from this file — no extra fields needed.
            </p>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-[11px] text-muted">
          {mode === 'new' ? 'Creates a new file in ' : 'Updates '}
          <span className="mono">
            {client.repo.contentDir}/{draft.slug}.json
          </span>
          {dirty ? ' · unsaved changes' : ' · no pending changes'}
        </p>
        <div className="flex gap-2">
          <Button onClick={requestBack}>Close</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()} disabled={busy}>
            {mode === 'new' ? 'Create project' : 'Save & commit'}
          </Button>
        </div>
      </div>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Discard unsaved changes?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button
              variant="danger"
              onClick={() => {
                setLeaveOpen(false);
                onBack();
              }}
            >
              Discard and leave
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-muted">
          Uploaded images and uploaded builds that are not committed yet will be lost. Everything already committed
          stays.
        </p>
      </Modal>

      <Modal
        open={conflict !== null}
        onClose={() => setConflict(null)}
        title="The branch moved while you were editing"
        description={`Someone (or a workflow) pushed ${conflict?.slice(0, 7) ?? ''} after this editor loaded.`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setConflict(null)}>Keep editing</Button>
            <Button
              variant="primary"
              onClick={() => {
                const remote = conflict;
                setConflict(null);
                void save(remote ?? undefined);
              }}
            >
              Save on top of latest
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[12.5px] leading-relaxed text-muted">
          <p>
            Your draft is intact. “Save on top of latest” re-reads the branch head and commits your version over it — it
            will not merge the other change, so review that commit afterwards.
          </p>
          <Button
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(prepare(draft), null, 2));
                toast.push('Draft JSON copied to the clipboard.', 'ok');
              } catch {
                toast.push('Clipboard blocked — select the JSON manually.', 'bad');
              }
            }}
          >
            Copy draft JSON
          </Button>
          <div>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                setConflict(null);
                onConflictReload();
              }}
            >
              Reload from GitHub (discard draft)
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
