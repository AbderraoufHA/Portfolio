import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Project, Site } from '../../lib/schema';
import { relativeTime } from '../../lib/utils';
import { ApiError, type CommitInfo, type GitHubClient, type WorkflowRun } from '../github';
import { checkAll, checkImageWeights, contentStats, type HealthIssue } from '../health';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Skeleton,
  Spinner,
  Stat,
  useToast,
} from '../ui';

interface Props {
  client: GitHubClient;
  site: Site;
  projects: Project[];
  head: string;
  base: string;
  refreshing: boolean;
  onRefresh: () => void;
  onNewProject: () => void;
  onEditProject: (project: Project) => void;
  onNavigate: (tab: 'projects' | 'settings' | 'history' | 'backup') => void;
}

type RunState =
  { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; run: WorkflowRun | null };

type CommitState =
  { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; commits: CommitInfo[] };

interface GoatStats {
  count: number | null;
  unique: number | null;
}

const SEVERITY_ORDER: HealthIssue['severity'][] = ['error', 'warn', 'info'];
const SEVERITY_TONE = { error: 'bad', warn: 'warn', info: 'muted' } as const;

function conclusionTone(conclusion: WorkflowRun['conclusion']): 'ok' | 'bad' | 'warn' | 'muted' {
  if (conclusion === 'success') return 'ok';
  if (conclusion === 'failure' || conclusion === 'timed_out') return 'bad';
  if (conclusion === 'cancelled' || conclusion === 'skipped' || conclusion === 'neutral') return 'warn';
  return 'muted';
}

