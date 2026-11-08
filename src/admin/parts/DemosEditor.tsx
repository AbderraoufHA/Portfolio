import { useState } from 'react';
import type { Demo, DemoType } from '../../lib/schema';
import { makeId } from '../../lib/utils';
import type { FileToCommit, GitHubClient } from '../github';
import { extractStaticBuild, toCommitFiles, type ExtractedBuild } from '../zip';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '../ui';

interface Props {
  demos: Demo[];
  errors: Record<string, string>;
  slug: string;
  client: GitHubClient;
  base: string;
  onChange: (demos: Demo[]) => void;
  onStaticFiles: (files: FileToCommit[]) => void;
}

const TYPE_LABEL: Record<DemoType, string> = {
  live: 'Live site',
  embed: 'Iframe embed',
  video: 'Video',
  'static-build': 'Static build',
};

function emptyDemo(): Demo {
  return {
    id: makeId('demo'),
    label: 'New demo',
    type: 'live',
    url: '',
    status: 'stable',
    description: '',
  };
}

function demoError(errors: Record<string, string>, index: number, field: string): string | undefined {
  return errors[`demos.${index}.${field}`];
}

export default function DemosEditor({ demos, errors, slug, client, base, onChange, onStaticFiles }: Props) {
  function patch(index: number, changes: Partial<Demo>) {
    onChange(demos.map((demo, current) => (current === index ? { ...demo, ...changes } : demo)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= demos.length) return;
    const next = [...demos];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {demos.length === 0 && (
        <Alert tone="info" title="No demo yet">
          A live link, a versioned static build or a short video makes a case study tangible. Static builds are uploaded
          as a zip and committed under <span className="mono">public/demos/{slug}/</span>.
        </Alert>
      )}

      {demos.map((demo, index) => (
        <DemoCard
          key={demo.id}
          demo={demo}
          index={index}
          count={demos.length}
          slug={slug}
          client={client}
          base={base}
          errors={errors}
          onPatch={(changes) => patch(index, changes)}
          onMove={(direction) => move(index, direction)}
          onRemove={() => onChange(demos.filter((_, current) => current !== index))}
          onStaticFiles={onStaticFiles}
        />
      ))}

      <Button type="button" onClick={() => onChange([...demos, emptyDemo()])}>
        Add demo
      </Button>
    </div>
  );
}

function DemoCard({
  demo,
  index,
  count,
  slug,
  client,
  base,
  errors,
  onPatch,
  onMove,
  onRemove,
  onStaticFiles,
}: {
  demo: Demo;
  index: number;
  count: number;
  slug: string;
  client: GitHubClient;
  base: string;
  errors: Record<string, string>;
  onPatch: (changes: Partial<Demo>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onStaticFiles: (files: FileToCommit[]) => void;
}) {
  const [version, setVersion] = useState(() => {
    const match = demo.path?.match(/\/demos\/[^/]+\/([^/]+)\//);
    return match?.[1] ?? '1.0.0';
  });
  const [build, setBuild] = useState<ExtractedBuild | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function uploadBuild(file: File) {
    setBusy(true);
    setUploadError(null);
    try {
      const safeVersion = version.trim().replace(/[^a-zA-Z0-9._-]/g, '-') || '1.0.0';
      const extracted = await extractStaticBuild(file);
      const repoDir = `${client.repo.demosDir}/${slug}/${safeVersion}`;
      onStaticFiles(toCommitFiles(extracted, repoDir));
      setBuild(extracted);
      setVersion(safeVersion);
      onPatch({
        type: 'static-build',
        path: `/demos/${slug}/${safeVersion}/index.html`,
        url: undefined,
        description:
          demo.description ||
          `Static build of ${demo.label} — ${extracted.files.length} files, ${(extracted.totalBytes / 1024 / 1024).toFixed(1)} MB.`,
      });
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : 'Could not read that archive.');
    } finally {
      setBusy(false);
    }
  }

  const targetError = demo.type === 'static-build' ? demoError(errors, index, 'path') : demoError(errors, index, 'url');

  return (
    <div className="rounded-lg border border-line bg-surface/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Badge tone={demo.status === 'beta' ? 'warn' : demo.status === 'archived' ? 'muted' : 'ok'}>
          {TYPE_LABEL[demo.type]}
        </Badge>
        <span className="mono truncate text-[11px] text-muted">{demo.id}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="quiet" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move demo up">
            ▲
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label="Move demo down"
          >
            ▼
          </Button>
          <Button size="sm" variant="danger" onClick={onRemove} aria-label={`Remove ${demo.label}`}>
            Remove
          </Button>
        </div>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <Field label="Label" htmlFor={`demo-label-${demo.id}`} required error={demoError(errors, index, 'label')}>
          <Input
            id={`demo-label-${demo.id}`}
            value={demo.label}
            onChange={(event) => onPatch({ label: event.target.value })}
            placeholder="v1.4.0 — static snapshot"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" htmlFor={`demo-type-${demo.id}`} required>
            <Select
              id={`demo-type-${demo.id}`}
              value={demo.type}
              onChange={(event) => {
                const type = event.target.value as DemoType;
                onPatch({
                  type,
                  url: type === 'static-build' ? undefined : (demo.url ?? ''),
                  path: type === 'static-build' ? (demo.path ?? '') : undefined,
                });
              }}
            >
              {(Object.keys(TYPE_LABEL) as DemoType[]).map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor={`demo-status-${demo.id}`}>
            <Select
              id={`demo-status-${demo.id}`}
              value={demo.status}
              onChange={(event) => onPatch({ status: event.target.value as Demo['status'] })}
            >
              <option value="stable">Stable</option>
              <option value="beta">Beta</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        </div>

        <Field
          label="Date"
          htmlFor={`demo-date-${demo.id}`}
          hint="YYYY-MM or YYYY-MM-DD"
          error={demoError(errors, index, 'date')}
        >
          <Input
            id={`demo-date-${demo.id}`}
            value={demo.date ?? ''}
            onChange={(event) => onPatch({ date: event.target.value || undefined })}
            placeholder="2026-05"
            className="mono"
          />
        </Field>

        <Field
          label={demo.type === 'static-build' ? 'Build path' : 'URL'}
          htmlFor={`demo-target-${demo.id}`}
          required
          error={targetError}
          hint={
            demo.type === 'static-build'
              ? 'Public path to index.html under /demos/<slug>/<version>/'
              : demo.type === 'video'
                ? 'YouTube, Vimeo, or an .mp4/.webm file'
                : 'https://… or a site-relative path'
          }
        >
          <Input
            id={`demo-target-${demo.id}`}
            value={(demo.type === 'static-build' ? demo.path : demo.url) ?? ''}
            onChange={(event) =>
              onPatch(demo.type === 'static-build' ? { path: event.target.value } : { url: event.target.value })
            }
            placeholder={demo.type === 'static-build' ? `/demos/${slug}/${version}/index.html` : 'https://…'}
            className="mono"
            aria-invalid={targetError ? 'true' : undefined}
          />
        </Field>

        <Field label="Description" htmlFor={`demo-desc-${demo.id}`} className="sm:col-span-2">
          <Textarea
            id={`demo-desc-${demo.id}`}
            rows={2}
            value={demo.description ?? ''}
            onChange={(event) => onPatch({ description: event.target.value })}
            placeholder="What the visitor is looking at, and what to try first."
          />
        </Field>

        {(demo.type === 'video' || demo.type === 'static-build') && (
          <Field
            label={demo.type === 'video' ? 'Poster image path' : 'Captions (optional)'}
            htmlFor={`demo-poster-${demo.id}`}
            hint={
              demo.type === 'video' ? 'Site-relative path or https URL. Used for the video facade.' : 'WebVTT file path'
            }
          >
            <Input
              id={`demo-poster-${demo.id}`}
              value={(demo.type === 'video' ? demo.poster : demo.captions) ?? ''}
              onChange={(event) =>
                onPatch(demo.type === 'video' ? { poster: event.target.value } : { captions: event.target.value })
              }
              placeholder={demo.type === 'video' ? '/images/projects/slug/poster.webp' : '/demos/captions.vtt'}
              className="mono"
            />
          </Field>
        )}

        {demo.type === 'static-build' && (
          <div className="sm:col-span-2 rounded-lg border border-dashed border-line bg-bg/50 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Version folder" htmlFor={`demo-version-${demo.id}`} hint="Letters, numbers, dots, dashes">
                <Input
                  id={`demo-version-${demo.id}`}
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  className="mono w-32"
                />
              </Field>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] hover:bg-elevated">
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadBuild(file);
                    event.target.value = '';
                  }}
                />
                {busy ? 'Reading zip…' : 'Upload .zip build'}
              </label>
              {demo.path && (
                <a
                  href={`${base.replace(/\/$/, '')}${demo.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11.5px] text-accent underline underline-offset-4"
                >
                  Current build ↗
                </a>
              )}
            </div>

            {build && (
              <p className="mt-2 text-[11.5px] text-emerald-300">
                Staged {build.files.length} files ({(build.totalBytes / 1024 / 1024).toFixed(1)} MB). They commit with
                this project.
                {build.strippedRoot && <span className="text-muted"> Folder “{build.strippedRoot}” stripped.</span>}
              </p>
            )}
            {build && build.skipped.length > 0 && (
              <p className="mt-1 text-[11.5px] text-amber-300">
                Skipped {build.skipped.length}: {build.skipped.slice(0, 3).join(', ')}
                {build.skipped.length > 3 ? '…' : ''}
              </p>
            )}
            {uploadError && (
              <p className="mt-1 text-[11.5px] text-red-400" role="alert">
                {uploadError}
              </p>
            )}
            <p className="mt-1.5 text-[10.5px] text-muted">
              Zip the folder that contains index.html. Hostable asset types only; executables and hidden files are
              dropped. Max 30 MB compressed, 400 files.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
