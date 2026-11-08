/**
 * Turn a zipped static build into commit-ready files.
 *
 * Runs entirely in the browser with fflate. The archive is treated as hostile input:
 * paths are normalised, traversal is rejected, hidden/system files and executables are
 * dropped, and both compressed and expanded sizes are capped before anything is staged.
 */
import { strFromU8, unzipSync } from 'fflate';
import type { FileToCommit } from './github';

export const MAX_ARCHIVE_BYTES = 30 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 80 * 1024 * 1024;
export const MAX_FILES = 400;

/** Anything not on this list is dropped with a note, not silently hosted. */
const ALLOWED_EXTENSIONS = new Set([
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'cjs',
  'json',
  'map',
  'txt',
  'xml',
  'svg',
  'webmanifest',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'avif',
  'gif',
  'ico',
  'bmp',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'mp4',
  'webm',
  'ogg',
  'mp3',
  'wav',
  'wasm',
  'csv',
  'md',
  'pdf',
]);

export interface ExtractedFile {
  /** Path relative to the build root, e.g. "assets/app.js". */
  relative: string;
  base64: string;
  size: number;
}

export interface ExtractedBuild {
  files: ExtractedFile[];
  totalBytes: number;
  skipped: string[];
  /** Root folder that was stripped, if the zip wrapped everything in one directory. */
  strippedRoot: string | null;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function normalisePath(raw: string): string | null {
  const path = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!path) return null;
  const parts = path.split('/');
  if (parts.some((part) => part === '..' || part === '' || part === '.')) return null;
  return parts.join('/');
}

function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function isJunk(path: string): boolean {
  const parts = path.split('/');
  if (parts[0] === '__MACOSX') return true;
  const name = parts[parts.length - 1] ?? '';
  return name.startsWith('.') || name === 'Thumbs.db' || name === 'desktop.ini';
}

/**
 * Reads a zip, strips a single wrapping directory if present, and returns base64 files.
 * Throws with a human-readable message for anything that cannot be hosted safely.
 */
export async function extractStaticBuild(file: File): Promise<ExtractedBuild> {
  if (!/\.zip$/i.test(file.name)) {
    throw new Error('Upload a .zip file — export the build folder, then compress it.');
  }
  if (file.size > MAX_ARCHIVE_BYTES) {
    throw new Error(`That archive is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 30 MB.`);
  }

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('That file is not a readable zip archive. Re-zip the build folder and try again.');
  }

  const skipped: string[] = [];
  const entries: Array<{ path: string; bytes: Uint8Array }> = [];
  let expanded = 0;

  for (const [rawPath, bytes] of Object.entries(archive)) {
    if (rawPath.endsWith('/')) continue;
    const path = normalisePath(rawPath);
    if (!path) {
      skipped.push(`${rawPath} (unsafe path)`);
      continue;
    }
    if (isJunk(path)) continue;
    if (!ALLOWED_EXTENSIONS.has(extensionOf(path))) {
      skipped.push(`${path} (file type)`);
      continue;
    }
    expanded += bytes.byteLength;
    if (expanded > MAX_EXPANDED_BYTES) {
      throw new Error('The expanded build is over 80 MB. Trim large media before uploading.');
    }
    entries.push({ path, bytes });
  }

  if (entries.length === 0) throw new Error('No hostable files found in that archive.');
  if (entries.length > MAX_FILES) {
    throw new Error(`That build has ${entries.length} files. The limit is ${MAX_FILES} — bundle or trim assets first.`);
  }

  const hasRootIndex = entries.some((entry) => entry.path === 'index.html');
  let prefix = '';
  if (!hasRootIndex) {
    const roots = new Set(entries.map((entry) => entry.path.split('/')[0] ?? ''));
    const [onlyRoot] = [...roots];
    if (roots.size === 1 && onlyRoot) {
      const candidate = entries.find((entry) => entry.path === `${onlyRoot}/index.html`);
      if (candidate) prefix = `${onlyRoot}/`;
    }
  }

  const files: ExtractedFile[] = [];
  let totalBytes = 0;
  for (const entry of entries) {
    if (prefix && !entry.path.startsWith(prefix)) continue;
    const relative = prefix ? entry.path.slice(prefix.length) : entry.path;
    if (!relative || relative.endsWith('/')) continue;
    totalBytes += entry.bytes.byteLength;
    files.push({ relative, base64: bytesToBase64(entry.bytes), size: entry.bytes.byteLength });
  }

  if (!files.some((file) => file.relative === 'index.html')) {
    throw new Error('The archive has no index.html at its root. Zip the folder that contains index.html.');
  }

  files.sort((a, b) =>
    a.relative === 'index.html' ? -1 : b.relative === 'index.html' ? 1 : a.relative.localeCompare(b.relative),
  );

  return { files, totalBytes, skipped, strippedRoot: prefix ? prefix.slice(0, -1) : null };
}

/** Prefix extracted files with the repo folder they should be committed to. */
export function toCommitFiles(build: ExtractedBuild, repoDir: string): FileToCommit[] {
  const dir = repoDir.replace(/\/+$/, '');
  return build.files.map((file) => ({ path: `${dir}/${file.relative}`, base64: file.base64 }));
}

export function readTextPreview(build: ExtractedBuild, relative: string): string | null {
  const file = build.files.find((entry) => entry.relative === relative);
  if (!file) return null;
  try {
    return strFromU8(Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
}