export default function Overview({
  client,
  site,
  projects,
  head,
  base,
  refreshing,
  onRefresh,
  onNewProject,
  onEditProject,
  onNavigate,
}: Props) {
  const toast = useToast();
  const [run, setRun] = useState<RunState>({ status: 'loading' });
  const [commits, setCommits] = useState<CommitState>({ status: 'loading' });
  const [jobs, setJobs] = useState<Array<{ name: string; status: string; conclusion: string | null }> | null>(null);
  const [jobsBusy, setJobsBusy] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [weights, setWeights] = useState<HealthIssue[] | null>(null);
  const [weightsBusy, setWeightsBusy] = useState(false);
  const [goat, setGoat] = useState<GoatStats | null>(null);
  const [goatNote, setGoatNote] = useState<string | null>(null);

  const stats = useMemo(() => contentStats(site, projects), [site, projects]);
  const issues = useMemo(() => checkAll(site, projects), [site, projects]);
  const counts = useMemo(
    () => ({
      error: issues.filter((issue) => issue.severity === 'error').length,
      warn: issues.filter((issue) => issue.severity === 'warn').length,
      info: issues.filter((issue) => issue.severity === 'info').length,
    }),
    [issues],
  );
  const allIssues = useMemo(() => [...issues, ...(weights ?? [])], [issues, weights]);
  const visibleIssues = useMemo(() => {
    const rank = (severity: HealthIssue['severity']) => SEVERITY_ORDER.indexOf(severity);
    return [...allIssues].sort((a, b) => rank(a.severity) - rank(b.severity)).slice(0, 8);
  }, [allIssues]);

  const loadDeploy = useCallback(async () => {
    setRun({ status: 'loading' });
    try {
      const latest = await client.latestRun();
      setRun({ status: 'ready', run: latest });
    } catch (error) {
      setRun({ status: 'error', error });
    }
  }, [client]);

  const loadCommits = useCallback(async () => {
    setCommits({ status: 'loading' });
    try {
      setCommits({ status: 'ready', commits: await client.listCommits(undefined, 6) });
    } catch (error) {
      setCommits({ status: 'error', error });
    }
  }, [client]);

  useEffect(() => {
    void loadDeploy();
    void loadCommits();
  }, [loadDeploy, loadCommits, head]);

  useEffect(() => {
    const analytics = site.analytics;
    if (analytics.provider !== 'goatcounter' || !analytics.siteId) return;
    let cancelled = false;
    const endpoint = `https://${analytics.siteId}.goatcounter.com/counter/TOTAL.json`;
    fetch(endpoint, { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as { count?: string | number; count_unique?: string | number };
      })
      .then((data) => {
        if (cancelled) return;
        const count = data.count === undefined ? null : Number(data.count);
        const unique = data.count_unique === undefined ? null : Number(data.count_unique);
        setGoat({ count, unique });
      })
      .catch(() => {
        if (cancelled) return;
        setGoatNote(
          'The public counter endpoint did not answer (CORS or a private dashboard). Open GoatCounter for the real numbers.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [site.analytics]);

  async function loadJobs(runId: number) {
    setJobsBusy(true);
    setJobsError(null);
    try {
      setJobs(await client.runJobs(runId));
    } catch (error) {
      setJobsError(error instanceof ApiError ? `${error.message} ${error.hint ?? ''}`.trim() : 'Could not load jobs.');
    } finally {
      setJobsBusy(false);
    }
  }

  async function probeWeights() {
    setWeightsBusy(true);
    try {
      const found = await checkImageWeights(projects, 350 * 1024, (src) => `${base.replace(/\/$/, '')}${src}`);
      setWeights(found);
      toast.push(
        found.length === 0 ? 'All same-origin images are under 350 kB.' : `${found.length} heavy image(s) found.`,
        found.length ? 'info' : 'ok',
      );
    } catch {
      toast.push('Image weight probe failed — open the site in a tab to measure weights.', 'bad');
    } finally {
      setWeightsBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-[13px] text-muted">
            Deploy state, content health and recent history for{' '}
            <span className="mono text-ink/80">
              {site.repo.owner}/{site.repo.name}
            </span>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onRefresh} loading={refreshing}>
            Refresh
          </Button>
          <Button variant="primary" onClick={onNewProject}>
            New project
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Published" value={stats.published} hint={`${stats.total} total in the repo`} tone="ok" />
        <Stat
          label="Drafts"
          value={stats.drafts}
          hint={`${stats.archived} archived`}
          tone={stats.drafts ? 'warn' : undefined}
        />
        <Stat label="Demos" value={stats.demos} hint="live, embeds, video and static builds" tone="accent" />
        <Stat label="Last content change" value={stats.lastUpdate} hint={`HEAD ${head.slice(0, 7)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Deploy status"
            description="Latest GitHub Actions run on the content branch"
            actions={
              <Button size="sm" variant="quiet" onClick={() => void loadDeploy()} aria-label="Reload deploy status">
                Reload
              </Button>
            }
          />
          <div className="px-4 py-4">
            {run.status === 'loading' && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            )}
            {run.status === 'error' && <ErrorNote error={run.error} onRetry={() => void loadDeploy()} />}
            {run.status === 'ready' && !run.run && (
              <EmptyState
                title="No workflow runs yet"
                description="Push the deploy workflow to the repository and run it once. Deploy status appears here afterwards."
              />
            )}
            {run.status === 'ready' && run.run && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={run.run.status === 'completed' ? conclusionTone(run.run.conclusion) : 'accent'}>
                    {run.run.status === 'completed' ? (run.run.conclusion ?? 'completed') : run.run.status}
                  </Badge>
                  <span className="text-[13px] font-medium">{run.run.name}</span>
                  <span className="mono text-[11px] text-muted">#{run.run.run_number}</span>
                  <span className="ml-auto text-[11.5px] text-muted">{relativeTime(run.run.updated_at)}</span>
                </div>
                <div className="mono flex flex-wrap items-center gap-3 text-[11px] text-muted">
                  <span>sha {run.run.head_sha.slice(0, 7)}</span>
                  <span>{new Date(run.run.created_at).toLocaleString()}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={run.run.html_url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm">Open run ↗</Button>
                  </a>
                  <Button
                    size="sm"
                    loading={jobsBusy}
                    onClick={() => {
                      if (!run.run) return;
                      if (jobs) setJobs(null);
                      else void loadJobs(run.run.id);
                    }}
                  >
                    {jobs ? 'Hide jobs' : 'Show jobs'}
                  </Button>
                </div>
                {jobsError && <p className="text-[11.5px] text-amber-300">{jobsError}</p>}
                {jobs && (
                  <ul className="space-y-1 rounded-lg border border-line bg-bg p-2">
                    {jobs.map((job) => (
                      <li key={job.name} className="flex items-center justify-between gap-2 px-1 py-0.5 text-[12px]">
                        <span className="truncate">{job.name}</span>
                        <Badge
                          tone={job.conclusion === 'success' ? 'ok' : job.conclusion === 'failure' ? 'bad' : 'muted'}
                        >
                          {job.conclusion ?? job.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {run.run.status !== 'completed' && (
                  <p className="flex items-center gap-2 text-[11.5px] text-muted">
                    <Spinner className="h-3 w-3" /> A deploy is in progress — the site updates when it finishes.
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Content health"
            description={`${counts.error} errors · ${counts.warn} warnings · ${counts.info} notes`}
            actions={
              <Button size="sm" variant="quiet" loading={weightsBusy} onClick={() => void probeWeights()}>
                Probe image weights
              </Button>
            }
          />
          <div className="px-4 py-4">
            {allIssues.length === 0 ? (
              <div className="flex items-center gap-2 text-[13px] text-emerald-300">
                <span aria-hidden="true">✓</span> Nothing to flag. Content is ready to ship.
              </div>
            ) : (
              <ul className="space-y-2">
                {visibleIssues.map((issue) => (
                  <li key={issue.id} className="flex items-start gap-2">
                    <Badge tone={SEVERITY_TONE[issue.severity]}>{issue.severity}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium">{issue.title}</p>
                      <p className="text-[11.5px] leading-snug text-muted">{issue.detail}</p>
                    </div>
                    {issue.projectSlug && (
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => {
                          const project = projects.find((entry) => entry.slug === issue.projectSlug);
                          if (project) onEditProject(project);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {allIssues.length > visibleIssues.length && (
              <p className="mt-3 text-[11px] text-muted">
                {allIssues.length - visibleIssues.length} more item(s) — fix these first, then re-run the checks.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent commits"
            description={`Everything on ${site.repo.branch}`}
            actions={
              <Button size="sm" variant="quiet" onClick={() => onNavigate('history')}>
                History
              </Button>
            }
          />
          <div className="divide-y divide-line/60">
            {commits.status === 'loading' &&
              [0, 1, 2].map((index) => (
                <div key={index} className="px-4 py-3">
                  <Skeleton className="h-3.5 w-3/4" />
                </div>
              ))}
            {commits.status === 'error' && (
              <div className="px-4 py-4">
                <ErrorNote error={commits.error} onRetry={() => void loadCommits()} />
              </div>
            )}
            {commits.status === 'ready' &&
              commits.commits.map((commit) => (
                <a
                  key={commit.sha}
                  href={commit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-elevated/40"
                >
                  <span className="mono mt-0.5 shrink-0 text-[10.5px] text-accent/80">{commit.sha.slice(0, 7)}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{commit.message}</span>
                  <span className="shrink-0 text-[11px] text-muted">{relativeTime(commit.date)}</span>
                </a>
              ))}
            {commits.status === 'ready' && commits.commits.length === 0 && (
              <div className="px-4 py-6 text-center text-[12.5px] text-muted">No commits on this branch yet.</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Traffic"
            description={
              site.analytics.provider === 'none'
                ? 'No analytics configured'
                : site.analytics.provider === 'goatcounter'
                  ? 'GoatCounter — cookie-free'
                  : 'Umami — cookieless'
            }
            actions={
              <Button size="sm" variant="quiet" onClick={() => onNavigate('settings')}>
                Settings
              </Button>
            }
          />
          <div className="px-4 py-4">
            {site.analytics.provider === 'none' && (
              <EmptyState
                title="Analytics is off"
                description="Add a GoatCounter site code or an Umami website id in Settings. Nothing loads for visitors until then."
                action={<Button onClick={() => onNavigate('settings')}>Configure analytics</Button>}
              />
            )}

            {site.analytics.provider === 'goatcounter' && site.analytics.siteId && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-line bg-bg px-3 py-2">
                    <p className="mono text-[10px] uppercase tracking-wider text-muted">views (all time)</p>
                    <p className="mt-1 text-lg font-semibold">{goat?.count ?? (goatNote ? '—' : '…')}</p>
                  </div>
                  <div className="rounded-lg border border-line bg-bg px-3 py-2">
                    <p className="mono text-[10px] uppercase tracking-wider text-muted">unique</p>
                    <p className="mt-1 text-lg font-semibold">{goat?.unique ?? (goatNote ? '—' : '…')}</p>
                  </div>
                </div>
                {goatNote && <p className="text-[11.5px] leading-snug text-muted">{goatNote}</p>}
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`https://${site.analytics.siteId}.goatcounter.com`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm">Open dashboard ↗</Button>
                  </a>
                  <a
                    href={`https://${site.analytics.siteId}.goatcounter.com/settings`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="sm" variant="quiet">
                      Counter settings
                    </Button>
                  </a>
                </div>
              </div>
            )}

            {site.analytics.provider === 'umami' && (
              <div className="space-y-3">
                <Alert tone="info" title="Umami stats need a server-side API key">
                  The public site sends page views, but reading them requires the Umami API. Open the dashboard — a
                  browser-only admin must not hold that key.
                </Alert>
                <a
                  href={site.analytics.endpoint || 'https://cloud.umami.is'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <Button size="sm">Open Umami ↗</Button>
                </a>
              </div>
            )}
          </div>
        </Card>
      </div>

      <p className="text-[11.5px] text-muted">
        Content committed from this dashboard goes straight to <span className="mono">{site.repo.branch}</span> and
        triggers a rebuild. Every write is a normal Git commit — reviewable, revertible, and attributed to the token
        owner.
      </p>
    </div>
  );
}
