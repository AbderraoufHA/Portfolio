import { useState, type SubmitEvent } from 'react';
import { ApiError, GitHubClient, type GitHubUser, type RepoConfig } from '../github';
import { Alert, Button, CopyButton, Field, Input } from '../ui';

interface Props {
  repo: RepoConfig;
  notice?: string;
  onConnected: (token: string, client: GitHubClient, user: GitHubUser) => void;
}

const PLACEHOLDER_OWNER = /^(your-username|username|owner)$/i;

export default function Login({ repo, notice, onConnected }: Props) {
  const [token, setToken] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const repoLabel = `${repo.owner}/${repo.name}`;
  const placeholderRepo = PLACEHOLDER_OWNER.test(repo.owner);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = token.trim();
    if (!clean) {
      setError('Paste a fine-grained personal access token.');
      return;
    }
    setBusy(true);
    setError(null);
    setHint(null);
    const client = new GitHubClient(clean, repo);
    try {
      const [user, access] = await Promise.all([client.getUser(), client.checkWriteAccess()]);
      if (!access.ok) {
        setError(access.detail);
        return;
      }
      onConnected(clean, client, user);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setHint(caught.hint ?? null);
      } else {
        setError(caught instanceof Error ? caught.message : 'Could not reach GitHub.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10 text-ink">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 font-mono text-sm text-accent">
            ~$
          </span>
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">portfolio</p>
            <h1 className="text-lg font-semibold tracking-tight">Admin</h1>
          </div>
        </div>

        {notice && (
          <div className="mb-4">
            <Alert tone="warn" title={notice} />
          </div>
        )}

        {placeholderRepo ? (
          <Alert tone="bad" title="The repository is still a placeholder">
            <p>
              <code className="mono">{repoLabel}</code> comes from <code className="mono">repo</code> in{' '}
              <code className="mono">src/content/site.json</code>. Set <code className="mono">owner</code>,{' '}
              <code className="mono">name</code> and <code className="mono">branch</code>, rebuild, then reload this
              page.
            </p>
          </Alert>
        ) : (
          <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-line bg-bg px-3 py-2">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">repository</p>
                <p className="truncate text-[13px] font-medium">{repoLabel}</p>
                <p className="font-mono text-[10.5px] text-muted">
                  {repo.branch} · {repo.contentDir}
                </p>
              </div>
              <CopyButton value={repoLabel} />
            </div>

            <Field
              label="Fine-grained personal access token"
              htmlFor="admin-token"
              hint="Stored in this tab's sessionStorage. Closing the tab, or 30 minutes idle, signs you out."
              required
            >
              <div className="flex gap-2">
                <Input
                  id="admin-token"
                  type={reveal ? 'text' : 'password'}
                  name="token"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="github_pat_…"
                  aria-invalid={error ? 'true' : undefined}
                />
                <Button type="button" onClick={() => setReveal((value) => !value)} aria-pressed={reveal}>
                  {reveal ? 'Hide' : 'Show'}
                </Button>
              </div>
            </Field>

            {error && (
              <p className="mt-2 text-[12px] font-medium text-red-400" role="alert">
                {error}
                {hint && <span className="mt-1 block font-normal text-muted">{hint}</span>}
              </p>
            )}

            <Button type="submit" variant="primary" className="mt-4 w-full" loading={busy} disabled={busy}>
              {busy ? 'Checking access…' : 'Sign in'}
            </Button>

            <p className="mt-3 text-center text-[11px] text-muted">
              The token never leaves your browser except for requests to api.github.com.
            </p>
          </form>
        )}

        <details className="mt-4 rounded-xl border border-line bg-surface/60 px-4 py-3 text-[12.5px] text-muted">
          <summary className="cursor-pointer select-none font-medium text-ink">Token setup (once per repo)</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-4">
            <li>
              Open{' '}
              <a
                className="text-accent underline underline-offset-4"
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub → Settings → Developer settings → Fine-grained tokens
              </a>
              .
            </li>
            <li>
              Repository access: <strong className="text-ink">Only select repositories</strong> →{' '}
              <code className="mono">{repo.name}</code>.
            </li>
            <li>
              Permissions: <strong className="text-ink">Contents — Read and write</strong> (commits, images, demos),{' '}
              <strong className="text-ink">Actions — Read</strong> (deploy status),{' '}
              <strong className="text-ink">Metadata — Read</strong> (always on).
            </li>
            <li>Short expiry — 30 to 90 days. Re-issue when the dashboard reports a 401.</li>
            <li>Paste the token above. Nothing is written to the repository until you press Save.</li>
          </ol>
        </details>
      </div>
    </main>
  );
}
