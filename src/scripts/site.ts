/**
 * Public-site behaviour. One tiny bundle (~4 kB gzip) shared by every page.
 * Everything degrades gracefully: the HTML is fully usable without this file.
 */

const $ = <T extends Element>(selector: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(selector);
const $$ = <T extends Element>(selector: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(selector));

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ----------------------------------------------------------------- theme */
function initTheme(): void {
  const buttons = $$<HTMLButtonElement>('[data-theme-toggle]');
  if (!buttons.length) return;

  const sync = () => {
    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    for (const button of buttons) {
      button.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`);
      button.setAttribute('aria-pressed', String(theme === 'light'));
    }
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      try {
        localStorage.setItem('theme', next);
      } catch {
        /* private mode */
      }
      sync();
    });
  }
  sync();
}

/* ------------------------------------------------------------- command palette */
function initPalette(): void {
  const dialog = $<HTMLDialogElement>('[data-palette]');
  if (!dialog) return;
  const input = $<HTMLInputElement>('[data-palette-input]', dialog);
  const list = $<HTMLElement>('[data-palette-list]', dialog);
  const empty = $<HTMLElement>('[data-palette-empty]', dialog);
  if (!input || !list) return;

  const items = $$<HTMLElement>('[data-palette-item]', list);
  const groups = $$<HTMLElement>('[data-palette-group]', list);
  let visible: HTMLElement[] = [...items];
  let cursor = 0;
  let lastFocus: Element | null = null;

  const setCursor = (next: number) => {
    cursor = (next + visible.length) % Math.max(visible.length, 1);
    visible.forEach((item, index) => {
      const active = index === cursor;
      item.dataset.active = active ? 'true' : 'false';
      item.setAttribute('tabindex', active ? '0' : '-1');
      if (active) item.scrollIntoView({ block: 'nearest' });
    });
  };

  const filter = () => {
    const query = input.value.trim().toLowerCase();
    visible = [];
    for (const item of items) {
      const haystack = `${item.dataset.keywords ?? ''} ${item.textContent ?? ''}`.toLowerCase();
      const match = !query || haystack.includes(query);
      item.hidden = !match;
      if (match) visible.push(item);
    }
    for (const group of groups) {
      const any = $$<HTMLElement>('[data-palette-item]', group).some((item) => !item.hidden);
      group.hidden = !any;
    }
    if (empty) empty.hidden = visible.length > 0;
    setCursor(0);
  };

  const open = () => {
    lastFocus = document.activeElement;
    input.value = '';
    filter();
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => input.focus());
  };

  const close = () => {
    if (dialog.open) dialog.close();
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
  };

  for (const trigger of $$<HTMLElement>('[data-palette-open]')) {
    trigger.addEventListener('click', open);
  }

  input.addEventListener('input', filter);

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor(cursor + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor(cursor - 1);
    } else if (event.key === 'Enter') {
      const target = visible[cursor];
      if (target) {
        event.preventDefault();
        target.click();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      // Keep focus inside the dialog: input + result list only.
      const focusables = [input, ...visible];
      const index = focusables.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? index - 1 : index + 1;
      if (next < 0) {
        event.preventDefault();
        input.focus();
      } else if (next >= focusables.length) {
        event.preventDefault();
        visible[0]?.focus();
      }
    }
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('close', () => {
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (dialog.open) close();
      else open();
    }
  });

  for (const item of items) {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      if (action === 'copy-email') {
        const email = item.dataset.email ?? '';
        void navigator.clipboard?.writeText(email).then(() => {
          const label = item.querySelector('[data-copy-label]');
          if (label) label.textContent = 'Email copied';
          setTimeout(() => {
            if (label) label.textContent = 'Copy email address';
          }, 1600);
        });
      }
      if (action === 'toggle-theme') {
        $<HTMLButtonElement>('[data-theme-toggle]')?.click();
      }
      close();
    });
  }
}

/* ------------------------------------------------------------ project filters */
function initFilters(): void {
  const root = $<HTMLElement>('[data-project-filter]');
  if (!root) return;
  const search = $<HTMLInputElement>('[data-project-search]', root);
  const buttons = $$<HTMLButtonElement>('[data-filter-tag]', root);
  const cards = $$<HTMLElement>('[data-project-card]', root.parentElement ?? root);
  const count = $<HTMLElement>('[data-project-count]', root);
  const empty = $<HTMLElement>('[data-project-empty]');
  let activeTag = 'all';

  const apply = () => {
    const query = (search?.value ?? '').trim().toLowerCase();
    let shown = 0;
    for (const card of cards) {
      const tags = (card.dataset.tags ?? '').split(' ').filter(Boolean);
      const haystack = card.dataset.search ?? '';
      const tagMatch = activeTag === 'all' || tags.includes(activeTag);
      const textMatch = !query || haystack.includes(query);
      const show = tagMatch && textMatch;
      card.hidden = !show;
      if (show) shown += 1;
    }
    if (count) count.textContent = String(shown);
    if (empty) empty.hidden = shown > 0;
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      activeTag = button.dataset.filterTag ?? 'all';
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
      apply();
    });
  }
  search?.addEventListener('input', apply);
  apply();
}

/* ------------------------------------------------------------------ contact */
interface ContactConfig {
  provider: 'web3forms' | 'formspree' | 'mailto';
  key: string;
  endpoint: string;
  email: string;
}

function initContact(): void {
  const form = $<HTMLFormElement>('[data-contact-form]');
  if (!form) return;
  const status = $<HTMLElement>('[data-contact-status]');
  const submit = $<HTMLButtonElement>('[data-contact-submit]', form);
  const successPanel = $<HTMLElement>('[data-contact-success]');
  const errorPanel = $<HTMLElement>('[data-contact-error]');
  const fallback = $<HTMLAnchorElement>('[data-contact-mailto]');
  const config: ContactConfig = {
    provider: (form.dataset.provider as ContactConfig['provider']) ?? 'mailto',
    key: form.dataset.key ?? '',
    endpoint: form.dataset.endpoint ?? '',
    email: form.dataset.email ?? '',
  };

  const fields = {
    name: $<HTMLInputElement>('[name="name"]', form),
    email: $<HTMLInputElement>('[name="email"]', form),
    message: $<HTMLTextAreaElement>('[name="message"]', form),
    honeypot: $<HTMLInputElement>('[name="company"]', form),
  };

  const mailtoHref = (name: string, email: string, message: string) => {
    const subject = encodeURIComponent(`Project enquiry${name ? ` from ${name}` : ''}`);
    const body = encodeURIComponent(`${message}\n\n— ${name}${email ? ` (${email})` : ''}`);
    return `mailto:${config.email}?subject=${subject}&body=${body}`;
  };

  const setError = (field: HTMLInputElement | HTMLTextAreaElement | null, message: string) => {
    if (!field) return false;
    const error = $(`[data-error-for="${field.name}"]`, form);
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (error instanceof HTMLElement) {
      error.textContent = message;
      error.hidden = !message;
    }
    return message.length > 0;
  };

  const validate = (): boolean => {
    let invalid = false;
    const name = fields.name?.value.trim() ?? '';
    const email = fields.email?.value.trim() ?? '';
    const message = fields.message?.value.trim() ?? '';
    invalid = setError(fields.name, name.length < 2 ? 'Please tell me your name.' : '') || invalid;
    invalid =
      setError(fields.email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? '' : 'Enter a valid email address.') ||
      invalid;
    invalid =
      setError(fields.message, message.length < 20 ? 'A little more detail helps — at least 20 characters.' : '') ||
      invalid;
    return !invalid;
  };

  const showFallback = (reason: string) => {
    if (errorPanel) {
      errorPanel.hidden = false;
      const detail = $<HTMLElement>('[data-contact-error-detail]', errorPanel);
      if (detail) detail.textContent = reason;
    }
    if (fallback) {
      fallback.href = mailtoHref(
        fields.name?.value.trim() ?? '',
        fields.email?.value.trim() ?? '',
        fields.message?.value.trim() ?? '',
      );
    }
    if (status) status.textContent = 'The form could not send. Use the email link below.';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validate()) {
      const firstInvalid = $<HTMLElement>('[aria-invalid="true"]', form);
      firstInvalid?.focus();
      return;
    }
    if (fields.honeypot?.value) return; // silent bot trap

    const payload = {
      name: fields.name?.value.trim() ?? '',
      email: fields.email?.value.trim() ?? '',
      message: fields.message?.value.trim() ?? '',
    };

    if (config.provider === 'mailto' || !config.key) {
      window.location.href = mailtoHref(payload.name, payload.email, payload.message);
      return;
    }

    submit?.setAttribute('disabled', 'true');
    if (submit) submit.textContent = 'Sending…';
    if (status) status.textContent = 'Sending your message…';
    if (errorPanel) errorPanel.hidden = true;

    try {
      const last = Number(sessionStorage.getItem('contact:last') ?? 0);
      if (Date.now() - last < 60_000) {
        throw new Error('You just sent a message. Please wait a minute before trying again.');
      }

      const endpoint =
        config.provider === 'web3forms'
          ? config.endpoint || 'https://api.web3forms.com/submit'
          : config.endpoint || `https://formspree.io/f/${config.key}`;
      const body =
        config.provider === 'web3forms'
          ? JSON.stringify({
              access_key: config.key,
              subject: `Portfolio enquiry from ${payload.name}`,
              from_name: payload.name,
              email: payload.email,
              message: payload.message,
              botcheck: false,
            })
          : JSON.stringify({ name: payload.name, email: payload.email, message: payload.message });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
      });

      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? 'Too many messages in a short time. Please try again in a few minutes.'
            : `The form service responded with ${response.status}.`,
        );
      }

      sessionStorage.setItem('contact:last', String(Date.now()));
      form.hidden = true;
      if (successPanel) {
        successPanel.hidden = false;
        successPanel.focus();
      }
      if (status) status.textContent = 'Message sent.';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while sending.';
      showFallback(message);
      if (status) status.textContent = 'Message not sent.';
    } finally {
      submit?.removeAttribute('disabled');
      if (submit) submit.textContent = 'Send message';
    }
  });
}

