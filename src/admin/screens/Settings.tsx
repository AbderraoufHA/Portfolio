import { useEffect, useMemo, useState } from 'react';
import { siteSchema, type Site } from '../../lib/schema';
import { makeId } from '../../lib/utils';
import { ConflictError, type GitHubClient } from '../github';
import { saveSite } from '../data';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Switch, Textarea, useToast } from '../ui';

type Tab = 'profile' | 'sections' | 'contact' | 'design';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'sections', label: 'Sections' },
  { id: 'contact', label: 'Contact' },
  { id: 'design', label: 'Design & data' },
];

interface Props {
  client: GitHubClient;
  site: Site;
  head: string;
  onSaved: () => Promise<void>;
}

function LinesField({
  id,
  label,
  value,
  onChange,
  hint,
  rows = 3,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  rows?: number;
  error?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value.join('\n'));
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <Textarea
        id={id}
        rows={rows}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          onChange(
            event.target.value
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
          );
        }}
      />
    </Field>
  );
}

function CommaField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value.join(', '));
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <Input
        id={id}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          onChange(
            event.target.value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          );
        }}
      />
    </Field>
  );
}

export default function Settings({ client, site, head, onSaved }: Props) {
  const toast = useToast();
  const [draft, setDraft] = useState<Site>(site);
  const [tab, setTab] = useState<Tab>('profile');
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  const validation = useMemo(() => siteSchema.safeParse(draft), [draft]);
  const errors = useMemo(() => {
    if (validation.success) return {} as Record<string, string>;
    const map: Record<string, string> = {};
    for (const issue of validation.error.issues) {
      const key = issue.path.join('.') || '_root';
      if (!map[key]) map[key] = issue.message;
    }
    return map;
  }, [validation]);
  const baseline = useMemo(() => JSON.stringify(site), [site]);
  const dirty = useMemo(() => JSON.stringify(draft) !== baseline, [draft, baseline]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function patch(changes: Partial<Site>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  async function save(overrideHead?: string) {
    setShowErrors(true);
    const parsed = siteSchema.safeParse(draft);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.push(`Fix the highlighted field — ${first?.message ?? 'invalid settings'}.`, 'bad');
      return;
    }
    setBusy(true);
    try {
      await saveSite(client, parsed.data, overrideHead ?? head);
      setDraft(parsed.data);
      setShowErrors(false);
      toast.push('Settings committed. The next deploy picks them up.', 'ok');
      await onSaved();
    } catch (caught) {
      if (caught instanceof ConflictError) {
        setConflict(caught.remoteHead);
        return;
      }
      toast.push(caught instanceof Error ? caught.message : 'Could not save settings.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  const errorCount = Object.keys(errors).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Site settings</h1>
          <p className="mt-1 text-[13px] text-muted">
            One commit to <span className="mono">{client.repo.siteFile}</span>. Every section renders from this file.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="mono text-[10px] uppercase tracking-wider text-amber-300">unsaved</span>}
          <Button variant="primary" loading={busy} onClick={() => void save()} disabled={busy}>
            Save settings
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
                  <span className="mono">{path}</span> — {message}
                </li>
              ))}
          </ul>
        </Alert>
      )}

      {/your name/i.test(draft.profile.name) && (
        <Alert tone="warn" title="This is still the demo identity">
          The name, email and social handles in this repo are placeholders. Replace them before sharing the site — the
          health checks flag them until you do.
        </Alert>
      )}

      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Settings sections">
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
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="s-name" required error={errors['profile.name']}>
                <Input
                  id="s-name"
                  value={draft.profile.name}
                  onChange={(event) => patch({ profile: { ...draft.profile, name: event.target.value } })}
                />
              </Field>
              <Field
                label="Title"
                htmlFor="s-title"
                required
                error={errors['profile.title']}
                hint="Shown under your name"
              >
                <Input
                  id="s-title"
                  value={draft.profile.title}
                  onChange={(event) => patch({ profile: { ...draft.profile, title: event.target.value } })}
                />
              </Field>
              <Field
                label="Tagline"
                htmlFor="s-tagline"
                required
                error={errors['profile.tagline']}
                className="sm:col-span-2"
              >
                <Textarea
                  id="s-tagline"
                  rows={2}
                  value={draft.profile.tagline}
                  onChange={(event) => patch({ profile: { ...draft.profile, tagline: event.target.value } })}
                />
              </Field>
              <Field label="Availability label" htmlFor="s-avail" required error={errors['profile.availability.label']}>
                <Input
                  id="s-avail"
                  value={draft.profile.availability.label}
                  onChange={(event) =>
                    patch({
                      profile: {
                        ...draft.profile,
                        availability: { ...draft.profile.availability, label: event.target.value },
                      },
                    })
                  }
                />
              </Field>
              <div className="sm:pt-6">
                <Switch
                  checked={draft.profile.availability.available}
                  onChange={(available) =>
                    patch({
                      profile: { ...draft.profile, availability: { ...draft.profile.availability, available } },
                    })
                  }
                  label="Available for work"
                  description="Drives the pill in the hero and the contact section."
                />
              </div>
              <Field label="Location" htmlFor="s-location" required error={errors['profile.location']}>
                <Input
                  id="s-location"
                  value={draft.profile.location}
                  onChange={(event) => patch({ profile: { ...draft.profile, location: event.target.value } })}
                />
              </Field>
              <Field label="Timezone" htmlFor="s-tz" required error={errors['profile.timezone']}>
                <Input
                  id="s-tz"
                  value={draft.profile.timezone}
                  onChange={(event) => patch({ profile: { ...draft.profile, timezone: event.target.value } })}
                  className="mono"
                />
              </Field>
              <Field label="Years of experience" htmlFor="s-years" error={errors['profile.yearsExperience']}>
                <Input
                  id="s-years"
                  type="number"
                  min={0}
                  max={60}
                  value={draft.profile.yearsExperience ?? ''}
                  onChange={(event) =>
                    patch({
                      profile: {
                        ...draft.profile,
                        yearsExperience: event.target.value === '' ? undefined : Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
              <Field label="CV path" htmlFor="s-cv" hint="PDF in /public, e.g. /cv.pdf" error={errors['profile.cv']}>
                <Input
                  id="s-cv"
                  value={draft.profile.cv ?? ''}
                  onChange={(event) => patch({ profile: { ...draft.profile, cv: event.target.value } })}
                  className="mono"
                />
              </Field>
              <Field
                label="About"
                htmlFor="s-about"
                required
                error={errors['profile.about']}
                hint="Plain text. Blank lines become paragraphs."
                className="sm:col-span-2"
              >
                <Textarea
                  id="s-about"
                  rows={8}
                  value={draft.profile.about}
                  onChange={(event) => patch({ profile: { ...draft.profile, about: event.target.value } })}
                />
              </Field>
              <LinesField
                id="s-terminal"
                label="Terminal lines"
                value={draft.profile.terminalLines}
                onChange={(terminalLines) => patch({ profile: { ...draft.profile, terminalLines } })}
                hint="One per line, max 8. Typed out in the hero terminal."
                rows={4}
              />
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-[13px] font-semibold">Social links</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['github', 'GitHub'],
                  ['linkedin', 'LinkedIn'],
                  ['x', 'X / Twitter'],
                  ['telegram', 'Telegram'],
                  ['whatsapp', 'WhatsApp'],
                  ['calendly', 'Calendly'],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label} htmlFor={`s-social-${key}`} error={errors[`socials.${key}`]}>
                  <Input
                    id={`s-social-${key}`}
                    value={draft.socials[key] ?? ''}
                    onChange={(event) => patch({ socials: { ...draft.socials, [key]: event.target.value } })}
                    placeholder="https://…"
                    className="mono"
                  />
                </Field>
              ))}
              <Field label="Public email" htmlFor="s-social-email" error={errors['socials.email']}>
                <Input
                  id="s-social-email"
                  type="email"
                  value={draft.socials.email}
                  onChange={(event) => patch({ socials: { ...draft.socials, email: event.target.value } })}
                  className="mono"
                />
              </Field>
            </div>
            <p className="field-hint mt-2">
              Empty entries are hidden. Email is also used by the contact form fallback.
            </p>
          </Card>
        </div>
      )}

      {tab === 'sections' && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div>
                <h2 className="text-[13px] font-semibold">Services</h2>
                <p className="text-[11.5px] text-muted">What you sell. Four cards read best.</p>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  patch({
                    services: [
                      ...draft.services,
                      { id: makeId('service'), title: 'New service', description: '', deliverables: [] },
                    ],
                  })
                }
              >
                Add service
              </Button>
            </div>
            <div className="space-y-4 p-4">
              {draft.services.map((service, index) => (
                <div key={service.id} className="rounded-lg border border-line bg-bg/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="mono text-[10.5px] text-muted">{service.id}</span>
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => patch({ services: draft.services.filter((_, current) => current !== index) })}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Title" htmlFor={`svc-title-${index}`} error={errors[`services.${index}.title`]}>
                      <Input
                        id={`svc-title-${index}`}
                        value={service.title}
                        onChange={(event) => {
                          const services = [...draft.services];
                          services[index] = { ...service, title: event.target.value };
                          patch({ services });
                        }}
                      />
                    </Field>
                    <Field
                      label="ID"
                      htmlFor={`svc-id-${index}`}
                      error={errors[`services.${index}.id`]}
                      hint="Stable slug, alphanumeric"
                    >
                      <Input
                        id={`svc-id-${index}`}
                        value={service.id}
                        onChange={(event) => {
                          const services = [...draft.services];
                          services[index] = { ...service, id: event.target.value };
                          patch({ services });
                        }}
                        className="mono"
                      />
                    </Field>
                    <Field
                      label="Description"
                      htmlFor={`svc-desc-${index}`}
                      error={errors[`services.${index}.description`]}
                      className="sm:col-span-2"
                    >
                      <Textarea
                        id={`svc-desc-${index}`}
                        rows={2}
                        value={service.description}
                        onChange={(event) => {
                          const services = [...draft.services];
                          services[index] = { ...service, description: event.target.value };
                          patch({ services });
                        }}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <LinesField
                        id={`svc-deliv-${index}`}
                        label="Deliverables"
                        value={service.deliverables}
                        onChange={(deliverables) => {
                          const services = [...draft.services];
                          services[index] = { ...service, deliverables };
                          patch({ services });
                        }}
                        hint="One per line, max 8."
                        error={errors[`services.${index}.deliverables`]}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div>
                <h2 className="text-[13px] font-semibold">Skills</h2>
                <p className="text-[11.5px] text-muted">Grouped chips. Keep each group under ten items.</p>
              </div>
              <Button size="sm" onClick={() => patch({ skills: [...draft.skills, { group: 'New group', items: [] }] })}>
                Add group
              </Button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {draft.skills.map((skill, index) => (
                <div key={`${skill.group}-${index}`} className="rounded-lg border border-line bg-bg/40 p-3">
                  <div className="mb-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => patch({ skills: draft.skills.filter((_, current) => current !== index) })}
                    >
                      Remove
                    </Button>
                  </div>
                  <Field label="Group" htmlFor={`skill-group-${index}`} error={errors[`skills.${index}.group`]}>
                    <Input
                      id={`skill-group-${index}`}
                      value={skill.group}
                      onChange={(event) => {
                        const skills = [...draft.skills];
                        skills[index] = { ...skill, group: event.target.value };
                        patch({ skills });
                      }}
                    />
                  </Field>
                  <div className="mt-3">
                    <CommaField
                      id={`skill-items-${index}`}
                      label="Items"
                      value={skill.items}
                      onChange={(items) => {
                        const skills = [...draft.skills];
                        skills[index] = { ...skill, items };
                        patch({ skills });
                      }}
                      hint="Comma separated"
                      error={errors[`skills.${index}.items`]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div>
                <h2 className="text-[13px] font-semibold">Experience</h2>
                <p className="text-[11.5px] text-muted">The timeline under About.</p>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  patch({
                    experience: [
                      ...draft.experience,
                      {
                        company: 'Company',
                        role: 'Role',
                        period: '2024 — Present',
                        summary: '',
                        highlights: [],
                        url: '',
                        current: false,
                      },
                    ],
                  })
                }
              >
                Add role
              </Button>
            </div>
            <div className="space-y-4 p-4">
              {draft.experience.map((job, index) => (
                <div key={`${job.company}-${index}`} className="rounded-lg border border-line bg-bg/40 p-3">
                  <div className="mb-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => patch({ experience: draft.experience.filter((_, current) => current !== index) })}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Company"
                      htmlFor={`job-company-${index}`}
                      error={errors[`experience.${index}.company`]}
                    >
                      <Input
                        id={`job-company-${index}`}
                        value={job.company}
                        onChange={(event) => {
                          const experience = [...draft.experience];
                          experience[index] = { ...job, company: event.target.value };
                          patch({ experience });
                        }}
                      />
                    </Field>
                    <Field label="Role" htmlFor={`job-role-${index}`} error={errors[`experience.${index}.role`]}>
                      <Input
                        id={`job-role-${index}`}
                        value={job.role}
                        onChange={(event) => {
                          const experience = [...draft.experience];
                          experience[index] = { ...job, role: event.target.value };
                          patch({ experience });
                        }}
                      />
                    </Field>
                    <Field
                      label="Period"
                      htmlFor={`job-period-${index}`}
                      error={errors[`experience.${index}.period`]}
                      hint="Free text, e.g. 2023 — Present"
                    >
                      <Input
                        id={`job-period-${index}`}
                        value={job.period}
                        onChange={(event) => {
                          const experience = [...draft.experience];
                          experience[index] = { ...job, period: event.target.value };
                          patch({ experience });
                        }}
                      />
                    </Field>
                    <Field
                      label="URL (optional)"
                      htmlFor={`job-url-${index}`}
                      error={errors[`experience.${index}.url`]}
                    >
                      <Input
                        id={`job-url-${index}`}
                        value={job.url ?? ''}
                        onChange={(event) => {
                          const experience = [...draft.experience];
                          experience[index] = { ...job, url: event.target.value };
                          patch({ experience });
                        }}
                        className="mono"
                      />
                    </Field>
                    <Field
                      label="Summary"
                      htmlFor={`job-summary-${index}`}
                      error={errors[`experience.${index}.summary`]}
                      className="sm:col-span-2"
                    >
                      <Textarea
                        id={`job-summary-${index}`}
                        rows={2}
                        value={job.summary ?? ''}
                        onChange={(event) => {
                          const experience = [...draft.experience];
                          experience[index] = { ...job, summary: event.target.value };
                          patch({ experience });
                        }}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <LinesField
                        id={`job-highlights-${index}`}
                        label="Highlights"
                        value={job.highlights}
                        onChange={(highlights) => {
                          const experience = [...draft.experience];
                          experience[index] = { ...job, highlights };
                          patch({ experience });
                        }}
                        hint="One per line, max 6."
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Switch
                        checked={job.current}
                        onChange={(current) => {
                          const experience = [...draft.experience];
                          experience[index] = { ...job, current };
                          patch({ experience });
                        }}
                        label="Current role"
                        description="Marks the entry as ongoing."
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div>
                <h2 className="text-[13px] font-semibold">Testimonials</h2>
                <p className="text-[11.5px] text-muted">Clear the list to hide the section entirely.</p>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  patch({
                    testimonials: [
                      ...draft.testimonials,
                      { id: makeId('quote'), quote: '', author: '', role: '', company: '' },
                    ],
                  })
                }
              >
                Add quote
              </Button>
            </div>
            <div className="space-y-4 p-4">
              {draft.testimonials.length === 0 && (
                <p className="text-[12px] text-muted">No testimonials — the section does not render.</p>
              )}
              {draft.testimonials.map((testimonial, index) => (
                <div key={testimonial.id} className="rounded-lg border border-line bg-bg/40 p-3">
                  <div className="mb-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() =>
                        patch({ testimonials: draft.testimonials.filter((_, current) => current !== index) })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <Field label="Quote" htmlFor={`quote-${index}`} error={errors[`testimonials.${index}.quote`]}>
                    <Textarea
                      id={`quote-${index}`}
                      rows={3}
                      value={testimonial.quote}
                      onChange={(event) => {
                        const testimonials = [...draft.testimonials];
                        testimonials[index] = { ...testimonial, quote: event.target.value };
                        patch({ testimonials });
                      }}
                    />
                  </Field>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field
                      label="Author"
                      htmlFor={`quote-author-${index}`}
                      error={errors[`testimonials.${index}.author`]}
                    >
                      <Input
                        id={`quote-author-${index}`}
                        value={testimonial.author}
                        onChange={(event) => {
                          const testimonials = [...draft.testimonials];
                          testimonials[index] = { ...testimonial, author: event.target.value };
                          patch({ testimonials });
                        }}
                      />
                    </Field>
                    <Field label="Role" htmlFor={`quote-role-${index}`} error={errors[`testimonials.${index}.role`]}>
                      <Input
                        id={`quote-role-${index}`}
                        value={testimonial.role ?? ''}
                        onChange={(event) => {
                          const testimonials = [...draft.testimonials];
                          testimonials[index] = { ...testimonial, role: event.target.value };
                          patch({ testimonials });
                        }}
                      />
                    </Field>
                    <Field
                      label="Company"
                      htmlFor={`quote-company-${index}`}
                      error={errors[`testimonials.${index}.company`]}
                    >
                      <Input
                        id={`quote-company-${index}`}
                        value={testimonial.company ?? ''}
                        onChange={(event) => {
                          const testimonials = [...draft.testimonials];
                          testimonials[index] = { ...testimonial, company: event.target.value };
                          patch({ testimonials });
                        }}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'contact' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider" htmlFor="c-provider" error={errors['contact.provider']}>
                <Select
                  id="c-provider"
                  value={draft.contact.provider}
                  onChange={(event) =>
                    patch({
                      contact: { ...draft.contact, provider: event.target.value as Site['contact']['provider'] },
                    })
                  }
                >
                  <option value="web3forms">Web3Forms</option>
                  <option value="formspree">Formspree</option>
                  <option value="mailto">mailto only (no network)</option>
                </Select>
              </Field>
              <Field
                label="Public form key"
                htmlFor="c-key"
                hint="Access key / form id. Never a secret — it ships in the HTML."
                error={errors['contact.key']}
              >
                <Input
                  id="c-key"
                  value={draft.contact.key ?? ''}
                  onChange={(event) => patch({ contact: { ...draft.contact, key: event.target.value } })}
                  className="mono"
                  disabled={draft.contact.provider === 'mailto'}
                />
              </Field>
              <Field label="Inbox email" htmlFor="c-email" required error={errors['contact.email']}>
                <Input
                  id="c-email"
                  type="email"
                  value={draft.contact.email}
                  onChange={(event) => patch({ contact: { ...draft.contact, email: event.target.value } })}
                  className="mono"
                />
              </Field>
              <Field label="Booking URL" htmlFor="c-booking" error={errors['contact.bookingUrl']}>
                <Input
                  id="c-booking"
                  value={draft.contact.bookingUrl ?? ''}
                  onChange={(event) => patch({ contact: { ...draft.contact, bookingUrl: event.target.value } })}
                  className="mono"
                />
              </Field>
              <Field label="Response time note" htmlFor="c-response" error={errors['contact.responseTime']}>
                <Input
                  id="c-response"
                  value={draft.contact.responseTime ?? ''}
                  onChange={(event) => patch({ contact: { ...draft.contact, responseTime: event.target.value } })}
                />
              </Field>
              <Field
                label="Endpoint override"
                htmlFor="c-endpoint"
                hint="Formspree-compatible URL for self-hosting"
                error={errors['contact.endpoint']}
              >
                <Input
                  id="c-endpoint"
                  value={draft.contact.endpoint ?? ''}
                  onChange={(event) => patch({ contact: { ...draft.contact, endpoint: event.target.value } })}
                  className="mono"
                />
              </Field>
            </div>
          </Card>

          <Alert tone="info" title="How the form degrades">
            Without a key, or when the provider rejects the request, the form opens the visitor's mail client with a
            prefilled subject and body. A honeypot field catches most bots before either path runs.
          </Alert>
        </div>
      )}

      {tab === 'design' && (
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-[13px] font-semibold">Theme</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Accent colour" htmlFor="d-accent" error={errors['theme.accent']} hint="6-digit hex">
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label="Pick accent colour"
                    value={draft.theme.accent}
                    onChange={(event) => patch({ theme: { ...draft.theme, accent: event.target.value } })}
                    className="h-9 w-12 cursor-pointer rounded border border-line bg-bg"
                  />
                  <Input
                    id="d-accent"
                    value={draft.theme.accent}
                    onChange={(event) => patch({ theme: { ...draft.theme, accent: event.target.value } })}
                    className="mono"
                  />
                </div>
              </Field>
              <Field label="Default mode" htmlFor="d-mode" error={errors['theme.mode']}>
                <Select
                  id="d-mode"
                  value={draft.theme.mode}
                  onChange={(event) =>
                    patch({ theme: { ...draft.theme, mode: event.target.value as Site['theme']['mode'] } })
                  }
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">Follow the OS</option>
                </Select>
              </Field>
            </div>
            <p className="field-hint mt-2">
              The accent is applied as CSS variables at build time. Contrast-safe text variants are derived
              automatically.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-[13px] font-semibold">Analytics</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider" htmlFor="a-provider" error={errors['analytics.provider']}>
                <Select
                  id="a-provider"
                  value={draft.analytics.provider}
                  onChange={(event) =>
                    patch({
                      analytics: { ...draft.analytics, provider: event.target.value as Site['analytics']['provider'] },
                    })
                  }
                >
                  <option value="none">None</option>
                  <option value="goatcounter">GoatCounter</option>
                  <option value="umami">Umami</option>
                </Select>
              </Field>
              <Field
                label={draft.analytics.provider === 'goatcounter' ? 'Site code' : 'Website ID'}
                htmlFor="a-site"
                error={errors['analytics.siteId']}
                hint={
                  draft.analytics.provider === 'goatcounter'
                    ? 'The subdomain part: yourname.goatcounter.com'
                    : 'From Umami → Websites'
                }
              >
                <Input
                  id="a-site"
                  value={draft.analytics.siteId ?? ''}
                  onChange={(event) => patch({ analytics: { ...draft.analytics, siteId: event.target.value } })}
                  className="mono"
                  disabled={draft.analytics.provider === 'none'}
                />
              </Field>
              <Field
                label="Umami endpoint"
                htmlFor="a-endpoint"
                error={errors['analytics.endpoint']}
                hint="Required for self-hosted Umami; leave empty for Umami Cloud"
                className="sm:col-span-2"
              >
                <Input
                  id="a-endpoint"
                  value={draft.analytics.endpoint ?? ''}
                  onChange={(event) => patch({ analytics: { ...draft.analytics, endpoint: event.target.value } })}
                  className="mono"
                  disabled={draft.analytics.provider !== 'umami'}
                />
              </Field>
            </div>
            <p className="field-hint mt-2">
              Nothing loads when the provider is “None”. Scripts are added to the CSP automatically.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 text-[13px] font-semibold">Repository binding</h2>
            <p className="mb-3 text-[11.5px] text-muted">
              This dashboard was built against the values below. Change them in{' '}
              <span className="mono">{client.repo.siteFile}</span> and rebuild — a browser cannot repoint its own token
              safely.
            </p>
            <dl className="grid gap-x-4 gap-y-2 text-[12px] sm:grid-cols-2">
              {[
                ['Owner', client.repo.owner],
                ['Repository', client.repo.name],
                ['Branch', client.repo.branch],
                ['Content directory', client.repo.contentDir],
                ['Images directory', client.repo.imagesDir],
                ['Images public path', client.repo.imagesPublicPath],
                ['Demos directory', client.repo.demosDir],
                ['Settings file', client.repo.siteFile],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-2 border-b border-line/50 py-1">
                  <dt className="text-muted">{label}</dt>
                  <dd className="mono truncate text-ink/90">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`https://github.com/${client.repo.owner}/${client.repo.name}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm">Open repository ↗</Button>
              </a>
              <a
                href={`https://github.com/${client.repo.owner}/${client.repo.name}/actions`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm" variant="quiet">
                  Actions ↗
                </Button>
              </a>
              <Badge>
                {client.rateLimit
                  ? `${client.rateLimit.remaining}/${client.rateLimit.limit} API calls`
                  : 'rate limit unknown'}
              </Badge>
            </div>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-[11px] text-muted">
          {dirty ? 'Unsaved changes' : 'No pending changes'} · validated with the same schema as the build
        </p>
        <Button variant="primary" loading={busy} onClick={() => void save()} disabled={busy}>
          Save settings
        </Button>
      </div>

      <Modal
        open={conflict !== null}
        onClose={() => setConflict(null)}
        title="The branch moved while you were editing"
        description={`Latest head is ${conflict?.slice(0, 7) ?? ''}.`}
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
        <p className="text-[12.5px] leading-relaxed text-muted">
          Saving over the latest head replaces the whole settings file with the version in this editor. If the other
          commit changed settings too, its edits are lost — check History afterwards.
        </p>
      </Modal>
    </div>
  );
}
