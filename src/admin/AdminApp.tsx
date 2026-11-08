import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Project } from '../lib/schema';
import { makeId, nextFreeSlug } from '../lib/utils';
import { loadContent, type AdminContent } from './data';
import { ApiError, GitHubClient, type GitHubUser, type RepoConfig } from './github';
import { clearSession, readSession, touchSession, writeSession } from './session';
import Editor from './screens/Editor';
import Backup from './screens/Backup';
import History from './screens/History';
import Login from './screens/Login';
import Overview from './screens/Overview';
import Projects from './screens/Projects';
import Settings from './screens/Settings';
import { Button, ErrorNote, Modal, Skeleton, Spinner, ToastProvider } from './ui';

export interface AdminAppProps {
  repo: RepoConfig;
  base: string;
}

type Tab = 'overview' | 'projects' | 'settings' | 'history' | 'backup';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '◱' },
  { id: 'projects', label: 'Projects', icon: '▤' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'history', label: 'History', icon: '↺' },
  { id: 'backup', label: 'Backup', icon: '⇩' },
];

type Phase = 'boot' | 'login' | 'ready';

interface Route {
  tab: Tab;
  slug?: string;
}

function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  if (!clean) return { tab: 'overview' };
  const [head, ...rest] = clean.split('/');
  const tab = TABS.some((item) => item.id === head) ? (head as Tab) : 'overview';
  const slug = rest.join('/');
  return slug ? { tab, slug } : { tab };
}

function routeHash(tab: Tab, slug?: string): string {
  return `#/${tab}${slug ? `/${slug}` : ''}`;
}

function createDraft(client: GitHubClient, existing: Project[]): Project {
  const now = new Date().toISOString();
  return {
    id: makeId('project'),
    slug: nextFreeSlug(
      'new-project',
      existing.map((project) => project.slug),
    ),
    title: '',
    summary: '',
    problem: '',
    solution: '',
    description: '',
    status: 'draft',
    featured: false,
    order: existing.length,
    startDate: now.slice(0, 7),
    endDate: '',
    role: '',
    client: '',
    tags: [],
    stack: [],
    links: {},
    metrics: [],
    cover: {
      src: `${client.repo.imagesPublicPath}/placeholder/cover.webp`,
      alt: 'Replace this cover with a screenshot of the project',
      width: 1600,
      height: 1000,
    },
    gallery: [],
    demos: [],
    seo: {},
    createdAt: now,
    updatedAt: now,
  };
}

export default function AdminApp({ repo, base }: AdminAppProps) {
  return (
    <ToastProvider>
      <AdminShell repo={repo} base={base} />
    </ToastProvider>
  );
}