/* -------------------------------------------------------------------- demos */
function initDemos(): void {
  for (const root of $$<HTMLElement>('[data-demos]')) {
    const tabs = $$<HTMLButtonElement>('[role="tab"]', root);
    const panels = $$<HTMLElement>('[role="tabpanel"]', root);
    if (!tabs.length) continue;

    const select = (index: number, focus = false) => {
      tabs.forEach((tab, i) => {
        const selected = i === index;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focus) tab.focus();
      });
      panels.forEach((panel, i) => {
        panel.hidden = i !== index;
      });
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(index));
      tab.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          const next = event.key === 'ArrowRight' ? index + 1 : index - 1;
          select((next + tabs.length) % tabs.length, true);
        } else if (event.key === 'Home') {
          event.preventDefault();
          select(0, true);
        } else if (event.key === 'End') {
          event.preventDefault();
          select(tabs.length - 1, true);
        }
      });
    });

    select(
      Math.max(
        0,
        tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true'),
      ),
    );
  }

  for (const button of $$<HTMLButtonElement>('[data-video-load]')) {
    button.addEventListener('click', () => {
      const src = button.dataset.videoLoad;
      const label = button.dataset.videoLabel ?? 'Demo video';
      if (!src) return;
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = label;
      iframe.className = 'aspect-video w-full';
      iframe.setAttribute('allow', 'accelerometer; encrypted-media; picture-in-picture; fullscreen');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('loading', 'lazy');
      button.replaceWith(iframe);
    });
  }
}

