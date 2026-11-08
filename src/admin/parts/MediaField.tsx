import { useRef, useState, type DragEvent } from 'react';
import type { ProjectImage } from '../../lib/schema';
import { cx } from '../../lib/utils';
import type { FileToCommit, GitHubClient } from '../github';
import { buildSrcset, processImage } from '../image';
import { Button, Field, Input, Spinner } from '../ui';

export interface PendingMedia {
  /** Repo path the file will be committed to. */
  path: string;
  /** Public path stored in the JSON. */
  publicPath: string;
  file: FileToCommit;
  previewUrl: string;
  bytes: number;
  width: number;
  /** Set once the file has been committed — the preview URL stays valid, the file is not re-sent. */
  committed?: boolean;
}

interface Props {
  label: string;
  value?: ProjectImage;
  slug: string;
  client: GitHubClient;
  base: string;
  error?: string;
  hint?: string;
  required?: boolean;
  widths?: number[];
  compact?: boolean;
  previewFor: (src: string) => string | undefined;
  onFiles: (files: PendingMedia[]) => void;
  onChange: (value: ProjectImage | undefined) => void;
}

function altFromName(name: string): string {
  const base = name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!base) return '';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function assetUrl(base: string, src: string): string {
  if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src;
  return `${base.replace(/\/$/, '')}${src.startsWith('/') ? src : `/${src}`}`;
}

export default function MediaField({
  label,
  value,
  slug,
  client,
  base,
  error,
  hint,
  required,
  widths = [1600, 900],
  compact = false,
  previewFor,
  onFiles,
  onChange,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const preview = value?.src ? (previewFor(value.src) ?? assetUrl(base, value.src)) : null;
  const isPending = value?.src ? Boolean(previewFor(value.src)) : false;

  async function upload(file: File) {
    setBusy(true);
    setLocalError(null);
    try {
      const processed = await processImage(file, widths);
      const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      const staged: PendingMedia[] = processed.variants.map((variant) => {
        const name = `${slug || 'project'}-${stamp}-${variant.width}.webp`;
        const publicPath = `${client.repo.imagesPublicPath}/${slug}/${name}`;
        const path = `${client.repo.imagesDir}/${slug}/${name}`;
        return {
          path,
          publicPath,
          file: { path, base64: variant.base64 },
          previewUrl: URL.createObjectURL(variant.blob),
          bytes: variant.blob.size,
          width: variant.width,
        };
      });
      const largest = staged[0];
      if (!largest) throw new Error('Image processing produced no output.');
      const variant = processed.variants[0];
      if (!variant) throw new Error('Image processing produced no dimensions.');
      onFiles(staged);
      onChange({
        src: largest.publicPath,
        alt: value?.alt || altFromName(file.name),
        width: variant.width,
        height: variant.height,
        srcset: buildSrcset(staged.map((entry) => ({ publicPath: entry.publicPath, width: entry.width }))),
        ...(value?.caption ? { caption: value.caption } : {}),
      });
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void upload(file);
  }

  return (
    <div className={cx('rounded-lg border border-line bg-bg/40 p-3', compact && 'p-2.5')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="field-label mb-0">
          {label}
          {required && <span className="ml-0.5 text-accent">*</span>}
        </span>
        <div className="flex items-center gap-1">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button size="sm" type="button" onClick={() => input.current?.click()} loading={busy} disabled={busy}>
            {value?.src ? 'Replace' : 'Upload'}
          </Button>
          {value?.src && (
            <Button size="sm" type="button" variant="quiet" onClick={() => onChange(undefined)} disabled={busy}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          'flex items-center gap-3 rounded-md border border-dashed p-2 transition-colors',
          dragging ? 'border-accent/60 bg-accent/5' : 'border-line/80',
          !preview && 'justify-center py-6',
        )}
      >
        {preview ? (
          <img
            src={preview}
            alt=""
            className={cx('rounded border border-line object-cover', compact ? 'h-16 w-24' : 'h-24 w-40')}
          />
        ) : (
          <div className="text-center">
            <p className="text-[12px] text-muted">Drop an image or use Upload</p>
            <p className="mt-0.5 text-[10.5px] text-muted/70">
              PNG, JPEG, WebP, AVIF — converted to WebP at {widths.join(' / ')} px
            </p>
          </div>
        )}
        {preview && (
          <div className="min-w-0 flex-1">
            <p className="mono truncate text-[10.5px] text-muted" title={value?.src}>
              {value?.src}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted/80">
              {value?.width && value?.height ? `${value.width}×${value.height}` : 'dimensions unknown'}
              {isPending && <span className="ml-1 text-amber-300">· local preview</span>}
            </p>
            {isPending && (
              <p className="mt-0.5 text-[10px] text-muted/70">
                Blob preview — the public URL resolves after the next deploy.
              </p>
            )}
          </div>
        )}
        {busy && <Spinner className="h-4 w-4 shrink-0 text-accent" />}
      </div>

      <div className="mt-2 grid gap-2">
        <Field label="Alt text" htmlFor={`${label}-alt-${slug}`} error={error} required>
          <Input
            id={`${label}-alt-${slug}`}
            value={value?.alt ?? ''}
            onChange={(event) =>
              onChange(value ? { ...value, alt: event.target.value } : { src: '', alt: event.target.value })
            }
            placeholder="What the image shows, for screen readers"
            aria-invalid={error ? 'true' : undefined}
          />
        </Field>
        <Field label="Caption (optional)" htmlFor={`${label}-caption-${slug}`}>
          <Input
            id={`${label}-caption-${slug}`}
            value={value?.caption ?? ''}
            onChange={(event) => {
              if (!value) return;
              onChange({ ...value, caption: event.target.value || undefined });
            }}
            placeholder="Shown under the image in the gallery"
          />
        </Field>
      </div>

      {hint && <p className="field-hint">{hint}</p>}
      {localError && (
        <p className="field-error" role="alert">
          {localError}
        </p>
      )}
    </div>
  );
}
