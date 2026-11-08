import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, relativeTime } from '../../lib/utils';
import { ConflictError, type CommitDetail, type CommitInfo, type GitHubClient } from '../github';
import { restoreFile } from '../data';
import { Alert, Badge, Button, Card, EmptyState, ErrorNote, Modal, Skeleton, useToast } from '../ui';

type Scope = 'all' | 'projects' | 'settings';

interface Props {
  client: GitHubClient;
  head: string;
  onRefresh: () => Promise<void>;
  onConflict: (remoteHead: string) => void;
}

type State = { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; commits: CommitInfo[] };

interface RestoreTarget {
  path: string;
  sha: string;
  message: string;
}

const SCOPE_LABEL: Record<Scope, string> = {
  all: 'Everything',
  projects: 'Project files',
  settings: 'Site settings',
};

export default function History({ client, head, onRefresh, onConflict }: Props) {
  const toast = useToast();
  const [scope, setScope] = useState<Scope>('all');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CommitDetail | 'loading' | 'error'>>({});
  const [restore, setRestore] = useState<RestoreTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const path = scope === 'projects' ? client.repo.contentDir : scope === 'settings' ? client.repo.siteFile : undefined;

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', commits: await client.listCommits(path, 30) });
    } catch (error) {
      setState({ status: 'error', error });
    }
  }, [client, path]);

  useEffect(() => {
    void load();
  }, [load, head]);

  const isRestorable = useMemo(
    () => (file: string) =>
      file === client.repo.siteFile || (file.startsWith(`${client.repo.contentDir}/`) && file.endsWith('.json')),
    [client.repo.contentDir, client.repo.siteFile],
  );

  async function toggle(sha: string) {
    if (open === sha) {
      setOpen(null);
      return;
    }
    setOpen(sha);
    if (details[sha] && details[sha] !== 'error') return;
    setDetails((current) => ({ ...current, [sha]: 'loading' }));
    try {
      const detail = await client.getCommit(sha);
      setDetails((current) => ({ ...current, [sha]: detail }));
    } catch {
      setDetails((current) => ({ ...current, [sha]: 'error' }));
    }
  }

  async function confirmRestore() {
    if (!restore) return;
    setBusy(true);
    try {
      const result = await restoreFile(client, restore.path, restore.sha, head);
      toast.push(
        `Restored ${restore.path.split('/').pop()} from ${restore.sha.slice(0, 7)} — ${result.sha.slice(0, 7)}.`,
        'ok',
      );
      setRestore(null);
      await onRefresh();
      await load();
    } catch (error) {
      if (error instanceof ConflictError) {
        setRestore(null);
        onConflict(error.remoteHead);
        return;
      }
      toast.push(error instanceof Error ? error.message : 'Restore failed.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">History</h1>
          <p className="mt-1 text-[13px] text-muted">
            Every commit on <span className="mono">{client.repo.branch}</span>. Restoring writes a new commit — nothing
            is rewritten.
          </p>
        </div>
        <Button onClick={() => void load()} loading={state.status === 'loading'}>
          Reload
        </Button>
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="History scope">
        {(Object.keys(SCOPE_LABEL) as Scope[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setScope(value);
              setOpen(null);
            }}
            aria-pressed={scope === value}
            className={
              scope === value
                ? 'rounded-md bg-accent/15 px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wide text-accent'
                : 'rounded-md px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-wide text-muted hover:bg-elevated hover:text-ink'
            }
          >
            {SCOPE_LABEL[value]}
          </button>
        ))}
        <span className="mono ml-auto self-center text-[10.5px] text-muted">{path ?? 'all paths'} · depth 30</span>
      </div>

      <Card>
        {state.status === 'loading' && (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <div className="p-4">
            <ErrorNote error={state.error} onRetry={() => void load()} />
          </div>
        )}

        {state.status === 'ready' && state.commits.length === 0 && (
          <div className="p-4">
            <EmptyState
              title="No commits for this path"
              description="Content commits appear here as soon as the first one lands."
            />
          </div>
        )}

        {state.status === 'ready' && state.commits.length > 0 && (
          <ul className="divide-y divide-line/60">
            {state.commits.map((commit) => {
              const detail = details[commit.sha];
              const expanded = open === commit.sha;
              return (
                <li key={commit.sha}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    {commit.avatar ? (
                      <img
                        src={commit.avatar}
                        alt=""
                        width={32}
                        height={32}
                        className="mt-0.5 h-8 w-8 rounded-full border border-line"
                      />
                    ) : (
                      <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-elevated font-mono text-[11px] text-muted">
                        {commit.author.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <a
                          href={commit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-[13px] font-medium hover:text-accent"
                        >
                          {commit.message}
                        </a>
                        <span className="mono text-[10.5px] text-accent/80">{commit.sha.slice(0, 7)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {commit.author} · {formatDate(commit.date)} · {relativeTime(commit.date)}
                      </p>
                    </div>
                    <Button size="sm" variant="quiet" onClick={() => void toggle(commit.sha)} aria-expanded={expanded}>
                      {expanded ? 'Hide files' : 'Files'}
                    </Button>
                  </div>

                  {expanded && (
                    <div className="border-t border-line/50 bg-bg/40 px-4 py-3">
                      {detail === 'loading' && <Skeleton className="h-4 w-1/2" />}
                      {detail === 'error' && (
                        <p className="text-[12px] text-amber-300">Could not load this commit's file list.</p>
                      )}
                      {detail && detail !== 'loading' && detail !== 'error' && (
                        <>
                          <ul className="space-y-1">
                            {detail.files.map((file) => (
                              <li key={file.filename} className="flex flex-wrap items-center gap-2 text-[12px]">
                                <Badge
                                  tone={
                                    file.status === 'added'
                                      ? 'ok'
                                      : file.status === 'removed'
                                        ? 'bad'
                                        : file.status === 'renamed'
                                          ? 'warn'
                                          : 'muted'
                                  }
                                >
                                  {file.status}
                                </Badge>
                                <span className="mono min-w-0 flex-1 truncate" title={file.filename}>
                                  {file.filename}
                                </span>
                                <span className="mono text-[10.5px] text-emerald-300/80">+{file.additions}</span>
                                <span className="mono text-[10.5px] text-red-300/80">−{file.deletions}</span>
                                {isRestorable(file.filename) && (
                                  <Button
                                    size="sm"
                                    variant="quiet"
                                    onClick={() =>
                                      setRestore({ path: file.filename, sha: commit.sha, message: commit.message })
                                    }
                                  >
                                    Restore
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2 flex gap-2">
                            <a href={commit.url} target="_blank" rel="noopener noreferrer">
                              <Button size="sm">Open diff ↗</Button>
                            </a>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Alert tone="info" title="What can be restored">
        JSON files (projects and site settings) restore cleanly as text. Images and static builds are binary — use{' '}
        <span className="mono">git revert</span> locally for those, or re-upload via the editor.
      </Alert>

      <Modal
        open={restore !== null}
        onClose={() => setRestore(null)}
        title="Restore a file from history"
        description={restore ? `${restore.path} @ ${restore.sha.slice(0, 7)}` : ''}
        size="sm"
        footer={
          <>
            <Button onClick={() => setRestore(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void confirmRestore()}>
              Restore as new commit
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-muted">
          This reads the file at the selected commit and commits it as the current version. The original commit stays in
          history. The next deploy rebuilds the site with the restored content.
        </p>
      </Modal>
    </div>
  );
}
