import { useMemo, useRef, useState } from 'react';
import { projectSchema, siteSchema, type Project, type Site } from '../../lib/schema';
import { formatDate } from '../../lib/utils';
import { ConflictError, type GitHubClient } from '../github';
import { projectPath, serialize } from '../data';
import { Alert, Badge, Button, Card, CardHeader, Modal, useToast } from '../ui';

interface Props {
  client: GitHubClient;
  site: Site;
  projects: Project[];
  head: string;
  onRefresh: () => Promise<void>;
  onConflict: (remoteHead: string) => void;
}

interface ParsedBackup {
  site?: Site;
  projects: Project[];
  issues: string[];
}

type Mode = 'merge' | 'replace';

function download(name: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const issues: string[] = [];
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!record && !Array.isArray(raw))
    throw new Error('Expected an object with site and projects, or an array of projects.');

  const siteCandidate = Array.isArray(raw)
    ? undefined
    : (record?.site ?? (record && 'profile' in record && 'repo' in record ? record : undefined));
  const projectsCandidate = Array.isArray(raw) ? raw : (record?.projects ?? []);

  let site: Site | undefined;
  if (siteCandidate !== undefined) {
    const parsed = siteSchema.safeParse(siteCandidate);
    if (parsed.success) site = parsed.data;
    else issues.push(`site: ${parsed.error.issues[0]?.message ?? 'invalid settings'}`);
  }

  if (!Array.isArray(projectsCandidate)) throw new Error('“projects” must be an array.');

  const projects: Project[] = [];
  projectsCandidate.forEach((entry, index) => {
    const parsed = projectSchema.safeParse(entry);
    if (parsed.success) projects.push(parsed.data);
    else {
      const first = parsed.error.issues[0];
      issues.push(`projects[${index}]: ${first ? `${first.path.join('.')} — ${first.message}` : 'invalid project'}`);
    }
  });

  if (!site && projects.length === 0) {
    throw new Error(issues[0] ?? 'Nothing importable found in that file.');
  }

  return { site, projects, issues };
}

