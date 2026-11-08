import { useEffect, useMemo, useState } from 'react';
import type { Project } from '../../lib/schema';
import { formatDate, makeId, nextFreeSlug, slugify } from '../../lib/utils';
import { ConflictError, type GitHubClient } from '../github';
import { deleteProject, reorderProjects, saveProject } from '../data';
import { Alert, Badge, Button, Card, EmptyState, ErrorNote, Input, Modal, useToast } from '../ui';

interface Props {
  client: GitHubClient;
  projects: Project[];
  head: string;
  base: string;
  onEdit: (project: Project) => void;
  onCreate: (project: Project) => void;
  onRefresh: () => Promise<void>;
  onConflict: (remoteHead: string) => void;
}

type StatusFilter = 'all' | 'published' | 'draft' | 'archived';

interface DeleteTarget {
  project: Project;
  typed: string;
}

export default function Projects({ client, projects, head, base, onEdit, onCreate, onRefresh, onConflict }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<Project | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState('');

  const bySlug = useMemo(() => new Map(projects.map((project) => [project.slug, project])), [projects]);

  const ordered = useMemo(() => {
    if (!order) return projects;
    const seen = new Set<string>();
    const list: Project[] = [];
    for (const slug of order) {
      const project = bySlug.get(slug);
      if (project && !seen.has(slug)) {
        list.push(project);
        seen.add(slug);
      }
    }
    for (const project of projects) if (!seen.has(project.slug)) list.push(project);
    return list;
  }, [order, projects, bySlug]);

  useEffect(() => {
    setOrder(null);
  }, [projects]);

  const orderDirty = useMemo(() => {
    if (!order) return false;
    const current = projects.map((project) => project.slug);
    return order.length !== current.length || order.some((slug, index) => slug !== current[index]);
  }, [order, projects]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ordered.filter((project) => {
      if (filter !== 'all' && project.status !== filter) return false;
      if (!needle) return true;
      return [project.title, project.slug, project.role, project.client ?? '', ...project.tags, ...project.stack]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [ordered, query, filter]);

  const counts = useMemo(
    () => ({
      all: projects.length,
      published: projects.filter((project) => project.status === 'published').length,
      draft: projects.filter((project) => project.status === 'draft').length,
      archived: projects.filter((project) => project.status === 'archived').length,
    }),
    [projects],
  );

  function move(index: number, direction: -1 | 1) {
    const next = ordered.map((project) => project.slug);
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const current = next[index];
    const swap = next[target];
    if (!current || !swap) return;
    next[index] = swap;
    next[target] = current;
    setOrder(next);
  }

  function drop(index: number) {
    if (dragFrom === null || dragFrom === index) {
      setDragFrom(null);
      return;
    }
    const next = ordered.map((project) => project.slug);
    const [moved] = next.splice(dragFrom, 1);
    if (moved) next.splice(index, 0, moved);
    setOrder(next);
    setDragFrom(null);
  }

  async function saveOrder() {
    setOrderBusy(true);
    setError(null);
    try {
      const list = ordered.map((project) => project);
      await reorderProjects(client, list, head);
      toast.push('Order committed — the next build picks it up.', 'ok');
      setOrder(null);
      await onRefresh();
    } catch (caught) {
      if (caught instanceof ConflictError) {
        onConflict(caught.remoteHead);
        return;
      }
      setError(caught);
      toast.push('Could not save the new order.', 'bad');
    } finally {
      setOrderBusy(false);
    }
  }

  async function toggleStatus(project: Project) {
    const nextStatus = project.status === 'published' ? 'draft' : 'published';
    setBusySlug(project.slug);
    setError(null);
    try {
      await saveProject(
        client,
        { ...project, status: nextStatus },
        {
          expectedHead: head,
          message: `content: ${nextStatus === 'published' ? 'publish' : 'unpublish'} ${project.slug}`,
        },
      );
      toast.push(
        nextStatus === 'published' ? `${project.title} is published.` : `${project.title} moved to drafts.`,
        'ok',
      );
      await onRefresh();
    } catch (caught) {
      if (caught instanceof ConflictError) {
        onConflict(caught.remoteHead);
        return;
      }
      setError(caught);
      toast.push('Status change failed.', 'bad');
    } finally {
      setBusySlug(null);
    }
  }

  function openDuplicate(project: Project) {
    setDuplicateTarget(project);
    setDuplicateTitle(`${project.title} (copy)`);
  }

  async function confirmDuplicate() {
    if (!duplicateTarget) return;
    const taken = projects.map((project) => project.slug);
    const base = slugify(duplicateTitle) || `${duplicateTarget.slug}-copy`;
    const slug = nextFreeSlug(base, taken);
    const now = new Date().toISOString();
    const clone: Project = {
      ...duplicateTarget,
      id: makeId(duplicateTarget.id.slice(0, 12).replace(/[^a-zA-Z0-9]/g, '') || 'project'),
      slug,
      title: duplicateTitle.trim() || `${duplicateTarget.title} (copy)`,
      status: 'draft',
      featured: false,
      order: projects.length,
      createdAt: now,
      updatedAt: now,
    };
    setDuplicateTarget(null);
    onCreate(clone);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await deleteProject(client, deleteTarget.project, head);
      toast.push(`${deleteTarget.project.title} removed — commit pushed.`, 'ok');
      setDeleteTarget(null);
      await onRefresh();
    } catch (caught) {
      if (caught instanceof ConflictError) {
        onConflict(caught.remoteHead);
        return;
      }
      setError(caught);
      toast.push('Delete failed.', 'bad');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-[13px] text-muted">
            Drag to reorder, or use the arrows. Order is written to every project file in one commit.
          </p>
        </div>
        <Button variant="primary" onClick={() => onCreate(createBlank(client, projects))}>
          New project
        </Button>
      </div>

      {error !== null && <ErrorNote error={error} onRetry={() => setError(null)} />}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, slug, tag, stack…"
            aria-label="Search projects"
            className="max-w-xs"
          />
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
            {(['all', 'published', 'draft', 'archived'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={
                  filter === value
                    ? 'rounded-md bg-accent/15 px-2 py-1 font-mono text-[10.5px] uppercase tracking-wide text-accent'
                    : 'rounded-md px-2 py-1 font-mono text-[10.5px] uppercase tracking-wide text-muted hover:bg-elevated hover:text-ink'
                }
              >
                {value} <span className="opacity-60">{counts[value]}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {orderDirty && (
              <>
                <Button size="sm" variant="quiet" onClick={() => setOrder(null)} disabled={orderBusy}>
                  Reset
                </Button>
                <Button size="sm" variant="primary" loading={orderBusy} onClick={() => void saveOrder()}>
                  Save order
                </Button>
              </>
            )}
            {!orderDirty && <Badge>{projects.length} files</Badge>}
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No projects yet"
              description="A project is one JSON file. Create the first one, then publish it to see it on the site."
              action={<Button onClick={() => onCreate(createBlank(client, projects))}>Create a project</Button>}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nothing matches"
              description="Clear the search or switch the status filter."
              action={
                <Button
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col" className="w-8">
                    <span className="sr-only">Reorder</span>
                  </th>
                  <th scope="col" className="w-12">
                    <span className="sr-only">Cover</span>
                  </th>
                  <th scope="col">Project</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="hidden md:table-cell">
                    Demos
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Updated
                  </th>
                  <th scope="col" className="text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((project) => {
                  const index = ordered.findIndex((entry) => entry.slug === project.slug);
                  return (
                    <tr
                      key={project.slug}
                      draggable
                      onDragStart={() => setDragFrom(index)}
                      onDragEnd={() => setDragFrom(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => drop(index)}
                      className={dragFrom === index ? 'opacity-50' : undefined}
                    >
                      <td>
                        <span
                          className="mono cursor-grab select-none text-muted"
                          title="Drag to reorder"
                          aria-hidden="true"
                        >
                          ⠿
                        </span>
                      </td>
                      <td>
                        <img
                          src={`${base.replace(/\/$/, '')}${project.cover.src.startsWith('/') ? project.cover.src : `/${project.cover.src}`}`}
                          alt=""
                          width={40}
                          height={30}
                          loading="lazy"
                          className="h-[30px] w-10 rounded border border-line object-cover"
                        />
                      </td>
                      <td className="min-w-[14rem]">
                        <div className="flex items-center gap-2">
                          {project.featured && (
                            <span className="text-accent" title="Featured" aria-label="Featured">
                              ★
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => onEdit(project)}
                            className="truncate text-left font-medium hover:text-accent"
                          >
                            {project.title}
                          </button>
                        </div>
                        <p className="mono truncate text-[10.5px] text-muted">
                          {project.slug} · {project.role}
                        </p>
                      </td>
                      <td>
                        <Badge
                          tone={project.status === 'published' ? 'ok' : project.status === 'draft' ? 'warn' : 'muted'}
                        >
                          {project.status}
                        </Badge>
                      </td>
                      <td className="hidden md:table-cell">
                        <span className="mono text-[11px] text-muted">{project.demos.length}</span>
                      </td>
                      <td className="hidden lg:table-cell">
                        <span className="text-[11.5px] text-muted" title={project.updatedAt}>
                          {formatDate(project.updatedAt)}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="quiet"
                            aria-label={`Move ${project.title} up`}
                            onClick={() => move(index, -1)}
                            disabled={index === 0}
                          >
                            ▲
                          </Button>
                          <Button
                            size="sm"
                            variant="quiet"
                            aria-label={`Move ${project.title} down`}
                            onClick={() => move(index, 1)}
                            disabled={index === ordered.length - 1}
                          >
                            ▼
                          </Button>
                          <Button
                            size="sm"
                            loading={busySlug === project.slug}
                            onClick={() => void toggleStatus(project)}
                          >
                            {project.status === 'published' ? 'Unpublish' : 'Publish'}
                          </Button>
                          <Button size="sm" onClick={() => onEdit(project)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="quiet"
                            onClick={() => openDuplicate(project)}
                            aria-label={`Duplicate ${project.title}`}
                          >
                            ⧉
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setDeleteTarget({ project, typed: '' })}
                            aria-label={`Delete ${project.title}`}
                          >
                            ✕
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-[11.5px] text-muted">
        Showing {filtered.length} of {projects.length}. Drafts and archived projects stay in the repo but are not linked
        from the public site; archived ones still have a page.
      </p>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete this project?"
        description={`Removes the JSON file for “${deleteTarget?.project.title ?? ''}” and every image under its own folder in one commit. The project page disappears on the next deploy.`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteBusy}
              disabled={!deleteTarget || deleteTarget.typed.trim() !== deleteTarget.project.slug}
              onClick={() => void confirmDelete()}
            >
              Delete project
            </Button>
          </>
        }
      >
        <label className="field-label" htmlFor="delete-confirm">
          Type <span className="mono text-ink">{deleteTarget?.project.slug}</span> to confirm
        </label>
        <Input
          id="delete-confirm"
          value={deleteTarget?.typed ?? ''}
          onChange={(event) =>
            setDeleteTarget((current) => (current ? { ...current, typed: event.target.value } : current))
          }
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        {deleteTarget && deleteTarget.typed.trim() !== deleteTarget.project.slug && (
          <p className="field-hint">The delete button stays disabled until the slug matches.</p>
        )}
        <div className="mt-3">
          <Alert tone="warn" title="This can be undone from History">
            The commit is reversible: open History, find the commit, restore the JSON file. Images removed in the same
            commit need a second restore per file.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={duplicateTarget !== null}
        onClose={() => setDuplicateTarget(null)}
        title="Duplicate project"
        description="The copy starts as a draft so nothing half-edited reaches the site."
        size="sm"
        footer={
          <>
            <Button onClick={() => setDuplicateTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void confirmDuplicate()}>
              Create draft copy
            </Button>
          </>
        }
      >
        <label className="field-label" htmlFor="duplicate-title">
          Title
        </label>
        <Input
          id="duplicate-title"
          value={duplicateTitle}
          onChange={(event) => setDuplicateTitle(event.target.value)}
          autoFocus
        />
        <p className="field-hint">
          Slugs are derived from the title. Images and demos are copied as references — upload replacements before
          publishing if the copy needs its own assets.
        </p>
        <label className="field-label mt-3" htmlFor="duplicate-slug">
          Resulting slug
        </label>
        <Input
          id="duplicate-slug"
          readOnly
          value={nextFreeSlug(
            slugify(duplicateTitle) || `${duplicateTarget?.slug ?? 'project'}-copy`,
            projects.map((project) => project.slug),
          )}
          className="mono"
        />
      </Modal>
    </div>
  );
}

function createBlank(client: GitHubClient, projects: Project[]): Project {
  const taken = projects.map((project) => project.slug);
  const slug = nextFreeSlug('new-project', taken);
  const now = new Date().toISOString();
  return {
    id: makeId('project'),
    slug,
    title: 'Untitled project',
    summary: '',
    problem: '',
    solution: '',
    description: '',
    status: 'draft',
    featured: false,
    order: projects.length,
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
      alt: 'Project cover placeholder — replace me',
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