/* --------------------------------------------------------------- hero typing */
function initTyping(): void {
  const host = $<HTMLElement>('[data-typing]');
  if (!host || prefersReducedMotion()) return;

  const lines = $$<HTMLElement>('[data-type-line]', host);
  const commands = lines.map((line) => ({
    line,
    cmd: $<HTMLElement>('[data-type-cmd]', line),
    out: $<HTMLElement>('[data-type-out]', line),
    text: $<HTMLElement>('[data-type-cmd]', line)?.dataset.text ?? '',
  }));
  if (!commands.length) return;

  for (const { cmd, out, line } of commands) {
    line.dataset.state = 'pending';
    if (out) out.hidden = true;
    if (cmd) cmd.textContent = '';
  }

  let index = 0;
  const typeNext = () => {
    const current = commands[index];
    if (!current) {
      for (const item of commands) item.line.dataset.state = 'done';
      return;
    }
    const { cmd, out, line, text } = current;
    line.dataset.state = 'active';
    if (!cmd || prefersReducedMotion()) {
      if (cmd) cmd.textContent = text;
      if (out) out.hidden = false;
      index += 1;
      typeNext();
      return;
    }
    let char = 0;
    const tick = () => {
      char += 1;
      cmd.textContent = text.slice(0, char);
      if (char < text.length) {
        setTimeout(tick, 34 + Math.random() * 40);
      } else {
        if (out) out.hidden = false;
        line.dataset.state = 'done';
        index += 1;
        setTimeout(typeNext, 380);
      }
    };
    setTimeout(tick, 240);
  };
  typeNext();
}

/* ------------------------------------------------------------------- mobile */
function initMobileMenu(): void {
  const menus = $$<HTMLDetailsElement>('details[data-mobile-menu]');
  for (const menu of menus) {
    menu.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('a, button')) menu.open = false;
    });
    document.addEventListener('click', (event) => {
      if (menu.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    });
  }
}

function boot(): void {
  initTheme();
  initPalette();
  initFilters();
  initContact();
  initDemos();
  initTyping();
  initMobileMenu();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