function AdminShell({ repo, base }: AdminAppProps) {
  const [phase, setPhase] = useState<Phase>('boot');
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [client, setClient] = useState<GitHubClient | null>(null);
  const [content, setContent] = useState<AdminContent | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [seed, setSeed] = useState<Project | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const clientRef = useRef<GitHubClient | null>(null);
  const lastTouch = useRef(0);
  const booted = useRef(false);

  const go = useCallback((tab: Tab, slug?: string) => {
    const next = routeHash(tab, slug);
    if (window.location.hash !== next) window.location.hash = next;
    else setRoute(parseRoute(next));
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refresh = useCallback(async (silent = false) => {
    const current = clientRef.current;
    if (!current) return;
    if (!silent) setRefreshing(true);
    try {
      const next = await loadContent(current);
      setContent(next);
      setLoadError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        clientRef.current = null;
        setClient(null);
        setContent(null);
        setPhase('login');
        setNotice('GitHub rejected the stored token — it may have expired. Sign in again.');
        return;
      }
      setLoadError(error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const connect = useCallback(
    async (token: string) => {
      const candidate = new GitHubClient(token, repo);
      setLoadError(null);
      try {
        const [account, loaded] = await Promise.all([candidate.getUser(), loadContent(candidate)]);
        clientRef.current = candidate;
        setClient(candidate);
        setUser(account);
        setContent(loaded);
        setPhase('ready');
        setNotice(undefined);
        writeSession(token);
        if (!window.location.hash) go('overview');
      } catch (error) {
        clearSession();
        clientRef.current = null;
        setPhase('login');
        if (error instanceof ApiError) {
          setNotice(`${error.message}${error.hint ? ` ${error.hint}` : ''}`.trim());
        } else {
          setNotice(error instanceof Error ? error.message : 'Could not load the repository.');
        }
      }
    },
    [repo, go],
  );

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const stored = readSession();
    if (!stored) {
      setPhase('login');
      return;
    }
    void connect(stored.token);
  }, [connect]);

  /* Idle timeout — 30 minutes without input clears the token. */
  useEffect(() => {
    if (phase !== 'ready') return;
    const interval = window.setInterval(() => {
      if (!readSession()) {
        clientRef.current = null;
        setClient(null);
        setContent(null);
        setUser(null);
        setPhase('login');
        setNotice('Signed out after 30 minutes of inactivity.');
      }
    }, 20_000);
    const activity = () => {
      const now = Date.now();
      if (now - lastTouch.current < 20_000) return;
      lastTouch.current = now;
      touchSession();
    };
    window.addEventListener('pointerdown', activity, { passive: true });
    window.addEventListener('keydown', activity);
    window.addEventListener('focus', activity);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      window.removeEventListener('focus', activity);
    };
  }, [phase]);

  /* Silent refresh when the tab wakes up after a pause. */
  useEffect(() => {
    if (phase !== 'ready') return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        last = Date.now();
        return;
      }
      if (Date.now() - last > 5 * 60 * 1000) void refresh(true);
      last = Date.now();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [phase, refresh]);

  function logout(message?: string) {
    clearSession();
    clientRef.current = null;
    setClient(null);
    setUser(null);
    setContent(null);
    setSeed(null);
    setPhase('login');
    setNotice(message);
    window.location.hash = '';
  }

  const stats = useMemo(() => {
    const projects = content?.projects ?? [];
    return {
      projects: projects.length,
      drafts: projects.filter((project) => project.status === 'draft').length,
    };
  }, [content]);

  if (phase === 'boot') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg text-ink">
        <div className="flex items-center gap-3 text-[13px] text-muted">
          <Spinner className="h-4 w-4" />
          Restoring session…
        </div>
      </main>
    );
  }

  if (phase === 'login' || !client) {
    return <Login repo={repo} notice={notice} onConnected={(token) => void connect(token)} />;
  }

  if (!content) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        {loadError ? (
          <ErrorNote error={loadError} onRetry={() => void refresh()} />
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </main>
    );
  }

  const slugs = content.projects.map((project) => project.slug);
  const activeTab: Tab = route.tab;

  let body: ReactNode;
  if (activeTab === 'projects' && route.slug) {
    const isNew = route.slug === 'new';
    const project = isNew
      ? (seed ?? createDraft(client, content.projects))
      : content.projects.find((entry) => entry.slug === route.slug);
    body = project ? (
      <Editor
        key={isNew ? 'new-project' : project.slug}
        client={client}
        project={project}
        mode={isNew ? 'new' : 'edit'}
        head={content.head}
        base={base}
        existingSlugs={slugs}
        onSaved={async (saved) => {
          setSeed(null);
          await refresh(true);
          go('projects', saved.slug);
        }}
        onBack={() => {
          setSeed(null);
          go('projects');
        }}
        onConflictReload={() => {
          setSeed(null);
          go('projects');
          void refresh();
        }}
      />
    ) : (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Project not found</h1>
        <p className="text-[13px] text-muted">
          <span className="mono">{route.slug}</span> is not in {client.repo.contentDir}. It may have been renamed or
          removed.
        </p>
        <Button onClick={() => go('projects')}>Back to projects</Button>
      </div>
    );
  } else if (activeTab === 'projects') {
    body = (
      <Projects
        client={client}
        projects={content.projects}
        head={content.head}
        base={base}
        onEdit={(project) => go('projects', project.slug)}
        onCreate={(project) => {
          setSeed(project);
          go('projects', 'new');
        }}
        onRefresh={() => refresh(true)}
        onConflict={(remoteHead) => setConflict(remoteHead)}
      />
    );
  } else if (activeTab === 'settings') {
    body = <Settings client={client} site={content.site} head={content.head} onSaved={() => refresh(true)} />;
  } else if (activeTab === 'history') {
    body = (
      <History
        client={client}
        head={content.head}
        onRefresh={() => refresh(true)}
        onConflict={(remoteHead) => setConflict(remoteHead)}
      />
    );
  } else if (activeTab === 'backup') {
    body = (
      <Backup
        client={client}
        site={content.site}
        projects={content.projects}
        head={content.head}
        onRefresh={() => refresh(true)}
        onConflict={(remoteHead) => setConflict(remoteHead)}
      />
    );
  } else {
    body = (
      <Overview
        client={client}
        site={content.site}
        projects={content.projects}
        head={content.head}
        base={base}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onNewProject={() => {
          setSeed(null);
          go('projects', 'new');
        }}
        onEditProject={(project) => go('projects', project.slug)}
        onNavigate={(tab) => go(tab)}
      />
    );
  }

  const rate = client.rateLimit;
  const head = content.head;

  return (
    <div className="admin-shell">
      <div className="mx-auto flex w-full max-w-[1440px]">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-bg px-3 py-4 lg:flex">
          <a href={base} className="mb-6 flex items-center gap-2 px-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 font-mono text-[12px] text-accent">
              ~$
            </span>
            <span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted">portfolio</span>
              <span className="block text-[13px] font-semibold">admin</span>
            </span>
          </a>

          <nav className="space-y-0.5" aria-label="Admin sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={
                  activeTab === item.id
                    ? 'flex w-full items-center gap-2.5 rounded-lg bg-elevated px-2.5 py-2 text-left text-[13px] font-medium text-ink'
                    : 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted transition-colors hover:bg-elevated/60 hover:text-ink'
                }
              >
                <span aria-hidden="true" className="w-4 text-center text-[11px] opacity-80">
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.id === 'projects' && (
                  <span className="mono text-[10.5px] text-muted">
                    {stats.projects}
                    {stats.drafts > 0 && <span className="text-amber-300/80"> · {stats.drafts}d</span>}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-2 border-t border-line pt-3">
            <a
              href={`https://github.com/${repo.owner}/${repo.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mono block truncate px-1 text-[10.5px] text-muted hover:text-accent"
              title={`${repo.owner}/${repo.name}`}
            >
              {repo.owner}/{repo.name}
            </a>
            <p className="mono px-1 text-[10px] text-muted/80">
              {repo.branch} · {head.slice(0, 7)}
            </p>
            <a href={base} className="block px-1 text-[10.5px] text-muted hover:text-accent">
              View public site ↗
            </a>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
            <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
              <button
                type="button"
                onClick={() => go('overview')}
                className="flex items-center gap-2 lg:hidden"
                aria-label="Admin home"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-accent/30 bg-accent/10 font-mono text-[11px] text-accent">
                  ~$
                </span>
              </button>

              <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
                <span className="mono truncate text-[11px] text-muted">
                  {repo.owner}/{repo.name}
                </span>
                <span className="mono rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
                  {head.slice(0, 7)}
                </span>
                {stats.drafts > 0 && (
                  <span className="mono text-[10px] text-amber-300/80">{stats.drafts} draft(s)</span>
                )}
                {rate && (
                  <span
                    className={
                      rate.remaining < 50
                        ? 'mono rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300'
                        : 'mono rounded border border-line px-1.5 py-0.5 text-[10px] text-muted'
                    }
                    title={`GitHub API: ${rate.remaining} of ${rate.limit} calls left this hour`}
                  >
                    api {rate.remaining}
                  </span>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => void refresh()}
                  loading={refreshing}
                  aria-label="Refresh content"
                >
                  ↻
                </Button>
                {user && (
                  <span className="hidden items-center gap-1.5 sm:flex">
                    {user.avatar_url && (
                      <img
                        src={user.avatar_url}
                        alt=""
                        width={22}
                        height={22}
                        className="h-[22px] w-[22px] rounded-full border border-line"
                      />
                    )}
                    <span className="text-[11.5px] text-muted">{user.login}</span>
                  </span>
                )}
                <Button size="sm" onClick={() => logout()}>
                  Sign out
                </Button>
              </div>
            </div>

            <nav className="scroll-thin flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden" aria-label="Admin sections">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                  className={
                    activeTab === item.id
                      ? 'shrink-0 rounded-md bg-elevated px-2.5 py-1.5 text-[12px] font-medium text-ink'
                      : 'shrink-0 rounded-md px-2.5 py-1.5 text-[12px] text-muted hover:bg-elevated/60 hover:text-ink'
                  }
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </header>

          {loadError !== null && (
            <div className="px-3 pt-3 sm:px-5">
              <ErrorNote error={loadError} onRetry={() => void refresh()} />
            </div>
          )}

          <main className="px-3 py-5 sm:px-5 lg:px-7">{body}</main>

          <footer className="border-t border-line px-3 py-3 sm:px-5 lg:px-7">
            <p className="mono text-[10px] text-muted/80">
              content is git · session idle timeout 30m · token stored in this tab only
            </p>
          </footer>
        </div>
      </div>

      <Modal
        open={conflict !== null}
        onClose={() => setConflict(null)}
        title="The branch moved"
        description={`GitHub reported a new head: ${conflict?.slice(0, 7) ?? ''}.`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setConflict(null)}>Dismiss</Button>
            <Button
              variant="primary"
              onClick={() => {
                setConflict(null);
                void refresh();
              }}
            >
              Reload latest content
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-muted">
          Your last action was not applied — the dashboard refuses to overwrite a commit it has not seen. Reload, then
          repeat the action. Nothing was lost: the remote change is intact.
        </p>
      </Modal>
    </div>
  );
}