export default function Backup({ client, site, projects, head, onRefresh, onConflict }: Props) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('merge');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const exportPayload = useMemo(
    () => ({
      format: 'portfolio-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      repository: `${client.repo.owner}/${client.repo.name}`,
      branch: client.repo.branch,
      head,
      site,
      projects,
    }),
    [client.repo, head, site, projects],
  );

  const exportText = useMemo(() => JSON.stringify(exportPayload, null, 2), [exportPayload]);

  const deletions = useMemo(() => {
    if (!parsed || mode !== 'replace') return [];
    const keep = new Set(parsed.projects.map((project) => project.slug));
    return projects.filter((project) => !keep.has(project.slug)).map((project) => projectPath(client, project.slug));
  }, [parsed, mode, projects, client]);

  async function readFile(file: File) {
    setFileName(file.name);
    setFileError(null);
    setParsed(null);
    try {
      const text = await file.text();
      setParsed(parseBackup(text));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Could not read that file.');
    }
  }

  async function runImport() {
    if (!parsed) return;
    setBusy(true);
    try {
      const files = [
        ...(parsed.site ? [{ path: client.repo.siteFile, text: serialize(parsed.site) }] : []),
        ...parsed.projects.map((project) => ({
          path: projectPath(client, project.slug),
          text: serialize(project),
        })),
      ];
      const result = await client.commit({
        message: `content: import ${parsed.projects.length} project(s)${parsed.site ? ' + settings' : ''}${
          mode === 'replace' ? ' (replace)' : ''
        }`,
        files,
        deletions,
        expectedHead: head,
      });
      toast.push(`Import committed as ${result.sha.slice(0, 7)} — ${files.length} file(s).`, 'ok');
      setParsed(null);
      setFileName(null);
      setConfirmOpen(false);
      await onRefresh();
    } catch (error) {
      if (error instanceof ConflictError) {
        setConfirmOpen(false);
        onConflict(error.remoteHead);
        return;
      }
      toast.push(error instanceof Error ? error.message : 'Import failed.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  const totalBytes = new Blob([exportText]).size;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Backup & import</h1>
        <p className="mt-1 text-[13px] text-muted">
          The repository itself is the backup. This screen is for snapshots you can diff, move between repos, or hand to
          a client.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Export"
            description={`${projects.length} projects + site settings · ${(totalBytes / 1024).toFixed(1)} kB`}
          />
          <div className="space-y-3 p-4">
            <div className="rounded-lg border border-line bg-bg p-3">
              <p className="mono text-[10.5px] uppercase tracking-wider text-muted">snapshot</p>
              <p className="mt-1 text-[12.5px]">
                A single JSON file: settings, every project, the branch and the head commit at export time.
              </p>
              <p className="mono mt-1 text-[10.5px] text-muted">
                head {head.slice(0, 7)} · {formatDate(new Date())}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => download(`portfolio-backup-${timestamp()}.json`, exportText)}>
                Download backup
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(exportText);
                    toast.push('Backup JSON copied.', 'ok');
                  } catch {
                    toast.push('Clipboard blocked — use Download instead.', 'bad');
                  }
                }}
              >
                Copy JSON
              </Button>
              <Button
                variant="quiet"
                onClick={() => download(`site-${timestamp()}.json`, `${JSON.stringify(site, null, 2)}\n`)}
              >
                site.json only
              </Button>
            </div>
            <p className="text-[11.5px] leading-snug text-muted">
              Images are not embedded — the JSON keeps their repository paths. A backup restored into a different repo
              needs the matching files under <span className="mono">public/</span>.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Import" description="Validated with the same Zod schema as the build" />
          <div className="space-y-3 p-4">
            <input
              ref={input}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = '';
              }}
            />
            <Button onClick={() => input.current?.click()}>Choose a backup file</Button>
            {fileName && <p className="mono text-[11px] text-muted">{fileName}</p>}

            {fileError && (
              <p className="text-[12px] font-medium text-red-400" role="alert">
                {fileError}
              </p>
            )}

            {parsed && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="ok">{parsed.projects.length} valid project(s)</Badge>
                  <Badge tone={parsed.site ? 'ok' : 'muted'}>
                    {parsed.site ? 'settings included' : 'settings absent'}
                  </Badge>
                  {parsed.issues.length > 0 && <Badge tone="warn">{parsed.issues.length} rejected</Badge>}
                </div>

                {parsed.issues.length > 0 && (
                  <Alert tone="warn" title="Some entries were skipped">
                    <ul className="space-y-0.5">
                      {parsed.issues.slice(0, 5).map((issue) => (
                        <li key={issue} className="mono text-[11px]">
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}

                <div className="space-y-2" role="radiogroup" aria-label="Import mode">
                  <label className="flex items-start gap-2 text-[12.5px]">
                    <input
                      type="radio"
                      name="import-mode"
                      checked={mode === 'merge'}
                      onChange={() => setMode('merge')}
                      className="mt-0.5 accent-current"
                    />
                    <span>
                      <strong className="text-ink">Merge</strong> — write every imported file, leave other projects
                      alone.
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-[12.5px]">
                    <input
                      type="radio"
                      name="import-mode"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                      className="mt-0.5 accent-current"
                    />
                    <span>
                      <strong className="text-ink">Replace projects</strong> — also delete{' '}
                      <span className="mono">{deletions.length}</span> project file(s) missing from the backup. Images
                      stay.
                    </span>
                  </label>
                </div>

                <Button variant="danger" onClick={() => setConfirmOpen(true)} disabled={busy}>
                  Import {parsed.projects.length} project(s)
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-[13px] font-semibold">What this does not cover</h2>
        <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-muted">
          <li>
            <span className="text-ink/90">Images, fonts and demo builds</span> — binary assets are not in the JSON
            snapshot. They live in Git and in each project's folder under <span className="mono">public/</span>.
          </li>
          <li>
            <span className="text-ink/90">Workflow files and configuration</span> — deployment lives in{' '}
            <span className="mono">.github/workflows</span>, outside the admin's scope.
          </li>
          <li>
            <span className="text-ink/90">Deleted files</span> — restore those from History or from the commit list on
            GitHub.
          </li>
        </ul>
      </Card>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={mode === 'replace' ? 'Replace projects from this backup?' : 'Import this backup?'}
        description={
          parsed
            ? `${parsed.projects.length} project file(s)${parsed.site ? ' and the settings file' : ''}${deletions.length ? `, ${deletions.length} deletion(s)` : ''} in one commit.`
            : ''
        }
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void runImport()}>
              Commit import
            </Button>
          </>
        }
      >
        <Alert tone="warn" title="A normal commit — not a force push">
          The next deploy rebuilds the site from whatever this commit leaves behind. If the imported files are stale,
          the site goes stale with them.
        </Alert>
        {mode === 'replace' && deletions.length > 0 && (
          <ul className="mono mt-3 space-y-0.5 text-[11px] text-red-300">
            {deletions.map((path) => (
              <li key={path}>delete {path}</li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
